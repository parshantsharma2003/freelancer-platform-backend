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
  timestamps: true
});

// Calculate profile completeness
freelancerProfileSchema.methods.calculateCompleteness = function() {
  let score = 0;
  const fields = {
    title: 10,
    description: 15,
    hourlyRate: 10,
    skills: 15,
    portfolio: 20,
    experience: 15,
    education: 10,
    languages: 5
  };

  if (this.title) score += fields.title;
  if (this.description && this.description.length > 100) score += fields.description;
  if (this.hourlyRate > 0) score += fields.hourlyRate;
  if (this.skills && this.skills.length >= 3) score += fields.skills;
  if (this.portfolio && this.portfolio.length > 0) score += fields.portfolio;
  if (this.experience && this.experience.length > 0) score += fields.experience;
  if (this.education && this.education.length > 0) score += fields.education;
  if (this.languages && this.languages.length > 0) score += fields.languages;

  this.profileCompleteness = score;
  return score;
};

// Index for search - separate indexes for array fields (MongoDB doesn't support compound indexes with multiple arrays)
freelancerProfileSchema.index({ skills: 1 });
freelancerProfileSchema.index({ categories: 1 });
freelancerProfileSchema.index({ hourlyRate: 1 });
freelancerProfileSchema.index({ rating: -1 });

const FreelancerProfile = mongoose.model('FreelancerProfile', freelancerProfileSchema);

export default FreelancerProfile;
