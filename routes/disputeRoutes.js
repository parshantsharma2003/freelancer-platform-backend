import express from 'express';
import {
  raiseDispute,
  addEvidence,
  getMyDisputes,
  getDispute,
  getOpenDisputes,
  getResolvedDisputes,
  resolveDisputeHandler,
  rejectDisputeHandler,
  getDisputeStats
} from '../controllers/disputeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// ==================== PROTECTED ROUTES (AUTHENTICATED USERS) ====================

// Raise a new dispute
router.post('/', protect, raiseDispute);

// Get current user's disputes
router.get('/', protect, getMyDisputes);

// Get a specific dispute (only involved parties)
router.get('/:id', protect, objectIdValidation, getDispute);

// Add evidence to a dispute
router.post('/:id/evidence', protect, objectIdValidation, addEvidence);

// ==================== ADMIN ROUTES ====================

// Get all open disputes (admin only)
router.get('/admin/open', protect, getOpenDisputes);

// Get all resolved disputes (admin only)
router.get('/admin/resolved', protect, getResolvedDisputes);

// Get dispute statistics (admin only)
router.get('/admin/stats', protect, getDisputeStats);

// Resolve a dispute (admin only)
router.patch('/:id/resolve', protect, objectIdValidation, resolveDisputeHandler);

// Reject a dispute (admin only)
router.patch('/:id/reject', protect, objectIdValidation, rejectDisputeHandler);

export default router;
