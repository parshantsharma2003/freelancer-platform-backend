import express from 'express';
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  getMyJobs,
  closeJob,
  changeJobStatus,
  getRecommendedJobsForFreelancer
} from '../controllers/jobController.js';
import {
  sendJobInvite,
  bulkInviteFreelancers,
  getJobInvites,
  getJobInviteStats
} from '../controllers/inviteController.js';
import { protect, clientOnly } from '../middleware/authMiddleware.js';
import { jobValidation, objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', paginationValidation, getJobs);

// Protected routes (Freelancers)
// Note: Placed before /:id to prevent "recommended" being treated as an ID
router.get(
  "/recommended",
  protect,
  getRecommendedJobsForFreelancer
);

// Protected routes (Clients only) - MUST come before /:id route
router.post('/', protect, clientOnly, jobValidation, createJob);
router.get('/my/posted', protect, clientOnly, getMyJobs);

// Job invite routes (Client only)
router.post('/:id/invite', protect, clientOnly, objectIdValidation, sendJobInvite);
router.post('/:id/invite-bulk', protect, clientOnly, objectIdValidation, bulkInviteFreelancers);
router.get('/:id/invites', protect, clientOnly, objectIdValidation, getJobInvites);
router.get('/:id/invite-stats', protect, clientOnly, objectIdValidation, getJobInviteStats);

// More job routes
router.put('/:id/close', protect, objectIdValidation, closeJob);
router.put('/:id/status', protect, objectIdValidation, changeJobStatus);
router.put('/:id', protect, objectIdValidation, updateJob);
router.delete('/:id', protect, objectIdValidation, deleteJob);

// Public route with :id param - MUST come after specific routes
router.get('/:id', objectIdValidation, getJobById);

export default router;