/**
 * Snippe payment provider — aligned with official docs:
 * https://docs.snippe.sh/
 *
 * Base URL: https://api.snippe.sh
 * Auth:    Authorization: Bearer <api_key>
 * Create:  POST /v1/payments  (+ Idempotency-Key header, max 30 chars)
 * Mobile:  payment_type: "mobile", phone_number, customer{firstname,lastname,email}, details{amount,currency}
 * Webhook: X-Webhook-Signature (HMAC-SHA256 of "{timestamp}.{raw_body}"), X-Webhook-Timestamp
 */
const crypto = require('crypto');
const config = require('../config/env');

const DEFAULT_BASE = 'https://api.snippe.sh';

function isConfigured() {
  const p = config.payment;
  const key = p.apiKey || '';
  return (
    (p.provider === 'snippe' || p.provider === 'paygrid' || !p.provider) &&
    !!key &&
    !String(key).includes('CHANGE_ME')
  );
}

function baseUrl() {
  const u = String(
    config.payment.baseUrl ||
      process.env.SNIPPE_BASE_URL ||
      process.env.PAYGRID_API_BASE_URL ||
      process.env.PAYMENT_API_BASE_URL ||
      DEFAULT_BASE
  ).replace(/\/$/, '');
  if (
    u.includes('paygrid.example') ||
    u.includes('api.paygrid.example') ||
    u.includes('meet.briq.tz')
  ) {
    return DEFAULT_BASE;
  }
  return u;
}

function authHeaders(idempotencyKey) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${config.payment.apiKey}`
  };
  // Snippe Idempotency-Key must be 30 characters or fewer
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 30);
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
 * Official: POST /v1/payments  payment_type: mobile
 */
async function initiateCollect({
  amount,
  currency,
  userId,
  phone,
  reference,
  customer,
  network,
  metadata,
  channel
}) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Payment provider is not configured.');
    }
    return {
      provider: 'snippe-dev',
      externalReference: reference || `ZENJIGO-TOPUP-${userId}-${Date.now()}`,
      status: 'pending'
    };
  }

  const idem = String(reference || `ZENJIGO-${userId}-${Date.now()}`).slice(0, 30);
  const webhookUrl =
    process.env.SNIPPE_WEBHOOK_URL ||
    process.env.SNIPPE_CALLBACK_URL ||
    process.env.PAYGRID_CALLBACK_URL ||
    process.env.PAYGRID_WEBHOOK_URL ||
    undefined;

  const body = {
    payment_type: 'mobile',
    details: {
      amount: Math.round(Number(amount)),
      currency: currency || 'TZS'
    },
    phone_number: normalizeTzPhone(phone),
    customer: {
      firstname: customer?.firstname || customer?.firstName || 'ZenjiGO',
      lastname: customer?.lastname || customer?.lastName || 'User',
      email: customer?.email || `user${userId}@zenjigo.online`
    },
    metadata: {
      ...(metadata || {}),
      order_id: reference || idem,
      userId: String(userId),
      channel: channel || 'wallet_topup'
    }
  };
  if (webhookUrl) body.webhook_url = webhookUrl;
  // network is auto-detected by Snippe from phone; ignore if provided

  const res = await fetch(`${baseUrl()}/v1/payments`, {
    method: 'POST',
    headers: authHeaders(idem),
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  // Envelope: { status, code, data } or error shape
  const payload = data.data || data;
  const ok =
    res.ok &&
    data.status !== 'error' &&
    data.error_code == null &&
    (payload.status === 'pending' ||
      payload.status === 'processing' ||
      payload.status === 'completed' ||
      res.status === 200 ||
      res.status === 201);

  if (!ok) {
    const msg =
      data.message ||
      data.error_code ||
      payload.message ||
      (data.details && JSON.stringify(data.details)) ||
      `Snippe payment failed (${res.status})`;
    throw new Error(msg);
  }

  return {
    provider: 'snippe',
    externalReference: payload.reference || payload.id || payload.transaction_id || idem,
    status: payload.status || 'pending',
    raw: payload
  };
}

/**
 * Charge saved method / commission — uses same create payment API (mobile).
 */
async function chargeDriverCommission({
  amount,
  currency,
  driverId,
  settlementId,
  reference,
  paymentMethod,
  customer
}) {
  const phone = paymentMethod?.phone || paymentMethod?.msisdn;
  const ref = reference || `ZENJIGO-COM-${driverId}-${settlementId || 'X'}-${Date.now()}`;

  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Payment provider is not configured.');
    }
    return { provider: 'snippe-dev', externalReference: ref, status: 'pending' };
  }

  if (!phone) throw new Error('A mobile-money phone number is required for the Snippe charge.');

  // Success of this call only means the USSD prompt was sent. It is NOT proof of payment.
  return initiateCollect({
    amount,
    currency: currency || 'TZS',
    userId: driverId,
    phone,
    reference: ref,
    customer,
    channel: 'driver_commission',
    metadata: {
      type: 'driver_commission',
      driverId: String(driverId),
      settlementId: settlementId != null ? String(settlementId) : undefined
    }
  });
}

/**
 * Verify Snippe webhook signature.
 * X-Webhook-Signature = hex(HMAC-SHA256(signing_key, "{timestamp}.{raw_body}"))
 * Also accepts legacy PayGrid format (raw body only, optional sha256= prefix) for transition.
 */
function verifyWebhook(rawBody, signatureHeader, timestampHeader) {
  const secret =
    config.payment.webhookSecret ||
    process.env.SNIPPE_WEBHOOK_SECRET ||
    process.env.PAYGRID_WEBHOOK_SECRET ||
    '';
  if (!secret || String(secret).includes('CHANGE_ME')) return false;

  try {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
    let sig = String(signatureHeader || '').trim();
    if (sig.toLowerCase().startsWith('sha256=')) sig = sig.slice(7);
    if (!sig) return false;

    // Preferred: Snippe "{timestamp}.{body}"
    if (timestampHeader) {
      const eventTime = parseInt(timestampHeader, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Number.isFinite(eventTime) && Math.abs(now - eventTime) > 300) {
        return false; // replay window 5 minutes
      }
      const message = `${timestampHeader}.${raw}`;
      const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
      if (expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'))) {
        return true;
      }
    }

    // Fallback: HMAC of raw body only (older providers)
    const expectedRaw = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (expectedRaw.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expectedRaw, 'utf8'), Buffer.from(sig, 'utf8'));
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
