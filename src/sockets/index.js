const { Server } = require('socket.io');
const { verifyAccess } = require('../utils/jwt');
const db = require('../config/db');
const driver = require('../services/driver.service');
const chat = require('../services/chat.service');
const config = require('../config/env');

function init(http) {
  const io = new Server(http, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io'
  });

  chat.setIo(io);

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      socket.user = verifyAccess(token);
      next();
    } catch (e) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.sub}`);

    socket.on('ride:join', async ({ rideId }) => {
      try {
        const r = await db.query('SELECT rider_id, driver_id FROM rides WHERE id=?', [rideId]);
        if (r.length && [r[0].rider_id, r[0].driver_id].includes(socket.user.sub)) {
          socket.join(`ride:${rideId}`);
        }
      } catch (_) {}
    });

    socket.on('driver:location', async (data) => {
      if (socket.user.role !== 'driver') return;
      try {
        const x = await driver.location(socket.user.sub, data);
        if (data.rideId) {
          io.to(`ride:${data.rideId}`).emit('ride:location', {
            driverId: socket.user.sub,
            ...x,
            heading: data.heading,
            speed: data.speed
          });
        }
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('chat:join', async ({ conversationId }) => {
      try {
        const member = await db.query(
          'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',
          [conversationId, socket.user.sub]
        );
        if (member.length) {
          socket.join(`chat:${conversationId}`);
          await chat.markRead(socket.user.sub, conversationId);
        }
      } catch (_) {}
    });

    socket.on('chat:leave', ({ conversationId }) => {
      if (conversationId) socket.leave(`chat:${conversationId}`);
    });

    socket.on('chat:message', async ({ conversationId, text, replyToId }) => {
      try {
        // chat.send already emits to rooms via setIo
        const m = await chat.send(socket.user.sub, conversationId, text, replyToId);
        // Also ack to sender
        socket.emit('chat:message:ack', m);
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('chat:read', async ({ conversationId }) => {
      try {
        await chat.markRead(socket.user.sub, conversationId);
        socket.emit('chat:read:ack', { conversationId });
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });
  });

  return io;
}

module.exports = { init };
