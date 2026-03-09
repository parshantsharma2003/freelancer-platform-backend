import express from 'express';
import {
  createOrUpdateReview,
  submitReview,
  getUserReviews,
  getAggregatedRatings,
  getPendingReviews,
  respondToReview,
  markAsHelpful,
  getFlaggedReviews,
  flagReview,
  unflagReview
} from '../controllers/reviewController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// ==================== PROTECTED ROUTES (AUTHENTICATED USERS) ====================

// Create or update a review (draft mode)
router.post('/', protect, createOrUpdateReview);

// Submit a review (triggers double-blind check)
router.post('/:contractId/submit', protect, submitReview);

// Get pending reviews for current user
router.get('/pending', protect, getPendingReviews);

// Respond to a review
router.post('/:id/respond', protect, objectIdValidation, respondToReview);

// Mark review as helpful
router.post('/:id/helpful', protect, objectIdValidation, markAsHelpful);

// ==================== PUBLIC ROUTES (NO AUTHENTICATION) ====================

// Get visible reviews for a user (double-blind: only visible after both submit)
router.get('/user/:userId', paginationValidation, getUserReviews);

// Get aggregated ratings for user profile
router.get('/ratings/:userId', getAggregatedRatings);

// ==================== ADMIN ROUTES ====================

// Get flagged reviews (suspicious patterns detected)
router.get('/admin/flagged', protect, getFlaggedReviews);

// Flag a review manually (admin action)
router.post('/admin/:id/flag', protect, objectIdValidation, flagReview);

// Unflag a review (admin action)
router.post('/admin/:id/unflag', protect, objectIdValidation, unflagReview);

export default router;
