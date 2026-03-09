import express from 'express';
import {
  createProposal,
  getJobProposals,
  getMyProposals,
  getReceivedProposals,
  getProposalById,
  updateProposal,
  withdrawProposal,
  acceptProposal,
  rejectProposal,
  getUnreadProposalCount
} from '../controllers/proposalController.js';
import { protect, freelancerOnly } from '../middleware/authMiddleware.js';
import { proposalValidation, objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes (Freelancers only)
router.post('/', protect, freelancerOnly, proposalValidation, createProposal);
router.get('/my/submitted', protect, freelancerOnly, paginationValidation, getMyProposals);
router.get('/unread-count', protect, getUnreadProposalCount);
router.get('/received/all', protect, paginationValidation, getReceivedProposals);
router.get('/job/:jobId', protect, getJobProposals);

// Protected routes (Authorization checked in controller) - MUST come after specific routes
router.get('/:id', protect, objectIdValidation, getProposalById);
router.put('/:id', protect, objectIdValidation, updateProposal);
router.put('/:id/withdraw', protect, objectIdValidation, withdrawProposal);
router.put('/:id/accept', protect, objectIdValidation, acceptProposal);
router.put('/:id/reject', protect, objectIdValidation, rejectProposal);
router.put('/:id/decline', protect, objectIdValidation, rejectProposal);

export default router;
