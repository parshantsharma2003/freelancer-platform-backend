import Notification from '../models/Notification.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Get all notifications for current user
// @route   GET /api/notifications
// @access  Private
export const getNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const { isRead, type } = req.query;

  const filters = {};
  if (isRead !== undefined) {
    filters.isRead = isRead === 'true';
  }
  if (type) {
    filters.type = type;
  }

  const result = await notificationService.getNotificationsForUser(
    req.user._id,
    page,
    limit,
    filters
  );

  res.status(200).json({
    status: 'success',
    data: {
      notifications: result.data,
      unreadCount: result.unreadCount,
      pagination: result.pagination
    }
  });
});

// @desc    Mark notification as read (using service)
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Notification marked as read',
    data: { notification }
  });
});

// @desc    Mark notification as read (PATCH alias)
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markAsReadPatch = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Notification marked as read',
    data: { notification }
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user._id);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { modifiedCount: result.modifiedCount }
  });
});

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Notification deleted'
  });
});

// @desc    Get unread count
// @route   GET /api/notifications/unread-count
// @access  Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);

  res.status(200).json({
    status: 'success',
    data: { count }
  });
});
