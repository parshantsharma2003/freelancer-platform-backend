import express from 'express';
import {
  createMilestones,
  getMilestones,
  getMilestoneById,
  getMilestoneAttachmentMetadata,
  deleteMilestone,
  reorderMilestones,
  updateMilestone,
  addMilestoneAttachment,
  addMilestoneComment,
  startMilestoneWorkHandler,
  submitMilestoneWorkHandler,
  approveMilestoneHandler,
  releaseMilestonePayment,
  getContractProgressHandler
} from '../controllers/milestoneController.js';
import { protect, clientOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.post('/', protect, clientOnly, createMilestones);
router.post('/reorder', protect, clientOnly, reorderMilestones);
router.get('/', protect, getMilestones);
router.get('/contract/:contractId/progress', protect, getContractProgressHandler);

// Get attachment metadata (must come before generic :id routes)
router.get('/:id/attachments/:index', protect, objectIdValidation, getMilestoneAttachmentMetadata);

router.get('/:id', protect, objectIdValidation, getMilestoneById);
router.patch('/:id', protect, clientOnly, objectIdValidation, updateMilestone);
router.delete('/:id', protect, clientOnly, objectIdValidation, deleteMilestone);
router.post('/:id/attachments', protect, objectIdValidation, addMilestoneAttachment);
router.post('/:id/comments', protect, objectIdValidation, addMilestoneComment);

// Must come before /:id routes
router.post('/:id/start-work', protect, objectIdValidation, startMilestoneWorkHandler);
router.post('/:id/submit', protect, objectIdValidation, submitMilestoneWorkHandler);
router.post('/:id/approve', protect, objectIdValidation, approveMilestoneHandler);
router.post('/:id/release-payment', protect, objectIdValidation, releaseMilestonePayment);

export default router;
