import notificationService from "../services/notificationService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getNotificationQueue } from "../queues/notificationQueue.js";

/* -------------------------------------------------------------------------- */
/* GET USER NOTIFICATIONS                             */
/* -------------------------------------------------------------------------- */

export const getNotifications = asyncHandler(async (req, res) => {

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const { isRead, type } = req.query;

  const filters = {};

  if (isRead !== undefined) {
    filters.isRead = isRead === "true";
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
    status: "success",
    data: {
      notifications: result.data,
      unreadCount: result.unreadCount,
      pagination: result.pagination
    }
  });

});


/* -------------------------------------------------------------------------- */
/* MARK NOTIFICATION AS READ                          */
/* -------------------------------------------------------------------------- */

export const markAsRead = asyncHandler(async (req, res) => {

  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: "success",
    message: "Notification marked as read",
    data: { notification }
  });

});


/* -------------------------------------------------------------------------- */
/* PATCH ALIAS FOR MARK AS READ                           */
/* -------------------------------------------------------------------------- */

export const markAsReadPatch = asyncHandler(async (req, res) => {

  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: "success",
    message: "Notification marked as read",
    data: { notification }
  });

});


/* -------------------------------------------------------------------------- */
/* MARK ALL NOTIFICATIONS AS READ                       */
/* -------------------------------------------------------------------------- */

export const markAllAsRead = asyncHandler(async (req, res) => {

  const result = await notificationService.markAllAsRead(req.user._id);

  res.status(200).json({
    status: "success",
    message: result.message,
    data: {
      modifiedCount: result.modifiedCount
    }
  });

});


/* -------------------------------------------------------------------------- */
/* DELETE NOTIFICATION                              */
/* -------------------------------------------------------------------------- */

export const deleteNotification = asyncHandler(async (req, res) => {

  await notificationService.deleteNotification(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: "success",
    message: "Notification deleted successfully"
  });

});


/* -------------------------------------------------------------------------- */
/* GET UNREAD COUNT                                */
/* -------------------------------------------------------------------------- */

export const getUnreadCount = asyncHandler(async (req, res) => {

  const count = await notificationService.getUnreadCount(req.user._id);

  res.status(200).json({
    status: "success",
    data: { count }
  });

});

/* -------------------------------------------------------------------------- */
/* SEND NOTIFICATION (ASYNC)                           */
/* -------------------------------------------------------------------------- */

/**
 * Example of how to use the background worker for new notifications
 */
export const createNotification = asyncHandler(async (req, res) => {
  const { recipient, message, type } = req.body;
  const notificationQueue = getNotificationQueue();

  // Notifications will now run in background worker via Bull/Redis
  await notificationQueue.add("sendNotification", {
    recipient,
    message,
    type
  });

  res.status(202).json({
    status: "success",
    message: "Notification queued for delivery"
  });
});