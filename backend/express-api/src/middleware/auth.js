import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { Farmer } from '../models/Farmer.js';
import { StaffUser } from '../models/StaffUser.js';

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.token || null;
}

/** Populates req.user with { id, role, ...profile }. Roles: FARMER | STAFF | ADMIN. */
export const protect = async (req, _res, next) => {
  try {
    const token = readToken(req);
    if (!token) throw ApiError.unauthorized('Please sign in to continue');

    const decoded = jwt.verify(token, env.jwtSecret);

    if (decoded.role === 'FARMER') {
      const farmer = await Farmer.findById(decoded.id).lean();
      if (!farmer) throw ApiError.unauthorized('Farmer account not found');
      req.user = { id: String(farmer._id), role: 'FARMER', ...farmer };
    } else {
      const staff = await StaffUser.findById(decoded.id).populate('center').lean();
      if (!staff || !staff.isActive) throw ApiError.unauthorized('Staff account not found or disabled');
      req.user = { id: String(staff._id), role: staff.role, ...staff };
    }
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session expired, please sign in again'));
    }
    next(err);
  }
};

/** Route guard: restrict('ADMIN', 'STAFF') */
export const restrict = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
  }
  next();
};

/** Shared-secret guard for server-to-server calls coming from the FastAPI service. */
export const internalOnly = (req, _res, next) => {
  if (req.headers['x-internal-key'] !== env.internalApiKey) {
    return next(ApiError.forbidden('Invalid internal service key'));
  }
  next();
};
