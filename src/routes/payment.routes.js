const express = require('express');
const router = express.Router();
const {
  verifySignature,
  completeWalletTopup,
  failPayment,
  normalizeWebhookPayload,
  findPaymentFromWebhook
} = require('../services/payment.service');

/**
 * PayGrid webhook endpoint.
 * POST /api/v1/payments/webhook
 *
 * Set this exact URL in your PayGrid dashboard:
 *   https://YOUR_API_DOMAIN/api/v1/payments/webhook
 *
 * Signature headers accepted (first non-empty wins):
 *   x-paygrid-signature | x-zenjigo-signature | x-signature | x-hub-signature-256
 *
 * Verified with PAYGRID_WEBHOOK_SECRET (HMAC-SHA256 of raw body).
 * In non-production, if the secret still contains CHANGE_ME, signature check is skipped.
 */
router.post('/webhook', async (req, res) => {
  try {
    const rawBuf = req.rawBody
      ? (Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody))
      : Buffer.from(JSON.stringify(req.body || {}));

    const sig =
      req.get('x-paygrid-signature') ||
      req.get('x-zenjigo-signature') ||
      req.get('x-signature') ||
      req.get('x-hub-signature-256') ||
      '';

    const secret = process.env.PAYGRID_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || '';
    const skipSig =
      process.env.NODE_ENV !== 'production' &&
      (!secret || String(secret).includes('CHANGE_ME'));

    if (!skipSig && !verifySignature(rawBuf, sig)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const event = normalizeWebhookPayload(body);
    const payment = await findPaymentFromWebhook(event);

    if (!payment) {
      return res.json({
        success: true,
        message: 'No matching payment transaction; ignored.',
        reference: event.externalReference
      });
    }

    if (payment.status === 'success') {
      return res.json({ success: true, data: { paymentId: payment.id, status: 'success' } });
    }

    if (event.failed) {
      await failPayment(payment.id, event.rawStatus || 'failed');
      return res.json({ success: true, data: { paymentId: payment.id, status: 'failed' } });
    }

    if (event.success || !event.rawStatus) {
      const p = await completeWalletTopup(
        payment.id,
        event.externalReference || payment.external_reference,
        event.provider
      );
      return res.json({ success: true, data: { paymentId: p.id, status: 'success' } });
    }

    return res.json({
      success: true,
      data: { paymentId: payment.id, status: payment.status, note: 'intermediate status acknowledged' }
    });
  } catch (e) {
    console.error('[PayGrid webhook]', e.message);
    return res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/v1/payments/status – ops check (no secrets).
 */
router.get('/status', (req, res) => {
  const { isConfigured } = require('../services/payment.provider');
  res.json({
    success: true,
    data: {
      provider: process.env.PAYMENT_PROVIDER || 'paygrid',
      configured: isConfigured(),
      webhookPath: '/api/v1/payments/webhook'
    }
  });
});

module.exports = router;
