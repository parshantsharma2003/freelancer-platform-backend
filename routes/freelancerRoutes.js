import express from 'express';
import {
  createOrUpdateProfile,
  getMyProfile,
  getFreelancers,
  getFreelancerById,
  getFeaturedFreelancers,
  getTopRatedFreelancers
} from '../controllers/freelancerController.js';
import {
  saveJob,
  unsaveJob,
  getSavedJobs,
  checkJobSaved
} from '../controllers/savedJobController.js';
import { protect, freelancerOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes (Freelancers only) - MUST come first
router.post('/profile', protect, freelancerOnly, createOrUpdateProfile);
router.get('/me/profile', protect, freelancerOnly, getMyProfile);

// Saved Jobs routes
router.get('/saved-jobs', protect, freelancerOnly, paginationValidation, getSavedJobs);
router.post('/saved-jobs/:jobId', protect, freelancerOnly, objectIdValidation, saveJob);
router.delete('/saved-jobs/:jobId', protect, freelancerOnly, objectIdValidation, unsaveJob);
router.get('/saved-jobs/:jobId/check', protect, freelancerOnly, objectIdValidation, checkJobSaved);

// Public specific routes - MUST come before generic routes
router.get('/featured', getFeaturedFreelancers);
router.get('/top-rated', getTopRatedFreelancers);

// Public routes - generic routes last
router.get('/', paginationValidation, getFreelancers);
router.get('/:id', objectIdValidation, getFreelancerById);

export default router;
