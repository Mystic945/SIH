import mongoose from 'mongoose';

const farmerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: [/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'],
    },
    /** Only the last 4 digits are ever stored — full Aadhaar never touches the DB. */
    aadhaarLast4: { type: String, match: [/^\d{4}$/, 'Must be 4 digits'] },
    village: { type: String, trim: true },
    district: { type: String, index: true },
    state: { type: String, index: true },
    landAcres: { type: Number, default: 0, min: 0 },
    preferredLanguage: { type: String, enum: ['en', 'hi'], default: 'hi' },
    bankLast4: { type: String, match: [/^\d{4}$/, 'Must be 4 digits'] },
    /** Farmer Registration ID printed on the physical procurement card. */
    farmerId: { type: String, unique: true, sparse: true, uppercase: true },
    isVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

farmerSchema.pre('save', function (next) {
  if (!this.farmerId) {
    const suffix = this.phone.slice(-4);
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.farmerId = `FRM${suffix}${rand}`;
  }
  next();
});

export const Farmer = mongoose.model('Farmer', farmerSchema);
