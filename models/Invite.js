import mongoose from 'mongoose';

const inviteSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['sent', 'accepted', 'declined', 'expired'],
    default: 'sent'
  },
  message: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  respondedAt: Date,
  declineReason: String,
  // Track if freelancer has applied after accepting
  appliedProposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
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

// Indexes for efficient queries
inviteSchema.index({ job: 1, freelancer: 1 }, { unique: true });
inviteSchema.index({ freelancer: 1, status: 1 });
inviteSchema.index({ client: 1, status: 1 });
inviteSchema.index({ expiresAt: 1 });
inviteSchema.index({ status: 1, expiresAt: 1 });

// Auto-expire invites
inviteSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() && this.status === 'sent';
};

// Mark as expired in database
inviteSchema.methods.markAsExpired = async function() {
  if (this.isExpired()) {
    this.status = 'expired';
    return this.save();
  }
  return this;
};

const Invite = mongoose.model('Invite', inviteSchema);

export default Invite;
