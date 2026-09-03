import { z } from 'zod';
import dayjs from 'dayjs';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Schedule } from '../models/Schedule.js';
import { Grievance } from '../models/Grievance.js';
import { asyncHandler, ApiError } from '../utils/apiError.js';
import { buildQueue, generateSlots } from '../services/queue.service.js';
import { sendSMS } from '../services/sms.service.js';
import { realtime } from '../services/socket.service.js';
import { STAGES, ALL_STAGES, COMMODITIES } from '../config/constants.js';

export const updateStageSchema = z.object({
  stage: z.enum(ALL_STAGES).optional(),
  note: z.string().max(300).optional(),
  quality: z
    .object({
      moisturePct: z.coerce.number().min(0).max(40).optional(),
      grade: z.enum(['A', 'B', 'C', 'REJECTED']).optional(),
      remarks: z.string().max(300).optional(),
    })
    .optional(),
  weighment: z
    .object({
      grossQuintals: z.coerce.number().min(0).optional(),
      netQuintals: z.coerce.number().min(0).optional(),
      bags: z.coerce.number().min(0).optional(),
    })
    .optional(),
});

export const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isOpen: z.boolean().optional(),
  dailyCapacity: z.coerce.number().min(0).max(2000).optional(),
  commodities: z.array(z.string()).optional(),
  note: z.string().max(300).optional(),
  noteHi: z.string().max(300).optional(),
  slots: z
    .array(
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        capacity: z.coerce.number().min(0),
        isOpen: z.boolean().optional(),
      })
    )
    .optional(),
});

/** Staff may only touch their own centre; ADMIN may target any centre. */
function resolveCenterId(req, requested) {
  const own = String(req.user.center?._id || req.user.center);
  if (req.user.role === 'ADMIN') return requested || own;
  if (requested && requested !== own) {
    throw ApiError.forbidden('You can only manage your assigned procurement centre');
  }
  return own;
}

