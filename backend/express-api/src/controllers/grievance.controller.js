import { z } from 'zod';
import dayjs from 'dayjs';
import { Grievance, GRIEVANCE_CATEGORIES, GRIEVANCE_STATUSES } from '../models/Grievance.js';
import { Booking } from '../models/Booking.js';
import { Farmer } from '../models/Farmer.js';
import { asyncHandler, ApiError } from '../utils/apiError.js';
import { sendSMS } from '../services/sms.service.js';
import { realtime } from '../services/socket.service.js';

export const createGrievanceSchema = z.object({
  centerId: z.string().min(10, 'Select the procurement centre'),
  bookingId: z.string().optional(),
  category: z.enum(GRIEVANCE_CATEGORIES),
  subject: z.string().min(5, 'Describe the issue in a few words').max(120),
  description: z.string().min(10, 'Please add some detail').max(2000),
});

export const respondSchema = z.object({
  message: z.string().min(2).max(1000),
  status: z.enum(GRIEVANCE_STATUSES).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  resolutionNote: z.string().max(1000).optional(),
});

/** Payment and weight disputes carry money, so they escalate automatically. */
const priorityFor = (category) =>
  ['PAYMENT_DELAY', 'WEIGHT_DISPUTE'].includes(category) ? 'HIGH'
    : category === 'QUALITY_REJECTION' ? 'MEDIUM'
    : 'LOW';

/** POST /grievances - farmer raises a complaint. */
export const createGrievance = asyncHandler(async (req, res) => {
  const { centerId, bookingId, category, subject, description } = req.body;

  if (bookingId) {
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) throw ApiError.notFound('Referenced token not found');
    if (String(booking.farmer) !== req.user.id) {
      throw ApiError.forbidden('You can only raise a complaint against your own token');
    }
  }

  const openCount = await Grievance.countDocuments({
    farmer: req.user.id,
    status: { $in: ['OPEN', 'IN_REVIEW'] },
  });
  if (openCount >= 5) {
    throw ApiError.conflict('You already have 5 open complaints. Please wait for them to be resolved.');
  }

  const grievance = await Grievance.create({
    ticketId: Grievance.generateTicketId(),
    farmer: req.user.id,
    booking: bookingId || undefined,
    center: centerId,
    category,
    subject,
    description,
    priority: priorityFor(category),
    slaHours: priorityFor(category) === 'HIGH' ? 24 : 72,
  });

  const farmer = await Farmer.findById(req.user.id).lean();
  await sendSMS({
    template: 'GRIEVANCE_RAISED',
    vars: { ticketId: grievance.ticketId, slaHours: grievance.slaHours },
    phone: farmer.phone,
    lang: farmer.preferredLanguage,
    farmer: farmer._id,
    booking: bookingId || undefined,
  });

  const populated = await grievance.populate([
    { path: 'center', select: 'name code district' },
    { path: 'booking', select: 'tokenCode slotDate commodity' },
  ]);

  realtime.grievanceUpdated(populated.toJSON());

  res.status(201).json({
    success: true,
    message: `Complaint registered as ${grievance.ticketId}`,
    data: populated.toJSON(),
  });
});

/** `.lean()` drops schema virtuals, so the SLA flag is recomputed here. */
const withSla = (g) => ({
  ...g,
  isBreached:
    !['RESOLVED', 'REJECTED'].includes(g.status) &&
    (Date.now() - new Date(g.createdAt).getTime()) / 36e5 > (g.slaHours || 72),
  ageHours: Math.round((Date.now() - new Date(g.createdAt).getTime()) / 36e5),
});

/** GET /grievances/mine */
export const myGrievances = asyncHandler(async (req, res) => {
  const grievances = await Grievance.find({ farmer: req.user.id })
    .populate('center', 'name code district')
    .populate('booking', 'tokenCode slotDate commodity')
    .sort({ createdAt: -1 })
    .lean();

  const data = grievances.map(withSla);
  res.json({ success: true, count: data.length, data });
});

/** GET /grievances/:id */
export const getGrievance = asyncHandler(async (req, res) => {
  const grievance = await Grievance.findById(req.params.id)
    .populate('center', 'name code district contactPhone')
    .populate('booking', 'tokenCode slotDate commodity quantityQuintals weighment payment')
    .populate('farmer', 'name phone farmerId village');
  if (!grievance) throw ApiError.notFound('Complaint not found');

  const isOwner = String(grievance.farmer._id) === req.user.id;
  const isStaff = ['STAFF', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !isStaff) throw ApiError.forbidden('You can only view your own complaints');

  res.json({ success: true, data: grievance.toJSON() });
});

