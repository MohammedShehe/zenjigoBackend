/**
 * Payment service — wallet top-ups & Snippe webhooks
 * Docs: https://docs.snippe.sh/
 */
const crypto = require('crypto');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const provider = require('./payment.provider');
const finance = require('./driver_finance.service');

function getWebhookSecret() {
  return config.payment.webhookSecret || process.env.SNIPPE_WEBHOOK_SECRET || '';
}

function verifySignature(rawBody, signature, timestamp) {
  return provider.verifyWebhook(rawBody, signature, timestamp);
}

async function completeWalletTopup(paymentId, externalReference, providerName = 'snippe', confirmedAmount = null) {
  return db.transaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE',
      [paymentId]
    );
    if (!rows.length) throw ApiError.notFound('Payment transaction not found.');
    const p = rows[0];
    if (p.status === 'success') return p;

    // Never credit more than the provider says it actually collected.
    if (confirmedAmount != null && Number.isFinite(Number(confirmedAmount)) && Number(confirmedAmount) + 0.009 < Number(p.amount)) {
      await conn.query(
        `UPDATE payment_transactions SET metadata = JSON_SET(COALESCE(metadata, '{}'), '$.underpaid', ?) WHERE id = ?`,
        [String(confirmedAmount), paymentId]
      );
      return { ...p, status: 'underpaid' };
    }

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
         (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, payment_method, description, status)
       VALUES (?, 'topup', ?, ?, ?, 'payment', ?, ?, 'Wallet top-up', 'success')`,
      [p.user_id, p.amount, before, after, p.id, providerName || 'snippe']
    );
    return { ...p, status: 'success' };
  });
}

async function failPayment(paymentId, reason) {
  await db.query(
    `UPDATE payment_transactions
     SET status = 'failed',
         metadata = JSON_SET(COALESCE(metadata, '{}'), '$.failReason', ?)
     WHERE id = ? AND status = 'pending'`,
    [String(reason || 'failed'), paymentId]
  );
}

/** Keep only non-sensitive card facts (never PAN / CVV / full expiry). */
function sanitizeCardInfo(card) {
  if (!card || typeof card !== 'object') return null;
  const last4 = String(card.last4 || card.cardLast4 || '').replace(/\D/g, '').slice(-4);
  const brand = String(card.brand || card.cardBrand || '').replace(/[^a-z ]/gi, '').slice(0, 20);
  const holder = String(card.holder || card.holderName || card.cardHolder || '')
    .replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!last4 && !brand && !holder) return null;
  return { last4: last4 || null, brand: brand || null, holder: holder || null };
}

async function initiateTopup({ userId, amount, phone, currency, customer, network, paymentMethod, callbackUrl, cancelUrl, card }) {
  const amt = Number(amount);
  if (!amt || amt < 500) throw ApiError.badRequest('Minimum top-up amount is 500 TZS.');

  const method = String(paymentMethod || 'momo').toLowerCase();
  const isCard = method === 'card' || method === 'bank' || method === 'bank_card';

  if (!isCard && !phone) throw ApiError.badRequest('Phone number is required for mobile money top-up.');

  const cardInfo = isCard ? sanitizeCardInfo(card) : null;
  const reference = `ZENJIGO-TOPUP-${userId}-${Date.now()}`;
  const insert = await db.query(
    `INSERT INTO payment_transactions
       (user_id, amount, currency, provider, status, external_reference, metadata)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [
      userId,
      amt,
      currency || config.ride.currency || 'TZS',
      'snippe',
      reference,
      JSON.stringify({
        phone: phone || null,
        requestedBy: userId,
        channel: isCard ? 'wallet_topup_card' : 'wallet_topup',
        paymentMethod: method,
        card: cardInfo
      })
    ]
  );
  const paymentId = insert.insertId;

  try {
    let cust = customer;
    if (!cust) {
      const users = await db.query(
        'SELECT full_name, email, phone FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      const u = users[0] || {};
      const parts = String(u.full_name || 'ZenjiGO User').trim().split(/\s+/);
      cust = {
        firstname: parts[0] || 'ZenjiGO',
        lastname: parts.slice(1).join(' ') || 'User',
        email: u.email || `user${userId}@zenjigo.online`
      };
      if (!phone && u.phone) phone = u.phone;
      // Billing name on the hosted card checkout follows the name on the card the rider typed.
      if (isCard && cardInfo?.holder) {
        const hp = cardInfo.holder.split(/\s+/);
        cust.firstname = hp[0] || cust.firstname;
        cust.lastname = hp.slice(1).join(' ') || cust.lastname;
      }
    }

    let result;
    if (isCard) {
      result = await provider.createCardPayment({
        amount: amt,
        currency: currency || config.ride.currency || 'TZS',
        userId,
        phone,
        reference,
        customer: cust,
        callbackUrl,
        cancelCallbackUrl: cancelUrl,
        channel: 'wallet_topup_card',
        metadata: { paymentId, paymentMethod: method }
      });
    } else {
      result = await provider.initiateCollect({
        amount: amt,
        currency: currency || config.ride.currency || 'TZS',
        userId,
        phone,
        reference,
        customer: cust,
        network,
        metadata: { paymentId }
      });
    }

    if (result.externalReference && result.externalReference !== reference) {
      await db.query(
        'UPDATE payment_transactions SET external_reference = ? WHERE id = ?',
        [result.externalReference, paymentId]
      );
    }

    return {
      paymentId,
      status: result.status || 'pending',
      externalReference: result.externalReference || reference,
      provider: result.provider,
      paymentUrl: result.paymentUrl || null,
      paymentMethod: method,
      amount: amt,
      card: cardInfo,
      message: isCard
        ? (result.paymentUrl
            ? 'Authorise the card payment on the secure checkout. Your wallet is credited once the bank confirms it.'
            : 'Card payment initiated. Complete checkout to credit your wallet.')
        : 'Confirm the payment prompt on your phone. Your wallet updates when payment completes.'
    };
  } catch (err) {
    await failPayment(paymentId, err.message);
    throw ApiError.badRequest(err.message || 'Payment could not be started.');
  }
}

