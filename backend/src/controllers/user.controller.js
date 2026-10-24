const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.me = asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT u.*, COALESCE(w.balance,0) wallet_balance, rp.referral_code, rp.rating, rp.total_rides
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN rider_profiles rp ON rp.user_id = u.id
     WHERE u.id = ?`,
    [req.user.sub]
  );
  if (!rows.length) throw ApiError.notFound('User not found');
  const u = rows[0];
  delete u.password_hash;
  ok(res, {
    ...u,
    walletBalance: Number(u.wallet_balance),
    notificationsEnabled: u.push_enabled == null ? true : Boolean(u.push_enabled),
  });
});

exports.update = asyncHandler(async (req, res) => {
  const sets = [];
  const vals = [];
  const map = {
    fullName: 'full_name',
    email: 'email',
    photoUrl: 'photo_url',
    island: 'island',
    region: 'region',
    district: 'district',
    ward: 'ward',
  };
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) {
      sets.push(`${col}=?`);
      vals.push(req.body[k]);
    }
  }
  // Push / notification preference (column added by migration if missing)
  if (req.body.notificationsEnabled !== undefined || req.body.pushEnabled !== undefined) {
    const enabled = req.body.notificationsEnabled !== undefined
      ? Boolean(req.body.notificationsEnabled)
      : Boolean(req.body.pushEnabled);
    try {
      await db.query('UPDATE users SET push_enabled=? WHERE id=?', [enabled ? 1 : 0, req.user.sub]);
    } catch (_) {
      // Column may not exist yet; ignore
    }
  }
  if (!sets.length) return exports.me(req, res);
  vals.push(req.user.sub);
  await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
  return exports.me(req, res);
});

exports.savedList = asyncHandler(async (req, res) =>
  ok(
    res,
    await db.query(
      'SELECT id,label,address,island,region,district,ward,lat,lng,created_at FROM saved_locations WHERE user_id=? ORDER BY id DESC',
      [req.user.sub]
    )
  )
);

exports.savedCreate = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.label || !b.address) throw ApiError.badRequest('label and address are required');
  const r = await db.query(
    'INSERT INTO saved_locations(user_id,label,address,island,region,district,ward,lat,lng) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      req.user.sub,
      b.label,
      b.address,
      b.island || null,
      b.region || null,
      b.district || null,
      b.ward || null,
      b.lat ?? null,
      b.lng ?? null,
    ]
  );
  ok(res, { id: r.insertId }, 'Location saved', 201);
});

exports.savedDelete = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM saved_locations WHERE id=? AND user_id=?', [req.params.id, req.user.sub]);
  ok(res, null, 'Location removed');
});

exports.paymentMethods = asyncHandler(async (req, res) =>
  ok(
    res,
    await db.query(
      `SELECT id, type, provider, account_number accountNumber, card_last4 cardLast4,
              card_brand cardBrand, expiry_month expiryMonth, expiry_year expiryYear,
              card_holder cardHolder, is_default isDefault
       FROM payment_methods WHERE user_id=? ORDER BY is_default DESC, id DESC`,
      [req.user.sub]
    )
  )
);

exports.paymentCreate = asyncHandler(async (req, res) => {
  const b = req.body;
  let type = b.type;
  if (type === 'bank') type = 'card';
  if (!['cash', 'momo', 'bank', 'wallet', 'card'].includes(type)) {
    throw ApiError.badRequest('Invalid payment method');
  }
  // Accept both Flutter field names and canonical API names
  const accountNumber = b.accountNumber || b.account || null;
  const cardLast4 = b.cardLast4 || b.last4 || null;
  const cardBrand = b.cardBrand || b.brand || null;
  const cardHolder = b.cardHolder || b.label || null;
  let expiryMonth = b.expiryMonth || null;
  let expiryYear = b.expiryYear || null;
  if ((!expiryMonth || !expiryYear) && b.expiry) {
    const parts = String(b.expiry).split(/[\/\-]/);
    if (parts.length >= 2) {
      expiryMonth = parts[0];
      expiryYear = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
    }
  }
  const isDefault = b.isDefault === true || b.isDefault === 1 || b.isDefault === '1' || b.isDefault === 'true';

  const r = await db.query(
    `INSERT INTO payment_methods(user_id,type,provider,account_number,card_last4,card_brand,expiry_month,expiry_year,card_holder,is_default)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [
      req.user.sub,
      type,
      b.provider || null,
      accountNumber,
      cardLast4,
      cardBrand,
      expiryMonth,
      expiryYear,
      cardHolder,
      isDefault ? 1 : 0,
    ]
  );
  if (isDefault) {
    await db.query('UPDATE payment_methods SET is_default=0 WHERE user_id=? AND id<>?', [
      req.user.sub,
      r.insertId,
    ]);
    await db.query('UPDATE payment_methods SET is_default=1 WHERE id=?', [r.insertId]);
  }
  ok(res, { id: r.insertId }, 'Payment method added', 201);
});

