const nodemailer = require('nodemailer');
const config = require('../config/env');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function welcomeHtml({ name, role, appName }) {
  const safeName = escapeHtml(name || 'there');
  const isDriver = role === 'driver';
  const heading = isDriver ? 'Welcome to the ZenjiGO Driver Community' : 'Welcome to ZenjiGO';
  const intro = isDriver
    ? 'Thank you for registering as a driver with ZenjiGO. We appreciate your interest in joining our driver community.'
    : 'Thank you for creating your ZenjiGO account. We are delighted to have you with us.';
  const nextStep = isDriver
    ? 'Your driver application and submitted documents are now pending review. We will let you know when your application status changes. You can sign in to check your application status at any time.'
    : 'You can now sign in to your account to request rides, manage your profile, and stay up to date with your trips.';
  const year = new Date().getFullYear();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#064e3b;padding:30px 36px;text-align:center"><div style="font-size:28px;font-weight:700;letter-spacing:.3px;color:#fff">${escapeHtml(appName)}</div><div style="font-size:13px;color:#d1fae5;margin-top:7px">Ride Anywhere in Zanzibar</div></td></tr>
  <tr><td style="padding:34px 36px 28px"><p style="font-size:16px;line-height:1.6;margin:0 0 18px">Hello ${safeName},</p>
  <h1 style="font-size:24px;line-height:1.3;margin:0 0 18px;color:#064e3b">${heading}</h1>
  <p style="font-size:15px;line-height:1.75;color:#334155;margin:0 0 16px">${intro}</p>
  <p style="font-size:15px;line-height:1.75;color:#334155;margin:0 0 16px">${nextStep}</p>
  <p style="font-size:15px;line-height:1.75;color:#334155;margin:0 0 22px">If you have any questions or need assistance, please contact our support team. We are happy to help.</p>
  <p style="font-size:15px;line-height:1.7;color:#334155;margin:0">Kind regards,<br><strong>The ${escapeHtml(appName)} Team</strong></p></td></tr>
  <tr><td style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center"><p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">© ${year} ${escapeHtml(appName)}. All rights reserved.</p><p style="font-size:11px;color:#94a3b8;margin:7px 0 0">This is an automated account welcome message. Please do not reply directly to this email.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendWelcomeEmail({ email, name, role }) {
  const target = String(email || '').trim().toLowerCase();
  if (!target || !target.includes('@')) return { sent: false, reason: 'missing_email' };
  const { host, port, user, password, from } = config.smtp;
  if (!host || !user || !password || !from) {
    console.warn(`[WELCOME EMAIL] SMTP is not configured; skipped welcome email for ${target}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  const appName = config.appName || 'ZenjiGO';
  const isDriver = role === 'driver';
  const transporter = nodemailer.createTransport({
    host, port: Number(port || 587), secure: Number(port || 587) === 465,
    auth: { user, pass: password },
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 15000
  });
  const subject = isDriver
    ? `Welcome to ${appName} — Driver Registration Received`
    : `Welcome to ${appName} — Your Account Is Ready`;
  await transporter.sendMail({
    from, to: target, subject,
    text: `Hello ${name || 'there'},\n\n${isDriver
      ? `Thank you for registering as a driver with ${appName}. Your application and documents are pending review. We will notify you when your application status changes.`
      : `Thank you for creating your ${appName} account. You can now sign in to request rides and manage your profile.`}\n\nIf you need assistance, please contact our support team.\n\nKind regards,\nThe ${appName} Team`,
    html: welcomeHtml({ name, role, appName })
  });
  return { sent: true };
}

module.exports = { sendWelcomeEmail };
