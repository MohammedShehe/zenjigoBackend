const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, fresh } = require('./helpers');

function load({ owed = 0, claimAffected = 1, active = true }) {
  const calls = [];
  const ApiError = require('../src/utils/ApiError');
  stub('config/db.js', { query: async (sql, p) => {
    calls.push({ sql, p });
    if (/FROM driver_profiles d JOIN users u/.test(sql)) return active ? [{ 1: 1 }] : [];
    if (/^UPDATE (parcels|tour_bookings)/.test(sql.trim())) return { affectedRows: claimAffected };
    if (/FROM parcels WHERE status='pending'/.test(sql) || /SELECT id, parcel_code/.test(sql)) return [{ id: 1, parcel_code: 'P1', pickup_lat: -6.1, pickup_lng: 39.2, rider_id: 9, description: 'secret', pickup_address: 'home' }];
    return [];
  } });
  stub('services/driver_finance.service.js', {
    getStatus: async () => ({ blocked: owed > 0, commissionOwed: owed }),
    assertUsable: async () => { if (owed > 0) throw ApiError.forbidden('ZenjiGO settlement required.'); },
  });
  return { ctrl: fresh('controllers/extra.controller.js'), calls };
}
const run = async (h, req) => { let out, err; await h(req, { json: (b) => { out = b; }, status() { return this; } }, (e) => { err = e; }); return { out, err }; };

test('blocked driver: parcel list is map-pin only, no addresses/rider/description', async () => {
  const { ctrl } = load({ owed: 5000 });
  const { out } = await run(ctrl.pendingParcels, { user: { sub: 7 } });
  const row = (out.data || out)[0];
  assert.equal(row.masked, true);
  for (const k of ['rider_id', 'description', 'pickup_address', 'delivery_address']) assert.ok(!(k in row), k);
  assert.ok('pickup_lat' in row && 'pickup_lng' in row);
});

test('blocked driver cannot accept parcels or tours', async () => {
  const { ctrl, calls } = load({ owed: 5000 });
  for (const h of [ctrl.acceptParcel, ctrl.acceptTour]) {
    const { err } = await run(h, { user: { sub: 7 }, params: { id: '1' } });
    assert.equal(err.statusCode, 403);
  }
  assert.ok(!calls.some((c) => /^UPDATE (parcels|tour_bookings)/.test(c.sql.trim())));
});

test('settled driver: second concurrent accept loses (atomic claim -> 409)', async () => {
  const { ctrl } = load({ owed: 0, claimAffected: 0 });
  const { err } = await run(ctrl.acceptParcel, { user: { sub: 7 }, params: { id: '1' } });
  assert.equal(err.statusCode, 409);
});

test('unapproved driver cannot accept work', async () => {
  const { ctrl } = load({ owed: 0, active: false });
  const { err } = await run(ctrl.acceptTour, { user: { sub: 7 }, params: { id: '1' } });
  assert.equal(err.statusCode, 403);
});
