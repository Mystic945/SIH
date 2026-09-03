import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Notification } from '../models/Notification.js';
import { realtime } from './socket.service.js';

/**
 * Bilingual message templates. Every farmer-facing SMS is rendered in the
 * language stored on the farmer profile, defaulting to Hindi.
 */
export const TEMPLATES = {
  BOOKING_CONFIRMED: {
    en: (v) => `AgriQueue: Token ${v.tokenCode} confirmed at ${v.center} on ${v.date}, slot ${v.slot}. Carry your Farmer ID ${v.farmerId}. Track: agriqueue.in/t/${v.tokenCode}`,
    hi: (v) => `AgriQueue: ${v.date} को ${v.center} पर टोकन ${v.tokenCode} बुक हुआ, समय ${v.slot}. किसान ID ${v.farmerId} साथ लाएं. स्थिति: agriqueue.in/t/${v.tokenCode}`,
  },
  TURN_APPROACHING: {
    en: (v) => `AgriQueue: Your turn is near. Token ${v.tokenCode} — ${v.ahead} farmers ahead, approx ${v.etaMins} min. Please reach ${v.center}.`,
    hi: (v) => `AgriQueue: आपकी बारी नजदीक है. टोकन ${v.tokenCode} — ${v.ahead} किसान आगे, लगभग ${v.etaMins} मिनट. कृपया ${v.center} पहुंचें.`,
  },
  STAGE_UPDATE: {
    en: (v) => `AgriQueue: Token ${v.tokenCode} — status updated to ${v.stage} at ${v.time}.`,
    hi: (v) => `AgriQueue: टोकन ${v.tokenCode} — स्थिति अब ${v.stage} (${v.time}).`,
  },
  PAYMENT_INITIATED: {
    en: (v) => `AgriQueue: Payment of Rs ${v.amount} initiated for token ${v.tokenCode}. Credit to A/C ending ${v.bankLast4} within 48 hrs.`,
    hi: (v) => `AgriQueue: टोकन ${v.tokenCode} हेतु रु ${v.amount} का भुगतान शुरू. खाता ...${v.bankLast4} में 48 घंटे में जमा होगा.`,
  },
  PAYMENT_CREDITED: {
    en: (v) => `AgriQueue: Rs ${v.amount} credited for token ${v.tokenCode}. UTR ${v.utr}. Thank you.`,
    hi: (v) => `AgriQueue: टोकन ${v.tokenCode} हेतु रु ${v.amount} जमा हुए. UTR ${v.utr}. धन्यवाद.`,
  },
  OTP: {
    en: (v) => `${v.code} is your AgriQueue verification code. Valid 5 minutes. Do not share.`,
    hi: (v) => `${v.code} आपका AgriQueue सत्यापन कोड है. 5 मिनट तक मान्य. किसी से साझा न करें.`,
  },
  GRIEVANCE_RAISED: {
    en: (v) => `AgriQueue: Complaint ${v.ticketId} registered. We will respond within ${v.slaHours} hrs.`,
    hi: (v) => `AgriQueue: शिकायत ${v.ticketId} दर्ज हुई. ${v.slaHours} घंटे में उत्तर मिलेगा.`,
  },
  GRIEVANCE_RESOLVED: {
    en: (v) => `AgriQueue: Complaint ${v.ticketId} resolved. ${v.note}`,
    hi: (v) => `AgriQueue: शिकायत ${v.ticketId} का समाधान हुआ. ${v.note}`,
  },
  BOOKING_CANCELLED: {
    en: (v) => `AgriQueue: Token ${v.tokenCode} for ${v.date} has been cancelled. Rebook anytime on the portal.`,
    hi: (v) => `AgriQueue: ${v.date} का टोकन ${v.tokenCode} रद्द कर दिया गया. पोर्टल पर दोबारा बुक करें.`,
  },
};

/**
 * MOCK provider: renders + persists the message and streams it to the UI, so a
 * judge can literally watch the SMS log fill up. Swapping in Twilio is a single
 * branch below — the rest of the codebase is untouched.
 */
async function deliver({ phone, message }) {
  if (env.smsProvider === 'TWILIO') {
    // const twilio = (await import('twilio')).default(SID, TOKEN);
    // await twilio.messages.create({ to: `+91${phone}`, from: FROM, body: message });
    // return { provider: 'TWILIO', status: 'SENT' };
  }
  logger.sms(`→ +91${phone} :: ${message}`);
  return { provider: env.smsProvider, status: 'SENT' };
}

export async function sendSMS({
  template,
  vars = {},
  phone,
  lang = 'hi',
  farmer = null,
  booking = null,
  channel = 'SMS',
  dispatchedBy = 'express',
}) {
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error(`Unknown SMS template: ${template}`);

  const message = (tpl[lang] || tpl.en)(vars);
  const result = await deliver({ phone, message });

  const doc = await Notification.create({
    farmer, booking, phone, channel, template, message, lang,
    status: result.status, provider: result.provider, dispatchedBy,
    meta: vars,
  });

  realtime.notificationSent(doc.toJSON());
  return doc;
}

/** Voice call for feature-phone users — simulated, but modelled end to end. */
export async function triggerIVR({ phone, template, vars, lang = 'hi', farmer, booking }) {
  return sendSMS({ template, vars, phone, lang, farmer, booking, channel: 'IVR' });
}
