import dayjs from 'dayjs';
import { Center } from '../models/Center.js';
import { Booking } from '../models/Booking.js';
import { Notification } from '../models/Notification.js';
import { buildQueue } from './queue.service.js';
import { sendSMS } from './sms.service.js';
import { realtime } from './socket.service.js';
import { logger } from '../utils/logger.js';

/** How close to the front of the queue triggers the "your turn is near" alert. */
const ALERT_WITHIN_POSITIONS = 3;
const TICK_MS = 60_000;

/**
 * Background sweep over every active centre. Two jobs:
 *   1. Push a fresh queue snapshot to connected clients (keeps ETAs honest even
 *      when no staff action has happened).
 *   2. Send the automatic "your turn is approaching" SMS exactly once per token.
 */
async function tick() {
  try {
    const date = dayjs().format('YYYY-MM-DD');
    const centers = await Center.find({ isActive: true }).select('_id name').lean();

    for (const center of centers) {
      const snapshot = await buildQueue(center._id, date);
      if (!snapshot || snapshot.queue.length === 0) continue;

      realtime.queueUpdated(center._id, snapshot);

      const upcoming = snapshot.queue
        .filter((q) => q.stage === 'BOOKED' && q.position <= ALERT_WITHIN_POSITIONS);

      for (const item of upcoming) {
        const alreadySent = await Notification.exists({
          booking: item._id,
          template: 'TURN_APPROACHING',
        });
        if (alreadySent) continue;

        await sendSMS({
          template: 'TURN_APPROACHING',
          vars: {
            tokenCode: item.tokenCode,
            ahead: item.ahead,
            etaMins: Math.max(item.etaMins, 5),
            center: center.name,
          },
          phone: item.farmer?.phone,
          lang: item.farmer?.preferredLanguage || 'hi',
          farmer: item.farmer?._id,
          booking: item._id,
        });
        logger.info(`Auto-alert sent for token ${item.tokenCode}`);
      }
    }
  } catch (err) {
    logger.error(`Queue watcher tick failed: ${err.message}`);
  }
}

/**
 * Marks tokens absent when the farmer never checked in and the centre has closed.
 * Runs once per tick but only does work after closing time.
 */
async function sweepNoShows() {
  const now = dayjs();
  const date = now.format('YYYY-MM-DD');
  const centers = await Center.find({ isActive: true }).select('_id closeTime').lean();

  for (const center of centers) {
    const [ch, cm] = (center.closeTime || '18:00').split(':').map(Number);
    if (now.hour() * 60 + now.minute() < ch * 60 + cm) continue;

    const stale = await Booking.find({ center: center._id, slotDate: date, stage: 'BOOKED' });
    for (const booking of stale) {
      booking.pushStage('NO_SHOW', 'system', 'Auto-marked after centre closing time');
      await booking.save();
    }
    if (stale.length) logger.info(`Auto no-show: ${stale.length} token(s) at centre ${center._id}`);
  }
}

export function startQueueWatcher() {
  const timer = setInterval(async () => {
    await tick();
    await sweepNoShows().catch((e) => logger.error(`No-show sweep failed: ${e.message}`));
  }, TICK_MS);

  timer.unref();
  logger.success(`Queue watcher running (every ${TICK_MS / 1000}s)`);
  // First pass shortly after boot so a demo does not wait a full minute.
  setTimeout(tick, 5000).unref();
  return timer;
}
