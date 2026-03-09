import mongoose from 'mongoose';

const savedSearchSchema = new mongoose.Schema({
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Search name is required'],
    trim: true,
    maxlength: 100
  },
  // Filter criteria
  filters: {
    // Skills to match (any of these)
    skills: [{
      type: String,
      trim: true
    }],
    // Category
    category: {
      type: String,
      trim: true
    },
    // Budget filters
    budget: {
      minAmount: {
        type: Number,
        min: 0
      },
      maxAmount: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        default: 'USD'
      }
    },
    // Duration filter
    duration: {
      type: [String],
      enum: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', '3-6-months', '6+ months']
    },
    // Experience level
    experienceLevel: {
      type: [String],
      enum: ['entry', 'intermediate', 'expert']
    },
    // Location
    location: {
      type: String,
      enum: ['worldwide', 'local', 'region-specific']
    },
    preferredLocation: {
      country: String,
      city: String
    }
  },
  // Notification preferences
  notificationSettings: {
    emailNotification: {
      type: Boolean,
      default: true
    },
    // Only notify if number of matching jobs meets this threshold
    notifyWhenJobsCount: {
      type: Number,
      default: 1,
      min: 1
    },
    // Max notifications per day
    maxNotificationsPerDay: {
      type: Number,
      default: 3,
      min: 1
    },
    // Quiet hours (don't send notifications during these times)
    quietHoursStart: String,    // HH:MM format
    quietHoursEnd: String       // HH:MM format
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Tracking
  matchedJobsCount: {
    type: Number,
    default: 0
  },
  lastNotificationAt: Date,
  notificationsThisDay: {
    type: Number,
    default: 0
  },
  notificationDateTracker: {
    type: Date  // To reset notificationsThisDay counter at midnight
  },
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

// Indexes for efficient querying
// Find active saved searches for a freelancer
savedSearchSchema.index({ freelancer: 1, isActive: 1 });

// Find all active saved searches (for matching when job is posted)
savedSearchSchema.index({ isActive: 1, createdAt: -1 });

// Find saved searches by category (for matching)
savedSearchSchema.index({ 'filters.category': 1, isActive: 1 });

// Text search on search names
savedSearchSchema.index({ name: 'text' });

// ========================================
// INSTANCE METHODS
// ========================================

/**
 * Check if a job matches this saved search
 * @param {Object} job - Job document
 * @returns {Boolean}
 */
savedSearchSchema.methods.matchesJob = function(job) {
  const filters = this.filters;

  // Check skills match (if filter exists, job must have at least one skill)
  if (filters.skills && filters.skills.length > 0) {
    const hasMatchingSkill = filters.skills.some(skill =>
      job.skills && job.skills.some(jobSkill =>
        jobSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(jobSkill.toLowerCase())
      )
    );
    if (!hasMatchingSkill) return false;
  }

  // Check category match
  if (filters.category && filters.category.trim()) {
    if (!job.category || job.category.toLowerCase() !== filters.category.toLowerCase()) {
      return false;
    }
  }

  // Check budget match
  if (filters.budget) {
    const jobAmount = job.budget.amount || job.budget.minAmount || 0;
    if (filters.budget.minAmount && jobAmount < filters.budget.minAmount) {
      return false;
    }
    if (filters.budget.maxAmount && jobAmount > filters.budget.maxAmount) {
      return false;
    }
  }

  // Check duration match
  if (filters.duration && filters.duration.length > 0) {
    if (!filters.duration.includes(job.duration)) {
      return false;
    }
  }

  // Check experience level match
  if (filters.experienceLevel && filters.experienceLevel.length > 0) {
    if (!filters.experienceLevel.includes(job.experienceLevel)) {
      return false;
    }
  }

  // Check location match
  if (filters.location && filters.location.trim()) {
    if (!job.location || job.location !== filters.location) {
      return false;
    }
  }

  return true;
};

/**
 * Check if freelancer should be notified (respecting quiet hours and daily limits)
 * @returns {Boolean}
 */
savedSearchSchema.methods.canNotifyFreelancer = function() {
  const settings = this.notificationSettings;

  // Check if email notifications are enabled
  if (!settings.emailNotification) {
    return false;
  }

  // Reset notification counter if it's a new day
  const now = new Date();
  if (this.notificationDateTracker) {
    const lastNotificationDate = new Date(this.notificationDateTracker);
    if (now.getDate() !== lastNotificationDate.getDate()) {
      this.notificationsThisDay = 0;
      this.notificationDateTracker = now;
    }
  } else {
    this.notificationDateTracker = now;
  }

  // Check daily limit
  if (this.notificationsThisDay >= settings.maxNotificationsPerDay) {
    return false;
  }

  // Check quiet hours
  if (settings.quietHoursStart && settings.quietHoursEnd) {
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' +
                       now.getMinutes().toString().padStart(2, '0');
    
    if (settings.quietHoursStart <= currentTime && currentTime <= settings.quietHoursEnd) {
      return false;
    }
  }

  return true;
};

/**
 * Increment notification counter
 */
savedSearchSchema.methods.incrementNotificationCount = function() {
  this.notificationsThisDay = (this.notificationsThisDay || 0) + 1;
  this.lastNotificationAt = new Date();
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Find all active saved searches
 * @returns {Query}
 */
savedSearchSchema.statics.getActiveSavedSearches = function() {
  return this.find({ isActive: true }).populate('freelancer', 'email name');
};

/**
 * Find saved searches by category
 * @param {String} category
 * @returns {Query}
 */
savedSearchSchema.statics.searchesByCategory = function(category) {
  return this.find({
    isActive: true,
    'filters.category': category
  }).populate('freelancer', 'email name');
};

export default mongoose.model('SavedSearch', savedSearchSchema);
