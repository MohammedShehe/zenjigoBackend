const { Server } = require('socket.io');
const { verifyAccess } = require('../utils/jwt');
const db = require('../config/db');
const driver = require('../services/driver.service');
const chat = require('../services/chat.service');
const config = require('../config/env');
const realtime = require('../utils/realtime');
const { validCoords, implausibleJump } = require('../utils/geo');

const ACTIVE_RIDE_STATUSES = ['accepted', 'arriving', 'arrived', 'started'];
const MIN_LOCATION_INTERVAL_MS = Number(process.env.SOCKET_LOCATION_MIN_INTERVAL_MS || 1000);
const lastFix = new Map(); // driverId -> { lat, lng, at }

function log(evt, data) { console.info(JSON.stringify({ evt, ...data })); }

function init(http) {
  const io = new Server(http, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io'
  });

  chat.setIo(io);
  realtime.setIo(io);

  // Authenticate EVERY connection against live account state (not only the JWT signature).
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyAccess(token);
      const rows = await db.query('SELECT id, role, status FROM users WHERE id=? LIMIT 1', [payload.sub]);
      if (!rows.length || ['suspended', 'rejected', 'banned'].includes(rows[0].status)) {
        return next(new Error('Unauthorized'));
      }
      // Role comes from the database, never from the client-held token alone.
      socket.user = { sub: rows[0].id, role: rows[0].role };
      next();
    } catch (_) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.user.sub;
    socket.join(`user:${uid}`);
    if (socket.user.role === 'driver') socket.join('drivers');
    log('socket.connected', { userId: uid, role: socket.user.role });

    socket.on('disconnect', (reason) => {
      if (socket.user.role === 'driver') {
        // location_updated_at (set on every accepted fix) is the authoritative last-seen time;
        // riders compare it to the staleness threshold and must not present an old fix as live.
        lastFix.delete(uid);
      }
      log('socket.disconnected', { userId: uid, reason });
    });

    // Join a ride room only if the caller is that ride's rider or assigned driver (server-checked).
    socket.on('ride:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const rideId = Number(payload && payload.rideId);
        if (!Number.isInteger(rideId) || rideId <= 0) return reply({ ok: false, message: 'Invalid ride.' });
        const r = await db.query('SELECT rider_id, driver_id FROM rides WHERE id=?', [rideId]);
        const allowed = r.length && (Number(r[0].rider_id) === Number(uid) || Number(r[0].driver_id) === Number(uid));
        if (!allowed) {
          log('socket.ride_join_denied', { userId: uid, rideId });
          return reply({ ok: false, message: 'Not allowed.' });
        }
        socket.join(`ride:${rideId}`);
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, message: 'Could not join ride.' });
      }
    });

    // Driver location: the client-supplied rideId is IGNORED. The ride is derived on the server
    // from the driver's own active assignment, so a driver can never broadcast into another room.
    socket.on('driver:location', async (data) => {
      if (socket.user.role !== 'driver') return;
      try {
        const lat = Number(data && data.lat), lng = Number(data && data.lng);
        if (!validCoords(lat, lng)) return socket.emit('location:rejected', { reason: 'invalid_coordinates' });

        const now = Date.now();
        const prev = lastFix.get(uid);
        if (prev && now - prev.at < MIN_LOCATION_INTERVAL_MS) return; // rate limit (silently dropped)
        if (implausibleJump(prev, { lat, lng, at: now })) {
          log('socket.location_jump_rejected', { userId: uid });
          return socket.emit('location:rejected', { reason: 'implausible_jump' });
        }
        lastFix.set(uid, { lat, lng, at: now });

        const active = await db.query(
          `SELECT id FROM rides WHERE driver_id=? AND status IN (${ACTIVE_RIDE_STATUSES.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1`,
          [uid, ...ACTIVE_RIDE_STATUSES]
        );
        const rideId = active.length ? Number(active[0].id) : null;
        const x = await driver.location(uid, { lat, lng, heading: data.heading, speed: data.speed, rideId });
        if (rideId) {
          io.to(`ride:${rideId}`).emit('ride:location', {
            rideId,
            driverId: uid,
            lat, lng,
            heading: data.heading ?? null,
            speed: data.speed ?? null,
            updatedAt: new Date().toISOString() // server time is authoritative
          });
        }
        return x;
      } catch (e) {
        socket.emit('error', { message: 'Location update failed.' });
      }
    });

    socket.on('chat:join', async ({ conversationId } = {}) => {
      try {
        const member = await db.query(
          'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',
          [conversationId, uid]
        );
        if (member.length) {
          socket.join(`chat:${conversationId}`);
          await chat.markRead(uid, conversationId);
        }
      } catch (_) {}
    });

    socket.on('chat:leave', ({ conversationId } = {}) => {
      if (conversationId) socket.leave(`chat:${conversationId}`);
    });

    socket.on('chat:message', async ({ conversationId, text, replyToId } = {}) => {
      try {
        const m = await chat.send(uid, conversationId, text, replyToId);
        socket.emit('chat:message:ack', m);
      } catch (e) {
        socket.emit('error', { message: e.isOperational ? e.message : 'Message failed.' });
      }
    });

    socket.on('chat:read', async ({ conversationId } = {}) => {
      try {
        await chat.markRead(uid, conversationId);
        socket.emit('chat:read:ack', { conversationId });
      } catch (e) {
        socket.emit('error', { message: e.isOperational ? e.message : 'Request failed.' });
      }
    });
  });

  return io;
}

module.exports = { init };
