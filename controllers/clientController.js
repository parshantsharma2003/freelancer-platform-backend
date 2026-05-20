import ClientProfile from '../models/ClientProfile.js';
import Job from '../models/Job.js';
import Contract from '../models/Contract.js';
import Proposal from '../models/Proposal.js';
import Payment from '../models/Payment.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Create/Update client profile
// @route   POST /api/clients/profile
// @access  Private (Clients only)
export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const profileData = { ...req.body, user: req.user._id };

  let profile = await ClientProfile.findOne({ user: req.user._id });

  if (profile) {
    profile = await ClientProfile.findOneAndUpdate(
      { user: req.user._id },
      profileData,
      { new: true, runValidators: true }
    );
  } else {
    profile = await ClientProfile.create(profileData);
  }

  profile.calculateCompleteness({ hasAvatar: !!req.user?.avatar });
  await profile.save();

  res.status(200).json({
    status: 'success',
    message: 'Profile saved successfully',
    data: { profile }
  });
});

// @desc    Get client profile
// @route   GET /api/clients/profile
// @access  Private
export const getMyProfile = asyncHandler(async (req, res) => {
  let profile = await ClientProfile.findOne({ user: req.user._id }).populate('user', 'firstName lastName email avatar');

  if (!profile) {
    profile = await ClientProfile.create({ user: req.user._id });
    profile = await ClientProfile.findById(profile._id).populate('user', 'firstName lastName email avatar');
  }

  const existingScore = profile.profileCompleteness;
  const nextScore = profile.calculateCompleteness({ hasAvatar: !!profile?.user?.avatar });
  if (existingScore !== nextScore) {
    await profile.save();
  }

  res.status(200).json({
    status: 'success',
    data: { profile }
  });
});

// @desc    Get client by ID
// @route   GET /api/clients/:id
// @access  Public
export const getClientById = asyncHandler(async (req, res) => {
  const profile = await ClientProfile.findById(req.params.id)
    .populate('user', 'firstName lastName email avatar createdAt');

  if (!profile) {
    return res.status(404).json({
      status: 'error',
      message: 'Client not found'
    });
  }

  profile.calculateCompleteness({ hasAvatar: !!profile?.user?.avatar });

  res.status(200).json({
    status: 'success',
    data: { profile }
  });
});

// @desc    Get client analytics
// @route   GET /api/clients/analytics/dashboard
// @access  Private (Clients only)
export const getClientAnalytics = asyncHandler(async (req, res) => {
  const clientId = req.user._id;

  // Fetch total jobs posted
  const jobsPosted = await Job.countDocuments({ 
    client: clientId,
    status: { $ne: 'draft' }
  });

  // Fetch active contracts count
  const activeContracts = await Contract.countDocuments({ 
    client: clientId,
    status: { $in: ['active', 'in-progress', 'paused'] }
  });

  // Fetch proposals received count
  const proposalsReceived = await Proposal.countDocuments({
    job: {
      $in: await Job.find({ client: clientId }).select('_id').lean().then(jobs => jobs.map(j => j._id))
    },
    status: { $in: ['pending', 'under-review'] }
  });

  // Fetch total spent from payments
  const paymentsData = await Payment.aggregate([
    {
      $match: {
        'clientDetails.clientId': clientId,
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$amount' }
      }
    }
  ]);

  const totalSpent = paymentsData.length > 0 ? paymentsData[0].totalSpent : 0;

  res.status(200).json({
    status: 'success',
    data: {
      analytics: {
        jobsPosted,
        totalSpent,
        activeContracts,
        proposalsReceived
      }
    }
  });
});

