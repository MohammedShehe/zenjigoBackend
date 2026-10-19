const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizePhone } = require('../utils/phone');
const { signAccess, issueRefreshToken } = require('../utils/jwt');
const otp = require('./otp.service');

function publicUser(row, wallet = 0) {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    photoUrl: row.photo_url,
    island: row.island,
    region: row.region,
    district: row.district,
    ward: row.ward,
    status: row.status,
    walletBalance: Number(wallet)
  };
}

async function sendOtp({ phone, purpose, channel }) {
  const target = normalizePhone(phone);
  await otp.send({ target, purpose, channel });
  return { target };
}

async function sendEmailOtp({ email, purpose = 'driver_registration' }) {
  const target = String(email || '').trim().toLowerCase();
  if (!target || !target.includes('@')) {
    throw ApiError.badRequest('A valid email address is required.');
  }
  await otp.send({ target, purpose, channel: 'email' });
  return { target };
}

/**
 * Non-consuming OTP check for driver registration UI.
 */
async function verifyDriverOtp({ target, code, purpose = 'driver_registration' }) {
  const t = String(target || '').trim();
  if (!t) throw ApiError.badRequest('Target (phone or email) is required.');
  if (!code || String(code).trim().length < 4) {
    throw ApiError.badRequest('OTP code is required.');
  }
  const normalized = t.includes('@') ? t.toLowerCase() : normalizePhone(t);
  await otp.check({ target: normalized, code: String(code).trim(), purpose });
  return { verified: true, target: normalized };
}

async function verifyRider({ phone, code, fullName, email, island, region, district, ward }) {
  const target = normalizePhone(phone);
  await otp.verify({ target, code, purpose: 'login' });
  let rows = await db.query('SELECT * FROM users WHERE phone=? LIMIT 1', [target]);
  let user;
  if (rows.length) {
    user = rows[0];
    if (user.role !== 'rider') throw ApiError.conflict('This phone number belongs to another account type.');
    await db.query(
      `UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP(),
       full_name=COALESCE(NULLIF(?,''),full_name),email=COALESCE(NULLIF(?,''),email),
       island=COALESCE(NULLIF(?,''),island),region=COALESCE(NULLIF(?,''),region),
       district=COALESCE(NULLIF(?,''),district),ward=COALESCE(NULLIF(?,''),ward) WHERE id=?`,
      [fullName || '', email || '', island || '', region || '', district || '', ward || '', user.id]
    );
    rows = await db.query('SELECT * FROM users WHERE id=?', [user.id]);
    user = rows[0];
  } else {
    const result = await db.query(
      'INSERT INTO users(role,full_name,phone,email,island,region,district,ward,phone_verified_at) VALUES("rider",?,?,?,?,?,?,?,UTC_TIMESTAMP())',
      [fullName || 'ZenjiGO Rider', target, email || null, island || null, region || null, district || null, ward || null]
    );
    const id = result.insertId;
    await db.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)', [id, `ZG${String(id).padStart(6, '0')}`]);
    await db.query('INSERT INTO wallets(user_id) VALUES(?)', [id]);
    user = (await db.query('SELECT * FROM users WHERE id=?', [id]))[0];
  }
  const wallet = (await db.query('SELECT balance FROM wallets WHERE user_id=?', [user.id]))[0]?.balance || 0;
  const access = signAccess({ sub: user.id, role: user.role });
  const refresh = await issueRefreshToken(user.id, user.role);
  return { user: publicUser(user, wallet), accessToken: access, refreshToken: refresh };
}

function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length <= 4) return value;
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(2, value.length - 5))}${value.slice(-2)}`;
}

async function loginAdmin({ email, password }) {
  const { comparePassword } = require('../utils/hash');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rows = await db.query('SELECT * FROM users WHERE email=? AND role="admin" LIMIT 1', [normalizedEmail]);
  if (!rows.length || !rows[0].password_hash || !(await comparePassword(password, rows[0].password_hash))) {
    throw ApiError.unauthorized('Invalid admin credentials.');
  }
  const admin = rows[0];
  if (admin.status !== 'active') throw ApiError.forbidden('Admin account is not active.');
  if (!admin.phone) throw ApiError.badRequest('Admin account has no phone number configured for OTP.');
  const target = normalizePhone(admin.phone);
  await otp.send({ target, purpose: 'admin_login' });
  return { maskedPhone: maskPhone(target), requiresOtp: true };
}

async function verifyAdminOtp({ email, code }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rows = await db.query('SELECT * FROM users WHERE email=? AND role="admin" LIMIT 1', [normalizedEmail]);
  if (!rows.length) throw ApiError.unauthorized('Invalid admin credentials.');
  const admin = rows[0];
  if (admin.status !== 'active') throw ApiError.forbidden('Admin account is not active.');
  if (!admin.phone) throw ApiError.badRequest('Admin account has no phone number configured for OTP.');
  const target = normalizePhone(admin.phone);
  await otp.verify({ target, code, purpose: 'admin_login' });
  await db.query(
    'UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP() WHERE id=?',
    [admin.id]
  );
  const fresh = (await db.query('SELECT * FROM users WHERE id=?', [admin.id]))[0] || admin;
  return {
    user: publicUser(fresh),
    accessToken: signAccess({ sub: fresh.id, role: 'admin' }),
    refreshToken: await issueRefreshToken(fresh.id, 'admin')
  };
}

async function loginDriver({ phone, code }) {
  const target = normalizePhone(phone);
  await otp.verify({ target, code, purpose: 'login' });
  const rows = await db.query(
    'SELECT u.*,d.application_status FROM users u JOIN driver_profiles d ON d.user_id=u.id WHERE u.phone=? AND u.role="driver" LIMIT 1',
    [target]
  );
  if (!rows.length) {
    throw ApiError.notFound('Driver account not found. Complete driver registration first.');
  }
  const user = rows[0];
  if (user.status === 'suspended' || user.status === 'banned') {
    throw ApiError.forbidden('This driver account is suspended.');
  }
  await db.query(
    'UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP() WHERE id=?',
    [user.id]
  );
  return {
    user: {
      ...publicUser(user),
      applicationStatus: user.application_status
    },
    accessToken: signAccess({ sub: user.id, role: 'driver' }),
    refreshToken: await issueRefreshToken(user.id, 'driver')
  };
}

module.exports = {
  sendOtp,
  sendEmailOtp,
  verifyDriverOtp,
  verifyRider,
  loginAdmin,
  verifyAdminOtp,
  loginDriver,
  publicUser
};
