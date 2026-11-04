/** Pure geo helpers (unit-tested in tests/geo.test.js). */
function validCoords(lat, lng) {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180
    && !(a === 0 && b === 0); // (0,0) is the classic "GPS not ready" value
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/**
 * A jump is implausible when it implies travelling faster than maxKmh.
 * Very short intervals use a small allowance so GPS jitter does not trip it.
 */
function implausibleJump(prev, next, maxKmh = 160) {
  if (!prev || prev.lat == null || prev.lng == null || !prev.at) return false;
  const dtH = Math.max((next.at - prev.at) / 3.6e6, 1 / 3600);
  const km = haversineKm(Number(prev.lat), Number(prev.lng), next.lat, next.lng);
  return km > 0.2 && km / dtH > maxKmh;
}
module.exports = { validCoords, haversineKm, implausibleJump };
