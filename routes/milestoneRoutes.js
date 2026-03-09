import express from 'express';
import {
  createMilestones,
  getMilestones,
  getMilestoneById,
  submitMilestoneWorkHandler,
  approveMilestoneHandler,
  releaseMilestonePayment,
  getContractProgressHandler
} from '../controllers/milestoneController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.post('/', protect, createMilestones);
router.get('/', protect, getMilestones);
router.get('/:id', protect, objectIdValidation, getMilestoneById);

// Must come before /:id routes
router.post('/:id/submit', protect, objectIdValidation, submitMilestoneWorkHandler);
router.post('/:id/approve', protect, objectIdValidation, approveMilestoneHandler);
router.post('/:id/release-payment', protect, objectIdValidation, releaseMilestonePayment);

// Progress tracking
router.get('/contract/:contractId/progress', protect, objectIdValidation, getContractProgressHandler);

export default router;
