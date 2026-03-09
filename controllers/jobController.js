import Job from '../models/Job.js';
import ClientProfile from '../models/ClientProfile.js';
import savedSearchService from '../services/savedSearchService.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Create a job
// @route   POST /api/jobs
// @access  Private (Clients only)
export const createJob = asyncHandler(async (req, res) => {
  const { isDraft, expiryDays, boostDays, ...rest } = req.body;
  const jobData = { ...rest, client: req.user._id };

  if (isDraft || jobData.status === 'draft') {
    jobData.status = 'draft';
  }

  if (expiryDays && !jobData.expiresAt) {
    jobData.expiresAt = new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000);
  }

  if (jobData.isBoosted && boostDays) {
    jobData.boostedAt = new Date();
    jobData.boostExpiry = new Date(Date.now() + Number(boostDays) * 24 * 60 * 60 * 1000);
  }

  if (jobData.status === 'open' && !jobData.publishedAt) {
    jobData.publishedAt = new Date();
  }

  const job = await Job.create(jobData);

  if (job.status !== 'draft') {
    // Update or create client profile with job counts
    await ClientProfile.findOneAndUpdate(
      { user: req.user._id },
      { $inc: { activeJobs: 1, totalJobs: 1 } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 📡 EMIT JOB POSTED EVENT TO CLIENT FOR REAL-TIME ANALYTICS UPDATE
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${req.user._id}`).emit('job_posted', {
          jobId: job._id,
          title: job.title,
          createdAt: job.createdAt
        });
      }
    } catch (socketError) {
      console.log('[Socket] Job posted event failed (non-critical):', socketError.message);
    }

    // 📡 BROADCAST JOB TO ALL ACTIVE FREELANCERS VIA SOCKET
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.broadcastNewJob(job);
      }
    } catch (socketError) {
      // Socket broadcasting failed, but REST API will serve as fallback
      console.log('[Socket] Broadcasting failed (REST fallback will handle it):', socketError.message);
    }

    // 🔔 MATCH SAVED SEARCHES AND NOTIFY FREELANCERS
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      const alertResult = await savedSearchService.processJobAlert(job, socketBroadcast);
      if (alertResult.success && alertResult.notificationsSent > 0) {
        console.log(`[SavedSearch] Job alert processed: ${alertResult.matchCount} matches, ${alertResult.notificationsSent} notifications sent`);
      }
    } catch (alertError) {
      // Saved search alert failed, but shouldn't block job creation
      console.log('[SavedSearch] Alert processing failed (non-critical):', alertError.message);
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Job created successfully',
    data: { job }
  });
});

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Public
export const getJobs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    skills,
    budgetType,
    minBudget,
    maxBudget,
    experienceLevel,
    status = 'open',
    search
  } = req.query;

  const query = { status, $and: [] };
  query.$and.push({
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  // Filter visibility: exclude invite-only jobs unless user is invited
  if (req.user) {
    // Logged-in user: can see public jobs + invite-only jobs they're invited to
    query.$or = [
      { visibility: 'public' },
      {
        visibility: 'invite-only',
        invitedFreelancers: req.user._id
      }
    ];
  } else {
    // Anonymous user: only public jobs
    query.visibility = 'public';
  }

  if (category) query.category = category;
  if (skills) query.skills = { $in: skills.split(',') };
  if (budgetType) query['budget.type'] = budgetType;
  if (experienceLevel) query.experienceLevel = experienceLevel;

  if (minBudget || maxBudget) {
    query['budget.amount'] = {};
    if (minBudget) query['budget.amount'].$gte = parseFloat(minBudget);
    if (maxBudget) query['budget.amount'].$lte = parseFloat(maxBudget);
  }

  if (search) {
    query.$and.push({
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    });
  }

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .populate('client', 'firstName lastName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Job.countDocuments(query);

  // Prevent caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  res.status(200).json({
    status: 'success',
    data: {
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get job by ID
// @route   GET /api/jobs/:id
// @access  Public
export const getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate('client', 'firstName lastName avatar')
    .populate('hiredFreelancer', 'firstName lastName avatar');

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { job }
  });
});

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private (Job owner only)
export const updateJob = asyncHandler(async (req, res) => {
  let job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check ownership
  if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to update this job'
    });
  }

  job = await Job.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (job.status === 'open' && !job.publishedAt) {
    job.publishedAt = new Date();
    await job.save();
  }

  res.status(200).json({
    status: 'success',
    message: 'Job updated successfully',
    data: { job }
  });
});

// @desc    Delete job
// @route   DELETE /api/jobs/:id
// @access  Private (Job owner only)
export const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check ownership
  if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to delete this job'
    });
  }

  await job.deleteOne();

  // Update client profile
  await ClientProfile.findOneAndUpdate(
    { user: job.client },
    { $inc: { activeJobs: -1 } }
  );

  res.status(200).json({
    status: 'success',
    message: 'Job deleted successfully'
  });
});

// @desc    Get my jobs (client)
// @route   GET /api/jobs/my/posted
// @access  Private (Clients only)
export const getMyJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { client: req.user._id };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Job.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Close job
// @route   PUT /api/jobs/:id/close
// @access  Private (Job owner only)
export const closeJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check ownership
  if (job.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to close this job'
    });
  }

  job.status = 'closed';
  await job.save();

  // Update client profile
  await ClientProfile.findOneAndUpdate(
    { user: job.client },
    { $inc: { activeJobs: -1 } }
  );

  res.status(200).json({
    status: 'success',
    message: 'Job closed successfully',
    data: { job }
  });
});

// @desc    Change job status
// @route   PUT /api/jobs/:id/status
// @access  Private (Job owner only)
export const changeJobStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      status: 'error',
      message: 'Status is required'
    });
  }

  const validStatuses = ['open', 'in-progress', 'completed', 'closed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  let job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check ownership
  if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to change this job status'
    });
  }

  const oldStatus = job.status;
  job.status = status;

  // Handle status transitions
  if (status === 'open' && !job.publishedAt) {
    job.publishedAt = new Date();
  }

  if ((status === 'closed' || status === 'cancelled') && job.status !== oldStatus) {
    job.closedAt = new Date();
  }

  if (status === 'completed') {
    job.completedAt = new Date();
  }

  await job.save();

  // Update client profile based on status changes
  if ((oldStatus === 'open' || oldStatus === 'in-progress') && (status === 'closed' || status === 'completed' || status === 'cancelled')) {
    await ClientProfile.findOneAndUpdate(
      { user: job.client },
      { $inc: { activeJobs: -1 } }
    );
  } else if ((oldStatus === 'closed' || oldStatus === 'completed' || oldStatus === 'cancelled') && (status === 'open' || status === 'in-progress')) {
    await ClientProfile.findOneAndUpdate(
      { user: job.client },
      { $inc: { activeJobs: 1 } }
    );
  }

  // Emit socket event for real-time update
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('job_status_updated', {
        jobId: job._id,
        title: job.title,
        oldStatus,
        newStatus: status,
        timestamp: new Date()
      });
    }
  } catch (socketError) {
    console.log('[Socket] Job status update event failed (non-critical):', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    message: `Job status changed to ${status} successfully`,
    data: { job }
  });
});
