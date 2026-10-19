/**
 * OTP via NextSMS (Internet SMS + WhatsApp SMS).
 * We generate the code ourselves, send it through NextSMS, and verify against a local hash.
 * Twilio has been fully removed.
 */
const crypto = require('crypto');
const config = require('../config/env');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, '0');
}

/** Basic Auth header for NextSMS (username:password base64) */
function nextsmsAuthHeader() {
  const { username, password, apiKey } = config.nextsms;
  if (apiKey) return `Basic ${apiKey}`;
  if (!username || !password) {
    throw ApiError.badRequest('NextSMS is not configured. Set NEXTSMS_USERNAME and NEXTSMS_PASSWORD in .env.');
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/**
 * Normalize phone to NextSMS format: 255XXXXXXXXX (no +)
 */
function toNextsmsPhone(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

/**
 * Send OTP message via NextSMS.
 * channel: 'sms' | 'whatsapp'
 */
async function sendViaNextsms({ to, text, channel = 'sms' }) {
  const phone = toNextsmsPhone(to);
  const from = config.nextsms.senderId || 'NEXTSMS';
  const isTest = config.nextsms.environment === 'testing' || config.nextsms.environment === 'test';

  let path;
  if (channel === 'whatsapp') {
    path = isTest
      ? '/api/whatsapp/v2/test/text/single'
      : '/api/whatsapp/v2/text/single';
  } else {
    path = isTest
      ? '/api/sms/v2/test/text/single'
      : '/api/sms/v2/text/single';
  }

  const base = (config.nextsms.baseUrl || 'https://messaging-service.co.tz').replace(/\/$/, '');
  const url = `${base}${path}`;

  const body = { from, to: phone, text };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: nextsmsAuthHeader()
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      data.error ||
      data.messages?.[0]?.status?.description ||
      `NextSMS HTTP ${res.status}`;
    throw ApiError.badRequest(`Failed to send OTP via NextSMS: ${msg}`);
  }

  const messageId =
    data.messages?.[0]?.messageId ||
    data.messages?.[0]?.message_id ||
    data.messageId ||
    data.reference ||
    data.requestId ||
    `NEXTSMS-${Date.now()}`;

  return { messageId, raw: data };
}

async function send({ target, purpose = 'login', channel }) {
  const ch = (channel || config.nextsms.defaultChannel || 'sms').toLowerCase();
  if (!['sms', 'whatsapp'].includes(ch)) {
    throw ApiError.badRequest('Channel must be sms or whatsapp.');
  }

  const recent = await db.query(
    'SELECT id, last_sent_at FROM otp_verifications WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1',
    [target, purpose]
  );
  if (
    recent.length &&
    recent[0].last_sent_at &&
    Date.now() - new Date(recent[0].last_sent_at).getTime() < config.security.otpResendSeconds * 1000
  ) {
    throw ApiError.badRequest(
      `Please wait ${config.security.otpResendSeconds} seconds before requesting another OTP.`
    );
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const appName = config.appName || 'ZenjiGO';
  const text = `${appName} verification code: ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`;

  let messageId = null;
  const hasCreds = !!(config.nextsms.username && config.nextsms.password) || !!config.nextsms.apiKey;
  if (hasCreds && config.nodeEnv !== 'test') {
    const sent = await sendViaNextsms({ to: target, text, channel: ch });
    messageId = sent.messageId;
  } else if (config.nodeEnv !== 'production') {
    console.warn(`[OTP DEV] target=${target} purpose=${purpose} channel=${ch} code=${code}`);
    messageId = `DEV-${Date.now()}`;
  } else {
    throw ApiError.badRequest('NextSMS credentials are not configured.');
  }

  await db.query(
    'UPDATE otp_verifications SET status="cancelled" WHERE target=? AND purpose=? AND status="pending"',
    [target, purpose]
  );

  await db.query(
    `INSERT INTO otp_verifications(target, channel, purpose, provider_sid, code_hash, last_sent_at, expires_at)
     VALUES(?,?,?,?,?,UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [target, ch, purpose, messageId, codeHash, OTP_TTL_MINUTES]
  );

  return { sid: messageId, channel: ch };
}

async function verify({ target, code, purpose = 'login' }) {
  const rows = await db.query(
    `SELECT id, code_hash, attempts, expires_at, status
     FROM otp_verifications
     WHERE target=? AND purpose=? AND status="pending"
     ORDER BY id DESC LIMIT 1`,
    [target, purpose]
  );

  if (!rows.length) throw ApiError.badRequest('Invalid or expired OTP.');

  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query('UPDATE otp_verifications SET status="expired" WHERE id=?', [row.id]);
    throw ApiError.badRequest('Invalid or expired OTP.');
  }

  const maxAttempts = config.security.otpMaxAttempts || 5;
  if (Number(row.attempts) >= maxAttempts) {
    await db.query('UPDATE otp_verifications SET status="cancelled" WHERE id=?', [row.id]);
    throw ApiError.badRequest('Too many invalid attempts. Request a new OTP.');
  }

  const incoming = hashCode(String(code || '').trim());
  if (!row.code_hash || incoming !== row.code_hash) {
    await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?', [row.id]);
    throw ApiError.badRequest('Invalid or expired OTP.');
  }

  await db.query(
    'UPDATE otp_verifications SET status="verified", verified_at=UTC_TIMESTAMP() WHERE id=?',
    [row.id]
  );
  return true;
}

module.exports = { send, verify, sendViaNextsms, toNextsmsPhone };
