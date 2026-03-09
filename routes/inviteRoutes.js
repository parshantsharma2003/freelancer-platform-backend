import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import {
  sendJobInvite,
  bulkInviteFreelancers,
  respondToInvite,
  getMyInvites,
  getInviteById,
  getJobInvites,
  getJobInviteStats,
  cancelInvite
} from '../controllers/inviteController.js';

const router = express.Router();

/* ============================================================================
                          INVITE ROUTES
   ============================================================================ */

// Freelancer invites
router.get('/', protect, getMyInvites);
router.get('/:inviteId', protect, validateObjectId, getInviteById);
router.post('/:inviteId/respond', protect, validateObjectId, respondToInvite);
router.delete('/:inviteId', protect, validateObjectId, cancelInvite);

export default router;
