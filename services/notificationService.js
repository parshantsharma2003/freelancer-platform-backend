import Notification from '../models/Notification.js';
import User from '../models/User.js';

// ========================================
// NOTIFICATION CREATION
// ========================================

/**
 * Create a notification and optionally send via socket
 * @param {Object} notificationData - Notification data
 * @param {String} notificationData.recipient - User ID (recipient)
 * @param {String} notificationData.type - Notification type (job_posted, proposal_received, etc.)
 * @param {String} notificationData.title - Notification title
 * @param {String} notificationData.message - Notification message
 * @param {String} notificationData.priority - Priority level (low, medium, high, urgent)
 * @param {Object} notificationData.relatedJob - Related job ID (optional)
 * @param {Object} notificationData.relatedProposal - Related proposal ID (optional)
 * @param {Object} notificationData.relatedContract - Related contract ID (optional)
 * @param {Object} notificationData.relatedUser - Related user ID (optional)
 * @param {String} notificationData.actionUrl - URL for frontend action (optional)
 * @param {Boolean} notificationData.emailNotification - Send email (default: true)
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const createNotification = async (notificationData, socketBroadcast = null) => {
  const {
    recipient,
    type,
    title,
    message,
    priority = 'medium',
    relatedJob,
    relatedProposal,
    relatedContract,
    relatedUser,
    actionUrl,
    emailNotification = true
  } = notificationData;

  // Validate required fields
  if (!recipient || !type || !title || !message) {
    throw new Error('Missing required notification fields: recipient, type, title, message');
  }

  // Validate recipient exists
  const user = await User.findById(recipient);
  if (!user) {
    throw new Error(`Recipient user ${recipient} not found`);
  }

  // Create notification in database
  const notification = new Notification({
    recipient,
    type,
    title,
    message,
    priority,
    relatedJob: relatedJob || undefined,
    relatedProposal: relatedProposal || undefined,
    relatedContract: relatedContract || undefined,
    relatedUser: relatedUser || undefined,
    actionUrl: actionUrl || undefined,
    emailSent: false,
    pushSent: false
  });

  await notification.save();

  // Populate related fields for response
  const populatedNotification = await Notification.findById(notification._id)
    .populate('relatedUser', 'firstName lastName avatar email')
    .populate('relatedJob', 'title category')
    .populate('relatedProposal', 'title bidAmount')
    .populate('relatedContract', 'title status');

  // Send real-time notification via socket if user is online
  if (socketBroadcast) {
    try {
      socketBroadcast.notifyUser(recipient, {
        type: type,
        title: title,
        message: message,
        priority: priority,
        actionUrl: actionUrl,
        notificationId: notification._id,
        createdAt: new Date()
      });
    } catch (err) {
      console.error(`[Notification] Socket broadcast failed for user ${recipient}:`, err.message);
    }
  }

  // Queue email notification if enabled
  if (emailNotification) {
    try {
      // TODO: Queue email to background job (Bull, Agenda, etc.)
      console.log(`[Notification] Email queued for user ${user.email}: ${type}`);
    } catch (err) {
      console.error(`[Notification] Failed to queue email for user ${recipient}:`, err.message);
    }
  }

  return populatedNotification;
};

/**
 * Create multiple notifications for different recipients
 * @param {Array} recipientIds - Array of user IDs
 * @param {Object} notificationData - Notification data (without recipient field)
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Array>} - Created notifications
 */
const createBulkNotifications = async (recipientIds, notificationData, socketBroadcast = null) => {
  const notifications = [];

  for (const recipientId of recipientIds) {
    try {
      const notification = await createNotification(
        { ...notificationData, recipient: recipientId },
        socketBroadcast
      );
      notifications.push(notification);
    } catch (err) {
      console.error(`[Notification] Failed to create notification for user ${recipientId}:`, err.message);
    }
  }

  return notifications;
};

// ========================================
// NOTIFICATION RETRIEVAL
// ========================================

/**
 * Get all notifications for a user
 * @param {String} userId - User ID
 * @param {Number} page - Page number (default: 1)
 * @param {Number} limit - Results per page (default: 20)
 * @param {Object} filters - Additional filters (optional)
 * @returns {Promise<Object>} - Paginated notifications
 */
