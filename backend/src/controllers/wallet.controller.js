const db = require('../config/db');
const ride = require('../services/ride.service');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/payment.service');
const config = require('../config/env');

exports.balance = asyncHandler(async (req, res) => {
  const r = await db.query('SELECT balance, currency FROM wallets WHERE user_id = ?', [req.user.sub]);
  ok(res, r[0] || { balance: 0, currency: config.ride.currency || 'TZS' });
});

exports.transactions = asyncHandler(async (req, res) => {
  ok(
    res,
    await db.query(
      `SELECT id, type, amount, balance_before AS balanceBefore, balance_after AS balanceAfter,
              reference_type AS referenceType, reference_id AS referenceId,
              payment_method AS paymentMethod, status, description, created_at AS createdAt
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [req.user.sub]
    )
  );
});

/**
 * POST /rider/wallet/topup
 * Body: { amount, phone, currency? }
 * Initiates PayGrid mobile-money collect and returns pending paymentId.
 * Wallet is credited only after the PayGrid webhook confirms success.
 */
exports.topup = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) throw ApiError.badRequest('Amount must be greater than zero.');

  // Prefer explicit phone; fall back to authenticated user's phone from DB
  let phone = req.body.phone || req.body.msisdn || null;
  if (!phone) {
    const users = await db.query('SELECT phone FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    phone = users[0]?.phone || null;
  }
  if (!phone) {
    throw ApiError.badRequest(
      'Phone number is required for mobile money top-up. Pass "phone" in the body or ensure your profile has a phone number.'
    );
  }

  const result = await paymentService.initiateTopup({
    userId: req.user.sub,
    amount,
    phone,
    currency: req.body.currency || config.ride.currency || 'TZS'
  });

  ok(res, result, result.message || 'Top-up initiated', 201);
});

/**
 * GET /rider/wallet/topup/:id
 * Poll status of a top-up payment.
 */
exports.topupStatus = asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT id, amount, currency, provider, status, external_reference AS externalReference, created_at AS createdAt
     FROM payment_transactions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [req.params.id, req.user.sub]
  );
  if (!rows.length) throw ApiError.notFound('Payment not found.');
  ok(res, rows[0]);
});

exports.charge = asyncHandler(async (req, res) => {
  ok(
    res,
    {
      balance: await ride.chargeWallet(
        req.user.sub,
        Number(req.body.amount),
        'adjustment',
        null,
        'Wallet debit'
      )
    },
    'Wallet charged'
  );
});
