import Review from '../models/Review.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';

/**
 * Check if a user can review another user based on contract completion
 */
export const canLeaveReview = async (reviewerId, revieweeId, contractId) => {
  if (reviewerId.toString() === revieweeId.toString()) {
    throw new Error('Cannot review yourself');
  }

  const contract = await Contract.findById(contractId);
  if (!contract) {
    throw new Error('Contract not found');
  }

  // Only allow reviews after contract is completed
  if (contract.status !== 'completed') {
    throw new Error('Contract must be completed before leaving a review');
  }

  // Verify reviewer is either client or freelancer in the contract
  const isClient = contract.client.toString() === reviewerId.toString();
  const isFreelancer = contract.freelancer.toString() === reviewerId.toString();
  if (!isClient && !isFreelancer) {
    throw new Error('You are not part of this contract');
  }

  // Verify reviewee is the other party
  if (isClient && contract.freelancer.toString() !== revieweeId.toString()) {
    throw new Error('Invalid reviewee for this contract');
  }
  if (isFreelancer && contract.client.toString() !== revieweeId.toString()) {
    throw new Error('Invalid reviewee for this contract');
  }

  return true;
};

/**
 * Create or update a draft review (not yet submitted)
 */
export const createOrUpdateReview = async (reviewerId, contractId, reviewData) => {
  const { revieweeId, rating, comment, skillRatings, pros, cons } = reviewData;

  // Validate permissions
  await canLeaveReview(reviewerId, revieweeId, contractId);

  // Find existing review or create new
  let review = await Review.findOne({
    contract: contractId,
    reviewer: reviewerId,
    reviewee: revieweeId
  });

  if (!review) {
    review = new Review({
      contract: contractId,
      reviewer: reviewerId,
      reviewee: revieweeId,
      submitted: false
    });
  }

  // Update review data
  review.rating.overall = rating;
  if (skillRatings) {
    review.rating.communication = skillRatings.communication || review.rating.communication;
    review.rating.quality = skillRatings.quality || review.rating.quality;
    review.rating.professionalism = skillRatings.professionalism || review.rating.professionalism;
    review.rating.deadlines = skillRatings.deadlines || review.rating.deadlines;
    review.rating.value = skillRatings.value || review.rating.value;
  }
  review.comment = comment;
  if (pros) review.pros = pros;
  if (cons) review.cons = cons;

  await review.save();
  return review;
};

/**
 * Detect suspicious review patterns (basic rules)
 */
const detectSuspiciousPatterns = async (reviewerId, newReview) => {
  const flags = [];

  // Rule 1: Perfect rating (5/5 across all metrics)
  if (
    newReview.rating.overall === 5 &&
    newReview.rating.communication === 5 &&
    newReview.rating.quality === 5 &&
    newReview.rating.professionalism === 5 &&
    newReview.rating.deadlines === 5 &&
    newReview.rating.value === 5
  ) {
    flags.push('perfect-rating');
  }

  // Rule 2: Check if reviewer always gives 5-star reviews
  const reviewerReviews = await Review.find({ reviewer: reviewerId, submitted: true });
  if (reviewerReviews.length >= 3) {
    const allFiveStars = reviewerReviews.every(r => r.rating.overall === 5);
    if (allFiveStars) {
      flags.push('all-5-star-reviews');
    }
  }

  // Rule 3: Extreme variance in ratings (e.g., 5 stars but negative comments)
  const hasNegativeWords = /poor|bad|awful|terrible|hate|worst|useless|unprofessional|late|slow|incomplete|garbage|fail/i.test(
    newReview.comment
  );
  if ((newReview.rating.overall >= 4 && hasNegativeWords) || (newReview.rating.overall <= 2 && !hasNegativeWords)) {
    flags.push('extreme-variance');
  }

  // Rule 4: Inconsistent skill ratings
  const skillValues = [
    newReview.rating.communication,
    newReview.rating.quality,
    newReview.rating.professionalism,
    newReview.rating.deadlines,
    newReview.rating.value
  ].filter(v => v !== undefined);

  if (skillValues.length > 2) {
    const max = Math.max(...skillValues);
    const min = Math.min(...skillValues);
    if (max - min >= 4) { // E.g., 5 and 1
      flags.push('inconsistent-ratings');
    }
  }

  // Rule 5: Rapid submission within 1 hour of previous review
  const previousReview = await Review.findOne({
    reviewer: reviewerId,
    submitted: true,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  });
  if (previousReview) {
    flags.push('rapid-submission');
  }

  return flags;
};

/**
 * Submit a review (makes it ready for double-blind visibility check)
 */
export const submitReview = async (reviewerId, contractId, revieweeId) => {
  const review = await Review.findOne({
    contract: contractId,
    reviewer: reviewerId,
    reviewee: revieweeId
  });

  if (!review) {
    throw new Error('Review not found');
  }

  if (review.submitted) {
    throw new Error('Review already submitted');
  }

  // Detect suspicious patterns
  const suspiciousFlags = await detectSuspiciousPatterns(reviewerId, review);
  if (suspiciousFlags.length > 0) {
    review.flagged = true;
    review.flagReason = suspiciousFlags[0]; // Store first flag
    review.flaggedAt = new Date();
  }

  // Mark as submitted
  review.submitted = true;
  review.submittedAt = new Date();

  // Save review (post-hook will check if both are submitted)
  await review.save();

  return review;
};

