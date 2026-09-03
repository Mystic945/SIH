import dayjs from 'dayjs';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { STAGE_SERVICE_MINUTES, STAGES } from '../config/constants.js';

export const today = () => dayjs().format('YYYY-MM-DD');

/** Stages that mean "physically at the centre, being processed". */
const IN_SERVICE = ['ARRIVED', 'QUALITY_CHECK', 'WEIGHMENT', 'PAYMENT_INITIATED'];

/**
 * Builds the live queue picture for one centre on one date:
 * ordering, how many are ahead of each token, and a per-token ETA.
 *
 * Ordering rules, in priority order:
 *   1. Priority farmers (elderly / differently-abled) first
 *   2. Farmers who have physically checked in beat those who haven't
 *   3. Then by slot start time, then by token number
 */
export async function buildQueue(centerId, date = today()) {
  const [center, bookings] = await Promise.all([
    Center.findById(centerId).lean(),
    Booking.find({ center: centerId, slotDate: date })
      .populate('farmer', 'name phone village preferredLanguage farmerId')
      .sort({ tokenNumber: 1 })
      .lean(),
  ]);

  if (!center) return null;

  const counters = Math.max(center.activeCounters || 1, 1);
  const active = bookings.filter((b) => !['PAID', 'CANCELLED', 'NO_SHOW'].includes(b.stage));

  const ordered = [...active].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const aIn = IN_SERVICE.includes(a.stage) ? 0 : 1;
    const bIn = IN_SERVICE.includes(b.stage) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    if (a.slotStart !== b.slotStart) return a.slotStart < b.slotStart ? -1 : 1;
    return a.tokenNumber - b.tokenNumber;
  });

  // Remaining work for a token = time left in its current stage + all later stages.
  const remainingWork = (stage) => {
    const idx = Math.max(STAGES.indexOf(stage), 0);
    return STAGES.slice(idx)
      .map((s) => STAGE_SERVICE_MINUTES[s] || 0)
      .reduce((a, c) => a + c, 0);
  };

  let cumulative = 0;
  const queue = ordered.map((b, index) => {
    const ahead = index;
    // Work ahead is spread across parallel counters.
    const etaMins = Math.max(Math.round(cumulative / counters), 0);
    cumulative += remainingWork(b.stage);
    return {
      ...b,
      position: index + 1,
      ahead,
      etaMins,
      etaAt: dayjs().add(etaMins, 'minute').format('HH:mm'),
      inService: IN_SERVICE.includes(b.stage),
    };
  });

  const counts = bookings.reduce((acc, b) => {
    acc[b.stage] = (acc[b.stage] || 0) + 1;
    return acc;
  }, {});

  const served = bookings.filter((b) => b.stage === 'PAID');
  const avgTurnaround = served.length
    ? Math.round(
        served
          .filter((b) => b.arrivedAt && b.completedAt)
          .reduce((a, b) => a + dayjs(b.completedAt).diff(dayjs(b.arrivedAt), 'minute'), 0) /
          Math.max(served.filter((b) => b.arrivedAt && b.completedAt).length, 1)
      )
    : center.avgServiceMins;

  return {
    center: {
      _id: center._id, name: center.name, nameHi: center.nameHi, code: center.code,
      district: center.district, state: center.state, activeCounters: counters,
      dailyCapacity: center.dailyCapacity, openTime: center.openTime, closeTime: center.closeTime,
    },
    date,
    queue,
    nowServing: queue.find((q) => q.inService) || null,
    stats: {
      totalBooked: bookings.length,
      waiting: queue.filter((q) => q.stage === 'BOOKED').length,
      inCentre: queue.filter((q) => q.inService).length,
      completed: counts.PAID || 0,
      cancelled: (counts.CANCELLED || 0) + (counts.NO_SHOW || 0),
      capacityLeft: Math.max(center.dailyCapacity - bookings.length, 0),
      capacityUsedPct: Math.round((bookings.length / Math.max(center.dailyCapacity, 1)) * 100),
      avgTurnaroundMins: avgTurnaround,
      counts,
    },
  };
}

/** Position + ETA for a single booking, used by the farmer's live tracker. */
export async function getBookingPosition(booking) {
  const snapshot = await buildQueue(booking.center?._id || booking.center, booking.slotDate);
  if (!snapshot) return null;
  const me = snapshot.queue.find((q) => String(q._id) === String(booking._id));
  return {
    date: snapshot.date,
    center: snapshot.center,
    nowServing: snapshot.nowServing
      ? { tokenCode: snapshot.nowServing.tokenCode, stage: snapshot.nowServing.stage }
      : null,
    position: me?.position ?? null,
    ahead: me?.ahead ?? 0,
    etaMins: me?.etaMins ?? 0,
    etaAt: me?.etaAt ?? null,
    totalInQueue: snapshot.queue.length,
    stats: snapshot.stats,
  };
}

/** Generates the bookable slot grid for a centre on a date. */
export function generateSlots(center, slotDurationMins = null) {
  const dur = slotDurationMins || center.slotDurationMins || 30;
  const [oh, om] = (center.openTime || '08:00').split(':').map(Number);
  const [ch, cm] = (center.closeTime || '18:00').split(':').map(Number);
  const startMin = oh * 60 + om;
  const endMin = ch * 60 + cm;
  const count = Math.floor((endMin - startMin) / dur);
  const perSlot = Math.max(Math.ceil((center.dailyCapacity || 120) / Math.max(count, 1)), 1);

  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  return Array.from({ length: count }, (_, i) => ({
    start: fmt(startMin + i * dur),
    end: fmt(startMin + (i + 1) * dur),
    capacity: perSlot,
    booked: 0,
    isOpen: true,
  }));
}
