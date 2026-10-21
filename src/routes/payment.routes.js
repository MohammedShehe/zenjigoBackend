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
 * PayGrid webhook + callback
 * POST /api/v1/payments/webhook
 * Dashboard: set webhook URL to https://YOUR_API/api/v1/payments/webhook
 * Header: X-MeetPay-Signature: sha256=<hmac>
 * Docs: https://paydocs.briq.tz/guides/webhooks/verify-signatures
 */
router.post('/webhook', async (req, res) => {
  try {
    const rawBuf = req.rawBody
      ? (Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody))
      : Buffer.from(JSON.stringify(req.body || {}));

    const sig =
      req.get('x-meetpay-signature') ||
      req.get('X-MeetPay-Signature') ||
      req.get('x-paygrid-signature') ||
      req.get('x-signature') ||
      '';

    const secret = process.env.PAYGRID_WEBHOOK_SECRET || '';
    const skipSig =
      process.env.NODE_ENV !== 'production' &&
      (!secret || String(secret).includes('CHANGE_ME'));

    if (!skipSig && !verifySignature(rawBuf, sig)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // Dashboard test event
    if (body.event === 'webhook.test') {
      return res.json({ success: true, message: 'Test webhook received' });
    }

    const event = normalizeWebhookPayload(body);
    const payment = await findPaymentFromWebhook(event);

    if (!payment) {
      return res.json({
        success: true,
        message: 'No matching payment; acknowledged.',
        reference: event.merchantReference || event.externalReference
      });
    }

    if (payment.status === 'success') {
      return res.json({ success: true, data: { paymentId: payment.id, status: 'success' } });
    }

    if (event.failed) {
      await failPayment(payment.id, event.rawStatus || 'failed');
      return res.json({ success: true, data: { paymentId: payment.id, status: 'failed' } });
    }

    if (event.success) {
      const p = await completeWalletTopup(
        payment.id,
        event.externalReference || payment.external_reference,
        'paygrid'
      );
      return res.json({ success: true, data: { paymentId: p.id, status: 'success' } });
    }

    return res.json({
      success: true,
      data: { paymentId: payment.id, status: payment.status }
    });
  } catch (e) {
    console.error('[PayGrid webhook]', e.message);
    return res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

router.get('/status', (req, res) => {
  const { isConfigured, baseUrl } = require('../services/payment.provider');
  res.json({
    success: true,
    data: {
      provider: 'paygrid',
      configured: isConfigured(),
      baseUrl: baseUrl(),
      webhookPath: '/api/v1/payments/webhook'
    }
  });
});

module.exports = router;
