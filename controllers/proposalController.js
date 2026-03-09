import Proposal from '../models/Proposal.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import Contract from '../models/Contract.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createContractFromProposal } from '../services/contractService.js';

// @desc    Create a proposal
// @route   POST /api/proposals
// @access  Private (Freelancers only)
export const createProposal = asyncHandler(async (req, res) => {
  const { jobId, ...proposalData } = req.body;

  // Check if job exists
  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check if job is open
  if (job.status !== 'open') {
    return res.status(400).json({
      status: 'error',
      message: 'Job is not accepting proposals'
    });
  }

  if (job.proposalLimit && job.proposalsCount >= job.proposalLimit) {
    return res.status(400).json({
      status: 'error',
      message: 'Proposal limit reached for this job'
    });
  }

  // Check if freelancer already submitted a proposal
  const existingProposal = await Proposal.findOne({
    job: jobId,
    freelancer: req.user._id
  });

  if (existingProposal) {
    return res.status(400).json({
      status: 'error',
      message: 'You have already submitted a proposal for this job'
    });
  }

  // Create proposal
  const creditCost = proposalData.creditCost || 1;

  if (req.user.credits < creditCost) {
    return res.status(400).json({
      status: 'error',
      message: 'Insufficient proposal credits'
    });
  }

  const proposal = await Proposal.create({
    ...proposalData,
    job: jobId,
    freelancer: req.user._id,
    creditCost,
    creditsUsed: creditCost
  });

  // Calculate quality score
  proposal.calculateQualityScore();
  proposal.spamScore = proposal.coverLetter.length < 80 ? 70 : 20;
  proposal.rankingScore = Math.min(100, proposal.qualityScore + 10);
  await proposal.save();

  req.user.credits -= creditCost;
  await req.user.save();

  // Update job proposal count
  await Job.findByIdAndUpdate(jobId, {
    $inc: { proposalsCount: 1 }
  });

  // Create notification for client via notification service
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    const io = req.app.get('io');
    
    await notificationService.notifyProposalReceived(proposal, job.client, socketBroadcast);
    
    // Emit explicit socket event for real-time proposal count update (Frontend expects this)
    if (socketBroadcast && socketBroadcast.toClient) {
      socketBroadcast.toClient(job.client.toString(), 'new_proposal', {
        proposalId: proposal._id,
        jobId: jobId,
        jobTitle: job.title,
        freelancerId: req.user._id,
        freelancerName: `${req.user.firstName} ${req.user.lastName}`,
        coverLetter: proposal.coverLetter.substring(0, 100) + '...',
        timestamp: new Date()
      });
    }

    // Emit analytics update event for Analytics page
    if (io) {
      io.to(`user:${job.client}`).emit('proposal_received', {
        proposalId: proposal._id,
        jobId: jobId,
        timestamp: new Date()
      });
    }
  } catch (err) {
    console.log('[Notification] Failed to notify client of proposal:', err.message);
    // Create fallback notification if service fails
    await Notification.create({
      recipient: job.client,
      type: 'proposal_received',
      title: 'New Proposal Received',
      message: `You received a new proposal for "${job.title}"`,
      relatedJob: jobId,
      relatedProposal: proposal._id,
      relatedUser: req.user._id,
      actionUrl: `/jobs/${jobId}/proposals/${proposal._id}`
    });
  }

  res.status(201).json({
    status: 'success',
    message: 'Proposal submitted successfully',
    data: { proposal }
  });
});

// @desc    Get proposals for a job
// @route   GET /api/proposals/job/:jobId
// @access  Private (Job owner only)
export const getJobProposals = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { status, sortBy = 'createdAt', order = 'desc' } = req.query;

  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check if user is job owner
  if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view these proposals'
    });
  }

  const query = { job: jobId };
  if (status) query.status = status;

  const sort = {};
  sort[sortBy] = order === 'desc' ? -1 : 1;

  const proposals = await Proposal.find(query)
    .populate('freelancer', 'firstName lastName avatar')
    .sort(sort);

  res.status(200).json({
    status: 'success',
    data: { proposals }
  });
});

// @desc    Get my proposals (freelancer)
// @route   GET /api/proposals/my/submitted
// @access  Private (Freelancers only)
export const getMyProposals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { freelancer: req.user._id };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const proposals = await Proposal.find(query)
    .populate('job', 'title budget status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Proposal.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get received proposals (client - all jobs)
// @route   GET /api/proposals/received/all
// @access  Private (Clients only)
export const getReceivedProposals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  // Get all jobs owned by this client
  const jobs = await Job.find({ client: req.user._id }, '_id');
  const jobIds = jobs.map(job => job._id);

  const query = { job: { $in: jobIds } };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const proposals = await Proposal.find(query)
    .populate('freelancer', 'firstName lastName email avatar title hourlyRate')
    .populate('job', 'title budget status client')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Proposal.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get proposal by ID
// @route   GET /api/proposals/:id
// @access  Private
export const getProposalById = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate('freelancer', 'firstName lastName email avatar title hourlyRate')
    .populate({
      path: 'job',
      select: 'title description budget client',
      populate: {
        path: 'client',
        select: 'firstName lastName email'
      }
    });

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  // Check authorization
  const freelancerId = proposal.freelancer._id.toString();
  const clientId = proposal.job?.client?._id?.toString() || proposal.job?.client?.toString();
  const userId = req.user._id.toString();
  const isSuper = req.user.role === 'super_admin';

  const isAuthorized = freelancerId === userId || clientId === userId || isSuper;

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this proposal'
    });
  }

  // Mark as viewed by client
  if (clientId === userId && !proposal.viewedByClient) {
    proposal.viewedByClient = true;
    proposal.viewedAt = new Date();
    await proposal.save();
  }

  res.status(200).json({
    status: 'success',
    data: { proposal }
  });
});

