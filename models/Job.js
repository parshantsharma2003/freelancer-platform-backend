import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  subCategory: {
    type: String,
    trim: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  budget: {
    type: {
      type: String,
      enum: ['fixed', 'hourly'],
      required: true
    },
    amount: {
      type: Number,
      min: 0
    },
    minAmount: Number,
    maxAmount: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  duration: {
    type: String,
    enum: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', '3-6-months', '6+ months'],
    required: true
  },
  experienceLevel: {
    type: String,
    enum: ['entry', 'intermediate', 'expert'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'open', 'in-progress', 'completed', 'cancelled', 'closed'],
    default: 'open'
  },
  proposalLimit: {
    type: Number,
    default: 0
  },
  visibility: {
    type: String,
    enum: ['public', 'invite-only', 'private'],
    default: 'public'
  },
  attachments: [{
    name: String,
    url: String,
    size: Number,
    type: String
  }],
  proposalsCount: {
    type: Number,
    default: 0
  },
  invitedFreelancers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  hiredFreelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  location: {
    type: String,
    enum: ['worldwide', 'local', 'region-specific']
  },
  preferredLocation: {
    country: String,
    city: String
  },
  questions: [{
    question: String,
    required: Boolean
  }],
  // AI and boost features
  aiMatchingEnabled: {
    type: Boolean,
    default: true
  },
  isBoosted: {
    type: Boolean,
    default: false
  },
  boostedAt: Date,
  boostExpiry: Date,
  // Compliance
  isPublished: {
    type: Boolean,
    default: true
  },
  flagged: {
    isFlagged: {
      type: Boolean,
      default: false
    },
    reason: String,
    flaggedAt: Date
  },
  expiresAt: {
    type: Date
  },
  publishedAt: Date,
  expiredAt: Date,
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

// Text index for search
jobSchema.index({ 
  title: 'text', 
  description: 'text',
  category: 'text'
});

// Regular indexes for filtering
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ client: 1, status: 1 });

const Job = mongoose.model('Job', jobSchema);

export default Job;
