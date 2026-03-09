import Invite from '../models/Invite.js';
import Job from '../models/Job.js';
import User from '../models/User.js';

// Helper: Get invite expiration date (7 days from now)
const getInviteExpirationDate = (daysUntilExpiry = 7) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysUntilExpiry);
  return expiresAt;
};

// Send job invite to freelancer
export const sendJobInvite = async (jobId, clientId, freelancerId, message = '') => {
  // Verify job exists and belongs to client
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error('Job not found');
  }
  if (job.client.toString() !== clientId.toString()) {
    throw new Error('Not authorized to invite for this job');
  }

  // Verify freelancer exists
  const freelancer = await User.findById(freelancerId);
  if (!freelancer) {
    throw new Error('Freelancer not found');
  }

  // Check if invite already exists
  const existingInvite = await Invite.findOne({
    job: jobId,
    freelancer: freelancerId,
    status: { $in: ['sent', 'accepted'] }
  });

  if (existingInvite) {
    throw new Error('Invitation already sent to this freelancer');
  }

  // Create invite
  const expiresAt = getInviteExpirationDate(7);
  const invite = await Invite.create({
    job: jobId,
    client: clientId,
    freelancer: freelancerId,
    message,
    expiresAt
  });

  // Add freelancer to job's invitedFreelancers if not already there
  if (!job.invitedFreelancers.includes(freelancerId)) {
    job.invitedFreelancers.push(freelancerId);
    await job.save();
  }

  // Populate and return
  const populatedInvite = await Invite.findById(invite._id)
    .populate('job', 'title description budget')
    .populate('client', 'firstName lastName avatar')
    .populate('freelancer', 'firstName lastName avatar');

  return populatedInvite;
};

// Respond to invite (accept or decline)
export const respondToInvite = async (inviteId, freelancerId, response, declineReason = '') => {
  const invite = await Invite.findById(inviteId);
  if (!invite) {
    throw new Error('Invite not found');
  }

  // Verify invite belongs to freelancer
  if (invite.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Not authorized to respond to this invite');
  }

  // Check if invite is expired
  if (invite.isExpired()) {
    invite.status = 'expired';
    await invite.save();
    throw new Error('This invitation has expired');
  }

  // Verify response is valid
  if (!['accepted', 'declined'].includes(response)) {
    throw new Error('Invalid response. Must be accepted or declined');
  }

  // Update invite
  invite.status = response;
  invite.respondedAt = new Date();
  if (response === 'declined' && declineReason) {
    invite.declineReason = declineReason;
  }

  await invite.save();

  // Populate and return
  const populatedInvite = await Invite.findById(inviteId)
    .populate('job', 'title description budget')
    .populate('client', 'firstName lastName avatar')
    .populate('freelancer', 'firstName lastName avatar');

  return populatedInvite;
};

// Get invites for freelancer
export const getFreelancerInvites = async (freelancerId, filters = {}) => {
  const query = { freelancer: freelancerId };

  // Filter by status
  if (filters.status) {
    query.status = filters.status;
  }

  // Auto-expire old invites
  const invites = await Invite.find(query)
    .populate('job', 'title description category budget experienceLevel skills')
    .populate('client', 'firstName lastName avatar rating')
    .sort({ createdAt: -1 });

  // Mark expired invites
  const updatedInvites = [];
  for (const invite of invites) {
    if (invite.isExpired() && invite.status === 'sent') {
      await invite.markAsExpired();
      updatedInvites.push(invite);
    } else {
      updatedInvites.push(invite);
    }
  }

  return updatedInvites;
};

// Get invites sent by client for a job
export const getJobInvites = async (jobId, clientId) => {
  // Verify client owns the job
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error('Job not found');
  }
  if (job.client.toString() !== clientId.toString()) {
    throw new Error('Not authorized to view invites for this job');
  }

  const invites = await Invite.find({ job: jobId })
    .populate('freelancer', 'firstName lastName avatar rating skills')
    .sort({ createdAt: -1 });

  return invites;
};

// Get single invite
export const getInviteById = async (inviteId, userId) => {
  const invite = await Invite.findById(inviteId)
    .populate('job', 'title description budget')
    .populate('client', 'firstName lastName avatar')
    .populate('freelancer', 'firstName lastName avatar');

  if (!invite) {
    throw new Error('Invite not found');
  }

  // Authorization: must be freelancer or client
  const isFreelancer = invite.freelancer._id.toString() === userId.toString();
  const isClient = invite.client._id.toString() === userId.toString();

  if (!isFreelancer && !isClient) {
    throw new Error('Not authorized to view this invite');
  }

  return invite;
};

// Cancel invite (client only)
export const cancelInvite = async (inviteId, clientId) => {
  const invite = await Invite.findById(inviteId);
  if (!invite) {
    throw new Error('Invite not found');
  }

  if (invite.client.toString() !== clientId.toString()) {
    throw new Error('Not authorized to cancel this invite');
  }

  if (invite.status !== 'sent') {
    throw new Error('Can only cancel sent invites');
  }

  await Invite.findByIdAndDelete(inviteId);
  return { message: 'Invite cancelled successfully' };
};

// Check if freelancer is invited to a job
export const isFreelancerInvited = async (jobId, freelancerId) => {
  const invite = await Invite.findOne({
    job: jobId,
    freelancer: freelancerId,
    status: 'accepted'
  });

  return !!invite;
};

// Bulk invite freelancers
export const bulkInviteFreelancers = async (jobId, clientId, freelancerIds, message = '') => {
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.client.toString() !== clientId.toString()) {
    throw new Error('Not authorized to invite for this job');
  }

  const results = {
    successful: [],
    failed: []
  };

  const expiresAt = getInviteExpirationDate(7);

  for (const freelancerId of freelancerIds) {
    try {
      // Check if invite already exists
      const existingInvite = await Invite.findOne({
        job: jobId,
        freelancer: freelancerId,
        status: { $in: ['sent', 'accepted'] }
      });

      if (existingInvite) {
        results.failed.push({
          freelancerId,
          reason: 'Invitation already sent'
        });
        continue;
      }

      // Create invite
      const invite = await Invite.create({
        job: jobId,
        client: clientId,
        freelancer: freelancerId,
        message,
        expiresAt
      });

      results.successful.push(freelancerId);

      // Add to job's invitedFreelancers
      if (!job.invitedFreelancers.includes(freelancerId)) {
        job.invitedFreelancers.push(freelancerId);
      }
    } catch (error) {
      results.failed.push({
        freelancerId,
        reason: error.message
      });
    }
  }

  // Save job with all invited freelancers
  await job.save();

  return results;
};

// Cleanup: Auto-expire invites older than expiration date
export const expireOldInvites = async () => {
  const result = await Invite.updateMany(
    {
      status: 'sent',
      expiresAt: { $lt: new Date() }
    },
    {
      status: 'expired'
    }
  );

  return result;
};

// Get stats for a job's invitations
export const getJobInviteStats = async (jobId, clientId) => {
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.client.toString() !== clientId.toString()) {
    throw new Error('Not authorized');
  }

  const stats = await Invite.aggregate([
    { $match: { job: job._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: {
          $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
        },
        declined: {
          $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
        },
        expired: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    sent: 0,
    accepted: 0,
    declined: 0,
    expired: 0
  };
};
