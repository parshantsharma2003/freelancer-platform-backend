import SavedSearch from '../models/SavedSearch.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

// ========================================
// SAVED SEARCH MANAGEMENT
// ========================================

/**
 * Create a new saved search
 * @param {String} freelancerId - Freelancer user ID
 * @param {Object} searchData - Search data (name, filters, notificationSettings)
 * @returns {Promise<Object>} - Created saved search
 */
const createSavedSearch = async (freelancerId, searchData) => {
  // Validate required fields
  if (!searchData.name || searchData.name.trim().length === 0) {
    throw new Error('Search name is required');
  }

  // Validate freelancer exists
  const freelancer = await User.findById(freelancerId);
  if (!freelancer) {
    throw new Error('Freelancer not found');
  }

  // Create saved search
  const savedSearch = new SavedSearch({
    freelancer: freelancerId,
    name: searchData.name.trim(),
    filters: searchData.filters || {},
    notificationSettings: searchData.notificationSettings || {
      emailNotification: true,
      notifyWhenJobsCount: 1,
      maxNotificationsPerDay: 3
    }
  });

  await savedSearch.save();
  return savedSearch.populate('freelancer', 'email name');
};

/**
 * Get all saved searches for a freelancer
 * @param {String} freelancerId - Freelancer user ID
 * @param {Number} page - Page number (default: 1)
 * @param {Number} limit - Results per page (default: 10)
 * @returns {Promise<Object>} - Paginated saved searches
 */
