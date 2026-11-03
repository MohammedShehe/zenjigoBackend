/**
 * Integration test for the ride lifecycle engine. Runs against a THROW-AWAY database (never production):
 *
 *   DB_HOST=127.0.0.1 DB_NAME=zg_test DB_USER=... DB_PASSWORD=... node src/utils/migrate.js
 *   DB_HOST=127.0.0.1 DB_NAME=zg_test DB_USER=... DB_PASSWORD=... node scripts/test-ride-lifecycle.js
 */
const http = require('http');
const assert = require('assert');
require('../src/config/env');
if (!/test/i.test(process.env.DB_NAME || '')) { console.error('Refusing to run: DB_NAME must contain "test".'); process.exit(2); }
const db = require('../src/config/db');
const app = require('../src/app');
const { signAccess } = require('../src/utils/jwt');
const rides = require('../src/services/ride.service');
const life = require('../src/services/ride.lifecycle.service');

let server, base, n = 0, passed = 0;
const P = { lat: -6.1659, lng: 39.2026 }, D = { lat: -6.1400, lng: 39.2200 };

async function user(role, name) {
  n++;
  const r = await db.query('INSERT INTO users(role,full_name,phone,email,status) VALUES(?,?,?,?,?)', [role, name, `+2557${String(Date.now()).slice(-6)}${n}`.slice(0, 15), `t${Date.now()}${n}@t.io`, 'active']);
  return r.insertId;
}
async function rider(name = 'Rider') {
  const id = await user('rider', name);
  await db.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)', [id, `R${id}${Date.now() % 1e5}`]);
  await db.query('INSERT INTO wallets(user_id,balance) VALUES(?,?)', [id, 0]);
  return id;
}
async function driver(name = 'Driver', type = 'boda') {
  const id = await user('driver', name);
  await db.query(`INSERT INTO driver_profiles(user_id,driver_code,application_status,online,current_lat,current_lng,location_updated_at) VALUES(?,?,'active',1,?,?,UTC_TIMESTAMP())`, [id, `D${id}${Date.now() % 1e5}`, P.lat + 0.002, P.lng + 0.002]);
  await db.query('INSERT INTO vehicles(driver_id,type,plate_number) VALUES(?,?,?)', [id, type, `T${id}${Date.now() % 1e4}`]);
  return id;
}
async function admin() { return user('admin', 'Admin'); }
const tok = (id, role) => signAccess({ sub: id, role });
async function api(t, method, path, body) {
  const res = await fetch(base + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j, data: j.data };
}
const book = (id, extra = {}) => api(tok(id, 'rider'), 'POST', '/rider/rides', { rideType: 'boda', pickupAddress: 'A', destinationAddress: 'B', pickupLat: P.lat, pickupLng: P.lng, destinationLat: D.lat, destinationLng: D.lng, paymentMethod: 'cash', ...extra });
const age = (rideId, col, min) => db.query(`UPDATE rides SET ${col}=DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE id=?`, [min, rideId]);
const ping = (driverId, min, online = 1) => db.query('UPDATE driver_profiles SET location_updated_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE), online=? WHERE user_id=?', [min, online, driverId]);
const row = async (id) => (await db.query('SELECT * FROM rides WHERE id=?', [id]))[0];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✘', name, '\n     ', e.message); process.exitCode = 1; }
}

