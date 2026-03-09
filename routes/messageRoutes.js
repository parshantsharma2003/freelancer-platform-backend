import express from 'express';
import {
  sendMessage,
  getConversations,
  getMessages,
  markAsRead,
  deleteMessage,
  checkCanMessage,
  getUnreadCount,
  getUnreadByConversation,
  searchMessages,
  getAttachmentMetadata,
  getDirectMessages
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Send message
router.post('/', sendMessage);

// Check if messaging is allowed (specific route - before :userId param routes)
router.get('/can-message/:userId', checkCanMessage);

// Get all conversations
router.get('/conversations', getConversations);

// Unread counters (specific routes - before :id param routes)
router.get('/unread/count', getUnreadCount);
router.get('/unread/by-conversation', getUnreadByConversation);

// Search messages (specific route - before :id param routes)
router.get('/search', searchMessages);

// Direct messages between two users (specific route - before :id param routes)
router.get('/direct/:userId', getDirectMessages);

// Get conversation messages (specific route with full path)
router.get('/conversation/:conversationId', getMessages);

// Get attachment metadata (specific param route - before generic :id routes)
router.get('/:id/attachments/:index', objectIdValidation, getAttachmentMetadata);

// Mark single message as read (param route with subpath)
router.put('/:id/read', objectIdValidation, markAsRead);

// Delete message (generic param route)
router.delete('/:id', objectIdValidation, deleteMessage);

export default router;
