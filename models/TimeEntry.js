import mongoose from 'mongoose';

const timeEntrySchema = new mongoose.Schema({
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Time tracking
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    // Duration in minutes
    type: Number,
    default: 0
  },
  // Work description
  description: {
    type: String,
    default: ''
  },
  // Approval workflow
  approved: {
    type: Boolean,
    default: false
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Billing
  hourlyRate: {
    type: Number,
    required: true
  },
  billableAmount: {
    // Calculated: (duration in hours) * hourlyRate
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'stopped', 'submitted', 'approved', 'rejected'],
    default: 'stopped'
  },
  // Pause tracking (for pause/resume functionality)
  pauses: [{
    pausedAt: Date,
    resumedAt: Date,
    durationPaused: Number // in minutes
  }],
  // Weekly assignment
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date
  },
  // Invoice reference
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  // Platform fee & net amount
  platformFeePercent: {
    type: Number,
    default: 10
  },
  platformFee: {
    type: Number,
    default: 0
  },
  netAmount: {
    // Amount after platform fee: billableAmount - platformFee
    type: Number,
    default: 0
  },
  // Audit trail
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
timeEntrySchema.index({ contract: 1, freelancer: 1 });
timeEntrySchema.index({ contract: 1, weekStartDate: 1 });
timeEntrySchema.index({ freelancer: 1, approved: 1 });
timeEntrySchema.index({ client: 1, approved: 1 });
timeEntrySchema.index({ status: 1, approved: 1 });

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);

export default TimeEntry;