(async () => {
  await life.ensureLifecycleSchema();
  server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  console.log('Ride lifecycle tests');

  await t('booking while a ride is active returns a structured, resumable 409', async () => {
    const r = await rider(); const a = await book(r);
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    const b = await book(r);
    assert.strictEqual(b.status, 409);
    assert.strictEqual(b.body.details.code, 'ACTIVE_RIDE_EXISTS');
    assert.strictEqual(Number(b.body.details.rideId), Number(a.data.id));
  });

  await t('GET /rider/rides/active restores the ride; none for a fresh rider', async () => {
    const r = await rider(); assert.strictEqual((await api(tok(r, 'rider'), 'GET', '/rider/rides/active')).data.ride, null);
    const a = await book(r); const act = await api(tok(r, 'rider'), 'GET', '/rider/rides/active');
    assert.strictEqual(Number(act.data.ride.id), Number(a.data.id)); assert.ok(act.data.ride.trip_pin, 'rider sees PIN');
  });

  await t('concurrent double-tap booking creates exactly one ride', async () => {
    const r = await rider(); const res = await Promise.all([book(r), book(r), book(r)]);
    assert.strictEqual(res.filter((x) => x.status === 201).length, 1, res.map((x) => x.status).join(','));
    assert.strictEqual((await db.query("SELECT COUNT(*) n FROM rides WHERE rider_id=?", [r]))[0].n, 1);
  });

  await t('unanswered search is cleared so the rider can book again', async () => {
    const r = await rider(); const a = await book(r); await age(a.data.id, 'searching_since', 10);
    const b = await book(r); assert.strictEqual(b.status, 201, JSON.stringify(b.body));
    assert.strictEqual((await row(a.data.id)).status, 'cancelled');
  });

  await t('same pickup/destination, wallet too low, and absurd distance are rejected clearly', async () => {
    const r = await rider();
    assert.strictEqual((await book(r, { destinationLat: P.lat, destinationLng: P.lng })).status, 400);
    const w = await book(r, { paymentMethod: 'wallet' }); assert.strictEqual(w.status, 400); assert.strictEqual(w.body.details.code, 'WALLET_LOW');
    assert.strictEqual((await book(r, { destinationLat: 10, destinationLng: 10 })).status, 400);
  });

  await t('driver hands ride back -> rider keeps request, ride returns to searching, same driver cannot re-take it', async () => {
    const r = await rider(), d = await driver(); const a = await book(r);
    assert.strictEqual((await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`)).status, 200);
    const c = await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${a.data.id}/status`, { status: 'cancelled', reason: 'Flat tyre' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    const x = await row(a.data.id); assert.strictEqual(x.status, 'searching'); assert.strictEqual(x.driver_id, null); assert.strictEqual(x.redispatch_count, 1);
    const re = await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`); assert.strictEqual(re.status, 409);
    const list = await api(tok(d, 'driver'), 'GET', '/driver/ride-requests'); assert.ok(!list.data.requests.some((q) => Number(q.id) === Number(a.data.id)));
  });

  await t('driver cannot go offline in the middle of a ride; can afterwards', async () => {
    const r = await rider(), d = await driver(); const a = await book(r); await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`);
    const off = await api(tok(d, 'driver'), 'PATCH', '/driver/online', { online: false });
    assert.strictEqual(off.status, 409); assert.strictEqual(off.body.details.code, 'DRIVER_ON_RIDE');
    const act = await api(tok(d, 'driver'), 'GET', '/driver/rides/active'); assert.strictEqual(Number(act.data.ride.id), Number(a.data.id));
    await rides.cancelSystem(a.data.id, { reason: 'test' });
    assert.strictEqual((await api(tok(d, 'driver'), 'PATCH', '/driver/online', { online: false })).status, 200);
  });

  await t('vanished driver (accepted) -> ride auto re-dispatched; third failure cancels instead of looping', async () => {
    const r = await rider(), d = await driver(); const a = await book(r);
    for (let i = 1; i <= 2; i++) {
      await db.query("UPDATE driver_profiles SET online=1 WHERE user_id=?", [d]); await ping(d, 0);
      // a different driver each round (released drivers are excluded)
      const dx = await driver(`D${i}`); await api(tok(dx, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`);
      await ping(dx, 30); await age(a.data.id, 'accepted_at', 30);
      await life.runReaper(); const x = await row(a.data.id); assert.strictEqual(x.status, 'searching', `round ${i}`); assert.strictEqual(x.redispatch_count, i);
    }
    const d3 = await driver('D3'); await api(tok(d3, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`); await ping(d3, 30); await age(a.data.id, 'accepted_at', 30);
    await life.runReaper(); assert.strictEqual((await row(a.data.id)).status, 'cancelled');
  });

  await t('rider no-show: waiting driver gets compensated; driver who left is not blamed', async () => {
    const r = await rider(), d = await driver(); const a = await book(r); await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`);
    await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${a.data.id}/status`, { status: 'arrived' }); await age(a.data.id, 'arrived_at', 20); await ping(d, 0);
    await life.runReaper(); const x = await row(a.data.id); assert.strictEqual(x.status, 'cancelled'); assert.ok(Number(x.cancellation_fee) > 0, 'fee applied');
    const r2 = await rider(), d2 = await driver(); const b = await book(r2); await api(tok(d2, 'driver'), 'POST', `/driver/rides/${b.data.id}/accept`);
    await api(tok(d2, 'driver'), 'PATCH', `/driver/rides/${b.data.id}/status`, { status: 'arrived' }); await age(b.data.id, 'arrived_at', 20); await ping(d2, 30);
    await life.runReaper(); const y = await row(b.data.id); assert.strictEqual(y.status, 'cancelled'); assert.strictEqual(Number(y.cancellation_fee), 0);
  });

  async function startedRide() {
    const r = await rider(), d = await driver(); const a = await book(r); const id = a.data.id;
    await api(tok(d, 'driver'), 'POST', `/driver/rides/${id}/accept`); await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${id}/status`, { status: 'arrived' });
    const pin = (await row(id)).trip_pin; const s = await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${id}/status`, { status: 'started', otp: pin });
    assert.strictEqual(s.status, 200, JSON.stringify(s.body)); return { r, d, id };
  }

  await t('trip in progress cannot be cancelled by the rider while the driver is live', async () => {
    const { r, id } = await startedRide(); const c = await api(tok(r, 'rider'), 'POST', `/rider/rides/${id}/cancel`, {});
    assert.strictEqual(c.status, 409); assert.strictEqual(c.body.details.code, 'TRIP_IN_PROGRESS');
  });

  await t('rider can end a trip whose driver went silent (no fee), then book again', async () => {
    const { r, d, id } = await startedRide(); await ping(d, 12);
    const live = await api(tok(r, 'rider'), 'GET', `/rider/rides/${id}`); assert.strictEqual(live.data.can_force_close, true);
    const c = await api(tok(r, 'rider'), 'POST', `/rider/rides/${id}/cancel`, {}); assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(Number((await row(id)).cancellation_fee), 0);
    assert.strictEqual((await book(r)).status, 201);
  });

  await t('abandoned trip (driver silent 30+ min) is auto-closed, flagged for admin, rider freed', async () => {
    const { r, d, id } = await startedRide(); await ping(d, 45); await age(id, 'started_at', 45);
    await life.runReaper(); const x = await row(id); assert.strictEqual(x.status, 'cancelled'); assert.strictEqual(x.needs_attention, 1);
    assert.ok((await life.listAttention()).some((a) => Number(a.id) === Number(id)));
    assert.strictEqual((await book(r)).status, 201);
  });

  await t('cash ride at destination that the driver never confirms is auto-completed with earnings recorded', async () => {
    const { r, d, id } = await startedRide(); await api(tok(d, 'driver'), 'POST', `/driver/rides/${id}/reached-destination`);
    await db.query("UPDATE ride_events SET created_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 40 MINUTE) WHERE ride_id=? AND event_type='reached_destination'", [id]); await ping(d, 0);
    await life.runReaper(); const x = await row(id); assert.strictEqual(x.status, 'completed');
    assert.strictEqual((await db.query('SELECT COUNT(*) n FROM driver_earning_ledger WHERE ride_id=?', [id]))[0].n, 1);
    assert.strictEqual((await book(r)).status, 201);
  });

  await t('stale mobile-money prompt expires so the rider can retry another method', async () => {
    const { r, d, id } = await startedRide(); await api(tok(d, 'driver'), 'POST', `/driver/rides/${id}/reached-destination`);
    await db.query("INSERT INTO payment_transactions(user_id,amount,provider,status,external_reference,metadata,created_at) VALUES(?,?,?,?,?,?,DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))", [r, 1000, 'snippe', 'pending', `T-${id}-${Date.now()}`, JSON.stringify({ channel: 'ride_payment', rideId: String(id) })]);
    const live = await api(tok(r, 'rider'), 'GET', `/rider/rides/${id}`); assert.strictEqual(live.data.payment_status, 'pending', 'no longer "processing"');
    const pay = await api(tok(r, 'rider'), 'POST', `/rider/rides/${id}/pay`, { method: 'cash' }); assert.strictEqual(pay.status, 200);
  });

  await t('promo is redeemed once on completion and cannot be reused', async () => {
    const r = await rider(), d = await driver();
    await db.query("INSERT INTO promos(code,title,discount_type,discount_value,per_user_limit,valid_from,valid_until) VALUES('T1','t','fixed',500,1,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE usage_count=0");
    const a = await book(r, { promoCode: 't1' }); assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/accept`); await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${a.data.id}/status`, { status: 'arrived' });
    await api(tok(d, 'driver'), 'PATCH', `/driver/rides/${a.data.id}/status`, { status: 'started', otp: (await row(a.data.id)).trip_pin });
    await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/reached-destination`); await api(tok(r, 'rider'), 'POST', `/rider/rides/${a.data.id}/pay`, { method: 'cash' });
    assert.strictEqual((await api(tok(d, 'driver'), 'POST', `/driver/rides/${a.data.id}/collect-cash`)).status, 200);
    assert.strictEqual((await db.query("SELECT COUNT(*) n FROM promo_redemptions WHERE user_id=?", [r]))[0].n, 1);
    const b = await book(r, { promoCode: 'T1' }); assert.strictEqual(b.status, 400);
  });

  await t('admin can cancel, complete and re-dispatch stuck rides; suspension releases live rides', async () => {
    const adm = await admin(); const T = tok(adm, 'admin');
    const r1 = await rider(); const a = await book(r1);
    assert.strictEqual((await api(T, 'POST', `/admin/rides/${a.data.id}/cancel`, { reason: 'x' })).status, 400, 'reason required');
    assert.strictEqual((await api(T, 'POST', `/admin/rides/${a.data.id}/cancel`, { reason: 'Rider asked support' })).status, 200);
    assert.strictEqual((await book(r1)).status, 201);
    const { id: sid } = await startedRide(); const cmp = await api(T, 'POST', `/admin/rides/${sid}/complete`, { reason: 'Driver confirmed cash by phone', method: 'cash' });
    assert.strictEqual(cmp.status, 200, JSON.stringify(cmp.body)); assert.strictEqual((await row(sid)).status, 'completed');
    const r3 = await rider(), d3 = await driver(); const c = await book(r3); await api(tok(d3, 'driver'), 'POST', `/driver/rides/${c.data.id}/accept`);
    assert.strictEqual((await api(T, 'POST', `/admin/rides/${c.data.id}/redispatch`)).status, 200); assert.strictEqual((await row(c.data.id)).status, 'searching');
    await api(tok(d3, 'driver'), 'POST', `/driver/rides/${c.data.id}/accept`).catch(() => {});
    const r4 = await rider(), d4 = await driver(); const e = await book(r4); await api(tok(d4, 'driver'), 'POST', `/driver/rides/${e.data.id}/accept`);
    assert.strictEqual((await api(T, 'PATCH', `/admin/drivers/${d4}/status`, { status: 'suspended', reason: 'test' })).status, 200);
    assert.strictEqual((await row(e.data.id)).status, 'searching', 'suspended driver loses ride, rider keeps request');
    assert.strictEqual((await api(T, 'PATCH', `/admin/riders/${r4}/status`, { status: 'suspended' })).status, 200);
    assert.strictEqual((await row(e.data.id)).status, 'cancelled');
    assert.ok(Number((await api(T, 'GET', '/admin/dashboard')).data.queues.ridesAttention) >= 0);
  });

  await t('migration 012 columns exist and the boot-time ensure is idempotent', async () => {
    await life.ensureLifecycleSchema(); await life.ensureLifecycleSchema();
    const cols = (await db.query("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rides'")).map((x) => x.c);
    for (const c of ['searching_since', 'redispatch_count', 'needs_attention', 'attention_reason']) assert.ok(cols.includes(c), c);
  });

  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
  server.close(); await db.pool.end(); process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
