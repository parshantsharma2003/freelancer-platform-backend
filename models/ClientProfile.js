import mongoose from 'mongoose';

const clientProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  companyName: {
    type: String,
    trim: true
  },
  companyInfo: {
    legalName: String,
    registrationNumber: String,
    taxId: String
  },
  companySize: {
    type: String,
    enum: ['solo', '2-10', '11-50', '51-200', '201-500', '500+']
  },
  industry: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    maxlength: 1000
  },
  website: {
    type: String,
    trim: true
  },
  location: {
    country: String,
    city: String,
    timezone: String
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  hiringHistory: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job'
    },
    hiredAt: Date,
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    }
  }],
  activeJobs: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewsCount: {
    type: Number,
    default: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationBadge: {
    type: Boolean,
    default: false
  },
  paymentStatus: {
    type: String,
    enum: ['good', 'past_due', 'paused', 'delinquent'],
    default: 'good'
  },
  paymentMethod: {
    isVerified: {
      type: Boolean,
      default: false
    },
    stripeCustomerId: String
  },
  preferences: {
    autoAcceptProposals: {
      type: Boolean,
      default: false
    },
    notifyNewProposals: {
      type: Boolean,
      default: true
    }
  },
  profileCompleteness: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

clientProfileSchema.methods.calculateCompleteness = function(options = {}) {
  const { hasAvatar = false } = options;

  let score = 0;
  const fields = {
    avatar: 10,
    companyName: 20,
    companySize: 15,
    industry: 15,
    description: 20,
    hiringPreferences: 20
  };

  if (hasAvatar) score += fields.avatar;
  if (this.companyName) score += fields.companyName;
  if (this.companySize) score += fields.companySize;
  if (this.industry) score += fields.industry;
  if (this.description && this.description.length >= 40) score += fields.description;

  if (
    this.preferences &&
    typeof this.preferences.autoAcceptProposals === 'boolean' &&
    typeof this.preferences.notifyNewProposals === 'boolean'
  ) {
    score += fields.hiringPreferences;
  }

  this.profileCompleteness = Math.min(score, 100);
  return this.profileCompleteness;
};

clientProfileSchema.virtual('completeness').get(function() {
  return this.profileCompleteness;
}).set(function(value) {
  this.profileCompleteness = value;
});

const ClientProfile = mongoose.model('ClientProfile', clientProfileSchema);

export default ClientProfile;
