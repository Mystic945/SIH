import mongoose from 'mongoose';

const centerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameHi: { type: String, trim: true },
    district: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    address: { type: String, required: true },
    location: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    commodities: [{ type: String, uppercase: true }],
    /** Tokens the centre can realistically serve in a day. */
    dailyCapacity: { type: Number, default: 120, min: 1 },
    slotDurationMins: { type: Number, default: 30 },
    openTime: { type: String, default: '08:00' },
    closeTime: { type: String, default: '18:00' },
    /** Rolling average of full end-to-end service time; recalculated by FastAPI. */
    avgServiceMins: { type: Number, default: 23 },
    activeCounters: { type: Number, default: 3, min: 1 },
    contactPhone: { type: String, default: '' },
    inchargeName: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

centerSchema.index({ state: 1, district: 1, isActive: 1 });

/**
 * Populating a Center with a partial projection (e.g. `.populate('center', 'name code')`)
 * leaves the time fields undefined, and toJSON still evaluates virtuals — so this
 * must tolerate missing values rather than throwing during serialisation.
 */
centerSchema.virtual('slotsPerDay').get(function () {
  if (!this.openTime || !this.closeTime || !this.slotDurationMins) return null;
  const [oh, om] = String(this.openTime).split(':').map(Number);
  const [ch, cm] = String(this.closeTime).split(':').map(Number);
  if ([oh, om, ch, cm].some(Number.isNaN)) return null;
  return Math.floor((ch * 60 + cm - (oh * 60 + om)) / this.slotDurationMins);
});

centerSchema.set('toJSON', { virtuals: true });

export const Center = mongoose.model('Center', centerSchema);
