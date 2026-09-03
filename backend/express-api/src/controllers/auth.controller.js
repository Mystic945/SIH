import { z } from 'zod';
import dayjs from 'dayjs';
import { Farmer } from '../models/Farmer.js';
import { StaffUser } from '../models/StaffUser.js';
import { OtpRequest } from '../models/OtpRequest.js';
import { signToken } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { sendSMS } from '../services/sms.service.js';
import { env } from '../config/env.js';

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');

export const requestOtpSchema = z.object({ phone: phoneSchema });

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: phoneSchema,
  otp: z.string().length(6),
  village: z.string().min(2, 'Village is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().min(2, 'State is required'),
  landAcres: z.coerce.number().min(0).max(1000).optional().default(0),
  aadhaarLast4: z.string().regex(/^\d{4}$/).optional(),
  bankLast4: z.string().regex(/^\d{4}$/).optional(),
  preferredLanguage: z.enum(['en', 'hi']).optional().default('hi'),
});

export const staffLoginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
});

/**
 * POST /auth/farmer/request-otp
 * Generates a 6-digit OTP and "sends" it over SMS. In non-production the code is
 * echoed in the response so a judge can log in without a real handset.
 */
export const requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await OtpRequest.updateMany({ phone, consumed: false }, { consumed: true });
  await OtpRequest.create({ phone, code, expiresAt: dayjs().add(5, 'minute').toDate() });

  const existing = await Farmer.findOne({ phone }).lean();
  await sendSMS({
    template: 'OTP',
    vars: { code },
    phone,
    lang: existing?.preferredLanguage || 'hi',
    farmer: existing?._id,
  });

  res.json({
    success: true,
    message: `OTP sent to +91 ${phone}`,
    data: {
      isRegistered: Boolean(existing),
      expiresInSeconds: 300,
      // Demo affordance only — never exposed in production.
      ...(env.isProd ? {} : { devOtp: code }),
    },
  });
});

async function consumeOtp(phone, otp) {
  // Universal demo code keeps the judging session moving if SMS is unavailable.
  if (!env.isProd && otp === '123456') return true;

  const record = await OtpRequest.findOne({ phone, consumed: false }).sort({ createdAt: -1 });
  if (!record) throw ApiError.badRequest('Please request an OTP first');
  if (record.expiresAt < new Date()) throw ApiError.badRequest('OTP expired, request a new one');
  if (record.attempts >= 5) throw ApiError.badRequest('Too many attempts, request a new OTP');

  if (record.code !== otp) {
    record.attempts += 1;
    await record.save();
    throw ApiError.badRequest('Incorrect OTP');
  }
  record.consumed = true;
  await record.save();
  return true;
}

/** POST /auth/farmer/verify-otp — login for an already-registered farmer. */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  await consumeOtp(phone, otp);

  const farmer = await Farmer.findOne({ phone });
  if (!farmer) {
    return res.status(404).json({
      success: false,
      message: 'This number is not registered yet',
      data: { needsRegistration: true, phone },
    });
  }

  farmer.isVerified = true;
  farmer.lastLoginAt = new Date();
  await farmer.save();

  const token = signToken({ id: farmer._id, role: 'FARMER' });
  res.json({ success: true, message: 'Signed in', data: { token, user: { ...farmer.toJSON(), role: 'FARMER' } } });
});

/** POST /auth/farmer/register — OTP-verified self-registration. */
export const registerFarmer = asyncHandler(async (req, res) => {
  const { otp, ...payload } = req.body;
  await consumeOtp(payload.phone, otp);

  const exists = await Farmer.findOne({ phone: payload.phone });
  if (exists) throw ApiError.conflict('This mobile number is already registered. Please sign in.');

  const farmer = await Farmer.create({ ...payload, isVerified: true, lastLoginAt: new Date() });
  const token = signToken({ id: farmer._id, role: 'FARMER' });

  res.status(201).json({
    success: true,
    message: 'Registration complete',
    data: { token, user: { ...farmer.toJSON(), role: 'FARMER' } },
  });
});

/** POST /auth/staff/login */
export const staffLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const staff = await StaffUser.findOne({ username: username.toLowerCase() }).populate('center');
  if (!staff || !staff.isActive) throw ApiError.unauthorized('Invalid username or password');

  const ok = await staff.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid username or password');

  const token = signToken({ id: staff._id, role: staff.role });
  const user = staff.toJSON();
  delete user.passwordHash;

  res.json({ success: true, message: `Welcome back, ${staff.name}`, data: { token, user } });
});

/** GET /auth/me */
export const getMe = asyncHandler(async (req, res) => {
  const user = { ...req.user };
  delete user.passwordHash;
  res.json({ success: true, data: { user } });
});

/** PATCH /auth/me — farmers update their own profile (language, bank, village). */
export const updateMe = asyncHandler(async (req, res) => {
  if (req.user.role !== 'FARMER') throw ApiError.forbidden('Only farmer profiles are editable here');
  const allowed = ['name', 'village', 'district', 'state', 'landAcres', 'preferredLanguage', 'bankLast4', 'aadhaarLast4'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

  const farmer = await Farmer.findByIdAndUpdate(req.user.id, patch, { new: true, runValidators: true });
  res.json({ success: true, message: 'Profile updated', data: { user: { ...farmer.toJSON(), role: 'FARMER' } } });
});
