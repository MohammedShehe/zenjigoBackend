/**
 * PayGrid (Briq MeetPay) provider — aligned with official docs:
 * https://paydocs.briq.tz/
 *
 * Base URL: https://meet.briq.tz
 * Auth:    Authorization: Bearer <api_key>
 * Create:  POST /api/v1/payments  (+ required Idempotency-Key header)
 * Mobile:  type: "mobile", phone, customer{firstname,lastname,email}, amount, currency
 * Webhook: X-MeetPay-Signature: sha256=<hmac_hex>  (signing key ≠ api_key)
 */
const crypto = require('crypto');
const config = require('../config/env');

const DEFAULT_BASE = 'https://meet.briq.tz';

function isConfigured() {
  const p = config.payment;
  const key = p.apiKey || '';
  return (
    (p.provider === 'paygrid' || !p.provider) &&
    !!key &&
    !String(key).includes('CHANGE_ME')
  );
}

function baseUrl() {
  const u = String(config.payment.baseUrl || process.env.PAYGRID_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  // Official host is meet.briq.tz — if user left example host, use production default when key looks real
  if (u.includes('paygrid.example') || u.includes('api.paygrid.example')) return DEFAULT_BASE;
  return u;
}

function authHeaders(idempotencyKey) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${config.payment.apiKey}`
  };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 255);
  return headers;
}

function normalizeTzPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = '255' + d.slice(1);
  if (d.length === 9 && (d.startsWith('6') || d.startsWith('7'))) d = '255' + d;
  return d;
}

/**
 * Create mobile money payment (USSD push).
 * Official: POST /api/v1/payments  type: mobile
 */
async function initiateCollect({ amount, currency, userId, phone, reference, customer, network, metadata, channel }) {
  if (!isConfigured()) {
    // Never pretend a charge was started in production.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Payment provider is not configured.');
    }
    return {
      provider: 'paygrid-dev',
      externalReference: reference || `ZENJIGO-TOPUP-${userId}-${Date.now()}`,
      status: 'pending'
    };
  }

  const idem = reference || `ZENJIGO-${userId}-${Date.now()}`;
  const body = {
    amount: Number(amount),
    currency: currency || 'TZS',
    type: 'mobile',
    phone: normalizeTzPhone(phone),
    customer: {
      firstname: customer?.firstname || customer?.firstName || 'ZenjiGO',
      lastname: customer?.lastname || customer?.lastName || 'User',
      email: customer?.email || `user${userId}@zenjigo.online`
    },
    reference: idem,
    webhook_url: process.env.PAYGRID_CALLBACK_URL || process.env.PAYGRID_WEBHOOK_URL || undefined,
    metadata: {
      ...(metadata || {}),
      userId: String(userId),
      channel: channel || 'wallet_topup'
    }
  };
  if (network) body.network = network;

  const res = await fetch(`${baseUrl()}/api/v1/payments`, {
    method: 'POST',
    headers: authHeaders(idem),
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  // Envelope: { status, code, message, data }
  const payload = data.data || data;
  const ok =
    res.ok &&
    data.status !== 'error' &&
    data.error_code == null &&
    (payload.status === 'pending' || payload.status === 'processing' || payload.status === 'completed' || res.status === 200 || res.status === 201);

  if (!ok) {
    const msg =
      data.message ||
      data.error_code ||
      payload.message ||
      (data.details && JSON.stringify(data.details)) ||
      `PayGrid payment failed (${res.status})`;
    throw new Error(msg);
  }

  return {
    provider: 'paygrid',
    externalReference: payload.id || payload.transaction_id || payload.reference || idem,
    status: payload.status || 'pending',
    raw: payload
  };
}

/**
 * Charge saved method / commission — uses same create payment API (mobile).
 */
async function chargeDriverCommission({ amount, currency, driverId, settlementId, reference, paymentMethod, customer }) {
  const phone = paymentMethod?.phone || paymentMethod?.msisdn;
  const ref = reference || `ZENJIGO-COM-${driverId}-${settlementId || 'X'}-${Date.now()}`;

  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Payment provider is not configured.');
    }
    // Development only: the charge stays pending until a webhook / admin confirms it.
    return { provider: 'paygrid-dev', externalReference: ref, status: 'pending' };
  }

  if (!phone) throw new Error('A mobile-money phone number is required for the PayGrid charge.');

  // Success of this call only means the USSD prompt was sent. It is NOT proof of payment.
  return initiateCollect({
    amount,
    currency: currency || 'TZS',
    userId: driverId,
    phone,
    reference: ref,
    customer,
    channel: 'driver_commission',
    metadata: { type: 'driver_commission', driverId: String(driverId), settlementId: settlementId != null ? String(settlementId) : undefined }
  });
}

/**
 * Verify X-MeetPay-Signature (HMAC-SHA256 of raw body).
 * Header value format: sha256=<hex>
 * Use PAYGRID_WEBHOOK_SECRET / webhook signing key from PayGrid (not the API key).
 */
function verifyWebhook(rawBody, signatureHeader) {
  const secret = config.payment.webhookSecret || process.env.PAYGRID_WEBHOOK_SECRET || '';
  if (!secret || String(secret).includes('CHANGE_ME')) return false;
  try {
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    let sig = String(signatureHeader || '').trim();
    if (sig.toLowerCase().startsWith('sha256=')) sig = sig.slice(7);
    if (!sig || expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  chargeDriverCommission,
  initiateCollect,
  verifyWebhook,
  isConfigured,
  baseUrl
};