const getNotificationsForUser = async (userId, page = 1, limit = 20, filters = {}) => {
  const skip = (page - 1) * limit;
  const query = { recipient: userId, ...filters };

  const notifications = await Notification.find(query)
    .populate('relatedUser', 'firstName lastName avatar')
    .populate('relatedJob', 'title category')
    .populate('relatedProposal', 'title')
    .populate('relatedContract', 'title')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false
  });

  return {
    data: notifications,
    unreadCount,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get unread notification count for user
 * @param {String} userId - User ID
 * @returns {Promise<Number>} - Unread count
 */
const getUnreadCount = async (userId) => {
  return await Notification.countDocuments({
    recipient: userId,
    isRead: false
  });
};

/**
 * Get a specific notification
 * @param {String} notificationId - Notification ID
 * @param {String} userId - User ID (for authorization)
 * @returns {Promise<Object>} - Notification
 */
const getNotification = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId)
    .populate('relatedUser', 'firstName lastName avatar')
    .populate('relatedJob', 'title category')
    .populate('relatedProposal', 'title')
    .populate('relatedContract', 'title');

  if (!notification) {
    throw new Error('Notification not found');
  }

  // Check authorization
  if (notification.recipient.toString() !== userId) {
    throw new Error('Unauthorized access to notification');
  }

  return notification;
};

// ========================================
// NOTIFICATION MANAGEMENT
// ========================================

/**
 * Mark notification as read
 * @param {String} notificationId - Notification ID
 * @param {String} userId - User ID (for authorization)
 * @returns {Promise<Object>} - Updated notification
 */
const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new Error('Notification not found');
  }

  // Check authorization
  if (notification.recipient.toString() !== userId) {
    throw new Error('Unauthorized access to notification');
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  return notification;
};

/**
 * Mark all notifications as read for a user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Update result
 */
const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    message: `${result.modifiedCount} notifications marked as read`
  };
};

/**
 * Delete a notification
 * @param {String} notificationId - Notification ID
 * @param {String} userId - User ID (for authorization)
 * @returns {Promise<void>}
 */
const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new Error('Notification not found');
  }

  // Check authorization
  if (notification.recipient.toString() !== userId) {
    throw new Error('Unauthorized access to notification');
  }

  await Notification.findByIdAndDelete(notificationId);
};

/**
 * Clear all notifications for a user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Delete result
 */
const clearAllNotifications = async (userId) => {
  const result = await Notification.deleteMany({ recipient: userId });

  return {
    deletedCount: result.deletedCount,
    message: `${result.deletedCount} notifications cleared`
  };
};

// ========================================
// NOTIFICATION TEMPLATES
// ========================================

/**
 * Create job posted notification
 * @param {Object} job - Job document
 * @param {Array} freelancerIds - Array of freelancer IDs to notify
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Array>} - Created notifications
 */
