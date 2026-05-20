import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'image', 'voice', 'offer', 'system'],
    default: 'text'
  },
  senderRole: {
    type: String,
    enum: ['client', 'freelancer', 'admin', 'super_admin'],
    default: 'client'
  },
  attachments: [{
    name: String,
    url: String,
    size: Number,
    type: String,
    uploadedAt: Date
  }],
  // Contract-based messaging
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  // For contract offers sent via message
  offer: {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job'
    },
    amount: Number,
    description: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected']
    }
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  isDeleted: {
    sender: {
      type: Boolean,
      default: false
    },
    receiver: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ contract: 1, createdAt: -1 });
messageSchema.index({ proposal: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, receiver: 1 });

const Message = mongoose.model('Message', messageSchema);

// Conversation model for grouping messages
const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: Date,
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  isArchived: {
    type: Map,
    of: Boolean,
    default: {}
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

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ contract: 1 });
conversationSchema.index({ proposal: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export { Message, Conversation };