/**
 * Official Snippe webhook payload:
 * { event: "payment.completed", event_id, transaction_id, merchant_reference,
 *   data: { amount, currency, status, ... }, metadata, timestamp }
 * Callback: { type: "transaction.callback", transaction_id, merchant_reference, status, ... }
 */
function normalizeWebhookPayload(body) {
  const b = body || {};
  const eventName = String(b.event || b.type || '').toLowerCase();
  const data = b.data || {};
  const statusRaw = String(data.status || b.status || eventName || '').toLowerCase();

  const success =
    eventName === 'payment.completed' ||
    statusRaw === 'completed' ||
    statusRaw === 'success' ||
    statusRaw === 'paid';
  const failed =
    eventName === 'payment.failed' ||
    eventName === 'payment.cancelled' ||
    eventName === 'payment.expired' ||
    ['failed', 'cancelled', 'canceled', 'expired', 'declined'].includes(statusRaw);

  const externalReference =
    data.reference ||
    b.transaction_id ||
    data.transaction_id ||
    b.merchant_reference ||
    b.reference ||
    null;

  const merchantRef = b.merchant_reference || data.merchant_reference || null;
  const paymentIdMeta = (b.metadata && b.metadata.paymentId) || (data.metadata && data.metadata.paymentId) || null;
  const orderIdMeta = (b.metadata && b.metadata.order_id) || (data.metadata && data.metadata.order_id) || null;
  const settlementIdMeta = (b.metadata && b.metadata.settlementId) || (data.metadata && data.metadata.settlementId) || null;

  return {
    success,
    failed,
    externalReference: externalReference != null ? String(externalReference) : null,
    merchantReference: merchantRef != null ? String(merchantRef) : (orderIdMeta != null ? String(orderIdMeta) : null),
    paymentId: paymentIdMeta != null && !Number.isNaN(Number(paymentIdMeta)) ? Number(paymentIdMeta) : null,
    settlementId: settlementIdMeta != null && !Number.isNaN(Number(settlementIdMeta)) ? Number(settlementIdMeta) : null,
    amount: data.amount != null ? Number(data.amount) : b.amount != null ? Number(b.amount) : null,
    currency: data.currency || b.currency || null,
    rawStatus: statusRaw,
    eventId: b.event_id || null,
    provider: 'snippe'
  };
}

