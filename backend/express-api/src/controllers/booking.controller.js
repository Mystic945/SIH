import { z } from 'zod';
import dayjs from 'dayjs';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Farmer } from '../models/Farmer.js';
import { Schedule } from '../models/Schedule.js';
import { asyncHandler, ApiError } from '../utils/apiError.js';
import { buildQueue, getBookingPosition } from '../services/queue.service.js';
import { sendSMS } from '../services/sms.service.js';
import { realtime } from '../services/socket.service.js';
import { COMMODITIES } from '../config/constants.js';

export const createBookingSchema = z.object({
  centerId: z.string().min(10, 'Select a procurement centre'),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  slotStart: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid slot'),
  slotEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid slot'),
  commodity: z.string().min(2),
  quantityQuintals: z.coerce.number().min(0.5, 'Minimum 0.5 quintal').max(500),
  priority: z.boolean().optional().default(false),
  source: z.enum(['WEB', 'APP', 'IVR', 'CSC', 'SMS']).optional().default('WEB'),
});

const pad = (n) => String(n).padStart(3, '0');

/** POST /bookings - farmer books a token for a date + slot. */
export const createBooking = asyncHandler(async (req, res) => {
  const { centerId, slotDate, slotStart, slotEnd, commodity, quantityQuintals, priority, source } = req.body;

  const center = await Center.findById(centerId);
  if (!center || !center.isActive) throw ApiError.notFound('Procurement centre not available');

  if (dayjs(slotDate).isBefore(dayjs().startOf('day'))) {
    throw ApiError.badRequest('Cannot book a slot in the past');
  }
  if (!center.commodities.includes(commodity.toUpperCase())) {
    throw ApiError.badRequest(`${commodity} is not procured at this centre`);
  }

  // One token per farmer per centre per day, counting completed ones too — this
  // is the anti-duplication control that stops a single farmer taking several
  // slots at the same centre on the same day.
  const duplicate = await Booking.findOne({
    farmer: req.user.id,
    center: centerId,
    slotDate,
    stage: { $nin: ['CANCELLED', 'NO_SHOW'] },
  });
  if (duplicate) {
    const dateLabel = dayjs(slotDate).format('DD MMM YYYY');
    throw ApiError.conflict(
      duplicate.stage === 'PAID'
        ? `Token ${duplicate.tokenCode} was already completed at this centre on ${dateLabel}. Please choose another date or centre.`
        : `You already hold token ${duplicate.tokenCode} at this centre for ${dateLabel}.`
    );
  }

  const schedule = await Schedule.findOne({ center: centerId, date: slotDate }).lean();
  const isOpen = schedule ? schedule.isOpen : dayjs(slotDate).day() !== 0;
  if (!isOpen) throw ApiError.badRequest('This centre is closed on the selected date');

  const dailyCapacity = schedule?.dailyCapacity ?? center.dailyCapacity;
  const bookedToday = await Booking.countDocuments({
    center: centerId,
    slotDate,
    stage: { $nin: ['CANCELLED'] },
  });
  if (bookedToday >= dailyCapacity) {
    throw ApiError.conflict('This date is fully booked. Please pick another date.');
  }

  const slotCapacity =
    schedule?.slots?.find((s) => s.start === slotStart)?.capacity ?? Math.ceil(dailyCapacity / 20);
  const slotBooked = await Booking.countDocuments({
    center: centerId,
    slotDate,
    slotStart,
    stage: { $nin: ['CANCELLED'] },
  });
  if (slotBooked >= slotCapacity) {
    throw ApiError.conflict('This time slot is full. Please pick another slot.');
  }

  const tokenNumber = await Booking.nextTokenNumber(centerId, slotDate);
  const tokenCode = `${center.code}-${dayjs(slotDate).format('DDMM')}-${pad(tokenNumber)}`;
  const msp = COMMODITIES.find((c) => c.code === commodity.toUpperCase())?.msp || 2000;

  const booking = await Booking.create({
    tokenNumber,
    tokenCode,
    farmer: req.user.id,
    center: centerId,
    slotDate,
    slotStart,
    slotEnd,
    commodity: commodity.toUpperCase(),
    quantityQuintals,
    priority,
    source,
    stage: 'BOOKED',
    stageHistory: [{ stage: 'BOOKED', at: new Date(), by: 'farmer', note: 'Slot booked online' }],
    payment: { ratePerQuintal: msp, amount: Math.round(msp * quantityQuintals), status: 'PENDING' },
  });

  if (schedule) {
    await Schedule.updateOne({ _id: schedule._id }, { $inc: { booked: 1 } });
  }

  const farmer = await Farmer.findById(req.user.id).lean();
  await sendSMS({
    template: 'BOOKING_CONFIRMED',
    vars: {
      tokenCode,
      center: center.name,
      date: dayjs(slotDate).format('DD MMM YYYY'),
      slot: `${slotStart}-${slotEnd}`,
      farmerId: farmer.farmerId,
    },
    phone: farmer.phone,
    lang: farmer.preferredLanguage,
    farmer: farmer._id,
    booking: booking._id,
  });

  const populated = await booking.populate([
    { path: 'center', select: 'name nameHi code district state address contactPhone' },
    { path: 'farmer', select: 'name phone farmerId village' },
  ]);

  realtime.bookingUpdated(populated.toJSON());
  const snapshot = await buildQueue(centerId, slotDate);
  realtime.queueUpdated(centerId, snapshot);

  res.status(201).json({ success: true, message: 'Token booked', data: populated.toJSON() });
});

