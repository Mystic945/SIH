import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema(
  {
    start: { type: String, required: true }, // HH:mm
    end: { type: String, required: true },
    capacity: { type: Number, default: 15, min: 0 },
    booked: { type: Number, default: 0, min: 0 },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false }
);

slotSchema.virtual('remaining').get(function () {
  return Math.max(this.capacity - this.booked, 0);
});
slotSchema.set('toJSON', { virtuals: true });

/**
 * One document per centre per calendar date. Staff open/close dates and tune
 * per-slot capacity here; the farmer-facing schedule view reads straight off it.
 */
const scheduleSchema = new mongoose.Schema(
  {
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    isOpen: { type: Boolean, default: true },
    dailyCapacity: { type: Number, default: 120 },
    booked: { type: Number, default: 0 },
    commodities: [{ type: String, uppercase: true }],
    slots: { type: [slotSchema], default: [] },
    note: { type: String, default: '' },
    noteHi: { type: String, default: '' },
    updatedBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

scheduleSchema.index({ center: 1, date: 1 }, { unique: true });

scheduleSchema.virtual('remaining').get(function () {
  return Math.max(this.dailyCapacity - this.booked, 0);
});

/** open | filling | full | closed — drives the colour chip in the schedule view. */
scheduleSchema.virtual('status').get(function () {
  if (!this.isOpen) return 'closed';
  const remaining = this.dailyCapacity - this.booked;
  if (remaining <= 0) return 'full';
  if (remaining <= this.dailyCapacity * 0.2) return 'filling';
  return 'open';
});

scheduleSchema.set('toJSON', { virtuals: true });

export const Schedule = mongoose.model('Schedule', scheduleSchema);
