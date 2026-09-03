import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { protect, restrict } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/apiError.js';
import { callIntel } from '../services/intel.service.js';
import { COMMODITIES, STAGE_LABELS, STAGES } from '../config/constants.js';

import * as auth from '../controllers/auth.controller.js';
import * as centers from '../controllers/center.controller.js';
import * as bookings from '../controllers/booking.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as grievances from '../controllers/grievance.controller.js';
import * as notifications from '../controllers/notification.controller.js';

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ------------------------------------------------------------------ meta */

router.get('/meta', (_req, res) => {
  res.json({
    success: true,
    data: {
      commodities: COMMODITIES,
      stages: STAGES,
      stageLabels: STAGE_LABELS,
      languages: [
        { code: 'en', label: 'English' },
        { code: 'hi', label: 'हिन्दी' },
      ],
    },
  });
});

/* ------------------------------------------------------------------ auth */

router.post('/auth/farmer/request-otp', otpLimiter, validate(auth.requestOtpSchema), auth.requestOtp);
router.post('/auth/farmer/verify-otp', validate(auth.verifyOtpSchema), auth.verifyOtp);
router.post('/auth/farmer/register', validate(auth.registerSchema), auth.registerFarmer);
router.post('/auth/staff/login', validate(auth.staffLoginSchema), auth.staffLogin);
router.get('/auth/me', protect, auth.getMe);
router.patch('/auth/me', protect, auth.updateMe);

/* --------------------------------------------------------- centres/schedule */

router.get('/centers', centers.listCenters);
router.get('/centers/filters', centers.getFilters);
router.get('/centers/:id', centers.getCenter);
router.get('/centers/:id/schedule', centers.getCenterSchedule);
router.get('/centers/:id/slots', centers.getCenterSlots);

/* ------------------------------------------------------------- queue (public) */

router.get('/queue/:centerId', bookings.getLiveQueue);

/* ------------------------------------------------------------------ bookings */

router.get('/bookings/track/:tokenCode', bookings.trackByCode);
router.post('/bookings', protect, restrict('FARMER'), validate(bookings.createBookingSchema), bookings.createBooking);
router.get('/bookings/mine', protect, restrict('FARMER'), bookings.myBookings);
router.get('/bookings/:id', protect, bookings.getBooking);
router.patch('/bookings/:id/cancel', protect, restrict('FARMER'), bookings.cancelBooking);

/* ---------------------------------------------------------------- grievances */

router.get('/grievances/meta', grievances.grievanceMeta);
router.post('/grievances', protect, restrict('FARMER'), validate(grievances.createGrievanceSchema), grievances.createGrievance);
router.get('/grievances/mine', protect, restrict('FARMER'), grievances.myGrievances);
router.get('/grievances/:id', protect, grievances.getGrievance);
router.post('/grievances/:id/reply', protect, restrict('FARMER'), grievances.farmerReply);

/* ------------------------------------------------------------- notifications */

router.get('/notifications/mine', protect, notifications.myNotifications);
router.get('/notifications/feed', protect, restrict('ADMIN', 'STAFF'), notifications.notificationFeed);

/* -------------------------------------------------------- admin / centre staff */

const staffOnly = [protect, restrict('ADMIN', 'STAFF')];

router.get('/admin/dashboard', ...staffOnly, admin.getDashboard);
router.get('/admin/bookings', ...staffOnly, admin.listBookings);
router.patch('/admin/bookings/:id/stage', ...staffOnly, validate(admin.updateStageSchema), admin.updateBookingStage);
router.post('/admin/bookings/:id/notify', ...staffOnly, admin.notifyFarmer);
router.patch('/admin/bookings/:id/no-show', ...staffOnly, admin.markNoShow);

router.get('/admin/schedule', ...staffOnly, admin.listSchedule);
router.put('/admin/schedule', ...staffOnly, validate(admin.scheduleSchema), admin.upsertSchedule);
router.patch('/admin/center', ...staffOnly, admin.updateCenter);

router.get('/admin/grievances', ...staffOnly, grievances.listGrievances);
router.patch('/admin/grievances/:id', ...staffOnly, validate(grievances.respondSchema), grievances.respondToGrievance);

/* ------------------------------------------ FastAPI intelligence service proxy */

/**
 * Everything under /api/v1/intel/* is forwarded to the FastAPI service.
 * Public analytics (the transparency dashboard) stay open; anything under
 * /intel/admin requires a signed-in staff account.
 */
const intelProxy = asyncHandler(async (req, res) => {
  // req.path is already relative to the /api/v1 mount, e.g. /intel/analytics/overview
  const query = new URLSearchParams(req.query).toString();
  const target = `${req.path}${query ? `?${query}` : ''}`;

  const data = await callIntel(target, {
    method: req.method,
    body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
  });

  res.json({ success: true, servedBy: 'fastapi', data });
});

router.all(/^\/intel\/admin\/(.*)$/, ...staffOnly, intelProxy);
router.all(/^\/intel\/(.*)$/, intelProxy);

export default router;
