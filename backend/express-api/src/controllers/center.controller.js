import dayjs from 'dayjs';
import { Center } from '../models/Center.js';
import { Schedule } from '../models/Schedule.js';
import { Booking } from '../models/Booking.js';
import { asyncHandler, ApiError } from '../utils/apiError.js';
import { generateSlots } from '../services/queue.service.js';
import { COMMODITIES } from '../config/constants.js';

/** GET /centers?state=&district=&commodity=&q= */
export const listCenters = asyncHandler(async (req, res) => {
  const { state, district, commodity, q } = req.query;
  const filter = { isActive: true };
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (commodity) filter.commodities = commodity.toUpperCase();
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { code: new RegExp(q, 'i') },
    { district: new RegExp(q, 'i') },
    { address: new RegExp(q, 'i') },
  ];

  const centers = await Center.find(filter).sort({ state: 1, district: 1, name: 1 }).lean();
  const date = dayjs().format('YYYY-MM-DD');

  // Attach today's live load so the directory cards can show open/filling/full.
  const loads = await Booking.aggregate([
    { $match: { slotDate: date, stage: { $nin: ['CANCELLED', 'NO_SHOW'] } } },
    { $group: { _id: '$center', booked: { $sum: 1 } } },
  ]);
  const loadMap = Object.fromEntries(loads.map((l) => [String(l._id), l.booked]));

  const data = centers.map((c) => {
    const booked = loadMap[String(c._id)] || 0;
    const remaining = Math.max(c.dailyCapacity - booked, 0);
    const status = remaining === 0 ? 'full' : remaining <= c.dailyCapacity * 0.2 ? 'filling' : 'open';
    return { ...c, todayBooked: booked, todayRemaining: remaining, todayStatus: status };
  });

  res.json({ success: true, count: data.length, data });
});

/** GET /centers/filters — powers the district/state/commodity dropdowns. */
export const getFilters = asyncHandler(async (_req, res) => {
  const [states, districts] = await Promise.all([
    Center.distinct('state', { isActive: true }),
    Center.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: { state: '$state', district: '$district' } } },
      { $sort: { '_id.state': 1, '_id.district': 1 } },
    ]),
  ]);
  res.json({
    success: true,
    data: {
      states: states.sort(),
      districts: districts.map((d) => ({ state: d._id.state, district: d._id.district })),
      commodities: COMMODITIES,
    },
  });
});

/** GET /centers/:id */
export const getCenter = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.id).lean();
  if (!center) throw ApiError.notFound('Procurement centre not found');
  res.json({ success: true, data: center });
});

/**
 * GET /centers/:id/schedule?from=&days=
 * The farmer-facing procurement calendar: one entry per date with open/full status.
 * Missing schedule documents are materialised on the fly from centre defaults.
 */
export const getCenterSchedule = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.id).lean();
  if (!center) throw ApiError.notFound('Procurement centre not found');

  const days = Math.min(Number(req.query.days) || 14, 60);
  const from = req.query.from ? dayjs(req.query.from) : dayjs();
  const dates = Array.from({ length: days }, (_, i) => from.add(i, 'day').format('YYYY-MM-DD'));

  const [schedules, bookingCounts] = await Promise.all([
    Schedule.find({ center: center._id, date: { $in: dates } }).lean(),
    Booking.aggregate([
      { $match: { center: center._id, slotDate: { $in: dates }, stage: { $nin: ['CANCELLED'] } } },
      { $group: { _id: '$slotDate', booked: { $sum: 1 } } },
    ]),
  ]);

  const schedMap = Object.fromEntries(schedules.map((s) => [s.date, s]));
  const bookedMap = Object.fromEntries(bookingCounts.map((b) => [b._id, b.booked]));

  const data = dates.map((date) => {
    const s = schedMap[date];
    const dow = dayjs(date).day();
    const defaultOpen = dow !== 0; // centres closed on Sundays by default
    const isOpen = s ? s.isOpen : defaultOpen;
    const dailyCapacity = s?.dailyCapacity ?? center.dailyCapacity;
    const booked = bookedMap[date] || 0;
    const remaining = Math.max(dailyCapacity - booked, 0);
    const status = !isOpen ? 'closed' : remaining === 0 ? 'full' : remaining <= dailyCapacity * 0.2 ? 'filling' : 'open';
    return {
      date,
      weekday: dayjs(date).format('ddd'),
      isOpen,
      dailyCapacity,
      booked,
      remaining,
      status,
      note: s?.note || '',
      noteHi: s?.noteHi || '',
      commodities: s?.commodities?.length ? s.commodities : center.commodities,
      isConfigured: Boolean(s),
    };
  });

  res.json({ success: true, data: { center, schedule: data } });
});

/** GET /centers/:id/slots?date=YYYY-MM-DD — bookable time slots with live availability. */
export const getCenterSlots = asyncHandler(async (req, res) => {
  const center = await Center.findById(req.params.id).lean();
  if (!center) throw ApiError.notFound('Procurement centre not found');

  const date = req.query.date || dayjs().format('YYYY-MM-DD');
  if (dayjs(date).isBefore(dayjs().startOf('day'))) {
    throw ApiError.badRequest('Cannot view slots for a past date');
  }

  let schedule = await Schedule.findOne({ center: center._id, date }).lean();
  const slots = schedule?.slots?.length ? schedule.slots : generateSlots(center);

  const bookings = await Booking.find({
    center: center._id, slotDate: date, stage: { $nin: ['CANCELLED'] },
  }).select('slotStart').lean();

  const bookedPerSlot = bookings.reduce((acc, b) => {
    acc[b.slotStart] = (acc[b.slotStart] || 0) + 1;
    return acc;
  }, {});

  const isOpen = schedule ? schedule.isOpen : dayjs(date).day() !== 0;
  const data = slots.map((s) => {
    const booked = bookedPerSlot[s.start] || 0;
    const remaining = Math.max(s.capacity - booked, 0);
    return {
      ...s,
      booked,
      remaining,
      isAvailable: isOpen && s.isOpen !== false && remaining > 0,
      loadPct: Math.round((booked / Math.max(s.capacity, 1)) * 100),
    };
  });

  res.json({
    success: true,
    data: {
      center: { _id: center._id, name: center.name, code: center.code, district: center.district },
      date,
      isOpen,
      note: schedule?.note || '',
      totalBooked: bookings.length,
      dailyCapacity: schedule?.dailyCapacity ?? center.dailyCapacity,
      slots: data,
    },
  });
});
