import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/apiError.js';

/** GET /notifications/mine?limit= - the farmer's in-app inbox. */
export const myNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const notifications = await Notification.find({ farmer: req.user.id })
    .populate('booking', 'tokenCode slotDate stage')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ success: true, count: notifications.length, data: notifications });
});

/**
 * GET /notifications/feed - global outbox, admin only.
 * Demonstrates that both backends write into the same notification stream.
 */
export const notificationFeed = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  const filter = {};
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.dispatchedBy) filter.dispatchedBy = req.query.dispatchedBy;

  const notifications = await Notification.find(filter)
    .populate('farmer', 'name phone village')
    .populate('booking', 'tokenCode slotDate stage')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const byChannel = await Notification.aggregate([
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);
  const byService = await Notification.aggregate([
    { $group: { _id: '$dispatchedBy', count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    count: notifications.length,
    summary: {
      byChannel: Object.fromEntries(byChannel.map((c) => [c._id, c.count])),
      byService: Object.fromEntries(byService.map((c) => [c._id, c.count])),
      total: await Notification.estimatedDocumentCount(),
    },
    data: notifications,
  });
});
