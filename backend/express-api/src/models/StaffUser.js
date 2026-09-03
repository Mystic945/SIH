import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'STAFF'], default: 'STAFF' },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

staffSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

staffSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

export const StaffUser = mongoose.model('StaffUser', staffSchema);
