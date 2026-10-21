/**
 * PayGrid payment provider adapter.
 *
 * Production checklist:
 * 1. Set in .env:
 *      PAYMENT_PROVIDER=paygrid
 *      PAYGRID_API_BASE_URL=https://<your-paygrid-host>/v1   (no trailing slash issues handled)
 *      PAYGRID_API_KEY=...
 *      PAYGRID_SECRET_KEY=...          (optional, if provider uses dual keys)
 *      PAYGRID_MERCHANT_ID=...
 *      PAYGRID_PUBLIC_KEY=...          (optional client-side)
 *      PAYGRID_WEBHOOK_SECRET=...      (HMAC secret from PayGrid dashboard)
 *      PAYGRID_CALLBACK_URL=https://YOUR_API/api/v1/payments/webhook
 *
 * 2. In PayGrid dashboard set webhook / callback URL to PAYGRID_CALLBACK_URL.
 *
 * Endpoint paths below match a common REST collect/charge style.
 * If your PayGrid dashboard documents different paths or field names,
 * change only the URL path and body keys in this file — the rest of the app stays the same.
 *
 * Never store raw card data; store provider tokens/mandates only.
 */
const config = require('../config/env');
const crypto = require('crypto');

function isConfigured() {
  const p = config.payment;
  return (
    p.provider === 'paygrid' &&
    !!p.baseUrl &&
    !!p.apiKey &&
    !String(p.apiKey).includes('CHANGE_ME')
  );
}

function baseUrl() {
  return String(config.payment.baseUrl || '').replace(/\/$/, '');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${config.payment.apiKey}`,
    'X-Api-Key': config.payment.apiKey,
    'X-Merchant-Id': config.payment.merchantId || ''
  };
}

/**
 * Charge driver commission (or any direct charge against a saved payment method).
 */
async function chargeDriverCommission({ amount, currency, driverId, paymentMethod }) {
  if (!isConfigured()) {
    return {
      provider: 'paygrid-dev',
      externalReference: `PAYGRID-COM-${driverId}-${Date.now()}`
    };
  }

  const body = {
    merchant_id: config.payment.merchantId,
    amount: Number(amount),
    currency: currency || 'TZS',
    customer_reference: String(driverId),
    payment_method_token: paymentMethod?.provider_token || paymentMethod?.token,
    phone: paymentMethod?.phone || undefined,
    reference: `ZENJIGO-COM-${driverId}-${Date.now()}`,
    description: 'ZenjiGO driver commission',
    metadata: { type: 'driver_commission', driverId: String(driverId) }
  };

  const res = await fetch(`${baseUrl()}/charges`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'failed' || data.success === false) {
    throw new Error(data.message || data.error || 'PayGrid rejected the commission payment.');
  }

  return {
    provider: 'paygrid',
    externalReference: data.reference || data.transaction_id || data.id || body.reference,
    raw: data
  };
}

/**
 * Initiate a mobile-money / wallet top-up collect (USSD push style).
 * Caller stores payment_transactions as pending and waits for webhook.
 */
async function initiateCollect({ amount, currency, userId, phone, reference }) {
  if (!isConfigured()) {
    return {
      provider: 'paygrid-dev',
      externalReference: reference || `PAYGRID-TOPUP-${userId}-${Date.now()}`,
      status: 'pending'
    };
  }

  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const body = {
    merchant_id: config.payment.merchantId,
    amount: Number(amount),
    currency: currency || 'TZS',
    phone: normalizedPhone,
    msisdn: normalizedPhone,
    customer_reference: String(userId),
    reference: reference || `ZENJIGO-TOPUP-${userId}-${Date.now()}`,
    callback_url: process.env.PAYGRID_CALLBACK_URL || undefined,
    webhook_url: process.env.PAYGRID_CALLBACK_URL || undefined,
    description: 'ZenjiGO wallet top-up',
    metadata: {
      type: 'wallet_topup',
      userId: String(userId),
      paymentId: undefined // filled by service after insert if needed
    }
  };

  // Try primary collect path; some dashboards use /payments/collect
  const paths = ['/collect', '/payments/collect', '/v1/collect'];
  let lastErr = null;
  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false && data.status !== 'failed') {
        return {
          provider: 'paygrid',
          externalReference: data.reference || data.transaction_id || data.id || body.reference,
          status: data.status || 'pending',
          raw: data
        };
      }
      lastErr = new Error(data.message || data.error || `PayGrid collect failed (${res.status})`);
      // 404 → try next path
      if (res.status !== 404) break;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('PayGrid collect request failed.');
}

function verifyWebhook(rawBody, signature) {
  const secret = config.payment.webhookSecret;
  if (!secret) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sig = String(signature || '').replace(/^sha256=/i, '');
    if (expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

module.exports = {
  chargeDriverCommission,
  initiateCollect,
  verifyWebhook,
  isConfigured
};
