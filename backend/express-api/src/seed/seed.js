/**
 * Seeds a realistic, demo-ready dataset:
 *   6 procurement centres, ~70 farmers, staff accounts, 14 days of schedules,
 *   and today's queue already mid-flight so the dashboard is never empty.
 *
 *   npm run seed          → wipes AgriQueue collections and reseeds
 *   npm run seed -- --keep → adds data without wiping
 */
import mongoose from 'mongoose';
import dayjs from 'dayjs';

import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { Center } from '../models/Center.js';
import { Farmer } from '../models/Farmer.js';
import { StaffUser } from '../models/StaffUser.js';
import { Booking } from '../models/Booking.js';
import { Schedule } from '../models/Schedule.js';
import { Grievance } from '../models/Grievance.js';
import { Notification } from '../models/Notification.js';
import { OtpRequest } from '../models/OtpRequest.js';
import { generateSlots } from '../services/queue.service.js';
import { COMMODITIES, STAGES } from '../config/constants.js';

const keep = process.argv.includes('--keep');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, dp = 1) => Number((Math.random() * (max - min) + min).toFixed(dp));

const CENTERS = [
  {
    code: 'MP-HSG', name: 'Hoshangabad Mandi Procurement Centre', nameHi: 'होशंगाबाद मंडी खरीद केंद्र',
    district: 'Narmadapuram', state: 'Madhya Pradesh',
    address: 'Krishi Upaj Mandi Samiti, Itarsi Road, Narmadapuram - 461001',
    location: { lat: 22.7533, lng: 77.7228 },
    commodities: ['WHEAT', 'GRAM', 'SOYBEAN'], dailyCapacity: 140, activeCounters: 4,
    contactPhone: '07574255010', inchargeName: 'R. K. Verma',
  },
  {
    code: 'PB-LDH', name: 'Ludhiana Grain Market Centre', nameHi: 'लुधियाना अनाज मंडी केंद्र',
    district: 'Ludhiana', state: 'Punjab',
    address: 'New Grain Market, Gill Road, Ludhiana - 141003',
    location: { lat: 30.9010, lng: 75.8573 },
    commodities: ['WHEAT', 'PADDY'], dailyCapacity: 180, activeCounters: 5,
    contactPhone: '01612444120', inchargeName: 'Gurpreet Singh',
  },
  {
    code: 'UP-BLY', name: 'Bareilly Kisan Seva Kendra', nameHi: 'बरेली किसान सेवा केंद्र',
    district: 'Bareilly', state: 'Uttar Pradesh',
    address: 'Mandi Samiti Parisar, Pilibhit Bypass Road, Bareilly - 243006',
    location: { lat: 28.3670, lng: 79.4304 },
    commodities: ['WHEAT', 'PADDY', 'MUSTARD'], dailyCapacity: 120, activeCounters: 3,
    contactPhone: '05812428800', inchargeName: 'Anjali Tripathi',
  },
  {
    code: 'MH-LTR', name: 'Latur APMC Procurement Yard', nameHi: 'लातूर एपीएमसी खरीद केंद्र',
    district: 'Latur', state: 'Maharashtra',
    address: 'APMC Market Yard, Barshi Road, Latur - 413512',
    location: { lat: 18.4088, lng: 76.5604 },
    commodities: ['SOYBEAN', 'GRAM'], dailyCapacity: 110, activeCounters: 3,
    contactPhone: '02382242300', inchargeName: 'S. B. Kulkarni',
  },
  {
    code: 'RJ-KOT', name: 'Kota Krishi Upaj Centre', nameHi: 'कोटा कृषि उपज केंद्र',
    district: 'Kota', state: 'Rajasthan',
    address: 'Bhamashah Mandi, Jhalawar Road, Kota - 324007',
    location: { lat: 25.1638, lng: 75.8648 },
    commodities: ['WHEAT', 'MUSTARD', 'GRAM'], dailyCapacity: 130, activeCounters: 4,
    contactPhone: '07442325400', inchargeName: 'Meena Rathore',
  },
  {
    code: 'TS-KRM', name: 'Karimnagar Paddy Procurement Centre', nameHi: 'करीमनगर धान खरीद केंद्र',
    district: 'Karimnagar', state: 'Telangana',
    address: 'IKP Centre, Mankammathota, Karimnagar - 505001',
    location: { lat: 18.4386, lng: 79.1288 },
    commodities: ['PADDY'], dailyCapacity: 150, activeCounters: 4,
    contactPhone: '08782233440', inchargeName: 'V. Ramesh',
  },
];

