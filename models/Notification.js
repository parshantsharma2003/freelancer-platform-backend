import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'job_posted',
      'proposal_received',
      'proposal_accepted',
      'proposal_rejected',
      'contract_created',
      'contract_completed',
      'milestone_submitted',
      'milestone_approved',
      'payment_received',
      'payment_sent',
      'message_received',
      'review_received',
      'job_invitation',
      'system_announcement',
      'account_verified',
      'dispute_opened',
      'dispute_resolved'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // Related entities
  relatedJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  relatedProposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  relatedContract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  relatedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Action URL for frontend routing
  actionUrl: String,
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Email notification
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  // Push notification
  pushSent: {
    type: Boolean,
    default: false
  },
  pushSentAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
