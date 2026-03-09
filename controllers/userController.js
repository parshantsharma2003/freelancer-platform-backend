import User from '../models/User.js';
import FreelancerProfile from '../models/FreelancerProfile.js';
import ClientProfile from '../models/ClientProfile.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = asyncHandler(async (req, res) => {
  let profile = null;

  if (req.user.role === 'freelancer') {
    profile = await FreelancerProfile.findOne({ user: req.user._id });
  } else if (req.user.role === 'client') {
    profile = await ClientProfile.findOne({ user: req.user._id });
  }

  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
      profile
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, avatar } = req.body;

  const user = await User.findById(req.user._id);

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (avatar) user.avatar = avatar;

  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Profile updated successfully',
    data: { user }
  });
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Public
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  let profile = null;

  if (user.role === 'freelancer') {
    profile = await FreelancerProfile.findOne({ user: user._id });
  } else if (user.role === 'client') {
    profile = await ClientProfile.findOne({ user: user._id });
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
      profile
    }
  });
});

// @desc    Delete account
// @route   DELETE /api/users/account
// @access  Private
export const deleteAccount = asyncHandler(async (req, res) => {
  // Soft delete - deactivate account
  req.user.isActive = false;
  await req.user.save();

  res.status(200).json({
    status: 'success',
    message: 'Account deactivated successfully'
  });
});
