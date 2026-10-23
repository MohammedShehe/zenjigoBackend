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
  } catch (e) {
    console.warn('[cron] node-cron not available', e.message);
  }
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
