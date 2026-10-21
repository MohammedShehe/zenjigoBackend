const { verifyAccess } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const db = require('../config/db');

async function auth(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw ApiError.unauthorized('Access token required');
    const payload = verifyAccess(h.slice(7));
    // Ensure the user still exists in live data (archived users are removed from `users`)
    const rows = await db.query(
      'SELECT id, role, status FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );
    if (!rows.length) {
      throw ApiError.unauthorized('Account no longer exists or has been archived.');
    }
    if (rows[0].status === 'suspended' || rows[0].status === 'rejected') {
      throw ApiError.forbidden('This account is suspended.');
    }
    req.user = { ...payload, role: rows[0].role, status: rows[0].status };
    next();
  } catch (e) {
    next(e.isOperational ? e : ApiError.unauthorized('Invalid or expired access token'));
  }
}

function roles(...allowed) {
  return (req, _res, next) =>
    allowed.includes(req.user?.role)
      ? next()
      : next(ApiError.forbidden('You do not have permission for this resource.'));
}

module.exports = { auth, roles };
