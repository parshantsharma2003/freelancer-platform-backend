import Invite from '../models/Invite.js';
import Job from '../models/Job.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as inviteService from '../services/inviteService.js';

// @desc    Send job invite to freelancer
// @route   POST /api/jobs/:jobId/invite
// @access  Private (Client only)
export const sendJobInvite = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { freelancerId, message } = req.body;

  // Validate input
  if (!freelancerId) {
    return res.status(400).json({
      status: 'error',
      message: 'Freelancer ID is required'
    });
  }

  // Send invite
  const invite = await inviteService.sendJobInvite(jobId, req.user._id, freelancerId, message);

  // 📡 BROADCAST INVITE TO FREELANCER VIA SOCKET
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.broadcastJobInvite(invite);
    }
  } catch (socketError) {
    console.log('[Socket] Invite broadcast failed:', socketError.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Invitation sent successfully',
    data: { invite }
  });
});

// @desc    Bulk invite freelancers to a job
// @route   POST /api/jobs/:jobId/invite-bulk
// @access  Private (Client only)
export const bulkInviteFreelancers = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { freelancerIds, message } = req.body;

  // Validate input
  if (!Array.isArray(freelancerIds) || freelancerIds.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'freelancerIds array is required and must not be empty'
    });
  }

  // Bulk invite
  const results = await inviteService.bulkInviteFreelancers(jobId, req.user._id, freelancerIds, message);

  // 📡 BROADCAST INVITES TO FREELANCERS VIA SOCKET
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast && results.successful.length > 0) {
      // Get the invites that were created
      const jobInvites = await Invite.find({
        job: jobId,
        freelancer: { $in: results.successful }
      })
        .populate('job', 'title description budget')
        .populate('client', 'firstName lastName avatar')
        .populate('freelancer', 'firstName lastName avatar');

      jobInvites.forEach(invite => {
        socketBroadcast.broadcastJobInvite(invite);
      });
    }
  } catch (socketError) {
    console.log('[Socket] Bulk invite broadcast failed:', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'Bulk invitations sent',
    data: { results }
  });
});

// @desc    Respond to job invite (accept or decline)
// @route   POST /api/invites/:inviteId/respond
// @access  Private (Freelancer only)
export const respondToInvite = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;
  const { response, declineReason } = req.body;

  // Validate input
  if (!response || !['accepted', 'declined'].includes(response)) {
    return res.status(400).json({
      status: 'error',
      message: 'Response must be accepted or declined'
    });
  }

  // Respond to invite
  const invite = await inviteService.respondToInvite(
    inviteId,
    req.user._id,
    response,
    declineReason
  );

  // 📡 BROADCAST RESPONSE TO CLIENT VIA SOCKET
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.broadcastInviteResponse(invite);
    }
  } catch (socketError) {
    console.log('[Socket] Response broadcast failed:', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    message: `Invitation ${response}`,
    data: { invite }
  });
});

// @desc    Get all invites for freelancer
// @route   GET /api/invites
// @access  Private (Freelancer only)
export const getMyInvites = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filters = {};
  if (status) {
    filters.status = status;
  }

  const invites = await inviteService.getFreelancerInvites(req.user._id, filters);

  res.status(200).json({
    status: 'success',
    data: {
      invites,
      count: invites.length
    }
  });
});

// @desc    Get single invite
// @route   GET /api/invites/:inviteId
// @access  Private (Freelancer or Client)
export const getInviteById = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;

  const invite = await inviteService.getInviteById(inviteId, req.user._id);

  res.status(200).json({
    status: 'success',
    data: { invite }
  });
});

// @desc    Get all invites for a job
// @route   GET /api/jobs/:jobId/invites
// @access  Private (Client only - job owner)
export const getJobInvites = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const invites = await inviteService.getJobInvites(jobId, req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      invites,
      count: invites.length
    }
  });
});

// @desc    Get invite stats for a job
// @route   GET /api/jobs/:jobId/invite-stats
// @access  Private (Client only - job owner)
export const getJobInviteStats = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const stats = await inviteService.getJobInviteStats(jobId, req.user._id);

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

// @desc    Cancel job invite
// @route   DELETE /api/invites/:inviteId
// @access  Private (Client only - job owner)
export const cancelInvite = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;

  const result = await inviteService.cancelInvite(inviteId, req.user._id);

  res.status(200).json({
    status: 'success',
    message: result.message
  });
});
