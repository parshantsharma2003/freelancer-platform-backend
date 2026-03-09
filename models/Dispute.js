import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
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
  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['open', 'resolved', 'rejected'],
    default: 'open',
    index: true
  },

  // Evidence tracking
  evidence: [{
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    title: String,
    description: String,
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Escrow freezing
  escrowFrozen: {
    type: Boolean,
    default: false
  },
  frozenAt: Date,
  unfrozenAt: Date,

  // Resolution details
  resolutionNotes: {
    type: String,
    trim: true,
    maxlength: 3000
  },
  resolvingReason: {
    type: String,
    enum: ['refund-client', 'approve-freelancer', 'split-payment', 'custom', null],
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date,
    index: true
  },
  stripeDisputeId: String,
  stripeStatus: String,
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
disputeSchema.index({ contract: 1, status: 1 });
disputeSchema.index({ contract: 1, raisedBy: 1 });
disputeSchema.index({ raisedBy: 1, createdAt: -1 });
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ escrowFrozen: 1 });
disputeSchema.index({ resolvedAt: -1 });

// Static method: Get disputes for a user (as either client or freelancer)
disputeSchema.statics.getDisputesForUser = async function(userId) {
  return await this.find({
    $or: [
      { client: userId },
      { freelancer: userId }
    ]
  })
    .populate('raisedBy', 'firstName lastName')
    .populate('client', 'firstName lastName')
    .populate('freelancer', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ createdAt: -1 });
};

// Static method: Get open disputes requiring resolution
disputeSchema.statics.getOpenDisputes = async function() {
  return await this.find({ status: 'open' })
    .populate('raisedBy', 'firstName lastName')
    .populate('client', 'firstName lastName')
    .populate('freelancer', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ createdAt: -1 });
};

// Static method: Get frozen escrows
disputeSchema.statics.getFrozenEscrows = async function() {
  return await this.find({ escrowFrozen: true })
    .populate('contract', '_id')
    .sort({ frozenAt: -1 });
};

// Method: Check if user is involved in dispute
disputeSchema.methods.isUserInvolved = function(userId) {
  return (
    this.client.toString() === userId.toString() ||
    this.freelancer.toString() === userId.toString()
  );
};

// Method: Can user add evidence
disputeSchema.methods.canUserAddEvidence = function(userId) {
  // Only involved parties can add evidence, and only if dispute is open
  return this.status === 'open' && this.isUserInvolved(userId);
};

// Method: Can admin resolve
disputeSchema.methods.canBeResolved = function() {
  return this.status === 'open';
};

// Pre-delete hook: Unfreeze escrow if dispute is deleted
disputeSchema.pre('findOneAndDelete', async function(next) {
  const dispute = await this.model.findOne(this.getFilter());
  if (dispute && dispute.escrowFrozen) {
    // In production, would notify payment system to unfreeze
    console.log(`[Dispute] Escrow unfrozen for contract ${dispute.contract}`);
  }
  next();
});

const Dispute = mongoose.model('Dispute', disputeSchema);

export default Dispute;
