const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizePhone } = require('../utils/phone');
const { signAccess, issueRefreshToken } = require('../utils/jwt');
const otp = require('./otp.service');
const { sendWelcomeEmail } = require('./welcome-email.service');

function publicUser(row, wallet = 0) {
  return {
    id: row.id, role: row.role, fullName: row.full_name, phone: row.phone, email: row.email,
    photoUrl: row.photo_url, island: row.island, region: row.region, district: row.district,
    ward: row.ward, status: row.status, walletBalance: Number(wallet)
  };
}

function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 2) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}${domain}`;
}

/**
 * OTP is always delivered by email.
 * IMPORTANT: when phone is provided for login, look up the user by (role + phone)
 * so a shared phone number never routes the code to another role (e.g. admin).
 * The code is sent to the account's registered email; if the client also sends
 * an email it must match that account.
 */
async function sendOtp({ phone, email, purpose = 'login', role = null }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !mail.includes('@')) {
    throw ApiError.badRequest('A valid email address is required. OTP is delivered by email only.');
  }

  // Infer role from purpose / explicit role (set by auth routes)
  const resolvedRole =
    role ||
    (purpose === 'driver_registration' ? 'driver' : null) ||
    (purpose === 'admin_login' ? 'admin' : null);

  // Login flows: resolve the account in a role-safe way, then email THAT account only
  if (purpose === 'login' || purpose === 'admin_login') {
    let user = null;
    const targetPhone = phone ? normalizePhone(phone) : null;

    if (resolvedRole && targetPhone) {
      const rows = await db.query(
        'SELECT id, email, phone, role FROM users WHERE role = ? AND phone = ? LIMIT 1',
        [resolvedRole, targetPhone]
      );
      user = rows[0] || null;
    }

    // Fallback: look up by role + email
    if (!user && resolvedRole && mail) {
      const rows = await db.query(
        'SELECT id, email, phone, role FROM users WHERE role = ? AND email = ? LIMIT 1',
        [resolvedRole, mail]
      );
      user = rows[0] || null;
    }

    // Last resort without role (legacy): match email exactly, never bare phone across roles
    if (!user && mail) {
      const rows = await db.query(
        'SELECT id, email, phone, role FROM users WHERE email = ? LIMIT 1',
        [mail]
      );
      user = rows[0] || null;
    }

    if (!user) {
      // New rider registration: account does not exist yet.
      // Deliver OTP to the email the client provided so verifyRider can create the user
      // with fullName, island, region, etc. from the registration form.
      if (resolvedRole === 'rider' && mail) {
        await otp.send({ target: mail, purpose: 'login', channel: 'email' });
        return { target: mail, maskedEmail: maskEmail(mail) };
      }
      throw ApiError.notFound(
        resolvedRole
          ? `No ${resolvedRole} account found for these credentials.`
          : 'No account found for these credentials.'
      );
    }

    const registered = String(user.email || '').trim().toLowerCase();
    if (!registered) {
      throw ApiError.badRequest('This account has no email on file. Contact support.');
    }

    // If the client supplied an email, it must match the account (prevents sending codes to the wrong inbox)
    if (mail && mail !== registered) {
      throw ApiError.badRequest(
        'The email you entered does not match the email registered for this phone number.'
      );
    }

    await otp.send({ target: registered, purpose, channel: 'email' });
    return { target: registered, maskedEmail: maskEmail(registered) };
  }

  // Registration / other purposes: deliver to the email the user typed in
  await otp.send({ target: mail, purpose, channel: 'email' });
  return { target: mail, maskedEmail: maskEmail(mail) };
}

async function sendEmailOtp({ email, purpose = 'driver_registration' }) {
  const target = String(email || '').trim().toLowerCase();
  if (!target || !target.includes('@')) throw ApiError.badRequest('A valid email address is required.');
  await otp.send({ target, purpose, channel: 'email' });
  return { target, maskedEmail: maskEmail(target) };
}

async function verifyDriverOtp({ target, code, purpose = 'driver_registration' }) {
  const t = String(target || '').trim().toLowerCase();
  if (!t || !t.includes('@')) throw ApiError.badRequest('A valid email target is required.');
  if (!code || String(code).trim().length < 4) throw ApiError.badRequest('OTP code is required.');
  await otp.check({ target: t, code: String(code).trim(), purpose });
  return { verified: true, target: t };
}

async function verifyRider({ phone, code, fullName, email, island, region, district, ward }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !mail.includes('@')) throw ApiError.badRequest('Email is required for verification.');
  await otp.verify({ target: mail, code, purpose: 'login' });
  const target = normalizePhone(phone);
  let rows = await db.query("SELECT * FROM users WHERE phone=? AND role='rider' LIMIT 1", [target]);
  let user;
  let isNewRider = false;
  if (rows.length) {
    user = rows[0];
    
    await db.query(
      `UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP(),
       full_name=COALESCE(NULLIF(?,''),full_name),email=COALESCE(NULLIF(?,''),email),
       island=COALESCE(NULLIF(?,''),island),region=COALESCE(NULLIF(?,''),region),
       district=COALESCE(NULLIF(?,''),district),ward=COALESCE(NULLIF(?,''),ward) WHERE id=?`,
      [fullName || '', mail, island || '', region || '', district || '', ward || '', user.id]);
    rows = await db.query('SELECT * FROM users WHERE id=?', [user.id]);
    user = rows[0];
  } else {
    const byEmail = await db.query("SELECT id FROM users WHERE email=? AND role='rider' LIMIT 1", [mail]);
    if (byEmail.length) throw ApiError.conflict('This email is already associated with another account.');
    const result = await db.query(
      'INSERT INTO users(role,full_name,phone,email,island,region,district,ward,phone_verified_at) VALUES("rider",?,?,?,?,?,?,?,UTC_TIMESTAMP())',
      [fullName || 'ZenjiGO Rider', target, mail, island || null, region || null, district || null, ward || null]);
    const id = result.insertId;
    isNewRider = true;
    await db.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)', [id, `ZG${String(id).padStart(6, '0')}`]);
    await db.query('INSERT INTO wallets(user_id) VALUES(?)', [id]);
    user = (await db.query('SELECT * FROM users WHERE id=?', [id]))[0];
  }
  const wallet = (await db.query('SELECT balance FROM wallets WHERE user_id=?', [user.id]))[0]?.balance || 0;
  if (isNewRider) {
    try { await sendWelcomeEmail({ email: user.email, name: user.full_name, role: 'rider' }); }
    catch (err) { console.error('[WELCOME EMAIL] Failed to send rider welcome email:', err.message); }
  }
  return { user: publicUser(user, wallet), accessToken: signAccess({ sub: user.id, role: user.role }), refreshToken: await issueRefreshToken(user.id, user.role) };
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
  await otp.send({ target: normalizedEmail, purpose: 'admin_login', channel: 'email' });
  return { maskedEmail: maskEmail(normalizedEmail), requiresOtp: true };
}

async function verifyAdminOtp({ email, code }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rows = await db.query('SELECT * FROM users WHERE email=? AND role="admin" LIMIT 1', [normalizedEmail]);
  if (!rows.length) throw ApiError.unauthorized('Invalid admin credentials.');
  const admin = rows[0];
  if (admin.status !== 'active') throw ApiError.forbidden('Admin account is not active.');
  await otp.verify({ target: normalizedEmail, code, purpose: 'admin_login' });
  await db.query('UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP() WHERE id=?', [admin.id]);
  const fresh = (await db.query('SELECT * FROM users WHERE id=?', [admin.id]))[0] || admin;
  return { user: publicUser(fresh), accessToken: signAccess({ sub: fresh.id, role: 'admin' }), refreshToken: await issueRefreshToken(fresh.id, 'admin') };
}

async function loginDriver({ phone, email, code }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !mail.includes('@')) {
    const targetPhone = normalizePhone(phone);
    const rows = await db.query(
      'SELECT u.email FROM users u JOIN driver_profiles d ON d.user_id=u.id WHERE u.phone=? AND u.role="driver" LIMIT 1', [targetPhone]);
    if (!rows.length || !rows[0].email) throw ApiError.badRequest('Email is required for verification.');
    await otp.verify({ target: String(rows[0].email).toLowerCase(), code, purpose: 'login' });
  } else {
    await otp.verify({ target: mail, code, purpose: 'login' });
  }
  const target = normalizePhone(phone);
  const rows = await db.query(
    'SELECT u.*,d.application_status FROM users u JOIN driver_profiles d ON d.user_id=u.id WHERE u.phone=? AND u.role="driver" LIMIT 1', [target]);
  if (!rows.length) throw ApiError.notFound('Driver account not found. Complete driver registration first.');
  const user = rows[0];
  if (user.status === 'suspended' || user.status === 'banned') throw ApiError.forbidden('This driver account is suspended.');
  if (mail && mail !== (user.email || '').toLowerCase()) {
    throw ApiError.unauthorized('The email address does not match this driver account.');
  }
  await db.query('UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,UTC_TIMESTAMP()),last_login_at=UTC_TIMESTAMP() WHERE id=?', [user.id]);
  return {
    user: { ...publicUser(user), applicationStatus: user.application_status },
    accessToken: signAccess({ sub: user.id, role: 'driver' }),
    refreshToken: await issueRefreshToken(user.id, 'driver')
  };
}

module.exports = { sendOtp, sendEmailOtp, verifyDriverOtp, verifyRider, loginAdmin, verifyAdminOtp, loginDriver, publicUser };