// @desc    Update proposal
// @route   PUT /api/proposals/:id
// @access  Private (Proposal owner only)
export const updateProposal = asyncHandler(async (req, res) => {
  let proposal = await Proposal.findById(req.params.id);

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  // Check ownership
  if (proposal.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to update this proposal'
    });
  }

  // Can't update if already accepted or rejected
  if (['accepted', 'rejected'].includes(proposal.status)) {
    return res.status(400).json({
      status: 'error',
      message: `Cannot update ${proposal.status} proposal`
    });
  }

  proposal = await Proposal.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    message: 'Proposal updated successfully',
    data: { proposal }
  });
});

// @desc    Withdraw proposal
// @route   PUT /api/proposals/:id/withdraw
// @access  Private (Proposal owner only)
export const withdrawProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  // Check ownership
  if (proposal.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to withdraw this proposal'
    });
  }

  proposal.status = 'withdrawn';
  await proposal.save();

  // Decrement job proposal count
  await Job.findByIdAndUpdate(proposal.job, {
    $inc: { proposalsCount: -1 }
  });

  res.status(200).json({
    status: 'success',
    message: 'Proposal withdrawn successfully',
    data: { proposal }
  });
});

// @desc    Accept proposal
// @route   PUT /api/proposals/:id/accept
// @access  Private (Job owner only)
export const acceptProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id).populate('job');

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  // Check authorization
  if (proposal.job.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to accept this proposal'
    });
  }

  if (['accepted', 'declined', 'rejected', 'withdrawn'].includes(proposal.status)) {
    return res.status(400).json({
      status: 'error',
      message: `Proposal already ${proposal.status}`
    });
  }

  proposal.status = 'accepted';
  proposal.respondedAt = new Date();
  await proposal.save();

  // Update job
  await Job.findByIdAndUpdate(proposal.job._id, {
    status: 'in-progress',
    hiredFreelancer: proposal.freelancer
  });

  // STRICT: contract must exist for accepted proposals
  const contract = await createContractFromProposal(proposal, proposal.job);

  // Notify freelancer of contract creation and proposal acceptance via notification service
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    await notificationService.notifyContractCreated(contract, proposal.freelancer, socketBroadcast);
    await notificationService.notifyProposalAccepted(proposal, proposal.freelancer, socketBroadcast);
  } catch (notificationErr) {
    console.log('[Notification] Failed to notify freelancer:', notificationErr.message);
    await Notification.create([
      {
        recipient: proposal.freelancer,
        type: 'contract_created',
        title: 'Contract Created',
        message: `Your contract for "${proposal.job.title}" is now active`,
        relatedContract: contract._id,
        relatedUser: req.user._id,
        actionUrl: `/contracts/${contract._id}`,
        priority: 'high'
      },
      {
        recipient: proposal.freelancer,
        type: 'proposal_accepted',
        title: 'Proposal Accepted!',
        message: `Your proposal for "${proposal.job.title}" has been accepted`,
        relatedJob: proposal.job._id,
        relatedProposal: proposal._id,
        relatedUser: req.user._id,
        actionUrl: `/proposals/${proposal._id}`,
        priority: 'high'
      }
    ]);
  }

  console.log(`[Contract] Auto-created contract: ${contract._id} for proposal: ${proposal._id}`);

  res.status(200).json({
    status: 'success',
    message: 'Proposal accepted successfully',
    data: { proposal, contract }
  });
});

// @desc    Reject proposal
// @route   PUT /api/proposals/:id/reject
// @access  Private (Job owner only)
export const rejectProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id).populate('job');

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  // Check authorization
  if (proposal.job.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to reject this proposal'
    });
  }

  proposal.status = 'declined';
  proposal.respondedAt = new Date();
  await proposal.save();

  // Create notification for freelancer
  await Notification.create({
    recipient: proposal.freelancer,
    type: 'proposal_rejected',
    title: 'Proposal Not Selected',
    message: `Your proposal for "${proposal.job.title}" was not selected`,
    relatedJob: proposal.job._id,
    relatedProposal: proposal._id,
    actionUrl: `/proposals/${proposal._id}`
  });

  res.status(200).json({
    status: 'success',
    message: 'Proposal declined',
    data: { proposal }
  });
});

// @desc    Get unread proposal count for client
// @route   GET /api/proposals/unread-count
// @access  Private (Clients only)
export const getUnreadProposalCount = asyncHandler(async (req, res) => {
  // Count proposals for jobs owned by this client that are unread (status: pending)
  const Job = (await import('../models/Job.js')).default;
  
  // Get all job IDs for this client
  const clientJobs = await Job.find({ client: req.user._id }).select('_id');
  const jobIds = clientJobs.map(job => job._id);

  // Count pending proposals for these jobs
  const unreadCount = await Proposal.countDocuments({
    job: { $in: jobIds },
    status: 'pending',
    viewed: { $ne: true } // If you have a viewed field
  });

  res.status(200).json({
    status: 'success',
    data: { count: unreadCount }
  });
});
