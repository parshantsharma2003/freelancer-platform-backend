import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewerRole: {
    type: String,
    enum: ['client', 'freelancer'],
    required: true
  },
  rating: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    // Detailed ratings
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    },
    deadlines: {
      type: Number,
      min: 1,
      max: 5
    },
    value: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  skillRatings: [{
    skill: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    }
  }],
  comment: {
    type: String,
    required: true,
    maxlength: 2000
  },
  pros: [String],
  cons: [String],
  
  // Double-blind submission tracking
  submitted: {
    type: Boolean,
    default: false,
    index: true
  },
  submittedAt: Date,

  // Visibility flag - true when BOTH parties submit
  isVisible: {
    type: Boolean,
    default: false,
    index: true
  },
  visibleAt: Date,

  // Privacy
  isPublic: {
    type: Boolean,
    default: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  
  // Suspicious pattern detection
  flagged: {
    type: Boolean,
    default: false,
    index: true
  },
  flagReason: {
    type: String,
    enum: [
      'perfect-rating',
      'extreme-variance',
      'rapid-submission',
      'all-5-star-reviews',
      'inconsistent-ratings',
      'similar-comments',
      null
    ],
    default: null
  },
  flaggedAt: Date,

  // Admin review indicators
  reviewedByAdmin: {
    type: Boolean,
    default: false
  },
  adminNotes: String,
  adminReviewedAt: Date,
  adminReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Response from reviewee
  response: {
    content: String,
    respondedAt: Date
  },
  // Moderation
  isFlagged: {
    type: Boolean,
    default: false
  },
  flagReason: String,
  isVerified: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  markedHelpfulBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Calculate average rating
reviewSchema.methods.calculateAverageRating = function() {
  const ratings = [
    this.rating.communication,
    this.rating.quality,
    this.rating.professionalism,
    this.rating.deadlines,
    this.rating.value
  ].filter(r => r !== undefined);

  if (ratings.length > 0) {
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }
  return this.rating.overall;
};

// Static method: Check if both reviews for a contract are submitted
reviewSchema.statics.areAllReviewsSubmitted = async function(contractId) {
  const reviews = await this.find({
    contract: contractId,
    submitted: true
  });
  return reviews.length === 2;
};

// Static method: Get all visible reviews for a user
reviewSchema.statics.getVisibleReviews = async function(userId) {
  return await this.find({
    reviewee: userId,
    isVisible: true
  })
    .populate('reviewer', 'firstName lastName avatar')
    .populate('contract', '_id')
    .sort({ createdAt: -1 });
};

// Static method: Get pending reviews (not yet submitted)
reviewSchema.statics.getPendingReviews = async function(userId) {
  return await this.find({
    reviewer: userId,
    submitted: false
  })
    .populate('contract', '_id')
    .populate('reviewee', 'firstName lastName');
};

// Post-save hook: Check if both reviews are submitted and update visibility
reviewSchema.post('save', async function(doc) {
  try {
    const Review = mongoose.model('Review');
    const allSubmitted = await Review.areAllReviewsSubmitted(doc.contract);

    if (allSubmitted) {
      // Update both reviews to be visible
      await Review.updateMany(
        { contract: doc.contract },
        {
          isVisible: true,
          visibleAt: new Date()
        }
      );
    }
  } catch (error) {
    console.error('[Review] Error updating visibility:', error.message);
  }
});

// Ensure one review per person per contract
reviewSchema.index({ contract: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1, createdAt: -1 });

// Additional indexes for double-blind system
reviewSchema.index({ contract: 1, submitted: 1 });
reviewSchema.index({ reviewee: 1, isVisible: 1, createdAt: -1 });
reviewSchema.index({ flagged: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
