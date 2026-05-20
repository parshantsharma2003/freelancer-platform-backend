import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  orderIndex: {
    type: Number,
    default: 0,
    min: 0,
    index: true
  },
  // 📊 Status lifecycle
  status: {
    type: String,
    enum: [
      'pending',
      'funded',
      'in_progress',
      'submitted',
      'approved',
      'changes_requested',
      'paid',
      'refunded',
      'disputed',
      'rejected'
    ],
    default: 'pending',
    index: true
  },
  // 💰 Escrow management
  escrow: {
    isHeld: {
      type: Boolean,
      default: false
    },
    heldAmount: {
      type: Number,
      default: 0
    },
    heldAt: Date,
    releasedAt: Date,
    refundedAt: Date,
    releaseReason: String,
    stripePaymentIntentId: String,
    paymentReleased: {
      type: Boolean,
      default: false
    },
    releaseTransactionId: String
  },
  // 📝 Work submission
  submission: {
    submittedAt: Date,
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    description: String,
    attachments: [{
      name: String,
      url: String,
      uploadedAt: Date
    }],
    submissionNotes: String
  },
  // 📎 Planning attachments
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // 💬 Milestone comments
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // ✅ Approval
  approval: {
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    feedback: String,
    revisionRequested: Boolean,
    revisionNotes: String
  },
  // 💳 Payment
  payment: {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    stripeTransferId: String,
    paidAt: Date,
    paidAmount: Number,
    platformFee: {
      amount: Number,
      percentage: Number
    },
    netAmount: Number,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    }
  },
  // 🔄 Status history
  statusHistory: [{
    status: String,
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }],
  // 📅 Dates
  dueDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
milestoneSchema.index({ contract: 1, status: 1 });
milestoneSchema.index({ 'escrow.paymentReleased': 1 });
milestoneSchema.index({ contract: 1, orderIndex: 1, createdAt: 1 });

// Virtual for order in contract milestones
milestoneSchema.virtual('order').get(function() {
  return this.createdAt ? this.createdAt.getTime() : 0;
});

const Milestone = mongoose.model('Milestone', milestoneSchema);

export default Milestone;