/** POST /grievances/:id/reply - farmer adds a follow-up message. */
export const farmerReply = asyncHandler(async (req, res) => {
  const grievance = await Grievance.findById(req.params.id);
  if (!grievance) throw ApiError.notFound('Complaint not found');
  if (String(grievance.farmer) !== req.user.id) throw ApiError.forbidden('Not your complaint');
  if (['RESOLVED', 'REJECTED'].includes(grievance.status)) {
    throw ApiError.badRequest('This complaint is closed. Please raise a new one if the issue persists.');
  }

  grievance.responses.push({ by: req.user.name, role: 'FARMER', message: req.body.message });
  await grievance.save();

  realtime.grievanceUpdated(grievance.toJSON());
  res.json({ success: true, message: 'Reply added', data: grievance.toJSON() });
});

/** GET /admin/grievances?status=&category= - staff handling queue. */
export const listGrievances = asyncHandler(async (req, res) => {
  const centerId =
    req.user.role === 'ADMIN'
      ? req.query.centerId || undefined
      : String(req.user.center?._id || req.user.center);

  const filter = {};
  if (centerId) filter.center = centerId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;

  const rows = await Grievance.find(filter)
    .populate('center', 'name code district')
    .populate('farmer', 'name phone village farmerId')
    .populate('booking', 'tokenCode slotDate commodity quantityQuintals')
    .sort({ status: 1, priority: -1, createdAt: -1 })
    .lean();

  const grievances = rows.map(withSla);

  const summary = grievances.reduce(
    (acc, g) => {
      acc.total += 1;
      acc[g.status] = (acc[g.status] || 0) + 1;
      if (g.isBreached) acc.slaBreached += 1;
      return acc;
    },
    { total: 0, slaBreached: 0 }
  );

  res.json({ success: true, count: grievances.length, summary, data: grievances });
});

/** PATCH /admin/grievances/:id - staff respond / change status / resolve. */
export const respondToGrievance = asyncHandler(async (req, res) => {
  const grievance = await Grievance.findById(req.params.id).populate('farmer', 'name phone preferredLanguage');
  if (!grievance) throw ApiError.notFound('Complaint not found');

  if (req.user.role !== 'ADMIN') {
    const own = String(req.user.center?._id || req.user.center);
    if (String(grievance.center) !== own) {
      throw ApiError.forbidden('This complaint belongs to another centre');
    }
  }

  const { message, status, priority, resolutionNote } = req.body;
  const actor = req.user.name || req.user.username || 'staff';

  grievance.responses.push({ by: actor, role: req.user.role === 'ADMIN' ? 'ADMIN' : 'STAFF', message });
  if (priority) grievance.priority = priority;

  if (status) {
    grievance.status = status;
    if (['RESOLVED', 'REJECTED'].includes(status)) {
      grievance.resolvedAt = new Date();
      grievance.resolvedBy = actor;
      grievance.resolutionNote = resolutionNote || message;
    }
  } else if (grievance.status === 'OPEN') {
    grievance.status = 'IN_REVIEW';
  }

  await grievance.save();

  if (['RESOLVED', 'REJECTED'].includes(grievance.status)) {
    await sendSMS({
      template: 'GRIEVANCE_RESOLVED',
      vars: { ticketId: grievance.ticketId, note: (grievance.resolutionNote || '').slice(0, 90) },
      phone: grievance.farmer.phone,
      lang: grievance.farmer.preferredLanguage,
      farmer: grievance.farmer._id,
    });
  }

  realtime.grievanceUpdated(grievance.toJSON());
  res.json({ success: true, message: 'Complaint updated', data: grievance.toJSON() });
});

/** GET /grievances/meta - categories + labels for the complaint form. */
export const grievanceMeta = asyncHandler(async (_req, res) => {
  const labels = {
    WEIGHT_DISPUTE: { en: 'Wrong weight recorded', hi: 'तौल में गड़बड़ी' },
    PAYMENT_DELAY: { en: 'Payment delayed', hi: 'भुगतान में देरी' },
    QUALITY_REJECTION: { en: 'Unfair quality rejection', hi: 'गुणवत्ता अस्वीकृति' },
    LONG_WAIT: { en: 'Excessive waiting time', hi: 'लंबा इंतजार' },
    STAFF_BEHAVIOUR: { en: 'Staff behaviour', hi: 'कर्मचारी व्यवहार' },
    SLOT_ISSUE: { en: 'Slot / token problem', hi: 'स्लॉट या टोकन समस्या' },
    OTHER: { en: 'Something else', hi: 'अन्य' },
  };
  res.json({
    success: true,
    data: {
      categories: GRIEVANCE_CATEGORIES.map((c) => ({ code: c, ...labels[c] })),
      statuses: GRIEVANCE_STATUSES,
      slaNote: { en: 'High-priority issues are answered within 24 hours.', hi: 'उच्च प्राथमिकता की शिकायतों का उत्तर 24 घंटे में.' },
      generatedAt: dayjs().toISOString(),
    },
  });
});
