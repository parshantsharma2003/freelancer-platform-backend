import Review from '../models/Review.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as reviewService from '../services/reviewService.js';
import User from '../models/User.js';

// @desc    Create or update a review (draft - not yet submitted)
// @route   POST /api/reviews
// @access  Private
export const createOrUpdateReview = asyncHandler(async (req, res) => {
  const { contractId, revieweeId, rating, comment, skillRatings, pros, cons } = req.body;

  if (!contractId || !revieweeId || !rating || !comment) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields: contractId, revieweeId, rating, comment'
    });
  }

  // Validate rating
  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      status: 'error',
      message: 'Rating must be between 1 and 5'
    });
  }

  // Check if user can leave a review
  try {
    await reviewService.canLeaveReview(req.user._id, revieweeId, contractId);
  } catch (error) {
    return res.status(403).json({
      status: 'error',
      message: error.message
    });
  }

  try {
    const review = await reviewService.createOrUpdateReview(req.user._id, contractId, {
      revieweeId,
      rating,
      comment,
      skillRatings,
      pros,
      cons
    });

    res.status(201).json({
      status: 'success',
      message: 'Review draft saved. Call submit endpoint to make it final.',
      data: { review }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Submit a review (makes it eligible for double-blind visibility)
// @route   POST /api/reviews/:contractId/submit
// @access  Private
export const submitReview = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { revieweeId } = req.body;

  if (!revieweeId) {
    return res.status(400).json({
      status: 'error',
      message: 'revieweeId is required'
    });
  }

  try {
    const review = await reviewService.submitReview(req.user._id, contractId, revieweeId);

    const flagStatus = review.flagged
      ? `Review flagged for pattern: ${review.flagReason}`
      : 'Review submitted successfully';

    res.status(200).json({
      status: 'success',
      message: flagStatus,
      data: {
        review,
        flagged: review.flagged,
        flagReason: review.flagReason
      }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get visible reviews for a user (double-blind: only after both submit)
// @route   GET /api/users/:userId/reviews
// @access  Public
export const getUserReviews = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  try {
    const result = await reviewService.getUserReviews(userId, parseInt(page), parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get user's aggregated ratings for profile
// @route   GET /api/users/:userId/ratings-summary
// @access  Public
export const getAggregatedRatings = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const ratings = await reviewService.getAggregatedRatings(userId);

    res.status(200).json({
      status: 'success',
      data: ratings
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get pending reviews to submit (for current user)
// @route   GET /api/reviews/pending
// @access  Private
export const getPendingReviews = asyncHandler(async (req, res) => {
  try {
    const reviews = await reviewService.getPendingReviews(req.user._id);

    res.status(200).json({
      status: 'success',
      data: { reviews }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Respond to a review
// @route   POST /api/reviews/:id/respond
// @access  Private
export const respondToReview = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({
      status: 'error',
      message: 'Response content is required'
    });
  }

  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({
      status: 'error',
      message: 'Review not found'
    });
  }

  // Check if user is the reviewee
  if (review.reviewee.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to respond to this review'
    });
  }

  // Check if review is visible (can only respond to visible reviews)
  if (!review.isVisible) {
    return res.status(403).json({
      status: 'error',
      message: 'Cannot respond to reviews from incomplete double-blind submissions'
    });
  }

  review.response = {
    content,
    respondedAt: new Date()
  };

  await review.save();

  res.status(200).json({
    status: 'success',
    message: 'Response added successfully',
    data: { review }
  });
});

// @desc    Mark review as helpful
// @route   POST /api/reviews/:id/helpful
// @access  Private
export const markAsHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({
      status: 'error',
      message: 'Review not found'
    });
  }

  // Check if already marked as helpful
  if (review.markedHelpfulBy.includes(req.user._id)) {
    return res.status(400).json({
      status: 'error',
      message: 'You have already marked this review as helpful'
    });
  }

  review.markedHelpfulBy.push(req.user._id);
  review.helpfulCount += 1;
  await review.save();

  res.status(200).json({
    status: 'success',
    message: 'Marked as helpful',
    data: { review }
  });
});

// ==================== ADMIN ENDPOINTS ====================

// @desc    Get flagged reviews for admin (suspicious patterns)
// @route   GET /api/admin/reviews/flagged
// @access  Private (Admin only)
export const getFlaggedReviews = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { page = 1, limit = 20 } = req.query;

  try {
    const result = await reviewService.getFlaggedReviews(parseInt(page), parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Flag a review manually (admin action)
// @route   POST /api/admin/reviews/:id/flag
// @access  Private (Admin only)
export const flagReview = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { reason, notes } = req.body;

  if (!reason) {
    return res.status(400).json({
      status: 'error',
      message: 'Reason is required'
    });
  }

  try {
    const review = await reviewService.flagReviewManually(req.params.id, req.user._id, reason, notes);

    res.status(200).json({
      status: 'success',
      message: 'Review flagged successfully',
      data: { review }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Unflag a review (admin action)
// @route   POST /api/admin/reviews/:id/unflag
// @access  Private (Admin only)
export const unflagReview = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { notes } = req.body;

  try {
    const review = await reviewService.unflagReview(req.params.id, req.user._id, notes);

    res.status(200).json({
      status: 'success',
      message: 'Review unflagged successfully',
      data: { review }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});