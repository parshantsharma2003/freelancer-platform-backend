import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  freelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  budget: {
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['fixed', 'hourly'],
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    },
    hourlyRate: {
      // For hourly contracts: rate per hour
      type: Number,
      default: null
    },
    weeklyHourLimit: {
      // Maximum hours allowed per week for hourly contracts
      type: Number,
      default: 40
    }
  },
  milestones: [{
    title: String,
    description: String,
    amount: Number,
    dueDate: Date,
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'submitted', 'approved', 'rejected', 'paid'],
      default: 'pending'
    },
    submittedAt: Date,
    approvedAt: Date,
    paidAt: Date
  }],
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'cancelled', 'disputed'],
    default: 'active'
  },
  statusHistory: [{
    status: String,
    changedAt: Date,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  scopeLock: {
    isLocked: {
      type: Boolean,
      default: false
    },
    lockedAt: Date,
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    version: {
      type: Number,
      default: 1
    }
  },
  workSubmissions: [{
    title: String,
    description: String,
    attachments: [{
      name: String,
      url: String
    }],
    submittedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revision-requested']
    },
    feedback: String
  }],
  totalPaid: {
    type: Number,
    default: 0
  },
  hoursWorked: {
    type: Number,
    default: 0
  },
  // Time tracking summary (for hourly contracts)
  timeTracking: {
    totalHours: {
      type: Number,
      default: 0
    },
    totalEarnings: {
      type: Number,
      default: 0
    },
    approvedHours: {
      type: Number,
      default: 0
    },
    pendingHours: {
      type: Number,
      default: 0
    },
    currentWeekHours: {
      type: Number,
      default: 0
    },
    lastWeekUpdated: {
      type: Date
    }
  },
  terms: {
    type: String,
    maxlength: 2000
  },
  // Dispute handling
  dispute: {
    isDisputed: {
      type: Boolean,
      default: false
    },
    reason: String,
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['open', 'in-review', 'resolved', 'closed']
    },
    resolution: String,
    resolvedAt: Date
  },
  // Compliance
  agreementSigned: {
    client: {
      signed: Boolean,
      signedAt: Date,
      ipAddress: String
    },
    freelancer: {
      signed: Boolean,
      signedAt: Date,
      ipAddress: String
    }
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

// Calculate total contract value
contractSchema.virtual('totalValue').get(function() {
  if (this.milestones && this.milestones.length > 0) {
    return this.milestones.reduce((total, milestone) => total + milestone.amount, 0);
  }
  return this.budget.amount;
});

contractSchema.index({ client: 1, freelancer: 1, status: 1 });

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
