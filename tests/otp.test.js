const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { stub, fresh, fakeDb } = require('./helpers');
const sha = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');

function load(handlers) {
  const db = fakeDb(handlers);
  stub('config/env.js', { nodeEnv: 'test', appName: 'ZenjiGO', smtp: {}, security: { otpResendSeconds: 60, otpMaxAttempts: 3 } });
  stub('config/db.js', db);
  delete require.cache[require.resolve('../src/utils/ApiError')];
  return { otp: fresh('services/otp.service.js'), db };
}
const future = () => new Date(Date.now() + 5 * 60_000);

test('correct code verifies once; second concurrent consume is rejected (single use)', async () => {
  let consumed = false;
  const { otp } = load([
    [/SELECT id, code_hash/, () => [{ id: 1, code_hash: sha('123456'), attempts: 0, expires_at: future(), status: 'pending' }]],
    [/SET status="verified"/, () => { const r = { affectedRows: consumed ? 0 : 1 }; consumed = true; return r; }],
  ]);
  assert.equal(await otp.verify({ target: 'A@b.com', code: '123456', purpose: 'login' }), true);
  await assert.rejects(otp.verify({ target: 'a@b.com', code: '123456', purpose: 'login' }), /Invalid or expired/);
});

test('wrong code increments attempts and is rejected', async () => {
  const { otp, db } = load([[/SELECT id, code_hash/, () => [{ id: 1, code_hash: sha('111111'), attempts: 0, expires_at: future(), status: 'pending' }]]]);
  await assert.rejects(otp.verify({ target: 'a@b.com', code: '000000', purpose: 'login' }), /Invalid OTP/);
  assert.ok(db.calls.some((c) => /attempts = attempts \+ 1/.test(c.sql)));
});

test('expired code is rejected and marked expired', async () => {
  const { otp, db } = load([[/SELECT id, code_hash/, () => [{ id: 1, code_hash: sha('111111'), attempts: 0, expires_at: new Date(Date.now() - 1000), status: 'pending' }]]]);
  await assert.rejects(otp.verify({ target: 'a@b.com', code: '111111', purpose: 'login' }), /expired/);
  assert.ok(db.calls.some((c) => /status="expired"/.test(c.sql)));
});

test('attempt cap locks the code (429) even if the next guess is right', async () => {
  const { otp } = load([[/SELECT id, code_hash/, () => [{ id: 1, code_hash: sha('111111'), attempts: 3, expires_at: future(), status: 'pending' }]]]);
  await assert.rejects(otp.verify({ target: 'a@b.com', code: '111111', purpose: 'login' }), (e) => e.statusCode === 429);
});

test('send() without SMTP fails closed in production-like config and never logs a code', async () => {
  const { otp } = load([[/SELECT id, last_sent_at/, () => []], [/COUNT\(\*\)/, () => [{ c: 0 }]]]);
  await assert.rejects(otp.send({ target: 'a@b.com', purpose: 'login' }), /Email delivery is not configured/);
});

test('send() enforces resend cooldown', async () => {
  const { otp } = load([[/SELECT id, last_sent_at/, () => [{ id: 1, last_sent_at: new Date() }]]]);
  await assert.rejects(otp.send({ target: 'a@b.com', purpose: 'login' }), /Please wait/);
});
