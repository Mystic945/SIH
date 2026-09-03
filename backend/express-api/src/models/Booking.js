import mongoose from 'mongoose';
import { ALL_STAGES, STAGES } from '../config/constants.js';

const stageEventSchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ALL_STAGES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: 'system' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    /** Human-facing token, unique per centre per day, e.g. 47 → displayed as "T-047". */
    tokenNumber: { type: Number, required: true },
    tokenCode: { type: String, required: true, index: true },

    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },

    slotDate: { type: String, required: true, index: true }, // YYYY-MM-DD, avoids TZ drift
    slotStart: { type: String, required: true },             // HH:mm
    slotEnd: { type: String, required: true },

    commodity: { type: String, required: true, uppercase: true },
    quantityQuintals: { type: Number, required: true, min: 0.5 },

    stage: { type: String, enum: ALL_STAGES, default: 'BOOKED', index: true },
    stageHistory: { type: [stageEventSchema], default: [] },

    arrivedAt: { type: Date },
    completedAt: { type: Date },

    quality: {
      moisturePct: Number,
      grade: { type: String, enum: ['A', 'B', 'C', 'REJECTED'] },
      remarks: String,
    },
    weighment: {
      grossQuintals: Number,
      netQuintals: Number,
      bags: Number,
    },
    payment: {
      ratePerQuintal: Number,
      amount: Number,
      status: { type: String, enum: ['PENDING', 'INITIATED', 'PAID', 'FAILED'], default: 'PENDING' },
      utr: String,
      initiatedAt: Date,
      paidAt: Date,
    },

    /** Elderly / differently-abled farmers are pulled forward in the queue. */
    priority: { type: Boolean, default: false },
    cancelReason: { type: String },
    source: { type: String, enum: ['WEB', 'APP', 'IVR', 'CSC', 'SMS'], default: 'WEB' },
  },
  { timestamps: true }
);

bookingSchema.index({ center: 1, slotDate: 1, tokenNumber: 1 }, { unique: true });
bookingSchema.index({ center: 1, slotDate: 1, stage: 1 });

/** Position in today's *waiting* line — how many active tokens sit ahead. */
bookingSchema.methods.isActive = function () {
  return !['PAID', 'CANCELLED', 'NO_SHOW'].includes(this.stage);
};

bookingSchema.methods.pushStage = function (stage, by = 'system', note = '') {
  this.stage = stage;
  this.stageHistory.push({ stage, at: new Date(), by, note });
  if (stage === 'ARRIVED' && !this.arrivedAt) this.arrivedAt = new Date();
  if (stage === 'PAID') this.completedAt = new Date();
  return this;
};

bookingSchema.virtual('progressPct').get(function () {
  const idx = STAGES.indexOf(this.stage);
  if (idx < 0) return 0;
  return Math.round((idx / (STAGES.length - 1)) * 100);
});

bookingSchema.set('toJSON', { virtuals: true });

/**
 * Allocates the next token number for a centre+date atomically enough for a
 * prototype. A production build would use a dedicated counters collection.
 */
bookingSchema.statics.nextTokenNumber = async function (centerId, slotDate) {
  const last = await this.findOne({ center: centerId, slotDate }).sort({ tokenNumber: -1 }).lean();
  return (last?.tokenNumber || 0) + 1;
};

export const Booking = mongoose.model('Booking', bookingSchema);
