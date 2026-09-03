import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let io = null;

/**
 * Room strategy:
 *   center:<id>   → every dashboard + every farmer tracking that centre
 *   booking:<id>  → one farmer's own token screen
 *   admin         → global control-room feed
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    logger.info(`socket connected ${socket.id}`);

    socket.on('join:center', (centerId) => centerId && socket.join(`center:${centerId}`));
    socket.on('leave:center', (centerId) => centerId && socket.leave(`center:${centerId}`));
    socket.on('join:booking', (bookingId) => bookingId && socket.join(`booking:${bookingId}`));
    socket.on('join:admin', () => socket.join('admin'));

    socket.on('disconnect', () => logger.info(`socket disconnected ${socket.id}`));
  });

  logger.success('Socket.IO realtime layer ready');
  return io;
}

export function getIO() {
  return io;
}

/** Fire-and-forget emit that stays silent if sockets aren't up yet (e.g. seeding). */
export function emitTo(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

export const realtime = {
  queueUpdated: (centerId, payload) => {
    emitTo(`center:${centerId}`, 'queue:updated', payload);
    emitTo('admin', 'queue:updated', { centerId, ...payload });
  },
  bookingUpdated: (booking) => {
    emitTo(`booking:${booking._id}`, 'booking:updated', booking);
    emitTo(`center:${booking.center?._id || booking.center}`, 'booking:updated', booking);
  },
  notificationSent: (notification) => {
    emitTo(`booking:${notification.booking}`, 'notification:new', notification);
    emitTo('admin', 'notification:new', notification);
  },
  grievanceUpdated: (grievance) => {
    emitTo('admin', 'grievance:updated', grievance);
    emitTo(`center:${grievance.center?._id || grievance.center}`, 'grievance:updated', grievance);
  },
};