const getSavedSearchesForFreelancer = async (freelancerId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const total = await SavedSearch.countDocuments({ freelancer: freelancerId });

  const savedSearches = await SavedSearch.find({ freelancer: freelancerId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('freelancer', 'email name');

  return {
    data: savedSearches,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    }
  };
};

/**
 * Get a specific saved search by ID
 * @param {String} searchId - Saved search ID
 * @param {String} freelancerId - Freelancer user ID (for authorization)
 * @returns {Promise<Object>} - Saved search document
 */
const getSavedSearch = async (searchId, freelancerId) => {
  const savedSearch = await SavedSearch.findById(searchId).populate('freelancer', 'email name');

  if (!savedSearch) {
    throw new Error('Saved search not found');
  }

  // Authorize access
  if (savedSearch.freelancer._id.toString() !== freelancerId) {
    throw new Error('Unauthorized access to this saved search');
  }

  return savedSearch;
};

/**
 * Update a saved search
 * @param {String} searchId - Saved search ID
 * @param {String} freelancerId - Freelancer user ID (for authorization)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated saved search
 */
const updateSavedSearch = async (searchId, freelancerId, updateData) => {
  const savedSearch = await SavedSearch.findById(searchId);

  if (!savedSearch) {
    throw new Error('Saved search not found');
  }

  // Authorize access
  if (savedSearch.freelancer.toString() !== freelancerId) {
    throw new Error('Unauthorized access to this saved search');
  }

  // Update fields
  if (updateData.name) {
    savedSearch.name = updateData.name.trim();
  }
  if (updateData.filters) {
    savedSearch.filters = { ...savedSearch.filters, ...updateData.filters };
  }
  if (updateData.notificationSettings) {
    savedSearch.notificationSettings = {
      ...savedSearch.notificationSettings,
      ...updateData.notificationSettings
    };
  }
  if (updateData.hasOwnProperty('isActive')) {
    savedSearch.isActive = updateData.isActive;
  }

  await savedSearch.save();
  return savedSearch.populate('freelancer', 'email name');
};

/**
 * Delete a saved search
 * @param {String} searchId - Saved search ID
 * @param {String} freelancerId - Freelancer user ID (for authorization)
 * @returns {Promise<void>}
 */
const deleteSavedSearch = async (searchId, freelancerId) => {
  const savedSearch = await SavedSearch.findById(searchId);

  if (!savedSearch) {
    throw new Error('Saved search not found');
  }

  // Authorize access
  if (savedSearch.freelancer.toString() !== freelancerId) {
    throw new Error('Unauthorized access to this saved search');
  }

  await SavedSearch.findByIdAndDelete(searchId);
};

// ========================================
// JOB MATCHING & NOTIFICATIONS
// ========================================

/**
 * Find all matching saved searches for a newly posted job
 * @param {Object} job - Job document
 * @returns {Promise<Array>} - Array of matching saved searches with freelancer IDs
 */
const findMatchingSavedSearches = async (job) => {
  // Get all active saved searches
  const allSavedSearches = await SavedSearch.getActiveSavedSearches();

  // Filter to those that match the job
  const matchingSearches = allSavedSearches.filter(search => search.matchesJob(job));

  return matchingSearches;
};

/**
 * Notify freelancers about a matching job via saved search
 * @param {Object} job - Job document
 * @param {Array} matchingSavedSearches - Array of matching saved searches
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<void>}
 */
const notifyFreelancersAboutJob = async (job, matchingSavedSearches, socketBroadcast = null) => {
  const notifications = [];

  for (const savedSearch of matchingSavedSearches) {
    try {
      // Check if freelancer should be notified
      if (!savedSearch.canNotifyFreelancer()) {
        continue;
      }

      const freelancerId = savedSearch.freelancer._id;
      const freelancerEmail = savedSearch.freelancer.email;
      const freelancerName = savedSearch.freelancer.name;

      // Create notification in database
      const notification = new Notification({
        recipient: freelancerId,
        type: 'job_posted',
        title: `New job matches your saved search "${savedSearch.name}"`,
        message: `A new job has been posted that matches your saved search. Title: ${job.title}`,
        relatedJob: job._id,
        actionUrl: `/jobs/${job._id}`,
        priority: 'high',
        emailSent: false
      });

      await notification.save();
      notifications.push({
        notification,
        freelancerId,
        freelancerEmail,
        freelancerName
      });

      // Increment notification counter
      savedSearch.incrementNotificationCount();
      await savedSearch.save();

      // Notify via socket if user is online
      if (socketBroadcast) {
        socketBroadcast.notifyUser(freelancerId, {
          type: 'job_alert',
          title: `New job matches your saved search: "${savedSearch.name}"`,
          message: job.title,
          jobId: job._id,
          jobTitle: job.title,
          jobCategory: job.category,
          budget: job.budget,
          skills: job.skills,
          savedSearchId: savedSearch._id,
          savedSearchName: savedSearch.name
        });
      }
    } catch (err) {
      console.error(`[SavedSearch] Error notifying freelancer for saved search ${savedSearch._id}:`, err);
      // Continue processing other searches even if one fails
    }
  }

  // Schedule email sending for those with email notification enabled
  if (notifications.length > 0) {
    try {
      // TODO: Queue emails to send service (e.g., Bull, Agenda, etc.)
      // For now, this is a placeholder for where email sending would be triggered
      console.log(`[SavedSearch] ${notifications.length} notifications created, emails to be queued`);
    } catch (err) {
      console.error('[SavedSearch] Error queuing notifications:', err);
    }
  }

  return notifications;
};

/**
 * Get statistics for a freelancer's saved searches
 * @param {String} freelancerId - Freelancer ID
 * @returns {Promise<Object>} - Statistics
 */
const getSavedSearchStats = async (freelancerId) => {
  const searches = await SavedSearch.find({ freelancer: freelancerId });

  const totalSearches = searches.length;
  const activeSearches = searches.filter(s => s.isActive).length;
  const inactiveSearches = searches.filter(s => !s.isActive).length;
  const totalJobMatches = searches.reduce((sum, s) => sum + (s.matchedJobsCount || 0), 0);
  const totalNotifications = await Notification.countDocuments({
    type: 'job_posted',
    recipient: freelancerId
  });

  return {
    totalSearches,
    activeSearches,
    inactiveSearches,
    totalJobMatches,
    totalNotifications
  };
};

// ========================================
// BULK OPERATIONS
// ========================================

/**
 * Match a job against ALL saved searches and notify matching freelancers
 * (Called when a new job is posted)
 * @param {Object} job - Job document
 * @param {Object} socketBroadcast - Socket broadcast object (optional)
 * @returns {Promise<Object>} - Matching information
 */
const processJobAlert = async (job, socketBroadcast = null) => {
  try {
    // Find all matching saved searches
    const matchingSavedSearches = await findMatchingSavedSearches(job);

    if (matchingSavedSearches.length === 0) {
      return {
        success: true,
        matchCount: 0,
        notificationsSent: 0,
        message: 'Job posted but no matching saved searches found'
      };
    }

    // Notify matching freelancers
    const notificationsSent = await notifyFreelancersAboutJob(job, matchingSavedSearches, socketBroadcast);

    // Update match counts for each search
    for (const savedSearch of matchingSavedSearches) {
      savedSearch.matchedJobsCount = (savedSearch.matchedJobsCount || 0) + 1;
      await savedSearch.save();
    }

    return {
      success: true,
      matchCount: matchingSavedSearches.length,
      notificationsSent: notificationsSent.length,
      message: `Job matched with ${matchingSavedSearches.length} saved search(es), ${notificationsSent.length} notification(s) sent`
    };
  } catch (err) {
    console.error('[SavedSearch] Error processing job alert:', err);
    return {
      success: false,
      error: err.message
    };
  }
};

// ========================================
// CLEANUP & MAINTENANCE
// ========================================

/**
 * Reset daily notification counters (run via cron job at midnight)
 * @returns {Promise<Object>} - Update result
 */
const resetDailyNotificationCounters = async () => {
  const result = await SavedSearch.updateMany(
    {},
    {
      notificationsThisDay: 0,
      notificationDateTracker: new Date()
    }
  );

  return {
    modifiedCount: result.modifiedCount,
    message: `Reset notification counters for ${result.modifiedCount} saved searches`
  };
};

export default {
  // CRUD operations
  createSavedSearch,
  getSavedSearchesForFreelancer,
  getSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,

  // Matching and notifications
  findMatchingSavedSearches,
  notifyFreelancersAboutJob,
  processJobAlert,

  // Statistics
  getSavedSearchStats,

  // Maintenance
  resetDailyNotificationCounters
};
