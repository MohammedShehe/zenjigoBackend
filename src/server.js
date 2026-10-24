const http = require('http');
const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');
const { init } = require('./sockets');

const server = http.createServer(app);
const io = init(server);

async function startDailyReminders() {
  try {
    const cron = require('node-cron');
    // 09:00 UTC daily — gentle engagement for riders
    cron.schedule('0 9 * * *', async () => {
      try {
        const { notifyMany, allRiderIds } = require('./services/notification.service');
        const riders = await allRiderIds(2000);
        await notifyMany(
          riders,
          'Good morning from ZenjiGO',
          'Ready to explore Zanzibar? Book a ride or check today’s tour packages.',
          'daily_reminder',
          { type: 'daily_reminder' }
        );
        console.log(`[cron] daily reminder sent to ${riders.length} riders`);
      } catch (e) {
        console.warn('[cron] daily reminder failed', e.message);
      }
    });
    console.log('[cron] daily rider reminders scheduled (09:00 UTC)');

    // 08:00 UTC daily — driver document expiry warnings (30 days & 3 days)
    cron.schedule('0 8 * * *', async () => {
      try {
        await runDocumentExpiryReminders();
      } catch (e) {
        console.warn('[cron] document expiry reminders failed', e.message);
      }
    });
    console.log('[cron] driver document expiry reminders scheduled (08:00 UTC)');
  } catch (e) {
    console.warn('[cron] node-cron not available', e.message);
  }
}

/** Email + in-app notify drivers whose documents expire in ~30 days or ~3 days (or already expired). */
async function runDocumentExpiryReminders() {
  const db = require('./config/db');
  const nodemailer = require('nodemailer');
  const config = require('./config/env');
  const { notify } = require('./services/notification.service');

  // Documents expiring within 31 days or already expired (last 60 days)
  const rows = await db.query(`
    SELECT d.id docId, d.driver_id, d.document_type, d.expires_at, d.status,
           u.full_name fullName, u.email, u.phone
    FROM driver_documents d
    JOIN users u ON u.id = d.driver_id AND u.role = 'driver'
    WHERE d.expires_at IS NOT NULL
      AND d.expires_at <= DATE_ADD(UTC_DATE(), INTERVAL 31 DAY)
      AND d.expires_at >= DATE_SUB(UTC_DATE(), INTERVAL 60 DAY)
      AND d.status IN ('approved','verified','pending')
  `);

  if (!rows.length) {
    console.log('[cron] no expiring documents found');
    return;
  }

  let transporter = null;
  try {
    if (config.smtp && config.smtp.host) {
      transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port || 587,
        secure: !!config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
      });
    }
  } catch (_) {}

  let sent = 0;
  for (const row of rows) {
    const exp = new Date(row.expires_at);
    const today = new Date();
    today.setHours(0,0,0,0);
    const days = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    // Only fire on exactly ~30d, ~3d, or expired (0 or negative) to avoid daily spam
    if (!(days === 30 || days === 3 || days <= 0)) continue;

    const docLabel = String(row.document_type || 'document').replace(/_/g, ' ');
    let subject, body;
    if (days <= 0) {
      subject = `Your ${docLabel} has expired`;
      body = `Hi ${row.fullName || 'Driver'}, your ${docLabel} expired on ${exp.toISOString().slice(0,10)}. Please upload a renewed document in the ZenjiGO driver app to stay active.`;
    } else if (days === 3) {
      subject = `Your ${docLabel} expires in 3 days`;
      body = `Hi ${row.fullName || 'Driver'}, your ${docLabel} expires on ${exp.toISOString().slice(0,10)}. Renew it now to avoid interruption of service.`;
    } else {
      subject = `Your ${docLabel} expires in 30 days`;
      body = `Hi ${row.fullName || 'Driver'}, your ${docLabel} will expire on ${exp.toISOString().slice(0,10)}. Please plan to renew and upload the new document.`;
    }

    try {
      await notify(row.driver_id, subject, body, 'document_expiry', {
        type: 'document_expiry',
        documentId: String(row.docId),
        daysUntilExpiry: days
      });
    } catch (_) {}

    if (transporter && row.email) {
      try {
        await transporter.sendMail({
          from: (config.smtp && config.smtp.from) || 'ZenjiGO <noreply@zenjigo.online>',
          to: row.email,
          subject: `[ZenjiGO] ${subject}`,
          text: body,
          html: `<p>${body}</p><p style="color:#666;font-size:12px">— ZenjiGO Platform</p>`
        });
        sent++;
      } catch (e) {
        console.warn('[cron] email failed for driver', row.driver_id, e.message);
      }
    }
  }
  console.log(`[cron] document expiry processed ${rows.length} docs, emails sent: ${sent}`);
}

async function start() {
  await db.health();
  server.listen(config.port, () =>
    console.log(`ZenjiGO API listening on http://localhost:${config.port}${config.apiPrefix}`)
  );
  startDailyReminders();
}

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  await db.pool.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start().catch((e) => {
  console.error('Startup failed:', e);
  process.exit(1);
});

module.exports = { server, io };