const FIRST = ['Ramesh', 'Sunita', 'Mahesh', 'Kavita', 'Rajesh', 'Anita', 'Suresh', 'Geeta', 'Dinesh', 'Lakshmi', 'Prakash', 'Savitri', 'Mohan', 'Radha', 'Vijay', 'Sarita', 'Ganesh', 'Manju', 'Arjun', 'Pooja', 'Balram', 'Shanti', 'Hari', 'Nirmala', 'Kishan', 'Usha'];
const LAST = ['Patil', 'Yadav', 'Singh', 'Sharma', 'Verma', 'Kumar', 'Chaudhary', 'Rathore', 'Reddy', 'Gowda', 'Jat', 'Meena', 'Nair', 'Deshmukh', 'Thakur', 'Pawar'];
const VILLAGES = ['Rampur', 'Sultanpur', 'Bhilwara', 'Kharkhoda', 'Nandgaon', 'Pipariya', 'Bhojpur', 'Dhanora', 'Gopalpur', 'Sirsa', 'Amarpur', 'Kanhaiya Kheda', 'Manpura', 'Balrampur', 'Chandpur'];

function makePhone(i) {
  // Deterministic, obviously-fake numbers so the demo login list is predictable.
  return `9${String(800000000 + i * 137).slice(0, 9)}`;
}

async function wipe() {
  logger.warn('Clearing existing AgriQueue collections...');
  await Promise.all([
    Center.deleteMany({}), Farmer.deleteMany({}), StaffUser.deleteMany({}),
    Booking.deleteMany({}), Schedule.deleteMany({}), Grievance.deleteMany({}),
    Notification.deleteMany({}), OtpRequest.deleteMany({}),
  ]);
}

async function seedCenters() {
  const centers = await Center.insertMany(CENTERS);
  logger.success(`${centers.length} procurement centres created`);
  return centers;
}

async function seedStaff(centers) {
  const password = await StaffUser.hashPassword('admin123');
  const docs = [
    { name: 'Control Room Admin', username: 'admin', role: 'ADMIN', center: centers[0]._id, passwordHash: password },
    ...centers.map((c, i) => ({
      name: c.inchargeName,
      username: c.code.toLowerCase().replace('-', ''),
      role: 'STAFF',
      center: c._id,
      passwordHash: password,
    })),
  ];
  const staff = await StaffUser.insertMany(docs);
  logger.success(`${staff.length} staff accounts created (password for all: admin123)`);
  return staff;
}

/**
 * Pool size matters: one token per farmer per centre per day means each centre
 * needs a district roster large enough to fill a busy day several times over.
 */
const FARMER_COUNT = 540;

async function seedFarmers(centers) {
  const farmers = [];
  for (let i = 0; i < FARMER_COUNT; i += 1) {
    const center = centers[i % centers.length];
    farmers.push({
      name: `${pick(FIRST)} ${pick(LAST)}`,
      phone: makePhone(i),
      aadhaarLast4: String(rand(1000, 9999)),
      bankLast4: String(rand(1000, 9999)),
      village: pick(VILLAGES),
      district: center.district,
      state: center.state,
      landAcres: randFloat(0.5, 18, 1),
      preferredLanguage: Math.random() > 0.35 ? 'hi' : 'en',
      isVerified: true,
    });
  }
  // A stable demo account judges can always log into.
  farmers[0] = {
    ...farmers[0],
    name: 'Ramesh Patil',
    phone: '9876543210',
    village: 'Rampur',
    district: centers[0].district,
    state: centers[0].state,
    landAcres: 4.5,
    preferredLanguage: 'hi',
  };

  // insertMany skips the pre-save hook that mints farmerId, so it is minted here
  // and the whole roster goes in as one bulk write.
  const withIds = farmers.map((f, i) => ({
    ...f,
    // Index suffix guarantees uniqueness against the sparse unique index.
    farmerId: `FRM${f.phone.slice(-4)}${String(i).padStart(4, '0')}`,
  }));

  const created = await Farmer.insertMany(withIds);
  logger.success(`${created.length} farmers registered (demo login: 9876543210 / OTP 123456)`);
  return created;
}

