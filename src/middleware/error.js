const config = require('../config/env');
const crypto = require('crypto');

function requestId(req, res, next) {
  const id = String(req.headers['x-request-id'] || '').slice(0, 64) || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', requestId: req.id });
}

function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  // Structured, secret-free log line. Never log bodies, tokens, OTPs or full headers.
  console.error(JSON.stringify({
    evt: 'http.error', requestId: req.id, method: req.method, path: req.path,
    status, userId: req.user?.sub || null, message: err.message,
    ...(status >= 500 ? { stack: String(err.stack || '').split('\n').slice(0, 6).join(' | ') } : {})
  }));
  const body = {
    success: false,
    message: status >= 500 && !err.isOperational ? 'Internal server error' : err.message || 'Internal server error',
    requestId: req.id
  };
  if (err.details && status < 500) body.details = err.details;
  if (config.nodeEnv !== 'production' && err.stack) body.stack = err.stack;
  res.status(status).json(body);
}
module.exports = { requestId, notFound, errorHandler };
