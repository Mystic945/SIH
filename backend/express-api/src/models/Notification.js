import mongoose from 'mongoose';
import { CHANNELS } from '../config/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
    phone: { type: String, required: true },
    channel: { type: String, enum: CHANNELS, default: 'SMS' },
    template: { type: String, required: true },
    message: { type: String, required: true },
    lang: { type: String, enum: ['en', 'hi'], default: 'hi' },
    status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED'], default: 'QUEUED' },
    provider: { type: String, default: 'MOCK' },
    /** Which service pushed it — useful to demo the dual-backend split. */
    dispatchedBy: { type: String, enum: ['express', 'fastapi'], default: 'express' },
    sentAt: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