async function seedSchedules(centers) {
  const docs = [];
  for (const center of centers) {
    for (let d = 0; d < 21; d += 1) {
      const date = dayjs().add(d, 'day');
      const isSunday = date.day() === 0;
      docs.push({
        center: center._id,
        date: date.format('YYYY-MM-DD'),
        isOpen: !isSunday,
        dailyCapacity: center.dailyCapacity,
        booked: 0,
        commodities: center.commodities,
        slots: generateSlots(center),
        note: isSunday ? 'Weekly holiday' : '',
        noteHi: isSunday ? 'साप्ताहिक अवकाश' : '',
        updatedBy: 'seed',
      });
    }
  }
  await Schedule.insertMany(docs);
  logger.success(`${docs.length} daily schedules created (21 days x ${centers.length} centres)`);
}

/** Builds a booking whose stage history reads like a real day at the mandi. */
function buildBooking({ center, farmer, date, tokenNumber, slot, targetStage, isToday }) {
  const commodity = pick(center.commodities);
  const msp = COMMODITIES.find((c) => c.code === commodity)?.msp || 2000;
  const qty = randFloat(2, 45, 1);
  const tokenCode = `${center.code}-${dayjs(date).format('DDMM')}-${String(tokenNumber).padStart(3, '0')}`;

  const stageIdx = STAGES.indexOf(targetStage);
  const history = [];
  let cursor = dayjs(`${date} ${slot.start}`).subtract(rand(20, 240), 'minute');

  for (let i = 0; i <= Math.max(stageIdx, 0); i += 1) {
    history.push({
      stage: STAGES[i],
      at: cursor.toDate(),
      by: i === 0 ? 'farmer' : center.inchargeName,
      note: i === 0 ? 'Slot booked online' : '',
    });
    cursor = cursor.add(rand(4, 14), 'minute');
  }

  const netQtl = Number((qty * randFloat(0.94, 0.995, 3)).toFixed(2));
  const doc = {
    tokenNumber, tokenCode,
    farmer: farmer._id, center: center._id,
    slotDate: date, slotStart: slot.start, slotEnd: slot.end,
    commodity, quantityQuintals: qty,
    stage: targetStage,
    stageHistory: history,
    priority: Math.random() < 0.07,
    source: pick(['WEB', 'WEB', 'APP', 'CSC', 'IVR']),
    payment: { ratePerQuintal: msp, amount: Math.round(msp * qty), status: 'PENDING' },
    createdAt: history[0].at,
  };

  if (stageIdx >= STAGES.indexOf('ARRIVED')) doc.arrivedAt = history[1]?.at;

  if (stageIdx >= STAGES.indexOf('QUALITY_CHECK')) {
    doc.quality = {
      moisturePct: randFloat(8, 14, 1),
      grade: pick(['A', 'A', 'B', 'B', 'C']),
      remarks: 'Sample verified as per FAQ norms',
    };
  }
  if (stageIdx >= STAGES.indexOf('WEIGHMENT')) {
    doc.weighment = { grossQuintals: qty, netQuintals: netQtl, bags: Math.ceil(netQtl * 2) };
    doc.payment.amount = Math.round(msp * netQtl);
  }
  if (stageIdx >= STAGES.indexOf('PAYMENT_INITIATED')) {
    doc.payment.status = 'INITIATED';
    doc.payment.initiatedAt = history[STAGES.indexOf('PAYMENT_INITIATED')]?.at;
    doc.payment.utr = `UTR${dayjs(date).format('YYMMDD')}${rand(100000, 999999)}`;
  }
  if (targetStage === 'PAID') {
    doc.payment.status = 'PAID';
    doc.payment.paidAt = history[history.length - 1].at;
    doc.completedAt = history[history.length - 1].at;
  }
  return doc;
}

