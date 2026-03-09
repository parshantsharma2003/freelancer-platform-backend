import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAsReadPatch,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.get('/', protect, paginationValidation, getNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.put('/mark-all-read', protect, markAllAsRead);

// Mark as read - both PUT and PATCH
router.put('/:id/read', protect, objectIdValidation, markAsRead);
router.patch('/:id/read', protect, objectIdValidation, markAsReadPatch);

// Delete notification
router.delete('/:id', protect, objectIdValidation, deleteNotification);

export default router;
