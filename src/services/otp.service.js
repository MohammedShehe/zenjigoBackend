/**
 * OTP delivery via Email only.
 * Phone/SMS/WhatsApp OTP has been fully removed. Users still provide a phone
 * number for account identity, but every verification code is sent by email.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

const LOGO_PATH = path.join(__dirname, '../../public/email/zenjigo-logo.png');
let logoBuffer = null;
try {
  if (fs.existsSync(LOGO_PATH)) logoBuffer = fs.readFileSync(LOGO_PATH);
} catch (_) {}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, '0');
}

function buildEmailHtml({ appName, code, purpose }) {
  const purposeLabel =
    purpose === 'admin_login' ? 'Admin Login' :
    purpose === 'driver_registration' ? 'Driver Registration' :
    purpose === 'login' ? 'Login' : 'Verification';
  const year = new Date().getFullYear();
  const logoHtml = logoBuffer
    ? `<img src="cid:zenjigo-logo" alt="${appName}" width="180" style="display:block;max-width:180px;height:auto;" />`
    : `<div style="font-size:28px;font-weight:800;color:#10b981;letter-spacing:-0.5px;">${appName}</div>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${appName} Verification Code</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
body{margin:0!important;padding:0!important;width:100%!important;background-color:#0f172a}
a{color:#10b981;text-decoration:none}
@media only screen and (max-width:620px){.container{width:100%!important;padding:16px!important}.code-box{font-size:28px!important;letter-spacing:6px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0f172a;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" class="container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background-color:#111827;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.35);">
<tr><td align="center" style="padding:36px 32px 20px;background:linear-gradient(135deg,#064e3b 0%,#0f172a 100%);">${logoHtml}</td></tr>
<tr><td style="padding:8px 32px 32px;">
<h1 style="margin:24px 0 8px;font-size:22px;font-weight:700;color:#f8fafc;text-align:center;">${purposeLabel} Verification</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#94a3b8;text-align:center;">Use the secure one-time code below to continue. Valid for <strong style="color:#e2e8f0;">${OTP_TTL_MINUTES} minutes</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:8px 0 24px;">
<div class="code-box" style="display:inline-block;background:linear-gradient(135deg,#064e3b,#065f46);border:1px solid #10b981;border-radius:12px;padding:18px 32px;font-size:36px;font-weight:800;letter-spacing:10px;color:#ecfdf5;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;text-align:center;">If you did not request this code, ignore this email. Never share this code — ${appName} staff will never ask for it.</p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #1e293b;background-color:#0b1220;">
<p style="margin:0 0 6px;font-size:12px;color:#64748b;text-align:center;">&copy; ${year} ${appName}. Ride Anywhere in Zanzibar.</p>
<p style="margin:0;font-size:11px;color:#475569;text-align:center;">Automated message — please do not reply.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function send({ target, purpose = 'login', channel }) {
  const email = String(target || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw ApiError.badRequest('A valid email address is required for OTP delivery.');
  }
  const ch = 'email';
  if (channel && String(channel).toLowerCase() !== 'email') {
    throw ApiError.badRequest('Unsupported channel. Only email OTP is available.');
  }
  const recent = await db.query(
    'SELECT id, last_sent_at FROM otp_verifications WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1',
    [email, purpose]
  );
  if (recent.length && recent[0].last_sent_at &&
      Date.now() - new Date(recent[0].last_sent_at).getTime() < config.security.otpResendSeconds * 1000) {
    throw ApiError.badRequest(`Please wait ${config.security.otpResendSeconds} seconds before requesting another OTP.`);
  }
  const code = generateCode();
  const codeHash = hashCode(code);
  const appName = config.appName || 'ZenjiGO';
  const text = `${appName} verification code: ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`;
  let messageId = null;
  const { host, port, user, password, from } = config.smtp;
  if (!host || !user || !password || !from) {
    if (config.nodeEnv !== 'production' && process.env.OTP_ALLOW_CONSOLE === 'true') {
      console.warn(`[OTP DEV CONSOLE] target=${email} purpose=${purpose} code=${code}`);
      messageId = `DEV-CONSOLE-${Date.now()}`;
    } else {
      throw ApiError.badRequest('Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.');
    }
  } else {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host, port: Number(port || 587), secure: Number(port || 587) === 465,
      auth: { user, pass: password },
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 15000
    });
    const mailOptions = {
      from, to: email,
      subject: `${appName} · ${purpose === 'admin_login' ? 'Admin ' : ''}verification code`,
      text, html: buildEmailHtml({ appName, code, purpose }),
      attachments: logoBuffer ? [{ filename: 'zenjigo-logo.png', content: logoBuffer, cid: 'zenjigo-logo', contentType: 'image/png' }] : []
    };
    const info = await transporter.sendMail(mailOptions);
    messageId = info.messageId || `SMTP-${Date.now()}`;
  }
  await db.query('UPDATE otp_verifications SET status="cancelled" WHERE target=? AND purpose=? AND status="pending"', [email, purpose]);
  await db.query(
    `INSERT INTO otp_verifications(target, channel, purpose, provider_sid, code_hash, last_sent_at, expires_at)
     VALUES(?,?,?,?,?,UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [email, ch, purpose, messageId, codeHash, OTP_TTL_MINUTES]
  );
  return { sid: messageId, channel: ch };
}

async function verify({ target, code, purpose = 'login' }) {
  const email = String(target || '').trim().toLowerCase();
  const rows = await db.query(
    `SELECT id, code_hash, attempts, expires_at, status FROM otp_verifications
     WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1`, [email, purpose]);
  if (!rows.length) throw ApiError.badRequest('Invalid or expired OTP. Request a new one.');
  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query('UPDATE otp_verifications SET status="expired" WHERE id=?', [row.id]);
    throw ApiError.badRequest('OTP has expired. Request a new one.');
  }
  const maxAttempts = config.security.otpMaxAttempts || 5;
  if (Number(row.attempts) >= maxAttempts) {
    await db.query('UPDATE otp_verifications SET status="cancelled" WHERE id=?', [row.id]);
    throw ApiError.badRequest('Too many invalid attempts. Request a new OTP.');
  }
  const incoming = hashCode(String(code || '').trim());
  if (!row.code_hash || incoming !== row.code_hash) {
    await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?', [row.id]);
    throw ApiError.badRequest('Invalid OTP code. Check the code and try again.');
  }
  await db.query('UPDATE otp_verifications SET status="verified", verified_at=UTC_TIMESTAMP() WHERE id=?', [row.id]);
  return true;
}

async function check({ target, code, purpose = 'login' }) {
  const email = String(target || '').trim().toLowerCase();
  const rows = await db.query(
    `SELECT id, code_hash, attempts, expires_at, status FROM otp_verifications
     WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1`, [email, purpose]);
  if (!rows.length) throw ApiError.badRequest('Invalid or expired OTP. Request a new one.');
  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query('UPDATE otp_verifications SET status="expired" WHERE id=?', [row.id]);
    throw ApiError.badRequest('OTP has expired. Request a new one.');
  }
  const maxAttempts = config.security.otpMaxAttempts || 5;
  if (Number(row.attempts) >= maxAttempts) throw ApiError.badRequest('Too many invalid attempts. Request a new OTP.');
  const incoming = hashCode(String(code || '').trim());
  if (!row.code_hash || incoming !== row.code_hash) {
    await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?', [row.id]);
    throw ApiError.badRequest('Invalid OTP code. Check the code and try again.');
  }
  return true;
}

module.exports = { send, verify, check };
