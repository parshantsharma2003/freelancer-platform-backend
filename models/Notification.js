import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: [
        "job_posted",
        "proposal_received",
        "proposal_accepted",
        "proposal_rejected",
        "contract_created",
        "contract_completed",
        "milestone_submitted",
        "milestone_approved",
        "milestone_paid",
        "milestone_rejected",
        "payment_received",
        "payment_sent",
        "payment_refunded",
        "message_received",
        "review_received",
        "job_invitation",
        "system_announcement",
        "account_verified",
        "dispute_opened",
        "dispute_resolved"
      ],
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    message: {
      type: String,
      required: true,
      trim: true
    },

    // Broadcast support
    isBroadcast: {
      type: Boolean,
      default: false
    },

    // Related entities
    relatedJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job"
    },

    relatedProposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proposal"
    },

    relatedContract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract"
    },

    relatedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    relatedMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    },

    // Frontend routing
    actionUrl: {
      type: String
    },

    // Read status
    isRead: {
      type: Boolean,
      default: false
    },

    readAt: {
      type: Date
    },

    // Priority level
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },

    // Email notifications
    emailSent: {
      type: Boolean,
      default: false
    },

    emailSentAt: Date,

    // Push notifications
    pushSent: {
      type: Boolean,
      default: false
    },

    pushSentAt: Date
  },
  {
    timestamps: true
  }
);

/* -------------------------------------------------------------------------- */
/*                                   INDEXES                                  */
/* -------------------------------------------------------------------------- */

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