/** GET /admin/dashboard?date= - today's queue, counters, capacity, alerts. */
export const getDashboard = asyncHandler(async (req, res) => {
  const centerId = resolveCenterId(req, req.query.centerId);
  const date = req.query.date || dayjs().format('YYYY-MM-DD');

  const snapshot = await buildQueue(centerId, date);
  if (!snapshot) throw ApiError.notFound('Procurement centre not found');

  const [openGrievances, weekTrend] = await Promise.all([
    Grievance.countDocuments({ center: centerId, status: { $in: ['OPEN', 'IN_REVIEW'] } }),
    Booking.aggregate([
      {
        $match: {
          center: snapshot.center._id,
          slotDate: { $gte: dayjs(date).subtract(6, 'day').format('YYYY-MM-DD'), $lte: date },
        },
      },
      {
        $group: {
          _id: '$slotDate',
          booked: { $sum: 1 },
          served: { $sum: { $cond: [{ $eq: ['$stage', 'PAID'] }, 1, 0] } },
          quintals: { $sum: '$quantityQuintals' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const paidToday = snapshot.queue.length
    ? await Booking.aggregate([
        { $match: { center: snapshot.center._id, slotDate: date, 'payment.status': 'PAID' } },
        { $group: { _id: null, amount: { $sum: '$payment.amount' }, qty: { $sum: '$quantityQuintals' } } },
      ])
    : [];

  res.json({
    success: true,
    data: {
      ...snapshot,
      openGrievances,
      weekTrend: weekTrend.map((d) => ({ date: d._id, booked: d.booked, served: d.served, quintals: Math.round(d.quintals) })),
      payments: { amountPaid: paidToday[0]?.amount || 0, quintalsPaid: Math.round(paidToday[0]?.qty || 0) },
    },
  });
});

/**
 * PATCH /admin/bookings/:id/stage
 * The single control that drives every farmer's live tracker. Omitting `stage`
 * advances the booking one step down the pipeline.
 */
export const updateBookingStage = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('farmer', 'name phone preferredLanguage bankLast4')
    .populate('center', 'name code');
  if (!booking) throw ApiError.notFound('Token not found');

  resolveCenterId(req, String(booking.center._id));

  const { note = '', quality, weighment } = req.body;
  let nextStage = req.body.stage;

  if (!nextStage) {
    const idx = STAGES.indexOf(booking.stage);
    if (idx < 0) throw ApiError.badRequest(`Token is ${booking.stage} and cannot be advanced`);
    if (idx === STAGES.length - 1) throw ApiError.badRequest('This token has already completed the pipeline');
    nextStage = STAGES[idx + 1];
  }

  if (booking.stage === nextStage) throw ApiError.badRequest(`Token is already at ${nextStage}`);
  if (['PAID', 'CANCELLED'].includes(booking.stage)) {
    throw ApiError.badRequest('This token is closed and can no longer be updated');
  }

  if (quality) booking.quality = { ...booking.quality?.toObject?.(), ...quality };
  if (weighment) {
    booking.weighment = { ...booking.weighment?.toObject?.(), ...weighment };
    // Payable amount always follows verified net weight, never the declared quantity.
    if (weighment.netQuintals) {
      const rate = booking.payment?.ratePerQuintal
        || COMMODITIES.find((c) => c.code === booking.commodity)?.msp
        || 2000;
      booking.payment.ratePerQuintal = rate;
      booking.payment.amount = Math.round(rate * weighment.netQuintals);
    }
  }

  if (nextStage === 'PAYMENT_INITIATED') {
    booking.payment.status = 'INITIATED';
    booking.payment.initiatedAt = new Date();
    booking.payment.utr = `UTR${dayjs().format('YYMMDD')}${Math.floor(100000 + Math.random() * 899999)}`;
  }
  if (nextStage === 'PAID') {
    booking.payment.status = 'PAID';
    booking.payment.paidAt = new Date();
    if (!booking.payment.utr) {
      booking.payment.utr = `UTR${dayjs().format('YYMMDD')}${Math.floor(100000 + Math.random() * 899999)}`;
    }
  }

  booking.pushStage(nextStage, req.user.name || req.user.username || 'staff', note);
  await booking.save();

  const lang = booking.farmer.preferredLanguage || 'hi';
  const common = { farmer: booking.farmer._id, booking: booking._id, phone: booking.farmer.phone, lang };

  if (nextStage === 'PAYMENT_INITIATED') {
    await sendSMS({
      ...common,
      template: 'PAYMENT_INITIATED',
      vars: {
        tokenCode: booking.tokenCode,
        amount: booking.payment.amount?.toLocaleString('en-IN'),
        bankLast4: booking.farmer.bankLast4 || 'XXXX',
      },
    });
  } else if (nextStage === 'PAID') {
    await sendSMS({
      ...common,
      template: 'PAYMENT_CREDITED',
      vars: {
        tokenCode: booking.tokenCode,
        amount: booking.payment.amount?.toLocaleString('en-IN'),
        utr: booking.payment.utr,
      },
    });
  } else {
    await sendSMS({
      ...common,
      template: 'STAGE_UPDATE',
      vars: { tokenCode: booking.tokenCode, stage: nextStage.replace(/_/g, ' '), time: dayjs().format('HH:mm') },
    });
  }

  const snapshot = await buildQueue(booking.center._id, booking.slotDate);
  realtime.queueUpdated(booking.center._id, snapshot);
  realtime.bookingUpdated(booking.toJSON());

  res.json({ success: true, message: `Token moved to ${nextStage}`, data: booking.toJSON() });
});

/** POST /admin/bookings/:id/notify - manual "your turn is next" nudge. */
export const notifyFarmer = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('farmer', 'name phone preferredLanguage')
    .populate('center', 'name');
  if (!booking) throw ApiError.notFound('Token not found');
  resolveCenterId(req, String(booking.center._id));

  const snapshot = await buildQueue(booking.center._id, booking.slotDate);
  const me = snapshot.queue.find((q) => String(q._id) === String(booking._id));

  const notification = await sendSMS({
    template: 'TURN_APPROACHING',
    vars: {
      tokenCode: booking.tokenCode,
      ahead: me?.ahead ?? 0,
      etaMins: me?.etaMins ?? 5,
      center: booking.center.name,
    },
    phone: booking.farmer.phone,
    lang: booking.farmer.preferredLanguage,
    farmer: booking.farmer._id,
    booking: booking._id,
    channel: req.body?.channel || 'SMS',
  });

  res.json({ success: true, message: 'Alert sent to farmer', data: notification });
});

/** PATCH /admin/bookings/:id/no-show */
export const markNoShow = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('center', 'name');
  if (!booking) throw ApiError.notFound('Token not found');
  resolveCenterId(req, String(booking.center._id));
  if (booking.stage !== 'BOOKED') throw ApiError.badRequest('Only un-arrived tokens can be marked absent');

  booking.pushStage('NO_SHOW', req.user.name || 'staff', req.body?.note || 'Did not arrive');
  await booking.save();

  const snapshot = await buildQueue(booking.center._id, booking.slotDate);
  realtime.queueUpdated(booking.center._id, snapshot);
  res.json({ success: true, message: 'Marked as absent', data: booking.toJSON() });
});

/** GET /admin/schedule?from=&days= - the staff schedule-management grid. */
export const listSchedule = asyncHandler(async (req, res) => {
  const centerId = resolveCenterId(req, req.query.centerId);
  const center = await Center.findById(centerId).lean();
  if (!center) throw ApiError.notFound('Procurement centre not found');

  const days = Math.min(Number(req.query.days) || 21, 90);
  const from = req.query.from ? dayjs(req.query.from) : dayjs();
  const dates = Array.from({ length: days }, (_, i) => from.add(i, 'day').format('YYYY-MM-DD'));

  const [schedules, counts] = await Promise.all([
    Schedule.find({ center: centerId, date: { $in: dates } }).lean(),
    Booking.aggregate([
      { $match: { center: center._id, slotDate: { $in: dates }, stage: { $nin: ['CANCELLED'] } } },
      { $group: { _id: '$slotDate', booked: { $sum: 1 } } },
    ]),
  ]);

  const schedMap = Object.fromEntries(schedules.map((s) => [s.date, s]));
  const bookedMap = Object.fromEntries(counts.map((c) => [c._id, c.booked]));

  const data = dates.map((date) => {
    const s = schedMap[date];
    const isOpen = s ? s.isOpen : dayjs(date).day() !== 0;
    const dailyCapacity = s?.dailyCapacity ?? center.dailyCapacity;
    const booked = bookedMap[date] || 0;
    return {
      date,
      weekday: dayjs(date).format('ddd'),
      isOpen,
      dailyCapacity,
      booked,
      remaining: Math.max(dailyCapacity - booked, 0),
      note: s?.note || '',
      commodities: s?.commodities?.length ? s.commodities : center.commodities,
      slots: s?.slots?.length ? s.slots : generateSlots(center),
      isConfigured: Boolean(s),
    };
  });

  res.json({ success: true, data: { center, schedule: data } });
});

/** PUT /admin/schedule - open/close a date and set capacity. */
export const upsertSchedule = asyncHandler(async (req, res) => {
  const centerId = resolveCenterId(req, req.query.centerId || req.body.centerId);
  const center = await Center.findById(centerId);
  if (!center) throw ApiError.notFound('Procurement centre not found');

  const { date, slots, ...rest } = req.body;

  const booked = await Booking.countDocuments({
    center: centerId,
    slotDate: date,
    stage: { $nin: ['CANCELLED'] },
  });
  if (rest.dailyCapacity != null && rest.dailyCapacity < booked) {
    throw ApiError.badRequest(`${booked} tokens are already booked for ${date}. Capacity cannot be set below that.`);
  }

  const update = {
    ...rest,
    booked,
    updatedBy: req.user.name || req.user.username || 'staff',
    ...(slots ? { slots: slots.map((s) => ({ ...s, isOpen: s.isOpen !== false, booked: 0 })) } : {}),
  };

  const schedule = await Schedule.findOneAndUpdate(
    { center: centerId, date },
    { $set: update, $setOnInsert: { center: centerId, date, slots: slots ? undefined : generateSlots(center) } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  realtime.queueUpdated(centerId, { scheduleChanged: true, date });
  res.json({ success: true, message: `Schedule updated for ${date}`, data: schedule.toJSON() });
});

/** PATCH /admin/center - counters, capacity and working hours. */
export const updateCenter = asyncHandler(async (req, res) => {
  const centerId = resolveCenterId(req, req.body.centerId);
  const allowed = ['dailyCapacity', 'activeCounters', 'openTime', 'closeTime', 'slotDurationMins', 'commodities', 'contactPhone', 'inchargeName', 'isActive'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

  const center = await Center.findByIdAndUpdate(centerId, patch, { new: true, runValidators: true });
  if (!center) throw ApiError.notFound('Procurement centre not found');

  const snapshot = await buildQueue(centerId, dayjs().format('YYYY-MM-DD'));
  realtime.queueUpdated(centerId, snapshot);

  res.json({ success: true, message: 'Centre settings updated', data: center.toJSON() });
});

/** GET /admin/bookings?date=&stage=&q= - searchable token list for staff. */
export const listBookings = asyncHandler(async (req, res) => {
  const centerId = resolveCenterId(req, req.query.centerId);
  const { date = dayjs().format('YYYY-MM-DD'), stage, q } = req.query;

  const filter = { center: centerId, slotDate: date };
  if (stage) filter.stage = stage;

  let bookings = await Booking.find(filter)
    .populate('farmer', 'name phone village farmerId preferredLanguage')
    .sort({ tokenNumber: 1 })
    .lean();

  if (q) {
    const rx = new RegExp(q, 'i');
    bookings = bookings.filter(
      (b) => rx.test(b.tokenCode) || rx.test(b.farmer?.name || '') || rx.test(b.farmer?.phone || '') || rx.test(b.farmer?.farmerId || '')
    );
  }

  res.json({ success: true, count: bookings.length, data: bookings });
});