async function findPaymentFromWebhook(event) {
  if (event.paymentId) {
    const rows = await db.query('SELECT * FROM payment_transactions WHERE id = ? LIMIT 1', [event.paymentId]);
    if (rows.length) return rows[0];
  }
  // Prefer merchant_reference (our ZENJIGO-TOPUP-...) then transaction_id
  for (const ref of [event.merchantReference, event.externalReference]) {
    if (!ref) continue;
    const rows = await db.query(
      'SELECT * FROM payment_transactions WHERE external_reference = ? ORDER BY id DESC LIMIT 1',
      [ref]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

/** Look up a driver-commission settlement for a webhook event. */
async function findSettlementFromWebhook(event) {
  return finance.findSettlementFromWebhook(event);
}


/**
 * Start a mobile-money charge for a ride fare. The ride only completes when the provider
 * webhook confirms the money was collected (see routes/payment.routes.js).
 */
async function initiateRidePayment({ userId, rideId, amount, phone, currency }) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw ApiError.badRequest('Nothing to pay for this ride.');
  const reference = `ZENJIGO-RIDE-${rideId}-${Date.now()}`;
  const insert = await db.query(
    `INSERT INTO payment_transactions (user_id, amount, currency, provider, status, external_reference, metadata)
     VALUES (?, ?, ?, 'snippe', 'pending', ?, ?)`,
    [userId, amt, currency || config.ride.currency || 'TZS', reference,
      JSON.stringify({ phone, requestedBy: userId, channel: 'ride_payment', rideId: String(rideId) })]
  );
  const paymentId = insert.insertId;
  try {
    const users = await db.query('SELECT full_name, email FROM users WHERE id = ? LIMIT 1', [userId]);
    const u = users[0] || {};
    const parts = String(u.full_name || 'ZenjiGO Rider').trim().split(/\s+/);
    const result = await provider.initiateCollect({
      amount: amt,
      currency: currency || config.ride.currency || 'TZS',
      userId,
      phone,
      reference,
      customer: { firstname: parts[0] || 'ZenjiGO', lastname: parts.slice(1).join(' ') || 'Rider', email: u.email || `user${userId}@zenjigo.online` },
      channel: 'ride_payment',
      metadata: { paymentId, rideId: String(rideId) }
    });
    if (result.externalReference && result.externalReference !== reference) {
      await db.query('UPDATE payment_transactions SET external_reference = ? WHERE id = ?', [result.externalReference, paymentId]);
    }
    return { paymentId, status: result.status || 'pending', externalReference: result.externalReference || reference };
  } catch (err) {
    await failPayment(paymentId, err.message);
    throw ApiError.badRequest(err.message || 'Payment could not be started.');
  }
}

/** Mark a ride-payment row successful (idempotent). Returns the row. */
async function markPaymentSuccess(paymentId, externalReference) {
  await db.query(
    `UPDATE payment_transactions SET status='success', external_reference = COALESCE(?, external_reference) WHERE id = ? AND status <> 'success'`,
    [externalReference || null, paymentId]
  );
  const rows = await db.query('SELECT * FROM payment_transactions WHERE id = ?', [paymentId]);
  return rows[0];
}

async function cancelPendingTopup(userId, paymentId) {
  const r = await db.query(
    `UPDATE payment_transactions
     SET status = 'failed',
         metadata = JSON_SET(COALESCE(metadata, '{}'), '$.failReason', 'cancelled_by_rider')
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
    [paymentId, userId]
  );
  return (r.affectedRows || 0) > 0;
}

function paymentChannel(row) {
  try {
    const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return { channel: m.channel || null, rideId: m.rideId || null };
  } catch (_) { return { channel: null, rideId: null }; }
}

module.exports = {
  cancelPendingTopup,
  initiateRidePayment,
  markPaymentSuccess,
  paymentChannel,
  verifySignature,
  findSettlementFromWebhook,
  completeWalletTopup,
  failPayment,
  initiateTopup,
  normalizeWebhookPayload,
  findPaymentFromWebhook,
  isProviderConfigured: provider.isConfigured
};
