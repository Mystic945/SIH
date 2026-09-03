import mongoose from 'mongoose';

export const GRIEVANCE_CATEGORIES = [
  'WEIGHT_DISPUTE',
  'PAYMENT_DELAY',
  'QUALITY_REJECTION',
  'LONG_WAIT',
  'STAFF_BEHAVIOUR',
  'SLOT_ISSUE',
  'OTHER',
];

export const GRIEVANCE_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];

const responseSchema = new mongoose.Schema(
  {
    by: { type: String, required: true },
    role: { type: String, enum: ['FARMER', 'STAFF', 'ADMIN'], default: 'STAFF' },
    message: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const grievanceSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, uppercase: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    category: { type: String, enum: GRIEVANCE_CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    status: { type: String, enum: GRIEVANCE_STATUSES, default: 'OPEN', index: true },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    responses: { type: [responseSchema], default: [] },
    /** Service-level target the centre is measured against (hours). */
    slaHours: { type: Number, default: 72 },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    resolutionNote: { type: String },
  },
  { timestamps: true }
);

grievanceSchema.index({ createdAt: -1 });

grievanceSchema.virtual('isBreached').get(function () {
  if (['RESOLVED', 'REJECTED'].includes(this.status)) return false;
  const hours = (Date.now() - this.createdAt.getTime()) / 36e5;
  return hours > this.slaHours;
});

grievanceSchema.set('toJSON', { virtuals: true });

grievanceSchema.statics.generateTicketId = function () {
  const y = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `GRV-${y}-${rand}`;
};

export const Grievance = mongoose.model('Grievance', grievanceSchema);
