import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Mongo TTL index — expired OTP documents clean themselves up.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpRequest = mongoose.model('OtpRequest', otpSchema);
