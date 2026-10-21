/**
 * Payment service – wallet top-ups, webhook completion, status helpers.
 * Uses PayGrid via payment.provider.js.
 */
const crypto = require('crypto');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const provider = require('./payment.provider');

function getWebhookSecret() {
  return (
    config.payment.webhookSecret ||
    process.env.PAYGRID_WEBHOOK_SECRET ||
    process.env.PAYMENT_WEBHOOK_SECRET ||
    ''
  );
}

/**
 * Verify HMAC-SHA256 webhook signature.
 * Accepts hex or base64 signature; compares against raw request body.
 */
function verifySignature(rawBody, signature) {
  const secret = getWebhookSecret();
  if (!secret || !signature) return false;
  try {
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const expectedHex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const expectedB64 = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    const sig = String(signature).trim();
    const clean = sig.replace(/^sha256=/i, '');
    if (expectedHex.length === clean.length && crypto.timingSafeEqual(Buffer.from(expectedHex), Buffer.from(clean))) {
      return true;
    }
    if (expectedB64.length === clean.length && crypto.timingSafeEqual(Buffer.from(expectedB64), Buffer.from(clean))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Mark a pending payment_transactions row as success and credit the wallet.
 */
async function completeWalletTopup(paymentId, externalReference, providerName = 'paygrid') {
  return db.transaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE',
      [paymentId]
    );
    if (!rows.length) throw ApiError.notFound('Payment transaction not found.');
    const p = rows[0];
    if (p.status === 'success') return p;

    await conn.query(
      `UPDATE payment_transactions
       SET status = 'success',
           external_reference = COALESCE(?, external_reference),
           provider = COALESCE(?, provider)
       WHERE id = ?`,
      [externalReference || null, providerName || null, paymentId]
    );

    const [w] = await conn.query(
      'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [p.user_id]
    );
    const before = Number(w?.[0]?.balance || 0);
    const after = before + Number(p.amount);
    if (w.length) {
      await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [after, p.user_id]);
    } else {
      await conn.query('INSERT INTO wallets (user_id, balance) VALUES (?, ?)', [p.user_id, after]);
    }
    await conn.query(
      `INSERT INTO wallet_transactions
         (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, payment_method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.user_id,
        'topup',
        p.amount,
        before,
        after,
        'payment',
        p.id,
        providerName || 'paygrid',
        'Wallet top-up'
      ]
    );
    return { ...p, status: 'success' };
  });
}

/**
 * Mark payment failed (idempotent).
 */
async function failPayment(paymentId, reason) {
  await db.query(
    `UPDATE payment_transactions
     SET status = 'failed',
         metadata = JSON_SET(COALESCE(metadata, '{}'), '$.failReason', ?)
     WHERE id = ? AND status = 'pending'`,
    [String(reason || 'provider_failed'), paymentId]
  );
}

/**
 * Initiate a PayGrid collect (mobile money USSD push / hosted collect).
 * Creates a pending payment_transactions row then calls the provider.
 */
async function initiateTopup({ userId, amount, phone, currency }) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw ApiError.badRequest('Amount must be greater than zero.');
  if (!phone) throw ApiError.badRequest('Phone number is required for mobile money top-up.');

  const reference = `ZENJIGO-TOPUP-${userId}-${Date.now()}`;
  const insert = await db.query(
    `INSERT INTO payment_transactions
       (user_id, amount, currency, provider, status, external_reference, metadata)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [
      userId,
      amt,
      currency || config.ride.currency || 'TZS',
      config.payment.provider || 'paygrid',
      reference,
      JSON.stringify({ phone, requestedBy: userId, channel: 'wallet_topup' })
    ]
  );
  const paymentId = insert.insertId;

  try {
    const result = await provider.initiateCollect({
      amount: amt,
      currency: currency || config.ride.currency || 'TZS',
      userId,
      phone,
      reference
    });

    if (result.externalReference && result.externalReference !== reference) {
      await db.query(
        'UPDATE payment_transactions SET external_reference = ? WHERE id = ?',
        [result.externalReference, paymentId]
      );
    }

    // In dev mode without real keys, optionally auto-complete so UI can be tested
    if (result.provider === 'paygrid-dev' && process.env.PAYGRID_AUTO_COMPLETE_DEV === 'true') {
      await completeWalletTopup(paymentId, result.externalReference, 'paygrid-dev');
      return {
        paymentId,
        status: 'success',
        externalReference: result.externalReference,
        message: 'Dev auto-completed top-up (PAYGRID_AUTO_COMPLETE_DEV=true).'
      };
    }

    return {
      paymentId,
      status: result.status || 'pending',
      externalReference: result.externalReference || reference,
      provider: result.provider,
      message:
        'Top-up initiated. Confirm the prompt on your phone. Wallet will be credited when PayGrid webhook confirms payment.'
    };
  } catch (err) {
    await failPayment(paymentId, err.message);
    throw ApiError.badRequest(err.message || 'Payment provider rejected the top-up request.');
  }
}

/**
 * Parse a flexible PayGrid / generic webhook payload into a normalized event.
 */
function normalizeWebhookPayload(body) {
  const b = body || {};
  const statusRaw = String(
    b.status || b.transaction_status || b.event || b.type || ''
  ).toLowerCase();
  const success =
    ['success', 'successful', 'completed', 'paid', 'confirmed', 'charge.succeeded', 'payment.success'].some(
      (s) => statusRaw.includes(s)
    );
  const failed =
    ['fail', 'failed', 'cancelled', 'canceled', 'declined', 'error', 'payment.failed'].some((s) =>
      statusRaw.includes(s)
    );

  const externalReference =
    b.reference ||
    b.external_reference ||
    b.transaction_id ||
    b.transactionId ||
    b.id ||
    b.payment_reference ||
    null;

  const paymentId =
    b.paymentId ||
    b.payment_id ||
    (b.metadata && (b.metadata.paymentId || b.metadata.payment_id)) ||
    b.customer_reference ||
    null;

  const amount = b.amount != null ? Number(b.amount) : null;

  return {
    success,
    failed,
    externalReference: externalReference != null ? String(externalReference) : null,
    paymentId: paymentId != null && !Number.isNaN(Number(paymentId)) ? Number(paymentId) : null,
    amount,
    rawStatus: statusRaw,
    provider: b.provider || 'paygrid'
  };
}

/**
 * Resolve payment_transactions row from webhook data.
 */
async function findPaymentFromWebhook(event) {
  if (event.paymentId) {
    const rows = await db.query('SELECT * FROM payment_transactions WHERE id = ? LIMIT 1', [
      event.paymentId
    ]);
    if (rows.length) return rows[0];
  }
  if (event.externalReference) {
    const rows = await db.query(
      'SELECT * FROM payment_transactions WHERE external_reference = ? ORDER BY id DESC LIMIT 1',
      [event.externalReference]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

module.exports = {
  verifySignature,
  completeWalletTopup,
  failPayment,
  initiateTopup,
  normalizeWebhookPayload,
  findPaymentFromWebhook,
  isProviderConfigured: provider.isConfigured
};
