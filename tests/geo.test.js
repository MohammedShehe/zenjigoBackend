const test = require('node:test');
const assert = require('node:assert/strict');
const { validCoords, implausibleJump, haversineKm } = require('../src/utils/geo');

test('validCoords accepts Zanzibar, rejects junk', () => {
  assert.equal(validCoords(-6.1659, 39.2026), true);
  for (const [a, b] of [[91, 0], [0, 181], ['x', 1], [NaN, 1], [null, null], [0, 0]]) assert.equal(validCoords(a, b), false, `${a},${b}`);
});
test('implausibleJump flags teleporting, allows normal driving and jitter', () => {
  const t0 = 1_000_000;
  const prev = { lat: -6.16, lng: 39.2, at: t0 };
  assert.equal(implausibleJump(prev, { lat: -6.1601, lng: 39.2001, at: t0 + 2000 }), false); // jitter
  assert.equal(implausibleJump(prev, { lat: -6.17, lng: 39.2, at: t0 + 30_000 }), false);     // ~1.1km/30s = 133km/h ok
  assert.equal(implausibleJump(prev, { lat: -5.5, lng: 39.2, at: t0 + 5_000 }), true);        // ~73km in 5s
  assert.equal(implausibleJump(null, { lat: 1, lng: 1, at: t0 }), false);
});
test('haversine sanity', () => {
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.5);
});