/**
 * Get visible reviews for a user (only after both submit)
 */
export const getUserReviews = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const total = await Review.countDocuments({
    reviewee: userId,
    isVisible: true
  });

  const reviews = await Review.find({
    reviewee: userId,
    isVisible: true
  })
    .populate('reviewer', 'firstName lastName avatar')
    .populate('contract', '_id')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const pages = Math.ceil(total / limit);

  return {
    reviews,
    pagination: {
      total,
      page,
      limit,
      pages
    }
  };
};

/**
 * Get pending reviews for a reviewer (not yet submitted)
 */
export const getPendingReviews = async (reviewerId) => {
  const reviews = await Review.find({
    reviewer: reviewerId,
    submitted: false
  })
    .populate('contract', '_id job freelancer')
    .populate('reviewee', 'firstName lastName');

  return reviews;
};

/**
 * Get aggregated ratings for a user's profile
 */
export const getAggregatedRatings = async (userId) => {
  const reviews = await Review.find({
    reviewee: userId,
    isVisible: true,
    submitted: true
  });

  if (reviews.length === 0) {
    return {
      overallRating: 0,
      totalReviews: 0,
      skillBreakdown: {
        communication: 0,
        quality: 0,
        professionalism: 0,
        deadlines: 0,
        value: 0
      },
      ratingDistribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };
  }

  // Calculate overall rating
  const totalRating = reviews.reduce((sum, r) => sum + r.rating.overall, 0);
  const overallRating = (totalRating / reviews.length).toFixed(2);

  // Calculate skill breakdown
  const skillBreakdown = {
    communication: 0,
    quality: 0,
    professionalism: 0,
    deadlines: 0,
    value: 0
  };

  const skillCounts = {
    communication: 0,
    quality: 0,
    professionalism: 0,
    deadlines: 0,
    value: 0
  };

  reviews.forEach(r => {
    if (r.rating.communication) {
      skillBreakdown.communication += r.rating.communication;
      skillCounts.communication++;
    }
    if (r.rating.quality) {
      skillBreakdown.quality += r.rating.quality;
      skillCounts.quality++;
    }
    if (r.rating.professionalism) {
      skillBreakdown.professionalism += r.rating.professionalism;
      skillCounts.professionalism++;
    }
    if (r.rating.deadlines) {
      skillBreakdown.deadlines += r.rating.deadlines;
      skillCounts.deadlines++;
    }
    if (r.rating.value) {
      skillBreakdown.value += r.rating.value;
      skillCounts.value++;
    }
  });

  // Average out skills
  Object.keys(skillBreakdown).forEach(skill => {
    if (skillCounts[skill] > 0) {
      skillBreakdown[skill] = (skillBreakdown[skill] / skillCounts[skill]).toFixed(2);
    }
  });

  // Calculate rating distribution (1-5)
  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => {
    ratingDistribution[r.rating.overall]++;
  });

  return {
    overallRating: parseFloat(overallRating),
    totalReviews: reviews.length,
    skillBreakdown,
    ratingDistribution
  };
};

/**
 * Check if review is visible to a specific user
 */
export const isReviewVisibleToUser = async (reviewId, userId) => {
  const review = await Review.findById(reviewId);

  if (!review) {
    throw new Error('Review not found');
  }

  // Reviewer can always see their own review after submission
  if (review.reviewer.toString() === userId.toString() && review.submitted) {
    return true;
  }

  // Once both submit, it's publicly visible
  return review.isVisible;
};

/**
 * Get review for a specific contract (before visible to public)
 * Used internally to show reviewee their personal review during double-blind period
 */
export const getReviewForReviewee = async (contractId, revieweeId) => {
  const reviews = await Review.find({
    contract: contractId,
    reviewee: revieweeId
  });

  // Return reviews that are either visible OR submitted by each party
  return reviews.filter(r => r.isVisible || r.submitted);
};

/**
 * Flag a review manually (admin action)
 */
export const flagReviewManually = async (reviewId, adminId, reason, notes) => {
  const review = await Review.findById(reviewId);

  if (!review) {
    throw new Error('Review not found');
  }

  review.flagged = true;
  review.flagReason = reason;
  review.flaggedAt = new Date();
  review.reviewedByAdmin = true;
  review.adminNotes = notes;
  review.adminReviewedAt = new Date();
  review.adminReviewedBy = adminId;

  await review.save();
  return review;
};

/**
 * Unflag a review (admin action)
 */
export const unflagReview = async (reviewId, adminId, notes) => {
  const review = await Review.findById(reviewId);

  if (!review) {
    throw new Error('Review not found');
  }

  review.flagged = false;
  review.flagReason = null;
  review.flaggedAt = null;
  review.reviewedByAdmin = true;
  review.adminNotes = notes;
  review.adminReviewedAt = new Date();
  review.adminReviewedBy = adminId;

  await review.save();
  return review;
};

/**
 * Get flagged reviews for admin review
 */
export const getFlaggedReviews = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const total = await Review.countDocuments({
    flagged: true,
    reviewedByAdmin: false
  });

  const reviews = await Review.find({
    flagged: true,
    reviewedByAdmin: false
  })
    .populate('reviewer', 'firstName lastName')
    .populate('reviewee', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ flaggedAt: -1 })
    .skip(skip)
    .limit(limit);

  const pages = Math.ceil(total / limit);

  return {
    reviews,
    pagination: {
      total,
      page,
      limit,
      pages
    }
  };
};
