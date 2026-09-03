import { io, type Socket } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let socket: Socket | null = null;

/** Single shared connection. Rooms are joined per screen, not per socket. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      autoConnect: true,
    });
  }
  return socket;
}

export function joinCenter(centerId?: string) {
  if (!centerId) return;
  getSocket().emit('join:center', centerId);
}

export function leaveCenter(centerId?: string) {
  if (!centerId) return;
  getSocket().emit('leave:center', centerId);
}

export function joinBooking(bookingId?: string) {
  if (!bookingId) return;
  getSocket().emit('join:booking', bookingId);
}

export function joinAdmin() {
  getSocket().emit('join:admin');
}
