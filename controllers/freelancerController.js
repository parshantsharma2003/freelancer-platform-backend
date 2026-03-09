import FreelancerProfile from '../models/FreelancerProfile.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Create/Update freelancer profile
// @route   POST /api/freelancers/profile
// @access  Private (Freelancers only)
export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const profileData = { ...req.body, user: req.user._id };

  let profile = await FreelancerProfile.findOne({ user: req.user._id });

  if (profile) {
    // Update existing profile
    profile = await FreelancerProfile.findOneAndUpdate(
      { user: req.user._id },
      profileData,
      { new: true, runValidators: true }
    );
    profile.calculateCompleteness();
    await profile.save();
  } else {
    // Create new profile
    profile = await FreelancerProfile.create(profileData);
    profile.calculateCompleteness();
    await profile.save();
  }

  res.status(200).json({
    status: 'success',
    message: 'Profile saved successfully',
    data: { profile }
  });
});

// @desc    Get freelancer profile
// @route   GET /api/freelancers/profile
// @access  Private
export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await FreelancerProfile.findOne({ user: req.user._id }).populate('user', 'firstName lastName email avatar');

  if (!profile) {
    return res.status(404).json({
      status: 'error',
      message: 'Profile not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { profile }
  });
});

// @desc    Get all freelancers
// @route   GET /api/freelancers
// @access  Public
export const getFreelancers = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    skills, 
    category,
    minRate,
    maxRate,
    rating,
    search,
    visibility
  } = req.query;

  const query = { visibility: 'public' };

  if (visibility) {
    query.visibility = visibility;
  }

  if (skills) {
    query.skills = { $in: skills.split(',') };
  }

  if (category) {
    query.categories = category;
  }

  if (minRate || maxRate) {
    query.hourlyRate = {};
    if (minRate) query.hourlyRate.$gte = parseFloat(minRate);
    if (maxRate) query.hourlyRate.$lte = parseFloat(maxRate);
  }

  if (rating) {
    query.rating = { $gte: parseFloat(rating) };
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { skills: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const freelancers = await FreelancerProfile.find(query)
    .populate('user', 'firstName lastName avatar')
    .sort({ rating: -1, totalJobs: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await FreelancerProfile.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      freelancers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get freelancer by ID
// @route   GET /api/freelancers/:id
// @access  Public
export const getFreelancerById = asyncHandler(async (req, res) => {
  const profile = await FreelancerProfile.findById(req.params.id)
    .populate('user', 'firstName lastName email avatar createdAt');

  if (!profile) {
    return res.status(404).json({
      status: 'error',
      message: 'Freelancer not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { profile }
  });
});

// @desc    Get featured freelancers
// @route   GET /api/freelancers/featured
// @access  Public
export const getFeaturedFreelancers = asyncHandler(async (req, res) => {
  const freelancers = await FreelancerProfile.find({ 
    isFeatured: true,
    profileCompleteness: { $gte: 70 },
    visibility: 'public'
  })
    .populate('user', 'firstName lastName avatar')
    .sort({ rating: -1 })
    .limit(10);

  res.status(200).json({
    status: 'success',
    data: { freelancers }
  });
});

// @desc    Get top rated freelancers
// @route   GET /api/freelancers/top-rated
// @access  Public
export const getTopRatedFreelancers = asyncHandler(async (req, res) => {
  const freelancers = await FreelancerProfile.find({ 
    isTopRated: true,
    rating: { $gte: 4.5 }
  })
    .populate('user', 'firstName lastName avatar')
    .sort({ rating: -1, totalJobs: -1 })
    .limit(20);

  res.status(200).json({
    status: 'success',
    data: { freelancers }
  });
});
