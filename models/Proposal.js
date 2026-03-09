import mongoose from 'mongoose';

const proposalSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coverLetter: {
    type: String,
    required: [true, 'Cover letter is required'],
    maxlength: 2000
  },
  proposedBudget: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    type: {
      type: String,
      enum: ['fixed', 'hourly'],
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  deliveryTime: {
    value: Number,
    unit: {
      type: String,
      enum: ['days', 'weeks', 'months']
    }
  },
  milestones: [{
    title: String,
    description: String,
    amount: Number,
    dueDate: Date
  }],
  attachments: [{
    name: String,
    url: String,
    size: Number,
    type: String
  }],
  answers: [{
    question: String,
    answer: String
  }],
  status: {
    type: String,
    enum: ['pending', 'shortlisted', 'accepted', 'rejected', 'declined', 'withdrawn'],
    default: 'pending'
  },
  creditCost: {
    type: Number,
    default: 0
  },
  creditsUsed: {
    type: Number,
    default: 0
  },
  // AI quality scoring
  qualityScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  rankingScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  spamScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  aiRecommendation: {
    score: Number,
    reasons: [String]
  },
  // Boost for beginners
  beginnerBoost: {
    isEligible: {
      type: Boolean,
      default: false
    },
    boostScore: Number
  },
  viewedByClient: {
    type: Boolean,
    default: false
  },
  viewedAt: Date,
  respondedAt: Date,
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

// Calculate AI quality score based on proposal content
proposalSchema.methods.calculateQualityScore = function() {
  let score = 50; // Base score

  // Cover letter length (well-written proposals are detailed)
  if (this.coverLetter.length > 500) score += 10;
  if (this.coverLetter.length > 1000) score += 5;

  // Has milestones
  if (this.milestones && this.milestones.length > 0) score += 15;

  // Has attachments (portfolio, samples)
  if (this.attachments && this.attachments.length > 0) score += 10;

  // Answered questions
  if (this.answers && this.answers.length > 0) score += 10;

  this.qualityScore = Math.min(score, 100);
  return this.qualityScore;
};

// Index for queries
proposalSchema.index({ job: 1, freelancer: 1, status: 1, createdAt: -1 });

const Proposal = mongoose.model('Proposal', proposalSchema);

export default Proposal;