const notifyJobPosted = async (job, freelancerIds, socketBroadcast = null) => {
  return await createBulkNotifications(
    freelancerIds,
    {
      type: 'job_posted',
      title: `New Job: ${job.title}`,
      message: `A new ${job.category} job has been posted matching your criteria. Budget: $${job.budget.amount || job.budget.minAmount}`,
      priority: 'high',
      relatedJob: job._id,
      relatedUser: job.client,
      actionUrl: `/jobs/${job._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create proposal received notification
 * @param {Object} proposal - Proposal document
 * @param {String} jobClientId - Client user ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyProposalReceived = async (proposal, jobClientId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: jobClientId,
      type: 'proposal_received',
      title: 'New Proposal Received',
      message: `You received a new proposal for "${proposal.title}" at $${proposal.bidAmount}`,
      priority: 'high',
      relatedProposal: proposal._id,
      relatedJob: proposal.job,
      relatedUser: proposal.freelancer,
      actionUrl: `/proposals/${proposal._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create proposal accepted notification
 * @param {Object} proposal - Proposal document
 * @param {String} freelancerId - Freelancer user ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyProposalAccepted = async (proposal, freelancerId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: freelancerId,
      type: 'proposal_accepted',
      title: 'Proposal Accepted!',
      message: `Your proposal for "${proposal.title}" has been accepted. Contract is being prepared.`,
      priority: 'urgent',
      relatedProposal: proposal._id,
      relatedJob: proposal.job,
      relatedUser: proposal.job.client,
      actionUrl: `/proposals/${proposal._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create contract created notification
 * @param {Object} contract - Contract document
 * @param {String} recipientId - User ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyContractCreated = async (contract, recipientId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: recipientId,
      type: 'contract_created',
      title: 'Contract Created',
      message: `A new contract "${contract.title}" has been created. Please review the terms.`,
      priority: 'high',
      relatedContract: contract._id,
      relatedJob: contract.job,
      relatedUser: contract.client.toString() === recipientId ? contract.freelancer : contract.client,
      actionUrl: `/contracts/${contract._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create payment released notification
 * @param {Object} payment - Payment document
 * @param {String} recipientId - User ID
 * @param {Number} amount - Payment amount
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyPaymentReleased = async (payment, recipientId, amount, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: recipientId,
      type: 'payment_received',
      title: 'Payment Released',
      message: `Payment of $${amount} has been released to your account.`,
      priority: 'urgent',
      relatedContract: payment.contract,
      actionUrl: `/payments/${payment._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create milestone submitted notification
 * @param {Object} milestone - Milestone document
 * @param {String} recipientId - User ID (client)
 * @param {String} freelancerId - Freelancer ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyMilestoneSubmitted = async (milestone, recipientId, freelancerId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: recipientId,
      type: 'milestone_submitted',
      title: 'Milestone Submitted',
      message: `Milestone "${milestone.title}" has been submitted for review. Amount: $${milestone.amount}`,
      priority: 'high',
      relatedContract: milestone.contract,
      relatedUser: freelancerId,
      actionUrl: `/milestones/${milestone._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create review received notification
 * @param {Object} review - Review document
 * @param {String} recipientId - User ID
 * @param {String} reviewerId - Reviewer ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyReviewReceived = async (review, recipientId, reviewerId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: recipientId,
      type: 'review_received',
      title: 'You Received a Review',
      message: `${reviewerId.name || 'Someone'} left a ${review.rating}-star review`,
      priority: 'medium',
      relatedContract: review.contract,
      relatedUser: reviewerId,
      actionUrl: `/reviews/${review._id}`,
      emailNotification: true
    },
    socketBroadcast
  );
};

/**
 * Create message received notification
 * @param {Object} message - Message document
 * @param {String} recipientId - User ID
 * @param {String} senderId - Sender ID
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Created notification
 */
const notifyMessageReceived = async (message, recipientId, senderId, socketBroadcast = null) => {
  return await createNotification(
    {
      recipient: recipientId,
      type: 'message_received',
      title: 'New Message',
      message: message.content ? message.content.substring(0, 100) : 'You have a new message',
      priority: 'medium',
      relatedMessage: message._id,
      relatedUser: senderId,
      actionUrl: `/messages/${message.contractId || message.jobId}`,
      emailNotification: false  // Messages usually don't trigger emails
    },
    socketBroadcast
  );
};

// ========================================
// STATISTICS & CLEANUP
// ========================================

/**
 * Get notification statistics for a user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Statistics
 */
const getNotificationStats = async (userId) => {
  const total = await Notification.countDocuments({ recipient: userId });
  const unread = await Notification.countDocuments({ recipient: userId, isRead: false });
  const byType = await Notification.aggregate([
    { $match: { recipient: userId } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  return {
    total,
    unread,
    read: total - unread,
    byType: Object.fromEntries(byType.map(t => [t._id, t.count]))
  };
};

/**
 * Delete old notifications (cleanup)
 * @param {Number} daysOld - Delete notifications older than this many days
 * @returns {Promise<Object>} - Delete result
 */
const deleteOldNotifications = async (daysOld = 30) => {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await Notification.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true  // Only delete if already read
  });

  return {
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} notifications older than ${daysOld} days`
  };
};

export default {
  // Creation
  createNotification,
  createBulkNotifications,

  // Retrieval
  getNotificationsForUser,
  getUnreadCount,
  getNotification,

  // Management
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,

  // Templates
  notifyJobPosted,
  notifyProposalReceived,
  notifyProposalAccepted,
  notifyContractCreated,
  notifyPaymentReleased,
  notifyMilestoneSubmitted,
  notifyReviewReceived,
  notifyMessageReceived,

  // Statistics
  getNotificationStats,
  deleteOldNotifications
};