async function seedBookings(centers, farmers) {
  const docs = [];

  /**
   * The API enforces one live token per farmer per centre per day, so the seed
   * has to honour the same rule — otherwise the demo data contradicts the
   * validation and booking flows fail on the seeded accounts.
   */
  const claimed = new Set();
  const claimFarmer = (pool, centerCode, date, startIndex) => {
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(startIndex + offset) % pool.length];
      const key = `${centerCode}|${date}|${candidate._id}`;
      if (!claimed.has(key)) {
        claimed.add(key);
        return candidate;
      }
    }
    return null; // pool exhausted for this centre+date
  };

  for (const center of centers) {
    const slots = generateSlots(center);
    const centerFarmers = farmers.filter((f) => f.district === center.district);
    const pool = centerFarmers.length >= 8 ? centerFarmers : farmers;

    // ---- past 5 days: fully completed, feeds the analytics + trend charts
    for (let d = 5; d >= 1; d -= 1) {
      const date = dayjs().subtract(d, 'day');
      if (date.day() === 0) continue;
      const dateStr = date.format('YYYY-MM-DD');
      const count = Math.min(rand(28, Math.min(center.dailyCapacity - 10, 70)), pool.length);
      for (let t = 1; t <= count; t += 1) {
        const farmer = claimFarmer(pool, center.code, dateStr, t);
        if (!farmer) break;
        const stage = Math.random() < 0.92 ? 'PAID' : pick(['NO_SHOW', 'CANCELLED']);
        docs.push(
          buildBooking({
            center, farmer, date: dateStr,
            tokenNumber: t, slot: slots[t % slots.length], targetStage: stage,
          })
        );
      }
    }

    // ---- today: a live queue mid-flight, which is what judges actually see
    const todayCount = rand(26, 42);
    const distribution = [
      ...Array(Math.round(todayCount * 0.42)).fill('BOOKED'),
      ...Array(Math.round(todayCount * 0.12)).fill('ARRIVED'),
      ...Array(Math.round(todayCount * 0.12)).fill('QUALITY_CHECK'),
      ...Array(Math.round(todayCount * 0.10)).fill('WEIGHMENT'),
      ...Array(Math.round(todayCount * 0.08)).fill('PAYMENT_INITIATED'),
      ...Array(Math.round(todayCount * 0.16)).fill('PAID'),
    ];
    const todayStr = dayjs().format('YYYY-MM-DD');
    for (let t = 1; t <= distribution.length; t += 1) {
      const farmer = claimFarmer(pool, center.code, todayStr, t * 3);
      if (!farmer) break;
      docs.push(
        buildBooking({
          center, farmer, date: todayStr,
          tokenNumber: t, slot: slots[Math.min(Math.floor(t / 2), slots.length - 1)],
          targetStage: distribution[t - 1], isToday: true,
        })
      );
    }

    // ---- next 4 days: forward bookings so the schedule view shows real load
    for (let d = 1; d <= 4; d += 1) {
      const date = dayjs().add(d, 'day');
      if (date.day() === 0) continue;
      const dateStr = date.format('YYYY-MM-DD');
      const count = Math.min(rand(8, 30), pool.length);
      for (let t = 1; t <= count; t += 1) {
        const farmer = claimFarmer(pool, center.code, dateStr, t * 5);
        if (!farmer) break;
        docs.push(
          buildBooking({
            center, farmer, date: dateStr,
            tokenNumber: t, slot: slots[t % slots.length], targetStage: 'BOOKED',
          })
        );
      }
    }
  }

  await Booking.insertMany(docs, { ordered: false });
  logger.success(`${docs.length} bookings created across past, today and upcoming days`);

  // Keep the schedule counters consistent with what was actually inserted.
  const counts = await Booking.aggregate([
    { $match: { stage: { $nin: ['CANCELLED'] } } },
    { $group: { _id: { center: '$center', date: '$slotDate' }, booked: { $sum: 1 } } },
  ]);
  await Promise.all(
    counts.map((c) =>
      Schedule.updateOne({ center: c._id.center, date: c._id.date }, { $set: { booked: c.booked } })
    )
  );

  return docs;
}

