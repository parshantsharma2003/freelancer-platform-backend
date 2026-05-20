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
  const { firstName, lastName, avatar, phone } = req.body;

  const user = await User.findById(req.user._id);

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (avatar) user.avatar = avatar;
  if (phone !== undefined) {
    const normalizedPhone = String(phone || '').trim();

    if (normalizedPhone && normalizedPhone !== user.phone) {
      const existingPhoneUser = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } });
      if (existingPhoneUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is already in use'
        });
      }

      user.phone = normalizedPhone;
      user.phoneVerified = false;
      user.phoneVerification = {
        codeHash: null,
        expiresAt: null,
        verifiedAt: null
      };
      user.isVerified = Boolean(user.emailVerified || user.phoneVerified);
    } else if (!normalizedPhone) {
      user.phone = null;
      user.phoneVerified = false;
      user.phoneVerification = {
        codeHash: null,
        expiresAt: null,
        verifiedAt: null
      };
      user.isVerified = Boolean(user.emailVerified || user.phoneVerified);
    }
  }

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

// @desc    Get freelancer wallet summary
// @route   GET /api/users/wallet
// @access  Private (Freelancer only)
export const getWalletSummary = asyncHandler(async (req, res) => {
  if (req.user.role !== 'freelancer') {
    return res.status(403).json({
      status: 'error',
      message: 'Freelancers only'
    });
  }

  const user = await User.findById(req.user._id).select('wallet stripeConnect');

  res.status(200).json({
    status: 'success',
    data: {
      wallet: {
        availableBalance: Number(user?.wallet?.availableBalance || 0),
        pendingBalance: Number(user?.wallet?.pendingBalance || 0),
        totalEarnings: Number(user?.wallet?.totalEarnings || 0),
        lastUpdatedAt: user?.wallet?.lastUpdatedAt || null
      },
      stripeConnect: user?.stripeConnect || null
    }
  });
});

// @desc    Withdraw from freelancer wallet
// @route   POST /api/users/wallet/withdraw
// @access  Private (Freelancer only)
export const requestWalletWithdrawal = asyncHandler(async (req, res) => {
  if (req.user.role !== 'freelancer') {
    return res.status(403).json({
      status: 'error',
      message: 'Freelancers only'
    });
  }

  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Withdrawal amount must be a valid positive number'
    });
  }

  const user = await User.findById(req.user._id).select('wallet stripeConnect');

  if (!user?.stripeConnect?.accountId || !user?.stripeConnect?.payoutsEnabled) {
    return res.status(400).json({
      status: 'error',
      message: 'Complete Stripe payouts setup before withdrawing funds'
    });
  }

  const availableBalance = Number(user?.wallet?.availableBalance || 0);

  if (amount > availableBalance) {
    return res.status(400).json({
      status: 'error',
      message: 'Insufficient wallet balance'
    });
  }

  user.wallet.availableBalance = availableBalance - amount;
  user.wallet.pendingBalance = Number(user?.wallet?.pendingBalance || 0) + amount;
  user.wallet.lastUpdatedAt = new Date();
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Withdrawal request submitted successfully',
    data: {
      withdrawnAmount: amount,
      wallet: user.wallet
    }
  });
});

// @desc    Get fraud risk score
// @route   GET /api/users/fraud-score
// @access  Private
export const getFraudScore = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      riskScore: user.fraud?.riskScore || 0
    }
  });
});
