const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * Many riders/drivers share one mobile-carrier IP (CGNAT), so limiting purely by IP would lock
 * out whole neighbourhoods. Authenticated requests are keyed by the user id inside the JWT
 * (decoded without verification here, only for bucketing; real auth still happens later),
 * everything else falls back to the IP.
 */
function keyFor(req) {
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      const payload = JSON.parse(Buffer.from(h.slice(7).split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.sub) return `u:${payload.sub}`;
    }
  } catch (_) { /* fall through to IP */ }
  return `ip:${req.ip}`;
}

const skip = (req) =>
  req.path === '/health' ||
  req.originalUrl.includes('/payments/webhook');

const globalLimiter = rateLimit({
  windowMs: config.security.rateWindowMs,
  max: config.security.rateMax,
  keyGenerator: keyFor,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, message: 'You are doing that too quickly. Please wait a moment and try again.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many code requests. Please wait a few minutes and try again.' }
});

module.exports = { globalLimiter, otpLimiter };
