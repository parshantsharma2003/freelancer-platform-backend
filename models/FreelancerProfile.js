import mongoose from 'mongoose';

const freelancerProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: [true, 'Professional title is required'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: 2000
  },
  hourlyRate: {
    type: Number,
    required: [true, 'Hourly rate is required'],
    min: 0
  },
  skills: [{
    type: String,
    trim: true
  }],
  categories: [{
    type: String,
    trim: true
  }],
  languages: [{
    language: String,
    proficiency: {
      type: String,
      enum: ['basic', 'conversational', 'fluent', 'native']
    }
  }],
  experience: [{
    title: String,
    company: String,
    description: String,
    startDate: Date,
    endDate: Date,
    current: Boolean
  }],
  education: [{
    degree: String,
    institution: String,
    fieldOfStudy: String,
    startDate: Date,
    endDate: Date
  }],
  certifications: [{
    name: String,
    issuingOrganization: String,
    issueDate: Date,
    expiryDate: Date,
    credentialId: String
  }],
  portfolio: [{
    title: String,
    description: String,
    imageUrl: String,
    projectUrl: String,
    tags: [String]
  }],
  availability: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'not-available'],
    default: 'full-time'
  },
  experienceLevel: {
    type: String,
    enum: ['entry', 'intermediate', 'expert'],
    default: 'intermediate'
  },
  visibility: {
    type: String,
    enum: ['public', 'invite-only', 'private'],
    default: 'public'
  },
  location: {
    country: String,
    city: String,
    timezone: String
  },
  profileCompleteness: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  successRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  responseTime: {
    type: Number, // in hours
    default: 24
  },
  responseRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isTopRated: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  aiMatchScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  analytics: {
    profileViews: {
      type: Number,
      default: 0
    },
    inviteCount: {
      type: Number,
      default: 0
    },
    savedCount: {
      type: Number,
      default: 0
    }
  },
  lastActiveAt: Date,
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

// Calculate profile completeness
freelancerProfileSchema.methods.calculateCompleteness = function(options = {}) {
  const { hasAvatar = false } = options;
  let score = 0;
  const fields = {
    avatar: 10,
    title: 5,
    description: 20,
    hourlyRate: 5,
    education: 10,
    skills: 20,
    portfolio: 20,
    portfolioBonus: 10
  };

  if (hasAvatar) score += fields.avatar;
  if (this.title) score += fields.title;
  if (this.description && this.description.length >= 50) score += fields.description;
  if (this.hourlyRate > 0) score += fields.hourlyRate;
  if (this.skills && this.skills.length > 0) score += fields.skills;
  if (this.education && this.education.length > 0) score += fields.education;
  if (this.portfolio && this.portfolio.length > 0) {
    score += fields.portfolio;
    score += fields.portfolioBonus;
  }

  this.profileCompleteness = Math.min(score, 100);
  return this.profileCompleteness;
};

freelancerProfileSchema.virtual('bio').get(function() {
  return this.description;
}).set(function(value) {
  this.description = value;
});

freelancerProfileSchema.virtual('completeness').get(function() {
  return this.profileCompleteness;
}).set(function(value) {
  this.profileCompleteness = value;
});

// Index for search - separate indexes for array fields (MongoDB doesn't support compound indexes with multiple arrays)
freelancerProfileSchema.index({ skills: 1 });
freelancerProfileSchema.index({ categories: 1 });
freelancerProfileSchema.index({ hourlyRate: 1 });
freelancerProfileSchema.index({ rating: -1 });

const FreelancerProfile = mongoose.model('FreelancerProfile', freelancerProfileSchema);

export default FreelancerProfile;
