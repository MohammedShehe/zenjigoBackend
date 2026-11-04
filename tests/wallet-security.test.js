const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stub, fresh, fakeDb } = require('./helpers');

function loadRide(walletBalance = 1000) {
  const writes = [];
  const conn = { query: async (sql, p) => {
    if (/SELECT balance FROM wallets/.test(sql)) return [[{ balance: walletBalance }]];
    writes.push({ sql, p }); return [{}];
  } };
  stub('config/env.js', { ride: {}, nodeEnv: 'test' });
  stub('config/db.js', { query: async () => [], transaction: async (cb) => cb(conn) });
  stub('config/firebase.js', { sendPush: async () => {} });
  stub('services/notification.service.js', { notifyUser: async () => {} });
  stub('services/driver_finance.service.js', {});
  stub('utils/realtime.js', { emitToUser() {} });
  delete require.cache[require.resolve('../src/utils/ApiError')];
  return { svc: fresh('services/ride.service.js'), writes };
}

test('chargeWallet rejects negative / zero / NaN amounts (negative used to CREDIT the wallet)', async () => {
  const { svc, writes } = loadRide(1000);
  for (const bad of [-500, 0, NaN, Infinity, 'abc', null, undefined]) {
    await assert.rejects(svc.chargeWallet(1, bad, 'adjustment', null, 'x'), (e) => e.statusCode === 400, String(bad));
  }
  assert.equal(writes.length, 0, 'no balance write may happen for rejected amounts');
});

test('chargeWallet still rejects insufficient balance', async () => {
  const { svc } = loadRide(100);
  await assert.rejects(svc.chargeWallet(1, 500, 'ride', 1, 'x'), /Insufficient/);
});

test('the rider-callable POST /wallet/charge route no longer exists', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/wallet.routes.js'), 'utf8');
  const ctrl = fs.readFileSync(path.join(__dirname, '../src/controllers/wallet.controller.js'), 'utf8');
  assert.ok(!/router\.post\(\s*['"]\/charge['"]/.test(routes));
  assert.ok(!/exports\.charge\b/.test(ctrl));
});
