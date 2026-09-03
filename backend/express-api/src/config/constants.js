/**
 * Procurement pipeline. The order of this array *is* the pipeline order —
 * `advanceStage` simply moves a booking to the next index.
 */
export const STAGES = [
  'BOOKED',
  'ARRIVED',
  'QUALITY_CHECK',
  'WEIGHMENT',
  'PAYMENT_INITIATED',
  'PAID',
];

export const TERMINAL_STAGES = ['PAID', 'CANCELLED', 'NO_SHOW'];
export const ALL_STAGES = [...STAGES, 'CANCELLED', 'NO_SHOW'];

/** Median minutes a farmer spends *in* each stage — used for live ETA maths. */
export const STAGE_SERVICE_MINUTES = {
  ARRIVED: 4,
  QUALITY_CHECK: 8,
  WEIGHMENT: 6,
  PAYMENT_INITIATED: 5,
};

export const STAGE_LABELS = {
  BOOKED: { en: 'Slot Booked', hi: 'स्लॉट बुक' },
  ARRIVED: { en: 'Arrived at Centre', hi: 'केंद्र पर पहुंचे' },
  QUALITY_CHECK: { en: 'Quality Check', hi: 'गुणवत्ता जांच' },
  WEIGHMENT: { en: 'Weighment', hi: 'तौल' },
  PAYMENT_INITIATED: { en: 'Payment Initiated', hi: 'भुगतान शुरू' },
  PAID: { en: 'Payment Credited', hi: 'भुगतान जमा' },
  CANCELLED: { en: 'Cancelled', hi: 'रद्द' },
  NO_SHOW: { en: 'Did Not Arrive', hi: 'उपस्थित नहीं' },
};

export const COMMODITIES = [
  { code: 'WHEAT', en: 'Wheat', hi: 'गेहूं', msp: 2425 },
  { code: 'PADDY', en: 'Paddy', hi: 'धान', msp: 2300 },
  { code: 'GRAM', en: 'Gram', hi: 'चना', msp: 5650 },
  { code: 'MUSTARD', en: 'Mustard', hi: 'सरसों', msp: 5950 },
  { code: 'SOYBEAN', en: 'Soybean', hi: 'सोयाबीन', msp: 4892 },
];

export const CHANNELS = ['SMS', 'IVR', 'WHATSAPP', 'APP'];
