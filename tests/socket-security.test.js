const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { stub, fresh, fakeDb } = require('./helpers');

// Capture the handlers the socket module registers, with fake socket.io.
function setup({ user, rides = [] }) {
  const emitted = [];
  const roomEmits = [];
  const db = fakeDb([
    [/FROM users WHERE id=\?/, () => [user]],
    [/SELECT rider_id, driver_id FROM rides/, (p) => rides.filter((r) => r.id === p[0])],
    [/SELECT id FROM rides WHERE driver_id/, () => rides.filter((r) => r.driver_id === user.id && ['accepted', 'arriving', 'arrived', 'started'].includes(r.status)).map((r) => ({ id: r.id }))],
  ]);
  const locCalls = [];
  const handlers = {};
  let mw;
  class FakeServer { constructor() { this.to = (room) => ({ emit: (e, d) => roomEmits.push({ room, e, d }) }); }
    use(fn) { mw = fn; } on(ev, fn) { if (ev === 'connection') this.conn = fn; } }
  const Module = require('module'); const origLoad = Module._load;
  Module._load = function (req, ...a) { return req === 'socket.io' ? { Server: FakeServer } : origLoad.call(this, req, ...a); };
  stub('utils/jwt.js', { verifyAccess: () => ({ sub: user.id, role: 'rider' /* token claim is NOT trusted */ }) });
  stub('config/db.js', db);
  stub('config/env.js', { corsOrigins: [] });
  stub('services/driver.service.js', { location: async (id, d) => { locCalls.push({ id, d }); return {}; } });
  stub('services/chat.service.js', { setIo() {}, markRead: async () => {}, send: async () => ({}) });
  stub('utils/realtime.js', { setIo() {} });
  let sockets; try { sockets = fresh('sockets/index.js'); } finally { Module._load = origLoad; }
  const io = sockets.init({});
  const sock = new EventEmitter();
  sock.handshake = { auth: { token: 't' }, headers: {} };
  sock.join = (r) => emitted.push(['join', r]); sock.leave = () => {};
  sock.emit = (e, d) => emitted.push(['emit', e, d]);
  const origOn = sock.on.bind(sock);
  sock.on = (ev, fn) => { handlers[ev] = fn; return origOn(ev, fn); };
  return { io, sock, mw, handlers, emitted, roomEmits, locCalls, db };
}
const flush = () => new Promise((r) => setImmediate(r));

test('socket auth: role comes from DB; suspended users are refused', async () => {
  let t = setup({ user: { id: 7, role: 'driver', status: 'suspended' } });
  await new Promise((res) => t.mw(t.sock, (err) => { assert.ok(err); res(); }));
  t = setup({ user: { id: 7, role: 'driver', status: 'active' } });
  await new Promise((res) => t.mw(t.sock, (err) => { assert.equal(err, undefined); assert.equal(t.sock.user.role, 'driver'); res(); }));
});

test('driver cannot join or broadcast into a ride that is not theirs', async () => {
  const rides = [{ id: 1, rider_id: 50, driver_id: 7, status: 'started' }, { id: 2, rider_id: 51, driver_id: 99, status: 'started' }];
  const t = setup({ user: { id: 7, role: 'driver', status: 'active' }, rides });
  await new Promise((res) => t.mw(t.sock, res));
  t.io.conn(t.sock);
  let ack; await t.handlers['ride:join']({ rideId: 2 }, (a) => { ack = a; });
  assert.equal(ack.ok, false);
  assert.ok(!t.emitted.some((e) => e[0] === 'join' && e[1] === 'ride:2'));
  // Spoofed rideId in the location event is ignored; broadcast goes to the server-derived ride 1.
  await t.handlers['driver:location']({ lat: -6.16, lng: 39.2, rideId: 2 });
  await flush();
  assert.deepEqual(t.roomEmits.map((r) => r.room), ['ride:1']);
  assert.equal(t.roomEmits[0].d.rideId, 1);
  assert.ok(t.roomEmits[0].d.updatedAt);
});

test('invalid coords and non-drivers are rejected; no room broadcast', async () => {
  const t = setup({ user: { id: 7, role: 'driver', status: 'active' }, rides: [{ id: 1, rider_id: 50, driver_id: 7, status: 'started' }] });
  await new Promise((res) => t.mw(t.sock, res));
  t.io.conn(t.sock);
  await t.handlers['driver:location']({ lat: 999, lng: 39.2 });
  assert.equal(t.roomEmits.length, 0);
  assert.ok(t.emitted.some((e) => e[1] === 'location:rejected'));
  const r = setup({ user: { id: 50, role: 'rider', status: 'active' }, rides: [{ id: 1, rider_id: 50, driver_id: 7, status: 'started' }] });
  await new Promise((res) => r.mw(r.sock, res));
  r.io.conn(r.sock);
  await r.handlers['driver:location']({ lat: -6.16, lng: 39.2 });
  assert.equal(r.roomEmits.length, 0);
});

test('implausible jump and rate limit are enforced', async () => {
  const t = setup({ user: { id: 7, role: 'driver', status: 'active' }, rides: [{ id: 1, rider_id: 50, driver_id: 7, status: 'started' }] });
  await new Promise((res) => t.mw(t.sock, res));
  t.io.conn(t.sock);
  await t.handlers['driver:location']({ lat: -6.16, lng: 39.2 });
  await t.handlers['driver:location']({ lat: -6.1601, lng: 39.2 }); // < min interval => dropped
  assert.equal(t.locCalls.length, 1);
  await new Promise((r) => setTimeout(r, 1100));
  await t.handlers['driver:location']({ lat: -4.0, lng: 39.2 }); // ~240 km in ~1s
  assert.ok(t.emitted.some((e) => e[1] === 'location:rejected' && e[2].reason === 'implausible_jump'));
});
