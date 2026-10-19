/**
 * PayGrid payment provider adapter.
 *
 * Replace endpoint paths / field names with the exact PayGrid API docs from your dashboard.
 * Never store raw card data; store provider tokens/mandates only.
 * For mobile money, use the provider's customer/mandate ID or phone-based collect.
 */
const config = require('../config/env');
const crypto = require('crypto');

function isConfigured() {
  const p = config.payment;
  return (
    p.provider === 'paygrid' &&
    p.baseUrl &&
    p.apiKey &&
    !String(p.apiKey).includes('CHANGE_ME')
  );
}

/**
 * Charge driver commission (or any direct charge).
 * PayGrid-style body — adjust field names to match your PayGrid API contract.
 */
async function chargeDriverCommission({ amount, currency, driverId, paymentMethod }) {
  if (!isConfigured()) {
    // Development-safe simulated charge when credentials are missing
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
    description: 'ZenjiGO driver commission'
  };

  const res = await fetch(`${config.payment.baseUrl.replace(/\/$/, '')}/v1/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.payment.apiKey}`,
      'X-Merchant-Id': config.payment.merchantId || ''
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'failed' || data.success === false) {
    throw new Error(data.message || data.error || 'PayGrid rejected the commission payment.');
  }

  return {
    provider: 'paygrid',
    externalReference: data.reference || data.transaction_id || data.id || body.reference
  };
}

/**
 * Initiate a mobile-money / wallet top-up collect (USSD push style).
 * Caller should store payment_transactions row as pending and wait for webhook.
 */
async function initiateCollect({ amount, currency, userId, phone, reference }) {
  if (!isConfigured()) {
    return {
      provider: 'paygrid-dev',
      externalReference: reference || `PAYGRID-TOPUP-${userId}-${Date.now()}`,
      status: 'pending'
    };
  }

  const body = {
    merchant_id: config.payment.merchantId,
    amount: Number(amount),
    currency: currency || 'TZS',
    phone: String(phone || '').replace(/\D/g, ''),
    customer_reference: String(userId),
    reference: reference || `ZENJIGO-TOPUP-${userId}-${Date.now()}`,
    callback_url: process.env.PAYGRID_CALLBACK_URL || undefined,
    description: 'ZenjiGO wallet top-up'
  };

  const res = await fetch(`${config.payment.baseUrl.replace(/\/$/, '')}/v1/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.payment.apiKey}`,
      'X-Merchant-Id': config.payment.merchantId || ''
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || 'PayGrid collect request failed.');
  }

  return {
    provider: 'paygrid',
    externalReference: data.reference || data.transaction_id || data.id || body.reference,
    status: data.status || 'pending',
    raw: data
  };
}

function verifyWebhook(rawBody, signature) {
  const secret = config.payment.webhookSecret;
  if (!secret) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sig = String(signature || '');
    if (expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

module.exports = { chargeDriverCommission, initiateCollect, verifyWebhook, isConfigured };