async function seedGrievances(centers, farmers) {
  const paid = await Booking.find({ stage: 'PAID' }).limit(200).lean();
  const samples = [
    { category: 'WEIGHT_DISPUTE', subject: 'Net weight lower than my own weighing', description: 'My tractor trolley was weighed at 22.4 quintals at the village kanta but the centre recorded 21.1 quintals. Please re-verify the weighbridge calibration.' },
    { category: 'PAYMENT_DELAY', subject: 'Payment not credited after 6 days', description: 'Token shows Payment Initiated since last week but nothing has reached my bank account. UTR was shared but the bank says no credit received.' },
    { category: 'LONG_WAIT', subject: 'Waited 5 hours despite booked slot', description: 'I had a 10:00 AM slot but was called only at 3:00 PM. Tokens booked after mine were processed earlier.' },
    { category: 'QUALITY_REJECTION', subject: 'Moisture reading seems incorrect', description: 'The moisture meter showed 16% but my grain was sun dried for four days. Requesting a re-test with a calibrated meter.' },
    { category: 'STAFF_BEHAVIOUR', subject: 'Rude behaviour at weighment counter', description: 'The operator at counter 2 refused to show the digital display reading when I asked to verify it.' },
    { category: 'SLOT_ISSUE', subject: 'Could not book a slot for two weeks', description: 'Every date shows as full within minutes of opening. Requesting additional capacity for our block.' },
  ];

  const docs = samples.map((s, i) => {
    const booking = paid[i * 7] || paid[i];
    const created = dayjs().subtract(rand(1, 9), 'day').toDate();
    const status = i < 2 ? 'OPEN' : i < 4 ? 'IN_REVIEW' : 'RESOLVED';
    const priority = ['PAYMENT_DELAY', 'WEIGHT_DISPUTE'].includes(s.category) ? 'HIGH' : 'MEDIUM';

    return {
      ticketId: Grievance.generateTicketId(),
      farmer: booking?.farmer || farmers[i]._id,
      booking: booking?._id,
      center: booking?.center || centers[i % centers.length]._id,
      ...s,
      status,
      priority,
      slaHours: priority === 'HIGH' ? 24 : 72,
      createdAt: created,
      responses:
        status === 'OPEN'
          ? []
          : [
              { by: centers[i % centers.length].inchargeName, role: 'STAFF', message: 'Your complaint has been received and forwarded to the concerned officer for verification.', at: dayjs(created).add(4, 'hour').toDate() },
            ],
      ...(status === 'RESOLVED'
        ? {
            resolvedAt: dayjs(created).add(2, 'day').toDate(),
            resolvedBy: centers[i % centers.length].inchargeName,
            resolutionNote: 'Verified with centre records and corrective action completed. Revised entry updated in the system.',
          }
        : {}),
    };
  });

  await Grievance.insertMany(docs);
  logger.success(`${docs.length} sample grievances created`);
}

async function run() {
  logger.info(`Seeding database "${env.dbName}"...`);
  await connectDB();
  if (!keep) await wipe();

  const centers = await seedCenters();
  await seedStaff(centers);
  const farmers = await seedFarmers(centers);
  await seedSchedules(centers);
  await seedBookings(centers, farmers);
  await seedGrievances(centers, farmers);

  console.log('\n' + '-'.repeat(64));
  console.log('  AgriQueue demo data is ready');
  console.log('-'.repeat(64));
  console.log('  Farmer login   : 9876543210   OTP 123456  (any OTP works in dev)');
  console.log('  Admin login    : admin / admin123        (all centres)');
  console.log('  Centre staff   : mphsg | pbldh | upbly | mhltr | rjkot | tskrm');
  console.log('  Staff password : admin123');
  console.log('-'.repeat(64) + '\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  logger.error(err.stack);
  process.exit(1);
});
