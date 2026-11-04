const test = require('node:test');
const assert = require('node:assert/strict');
const { stub, fresh, fakeDb } = require('./helpers');

function loadDriverService({ rows, otpVerify }) {
  const db = fakeDb([[/FROM users u JOIN driver_profiles/, () => rows], [/SELECT id FROM users WHERE role/, () => []]]);
  stub('config/env.js', { nodeEnv: 'test', cloudinary: {}, security: {} });
  stub('config/db.js', db);
  stub('utils/jwt.js', { signAccess: (p) => `access.${p.sub}`, issueRefreshToken: async (id) => `refresh.${id}` });
  stub('services/notification.service.js', { notifyUser: async () => {} });
  stub('utils/phone.js', { normalizePhone: (x) => x });
  stub('services/upload.service.js', { upload: async () => ({}) });
  stub('utils/hash.js', { hashPassword: async (x) => x });
  stub('services/auth.service.js', { publicUser: (r) => r });
  stub('services/otp.service.js', { verify: otpVerify, verifyRegistrationForSubmit: async () => true });
  stub('services/welcome-email.service.js', { sendWelcomeEmail: async () => {} });
  delete require.cache[require.resolve('../src/utils/ApiError')];
  return { svc: fresh('services/driver.service.js'), db };
}
const DRIVER = { id: 7, full_name: 'D', email: 'd@x.com', status: 'active', role: 'driver', application_status: 'active', driver_code: 'ZG-DRV-000007', online: 0, rating: 5 };

test('bootstrapSession WITHOUT a code never issues tokens (the original bypass)', async () => {
  const { svc } = loadDriverService({ rows: [DRIVER], otpVerify: async () => true });
  await assert.rejects(svc.bootstrapSession({ driverId: 7, email: 'd@x.com' }), (e) => e.statusCode === 400);
});

test('bootstrapSession with a WRONG code gives the generic 401 (no account hints)', async () => {
  const ApiError = require('../src/utils/ApiError');
  const { svc } = loadDriverService({ rows: [DRIVER], otpVerify: async () => { throw ApiError.badRequest('Invalid OTP code.'); } });
  await assert.rejects(svc.bootstrapSession({ driverId: 7, email: 'd@x.com', code: '000000' }),
    (e) => e.statusCode === 401 && e.message === 'Invalid email or verification code.');
});

test('unknown driver + valid code looks identical to wrong code', async () => {
  const { svc } = loadDriverService({ rows: [], otpVerify: async () => true });
  await assert.rejects(svc.bootstrapSession({ driverId: 999, email: 'nobody@x.com', code: '123456' }),
    (e) => e.statusCode === 401 && e.message === 'Invalid email or verification code.');
});

test('valid OTP issues tokens; suspended driver is refused even with a valid OTP', async () => {
  let { svc } = loadDriverService({ rows: [DRIVER], otpVerify: async () => true });
  const s = await svc.bootstrapSession({ driverId: 7, email: 'D@X.com', code: '123456' });
  assert.equal(s.accessToken, 'access.7');
  ({ svc } = loadDriverService({ rows: [{ ...DRIVER, status: 'suspended' }], otpVerify: async () => true }));
  await assert.rejects(svc.bootstrapSession({ driverId: 7, email: 'd@x.com', code: '123456' }), (e) => e.statusCode === 403);
});

test('bootstrapSession never promotes application_status (no self-approval)', async () => {
  const { svc, db } = loadDriverService({ rows: [{ ...DRIVER, status: 'pending', application_status: 'approved' }], otpVerify: async () => true });
  await svc.bootstrapSession({ driverId: 7, email: 'd@x.com', code: '123456' });
  assert.ok(!db.calls.some((c) => /UPDATE (users|driver_profiles)/.test(c.sql)));
});

test('applicationStatus: a driver cannot read another driver; admin can; no rating leaked', async () => {
  const { svc } = loadDriverService({ rows: [], otpVerify: async () => true });
  await assert.rejects(svc.applicationStatus(8, { sub: 7, role: 'driver' }), (e) => e.statusCode === 404);
  const db = require('../src/config/db');
  const orig = db.query;
  db.query = async () => [{ id: 8, user_status: 'pending', application_status: 'pending', rejection_reason: null, rating: 4.9 }];
  const r = await svc.applicationStatus(8, { sub: 1, role: 'admin' });
  db.query = orig;
  assert.equal(r.driverId, 8);
  assert.ok(!('rating' in r));
  const self = (db.query = async () => [{ id: 7, user_status: 'pending', application_status: 'pending' }], await svc.applicationStatus(7, { sub: 7, role: 'driver' }));
  assert.equal(self.driverId, 7);
});
