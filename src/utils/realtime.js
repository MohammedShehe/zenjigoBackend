/** Tiny holder so services can emit socket events without importing the server (avoids circular requires). */
let io = null;
module.exports = {
  setIo(instance) { io = instance; },
  emitToUser(userId, event, payload) {
    try { if (io && userId != null) io.to(`user:${userId}`).emit(event, payload); } catch (_) {}
  },
  emitToRide(rideId, event, payload) {
    try { if (io && rideId != null) io.to(`ride:${rideId}`).emit(event, payload); } catch (_) {}
  }
};