exports.paymentDefault = asyncHandler(async (req, res) => {
  const exists = await db.query('SELECT id FROM payment_methods WHERE id=? AND user_id=?', [
    req.params.id,
    req.user.sub,
  ]);
  if (!exists.length) throw ApiError.notFound('Payment method not found');
  await db.query('UPDATE payment_methods SET is_default=(id=?) WHERE user_id=?', [
    req.params.id,
    req.user.sub,
  ]);
  ok(res, null, 'Default payment method updated');
});

exports.paymentDelete = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM payment_methods WHERE id=? AND user_id=?', [req.params.id, req.user.sub]);
  ok(res, null, 'Payment method removed');
});

exports.deviceToken = asyncHandler(async (req, res) => {
  if (!req.body.token) throw ApiError.badRequest('FCM token is required.');
  await db.query(
    `INSERT INTO device_tokens(user_id,token,platform) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), platform=VALUES(platform), updated_at=UTC_TIMESTAMP()`,
    [req.user.sub, req.body.token, req.body.platform || 'unknown']
  );
  ok(res, null, 'Device registered');
});

exports.removeDeviceToken = asyncHandler(async (req, res) => {
  if (!req.body.token) throw ApiError.badRequest('FCM token is required.');
  await db.query('DELETE FROM device_tokens WHERE user_id=? AND token=?', [req.user.sub, req.body.token]);
  ok(res, null, 'Device removed');
});

/** Rider reports a driver — stored for admin review */
exports.createReport = asyncHandler(async (req, res) => {
  const b = req.body;
  const driverId = b.driverId || b.driver_id;
  const reason = (b.reason || b.message || '').toString().trim();
  if (!driverId) throw ApiError.badRequest('driverId is required');
  if (!reason) throw ApiError.badRequest('reason is required');

  // Ensure table exists (safe for already-migrated DBs)
  await db.query(`CREATE TABLE IF NOT EXISTS driver_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    reporter_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    ride_id BIGINT UNSIGNED NULL,
    reason VARCHAR(500) NOT NULL,
    details TEXT NULL,
    status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_report_driver (driver_id, status),
    KEY idx_report_reporter (reporter_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const r = await db.query(
    `INSERT INTO driver_reports(reporter_id, driver_id, ride_id, reason, details) VALUES(?,?,?,?,?)`,
    [req.user.sub, driverId, b.rideId || b.ride_id || null, reason, b.details || null]
  );
  ok(res, { id: r.insertId }, 'Report submitted', 201);
});

exports.listMyReports = asyncHandler(async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT * FROM driver_reports WHERE reporter_id=? ORDER BY id DESC',
      [req.user.sub]
    );
    ok(res, rows);
  } catch (_) {
    ok(res, []);
  }
});


const authService = require('../services/auth.service');
const crypto = require('crypto');

exports.sendEmailChangeOtp = asyncHandler(async (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) throw ApiError.badRequest('Valid email is required');
  // Reuse OTP table via auth service purpose
  await authService.sendEmailOtp({ email, purpose: 'rider_email_change' });
  // store pending email on user row if column exists, else client keeps it
  try {
    await db.query('UPDATE users SET pending_email=? WHERE id=?', [email, req.user.sub]);
  } catch (_) {}
  ok(res, { email }, 'OTP sent to email');
});

exports.verifyEmailChangeOtp = asyncHandler(async (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  const code = (req.body.code || '').toString().trim();
  if (!email || !code) throw ApiError.badRequest('email and code are required');
  const otp = require('../services/otp.service');
  await otp.verify({ target: email, code, purpose: 'rider_email_change' });
  await db.query('UPDATE users SET email=?, email_verified_at=UTC_TIMESTAMP() WHERE id=?', [email, req.user.sub]);
  return exports.me(req, res);
});

