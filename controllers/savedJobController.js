import User from '../models/User.js';
import Job from '../models/Job.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Save a job (bookmark)
// @route   POST /api/freelancers/saved-jobs/:jobId
// @access  Private (Freelancers only)
export const saveJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  // Check if job exists
  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Check if already saved
  if (req.user.savedJobs && req.user.savedJobs.includes(jobId)) {
    return res.status(400).json({
      status: 'error',
      message: 'Job already saved'
    });
  }

  // Add to saved jobs
  req.user.savedJobs = req.user.savedJobs || [];
  req.user.savedJobs.push(jobId);
  await req.user.save();

  res.status(200).json({
    status: 'success',
    message: 'Job saved successfully',
    data: { jobId }
  });
});

// @desc    Unsave a job (remove bookmark)
// @route   DELETE /api/freelancers/saved-jobs/:jobId
// @access  Private (Freelancers only)
export const unsaveJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  // Remove from saved jobs
  if (!req.user.savedJobs || !req.user.savedJobs.includes(jobId)) {
    return res.status(400).json({
      status: 'error',
      message: 'Job not in saved list'
    });
  }

  req.user.savedJobs = req.user.savedJobs.filter(id => id.toString() !== jobId);
  await req.user.save();

  res.status(200).json({
    status: 'success',
    message: 'Job removed from saved list',
    data: { jobId }
  });
});

// @desc    Get all saved jobs for freelancer
// @route   GET /api/freelancers/saved-jobs
// @access  Private (Freelancers only)
export const getSavedJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, category } = req.query;

  if (!req.user.savedJobs || req.user.savedJobs.length === 0) {
    return res.status(200).json({
      status: 'success',
      data: {
        jobs: [],
        pagination: { total: 0, page: 1, pages: 0 }
      }
    });
  }

  const query = { _id: { $in: req.user.savedJobs }, status: 'open' };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (category) {
    query.category = category;
  }

  const skip = (page - 1) * limit;
  const total = await Job.countDocuments(query);

  const jobs = await Job.find(query)
    .populate('client', 'firstName lastName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.status(200).json({
    status: 'success',
    data: {
      jobs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Check if job is saved
// @route   GET /api/freelancers/saved-jobs/:jobId/check
// @access  Private (Freelancers only)
export const checkJobSaved = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const isSaved = req.user.savedJobs && req.user.savedJobs.includes(jobId);

  res.status(200).json({
    status: 'success',
    data: { saved: isSaved }
  });
});