/** GET /bookings/mine?status=upcoming|past|all */
export const myBookings = asyncHandler(async (req, res) => {
  const { status = 'all' } = req.query;
  const filter = { farmer: req.user.id };
  const todayStr = dayjs().format('YYYY-MM-DD');

  if (status === 'upcoming') {
    filter.slotDate = { $gte: todayStr };
    filter.stage = { $nin: ['CANCELLED', 'NO_SHOW', 'PAID'] };
  } else if (status === 'past') {
    filter.$or = [
      { slotDate: { $lt: todayStr } },
      { stage: { $in: ['PAID', 'CANCELLED', 'NO_SHOW'] } },
    ];
  }

  const bookings = await Booking.find(filter)
    .populate('center', 'name nameHi code district state address contactPhone')
    .sort({ slotDate: -1, tokenNumber: -1 })
    .lean();

  res.json({ success: true, count: bookings.length, data: bookings });
});

/** GET /bookings/:id - full detail + live position. This is the live-tracker payload. */
export const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('center', 'name nameHi code district state address contactPhone activeCounters openTime closeTime')
    .populate('farmer', 'name phone farmerId village preferredLanguage bankLast4');

  if (!booking) throw ApiError.notFound('Token not found');

  const isOwner = String(booking.farmer._id) === req.user.id;
  const isStaff = ['STAFF', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !isStaff) throw ApiError.forbidden('You can only view your own tokens');

  const position = await getBookingPosition(booking);
  res.json({ success: true, data: { booking: booking.toJSON(), position } });
});

/** GET /bookings/track/:tokenCode - public lookup used by the SMS deep link. */
export const trackByCode = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ tokenCode: req.params.tokenCode.toUpperCase() })
    .populate('center', 'name nameHi code district address')
    .populate('farmer', 'name');
  if (!booking) throw ApiError.notFound('No token found with that code');

  const position = await getBookingPosition(booking);
  const payload = booking.toJSON();
  // Public endpoint: mask identity down to a first name.
  payload.farmer = { name: String(payload.farmer.name).split(' ')[0] };

  res.json({ success: true, data: { booking: payload, position } });
});

/** PATCH /bookings/:id/cancel */
export const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('center', 'name code')
    .populate('farmer');
  if (!booking) throw ApiError.notFound('Token not found');
  if (String(booking.farmer._id) !== req.user.id) {
    throw ApiError.forbidden('You can only cancel your own token');
  }
  if (['PAID', 'CANCELLED'].includes(booking.stage)) {
    throw ApiError.badRequest('This token can no longer be cancelled');
  }
  if (booking.stage !== 'BOOKED') {
    throw ApiError.badRequest('Cancellation is not allowed after check-in at the centre');
  }

  const reason = req.body?.reason || 'Cancelled by farmer';
  booking.pushStage('CANCELLED', 'farmer', reason);
  booking.cancelReason = reason;
  await booking.save();

  await Schedule.updateOne({ center: booking.center._id, date: booking.slotDate }, { $inc: { booked: -1 } });

  await sendSMS({
    template: 'BOOKING_CANCELLED',
    vars: { tokenCode: booking.tokenCode, date: dayjs(booking.slotDate).format('DD MMM') },
    phone: booking.farmer.phone,
    lang: booking.farmer.preferredLanguage,
    farmer: booking.farmer._id,
    booking: booking._id,
  });

  const snapshot = await buildQueue(booking.center._id, booking.slotDate);
  realtime.queueUpdated(booking.center._id, snapshot);
  realtime.bookingUpdated(booking.toJSON());

  res.json({ success: true, message: 'Token cancelled', data: booking.toJSON() });
});

/** GET /queue/:centerId?date= - the live queue board (public). */
export const getLiveQueue = asyncHandler(async (req, res) => {
  const snapshot = await buildQueue(req.params.centerId, req.query.date);
  if (!snapshot) throw ApiError.notFound('Procurement centre not found');
  res.json({ success: true, data: snapshot });
});
