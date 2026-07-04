import crypto from 'crypto';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Proposal from '../models/Proposal.js';
import FreelancerProfile from '../models/FreelancerProfile.js';
import ClientProfile from '../models/ClientProfile.js';
import Contract from '../models/Contract.js';
import Payment from '../models/Payment.js';
import Dispute from '../models/Dispute.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken
} from '../utils/jwtUtils.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { getAuthCookieOptions } from '../utils/cookieOptions.js';

// =====================================================
// SUPER ADMIN AUTHENTICATION
// =====================================================

/**
 * @desc    Super Admin Login (separate from regular auth)
 * @route   POST /api/admin/login
 * @access  Public (but restricted to super_admin role)
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Email and password are required'
    });
  }

  // Find user with password field
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid credentials'
    });
  }

  // CRITICAL: Only allow super_admin role
  if (user.role !== 'super_admin') {
    // Log unauthorized admin access attempt
    await logAuditEvent({
      actor: user._id,
      actorRole: user.role,
      action: 'ADMIN_LOGIN_ATTEMPT_UNAUTHORIZED',
      targetType: 'User',
      targetId: user._id,
      summary: `Unauthorized admin login attempt by ${user.role} user`,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Super Admin only.'
    });
  }

  // Check if account is active
  if (!user.isActive || user.accountStatus !== 'active') {
    return res.status(401).json({
      status: 'error',
      message: 'Your account is not active.'
    });
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid credentials'
    });
  }

  // Generate tokens with super admin flag
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Update last login
  user.lastLogin = new Date();
  user.lastLoginIp = req.ip || req.connection.remoteAddress;
  user.lastLoginUserAgent = req.get('user-agent');
  user.refreshToken = hashToken(refreshToken);
  await user.save();

  res.cookie('accessToken', accessToken, getAuthCookieOptions(15 * 60 * 1000));
  res.cookie(
    'refreshToken',
    refreshToken,
    getAuthCookieOptions(7 * 24 * 60 * 60 * 1000)
  );

  // Log successful admin login
  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'ADMIN_LOGIN_SUCCESS',
    targetType: 'User',
    targetId: user._id,
    summary: 'Super Admin logged in successfully',
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        isSuperAdmin: true
      },
      accessToken,
      refreshToken
    }
  });
});

// =====================================================
// PLATFORM STATISTICS
// =====================================================

// @desc    Get platform statistics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
export const getPlatformStats = asyncHandler(async (req, res) => {
  // Calculate date ranges
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    clientCount,
    freelancerCount,
    newUsersThisMonth,
    activeUsers,
    totalJobs,
    openJobs,
    inProgressJobs,
    completedJobs,
    totalProposals,
    pendingProposals,
    totalContracts,
    activeContracts,
    completedContracts,
    totalPayments,
    completedPayments,
    totalRevenue,
    openDisputes,
    totalDisputes,
    totalReviews,
    averageRating
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'client' }),
    User.countDocuments({ role: 'freelancer' }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo } }),
    Job.countDocuments(),
    Job.countDocuments({ status: 'open' }),
    Job.countDocuments({ status: 'in-progress' }),
    Job.countDocuments({ status: 'completed' }),
    Proposal.countDocuments(),
    Proposal.countDocuments({ status: 'pending' }),
    Contract.countDocuments(),
    Contract.countDocuments({ status: 'active' }),
    Contract.countDocuments({ status: 'completed' }),
    Payment.countDocuments(),
    Payment.countDocuments({ status: 'completed' }),
    Payment.aggregate([
      { $match: { status: 'released' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Dispute.countDocuments({ status: 'open' }),
    Dispute.countDocuments(),
    Review.countDocuments(),
    Review.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ])
  ]);

  // Calculate platform commission
  const revenue = totalRevenue[0]?.total || 0;
  const platformFeePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || '10');
  const platformCommission = revenue * (platformFeePercent / 100);

  // Calculate average job value
  const avgJobValue = await Contract.aggregate([
    { $group: { _id: null, avgValue: { $avg: '$budget.amount' } } }
  ]);

  const stats = {
    users: {
      total: totalUsers,
      clients: clientCount,
      freelancers: freelancerCount,
      newThisMonth: newUsersThisMonth,
      active: activeUsers,
      verified: await User.countDocuments({ isVerified: true })
    },
    jobs: {
      total: totalJobs,
      open: openJobs,
      inProgress: inProgressJobs,
      completed: completedJobs
    },
    proposals: {
      total: totalProposals,
      pending: pendingProposals,
      accepted: await Proposal.countDocuments({ status: 'accepted' }),
      rejected: await Proposal.countDocuments({ status: 'rejected' })
    },
    contracts: {
      total: totalContracts,
      active: activeContracts,
      completed: completedContracts
    },
    financial: {
      totalRevenue: revenue,
      platformCommission: platformCommission,
      averageJobValue: avgJobValue[0]?.avgValue || 0,
      totalPayments: totalPayments,
      completedPayments: completedPayments
    },
    disputes: {
      open: openDisputes,
      total: totalDisputes,
      resolved: await Dispute.countDocuments({ status: 'resolved' })
    },
    reviews: {
      total: totalReviews,
      averageRating: averageRating[0]?.avgRating || 0,
      flagged: await Review.countDocuments({ isFlagged: true })
    }
  };

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
export const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, isActive, search } = req.query;

  const query = {};

  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';

  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Create user (admin)
// @route   POST /api/admin/users
// @access  Private (Super Admin only)
export const createUser = asyncHandler(async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    role = 'client',
    password,
    accountStatus = 'active'
  } = req.body;

  if (!email || !firstName || !lastName) {
    return res.status(400).json({
      status: 'error',
      message: 'Email, firstName, and lastName are required'
    });
  }

  if (!['client', 'freelancer'].includes(role)) {
    return res.status(400).json({
      status: 'error',
      message: 'Role must be client or freelancer'
    });
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(409).json({
      status: 'error',
      message: 'A user with this email already exists'
    });
  }

  const generatedPassword =
    password || crypto.randomBytes(10).toString('hex');

  const user = await User.create({
    email,
    firstName,
    lastName,
    role,
    password: generatedPassword,
    accountStatus,
    isActive: true
  });

  if (role === 'client') {
    await ClientProfile.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  if (role === 'freelancer') {
    await FreelancerProfile.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_CREATED_BY_ADMIN',
    targetType: 'User',
    targetId: user._id,
    summary: `Admin created user ${user.email}`,
    metadata: new Map([
      ['role', role],
      ['accountStatus', accountStatus],
      ['generatedPassword', password ? 'false' : 'true']
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({
    status: 'success',
    message: 'User created successfully',
    data: {
      user,
      ...(password ? {} : { generatedPassword })
    }
  });
});

// @desc    Update user status
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin only)
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive, isVerified, accountStatus, statusReason, kycStatus } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  // CRITICAL: Prevent modification of super admin
  if (user.role === 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Cannot modify super admin account'
    });
  }

  // Store old values for audit log
  const oldValues = {
    isActive: user.isActive,
    isVerified: user.isVerified,
    accountStatus: user.accountStatus,
    kycStatus: user.kyc?.status
  };

  if (isActive !== undefined) user.isActive = isActive;
  if (isVerified !== undefined) user.isVerified = isVerified;
  if (accountStatus) user.accountStatus = accountStatus;
  if (statusReason !== undefined) user.statusReason = statusReason;
  if (kycStatus) {
    user.kyc.status = kycStatus;
    user.kyc.updatedAt = new Date();
    if (kycStatus === 'verified') {
      user.kyc.verifiedAt = new Date();
    }
  }

  await user.save();

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_STATUS_UPDATED',
    targetType: 'User',
    targetId: user._id,
    summary: `Admin updated user status: ${user.email}`,
    metadata: new Map([
      ['oldValues', JSON.stringify(oldValues)],
      ['newValues', JSON.stringify({ isActive, isVerified, accountStatus, kycStatus })]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'User status updated',
    data: { user }
  });
});

// @desc    Approve or disapprove user registration / toggle active
// @route   PATCH /api/admin/users/:id/approval
// @access  Private (Admin only)
export const toggleUserApproval = asyncHandler(async (req, res) => {
  const { approved, active, statusReason } = req.body;

  if (approved === undefined && active === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'approved or active is required'
    });
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  if (user.role === 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Cannot modify super admin account'
    });
  }

  const oldValues = {
    isActive: user.isActive,
    accountStatus: user.accountStatus,
    statusReason: user.statusReason
  };

  if (approved !== undefined) {
    if (approved) {
      user.accountStatus = 'active';
      user.isActive = true;
      user.statusReason = undefined;
    } else {
      user.accountStatus = 'suspended';
      user.isActive = false;
      user.statusReason = statusReason || 'Registration disapproved';
    }
  }

  if (active !== undefined) {
    user.isActive = active;
    if (!active && !user.statusReason) {
      user.statusReason = statusReason || 'Account deactivated by admin';
    }
    if (active && user.accountStatus === 'suspended') {
      user.accountStatus = 'active';
    }
  }

  await user.save();

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_APPROVAL_TOGGLED',
    targetType: 'User',
    targetId: user._id,
    summary: `Admin toggled user approval: ${user.email}`,
    metadata: new Map([
      ['oldValues', JSON.stringify(oldValues)],
      ['newValues', JSON.stringify({
        approved,
        active,
        accountStatus: user.accountStatus,
        isActive: user.isActive,
        statusReason: user.statusReason
      })]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'User approval updated',
    data: { user }
  });
});

// @desc    Get audit logs
// @route   GET /api/admin/audit-logs
// @access  Private (Admin only)
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, actor, action, targetType } = req.query;

  const query = {};
  if (actor) query.actor = actor;
  if (action) query.action = action;
  if (targetType) query.targetType = targetType;

  const skip = (page - 1) * limit;

  const logs = await AuditLog.find(query)
    .populate('actor', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await AuditLog.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  // CRITICAL: Prevent deletion of super admin
  if (user.role === 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Super Admin account cannot be deleted'
    });
  }

  // Store user data for audit log
  const userData = {
    email: user.email,
    name: user.fullName,
    role: user.role
  };

  await user.deleteOne();

  // Also delete associated profiles
  if (user.role === 'freelancer') {
    await FreelancerProfile.findOneAndDelete({ user: user._id });
  } else if (user.role === 'client') {
    await ClientProfile.findOneAndDelete({ user: user._id });
  }

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_DELETED',
    targetType: 'User',
    targetId: req.params.id,
    summary: `Admin deleted user: ${userData.email}`,
    metadata: new Map([
      ['deletedUser', JSON.stringify(userData)]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'User deleted successfully'
  });
});

// @desc    Get all jobs (admin)
// @route   GET /api/admin/jobs
// @access  Private (Admin only)
export const getAllJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .populate('client', 'firstName lastName email')
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

// @desc    Create job (admin)
// @route   POST /api/admin/jobs
// @access  Private (Super Admin only)
export const createAdminJob = asyncHandler(async (req, res) => {
  const {
    clientId,
    title,
    description,
    category,
    budget,
    status = 'open',
    duration = '1-2-weeks',
    experienceLevel = 'intermediate'
  } = req.body;

  if (!title || !description || !category) {
    return res.status(400).json({
      status: 'error',
      message: 'title, description, and category are required'
    });
  }

  let client = null;

  if (clientId) {
    client = await User.findOne({ _id: clientId, role: 'client' });
  }

  if (!client) {
    client = await User.findOne({ role: 'client', isActive: true });
  }

  if (!client) {
    return res.status(400).json({
      status: 'error',
      message: 'No active client found. Pass a valid clientId.'
    });
  }

  const parsedBudget = Number(budget);

  const job = await Job.create({
    client: client._id,
    title,
    description,
    category,
    budget: {
      type: 'fixed',
      amount: Number.isFinite(parsedBudget) ? parsedBudget : 0,
      currency: 'INR'
    },
    duration,
    experienceLevel,
    status
  });

  await ClientProfile.findOneAndUpdate(
    { user: client._id },
    {
      $setOnInsert: { user: client._id },
      $inc: {
        totalJobs: 1,
        activeJobs: status === 'open' ? 1 : 0
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'JOB_CREATED_BY_ADMIN',
    targetType: 'Job',
    targetId: job._id,
    summary: `Admin created job ${job.title}`,
    metadata: new Map([
      ['clientId', String(client._id)],
      ['status', status]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({
    status: 'success',
    message: 'Job created successfully',
    data: { job }
  });
});

// @desc    Get job by ID
// @route   GET /api/admin/jobs/:id
// @access  Private (Admin only)
export const getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate('client', 'firstName lastName email avatar')
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

// @desc    Update job (Admin)
// @route   PUT /api/admin/jobs/:id
// @access  Private (Admin only)
export const updateAdminJob = asyncHandler(async (req, res) => {
  let job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  // Update allowed fields
  const updateFields = ['title', 'description', 'category', 'subCategory', 'skills', 'budget', 'duration', 'experienceLevel', 'visibility', 'status'];
  const updateData = {};

  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  if (updateData.budget !== undefined && !updateData.budget?.type) {
    const parsedBudget = Number(updateData.budget);

    updateData.budget = {
      type: job.budget?.type || 'fixed',
      amount: Number.isFinite(parsedBudget) ? parsedBudget : job.budget?.amount || 0,
      minAmount: job.budget?.minAmount,
      maxAmount: job.budget?.maxAmount,
      currency: job.budget?.currency || 'USD'
    };
  }

  job = await Job.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    message: 'Job updated successfully',
    data: { job }
  });
});

// @desc    Delete job (Admin)
// @route   DELETE /api/admin/jobs/:id
// @access  Private (Admin only)
export const deleteAdminJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
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

// @desc    Flag/unflag content
// @route   PUT /api/admin/jobs/:id/flag
// @access  Private (Admin only)
export const flagJob = asyncHandler(async (req, res) => {
  const isBodyString = typeof req.body === 'string';
  const isFlagged = isBodyString
    ? true
    : req.body?.isFlagged ?? true;
  const reason = isBodyString ? req.body : req.body?.reason;

  const job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: 'Job not found'
    });
  }

  job.flagged = {
    isFlagged,
    reason: isFlagged ? reason : null,
    flaggedAt: isFlagged ? new Date() : null
  };

  await job.save();

  res.status(200).json({
    status: 'success',
    message: `Job ${isFlagged ? 'flagged' : 'unflagged'} successfully`,
    data: { job }
  });
});

// @desc    Toggle freelancer featured status
// @route   PUT /api/admin/freelancers/:id/featured
// @access  Private (Admin only)
export const toggleFeatured = asyncHandler(async (req, res) => {
  const { isFeatured } = req.body;

  const profile = await FreelancerProfile.findById(req.params.id);

  if (!profile) {
    return res.status(404).json({
      status: 'error',
      message: 'Freelancer profile not found'
    });
  }

  profile.isFeatured =
    typeof isFeatured === 'boolean' ? isFeatured : !profile.isFeatured;
  await profile.save();

  res.status(200).json({
    status: 'success',
    message: `Freelancer ${profile.isFeatured ? 'featured' : 'unfeatured'}`,
    data: { profile }
  });
});

// =====================================================
// USER DETAILS & MANAGEMENT
// =====================================================

/**
 * @desc    Get single user details with full profile
 * @route   GET /api/admin/users/:id
 * @access  Private (Super Admin only)
 */
export const getUserDetails = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -refreshToken');

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  // Get additional profile data based on role
  let profile = null;
  if (user.role === 'freelancer') {
    profile = await FreelancerProfile.findOne({ user: user._id });
  } else if (user.role === 'client') {
    profile = await ClientProfile.findOne({ user: user._id });
  }

  // Get user's activity stats
  const stats = await getUserActivityStats(user._id, user.role);

  res.status(200).json({
    status: 'success',
    data: {
      user,
      profile,
      stats
    }
  });
});

/**
 * @desc    Update user data (admin override)
 * @route   PUT /api/admin/users/:id
 * @access  Private (Super Admin only)
 */
export const updateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const updates = req.body;

  // Prevent super admin role changes
  if (updates.role === 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Cannot change user role to super_admin via this endpoint'
    });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      status: 'error',
      message: 'User not found'
    });
  }

  // Prevent modification of super admin account
  if (user.role === 'super_admin' && user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Cannot modify super admin account'
    });
  }

  // Store old values for audit log
  const oldValues = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    accountStatus: user.accountStatus
  };

  // Update allowed fields
  const allowedUpdates = ['email', 'firstName', 'lastName', 'role', 'accountStatus', 'statusReason', 'isVerified'];
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key)) {
      user[key] = updates[key];
    }
  });

  await user.save();

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_UPDATED',
    targetType: 'User',
    targetId: user._id,
    summary: `Admin updated user ${user.email}`,
    metadata: new Map([
      ['oldValues', JSON.stringify(oldValues)],
      ['newValues', JSON.stringify(updates)]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// =====================================================
// PROPOSAL MANAGEMENT
// =====================================================

/**
 * @desc    Get all proposals with admin filters
 * @route   GET /api/admin/proposals
 * @access  Private (Super Admin only)
 */
export const getAllProposals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    filter.status = status;
  }

  if (search) {
    filter.$or = [
      { coverLetter: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [proposals, total] = await Promise.all([
    Proposal.find(filter)
      .populate('freelancer', 'firstName lastName email')
      .populate('job', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Proposal.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Update proposal (admin override)
 * @route   PUT /api/admin/proposals/:id
 * @access  Private (Super Admin only)
 */
export const updateProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  const { status, coverLetter, proposedBudget, deliveryTime } = req.body;

  if (status !== undefined) proposal.status = status;
  if (coverLetter !== undefined) proposal.coverLetter = coverLetter;

  if (proposedBudget && typeof proposedBudget === 'object') {
    proposal.proposedBudget = {
      ...proposal.proposedBudget,
      ...proposedBudget
    };
  }

  if (deliveryTime && typeof deliveryTime === 'object') {
    proposal.deliveryTime = {
      ...proposal.deliveryTime,
      ...deliveryTime
    };
  }

  await proposal.save();

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'PROPOSAL_UPDATED_BY_ADMIN',
    targetType: 'Proposal',
    targetId: proposal._id,
    summary: 'Admin updated proposal',
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Proposal updated successfully',
    data: { proposal }
  });
});

/**
 * @desc    Delete proposal (admin override)
 * @route   DELETE /api/admin/proposals/:id
 * @access  Private (Super Admin only)
 */
export const deleteProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) {
    return res.status(404).json({
      status: 'error',
      message: 'Proposal not found'
    });
  }

  const proposalData = {
    id: proposal._id,
    freelancer: proposal.freelancer,
    job: proposal.job
  };

  await Proposal.findByIdAndDelete(req.params.id);

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'PROPOSAL_DELETED',
    targetType: 'Proposal',
    targetId: req.params.id,
    summary: 'Admin deleted proposal',
    metadata: new Map([
      ['deletedProposal', JSON.stringify(proposalData)]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Proposal deleted successfully'
  });
});

// =====================================================
// CONTRACT MANAGEMENT
// =====================================================

/**
 * @desc    Get all contracts with admin filters
 * @route   GET /api/admin/contracts
 * @access  Private (Super Admin only)
 */
export const getAllContracts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    filter.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .populate('client', 'firstName lastName email')
      .populate('freelancer', 'firstName lastName email')
      .populate('job', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Contract.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      contracts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Update contract (admin override)
 * @route   PUT /api/admin/contracts/:id
 * @access  Private (Super Admin only)
 */
export const updateContract = asyncHandler(async (req, res) => {
  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const {
    title,
    description,
    terms,
    endDate,
    status,
    budget
  } = req.body;

  if (title !== undefined) contract.title = title;
  if (description !== undefined) contract.description = description;
  if (terms !== undefined) contract.terms = terms;
  if (endDate !== undefined) contract.endDate = endDate;
  if (status !== undefined) contract.status = status;

  if (budget && typeof budget === 'object') {
    contract.budget = {
      ...contract.budget,
      ...budget
    };
  }

  await contract.save();

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'CONTRACT_UPDATED_BY_ADMIN',
    targetType: 'Contract',
    targetId: contract._id,
    summary: 'Admin updated contract',
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Contract updated successfully',
    data: { contract }
  });
});

/**
 * @desc    Update contract status (admin override)
 * @route   PATCH /api/admin/contracts/:id/status
 * @access  Private (Super Admin only)
 */
export const updateContractStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const oldStatus = contract.status;
  contract.status = status;
  
  if (status === 'cancelled' && reason) {
    contract.cancellationReason = reason;
  }

  await contract.save();

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'CONTRACT_STATUS_CHANGED',
    targetType: 'Contract',
    targetId: contract._id,
    summary: `Admin changed contract status from ${oldStatus} to ${status}`,
    metadata: new Map([
      ['oldStatus', oldStatus],
      ['newStatus', status],
      ['reason', reason || 'No reason provided']
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    data: { contract }
  });
});

// =====================================================
// PAYMENT MANAGEMENT
// =====================================================

/**
 * @desc    Get all payments with admin filters
 * @route   GET /api/admin/payments
 * @access  Private (Super Admin only)
 */
export const getAllPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    filter.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'firstName lastName email')
      .populate('freelancer', 'firstName lastName email')
      .populate('contract', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Payment.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Override payment status (admin emergency control)
 * @route   PATCH /api/admin/payments/:id/override
 * @access  Private (Super Admin only)
 */
export const overridePaymentStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  if (!['released', 'refunded', 'held'].includes(status)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid payment status'
    });
  }

  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    return res.status(404).json({
      status: 'error',
      message: 'Payment not found'
    });
  }

  const oldStatus = payment.status;
  payment.status = status;
  payment.adminOverride = {
    status: true,
    reason: reason || 'Admin override',
    overriddenBy: req.user._id,
    overriddenAt: new Date()
  };

  await payment.save();

  // Log critical admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'PAYMENT_OVERRIDE',
    targetType: 'Payment',
    targetId: payment._id,
    summary: `CRITICAL: Admin overrode payment status from ${oldStatus} to ${status}`,
    metadata: new Map([
      ['oldStatus', oldStatus],
      ['newStatus', status],
      ['amount', payment.amount.toString()],
      ['reason', reason || 'No reason provided']
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Payment status overridden. This action has been logged.',
    data: { payment }
  });
});

// =====================================================
// DISPUTE MANAGEMENT (ENHANCED)
// =====================================================

/**
 * @desc    Get all disputes with admin filters
 * @route   GET /api/admin/disputes
 * @access  Private (Super Admin only)
 */
export const getAllDisputes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    filter.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [disputes, total] = await Promise.all([
    Dispute.find(filter)
      .populate('contract')
      .populate('raisedBy', 'firstName lastName email role')
      .populate('againstUser', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Dispute.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      disputes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Resolve dispute with admin decision
 * @route   PATCH /api/admin/disputes/:id/resolve
 * @access  Private (Super Admin only)
 */
export const resolveDispute = asyncHandler(async (req, res) => {
  const { resolution, decision, notes } = req.body;

  const dispute = await Dispute.findById(req.params.id);

  if (!dispute) {
    return res.status(404).json({
      status: 'error',
      message: 'Dispute not found'
    });
  }

  dispute.status = 'resolved';
  dispute.resolution = resolution;
  dispute.decision = decision; // 'favor_client', 'favor_freelancer', 'split'
  dispute.adminNotes = notes;
  dispute.resolvedBy = req.user._id;
  dispute.resolvedAt = new Date();

  await dispute.save();

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'DISPUTE_RESOLVED',
    targetType: 'Dispute',
    targetId: dispute._id,
    summary: `Admin resolved dispute with decision: ${decision}`,
    metadata: new Map([
      ['decision', decision],
      ['resolution', resolution]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    data: { dispute }
  });
});

// =====================================================
// REVIEW MANAGEMENT
// =====================================================

/**
 * @desc    Get all reviews with admin filters
 * @route   GET /api/admin/reviews
 * @access  Private (Super Admin only)
 */
export const getAllReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, flagged } = req.query;

  const filter = {};
  if (flagged === 'true') {
    filter.isFlagged = true;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('reviewer', 'firstName lastName email')
      .populate('reviewee', 'firstName lastName email')
      .populate('contract', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Delete review (admin override)
 * @route   DELETE /api/admin/reviews/:id
 * @access  Private (Super Admin only)
 */
export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({
      status: 'error',
      message: 'Review not found'
    });
  }

  const reviewData = {
    reviewer: review.reviewer,
    reviewee: review.reviewee,
    rating: review.rating
  };

  await Review.findByIdAndDelete(req.params.id);

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'REVIEW_DELETED',
    targetType: 'Review',
    targetId: req.params.id,
    summary: 'Admin deleted review',
    metadata: new Map([
      ['deletedReview', JSON.stringify(reviewData)]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Review deleted successfully'
  });
});

// =====================================================
// PLATFORM SETTINGS
// =====================================================

/**
 * @desc    Get platform settings
 * @route   GET /api/admin/settings
 * @access  Private (Super Admin only)
 */
export const getPlatformSettings = asyncHandler(async (req, res) => {
  const settings = {
    platformFee: process.env.PLATFORM_FEE_PERCENT || '10',
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    registrationOpen: process.env.REGISTRATION_OPEN !== 'false',
    stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
    emailProvider: process.env.EMAIL_PROVIDER || 'none',
    smsProvider: process.env.SMS_PROVIDER || 'none'
  };

  res.status(200).json({
    status: 'success',
    data: { settings }
  });
});

// =====================================================
// NOTIFICATION BROADCASTING (FIXED)
// =====================================================

/**
 * @desc    Send system-wide notification
 * @route   POST /api/admin/notifications/broadcast
 * @access  Private (Super Admin only)
 */
export const broadcastNotification = asyncHandler(async (req, res) => {

  const { title, message, targetRole } = req.body;

  // Validate input
  if (!title || !message) {
    return res.status(400).json({
      status: "error",
      message: "Title and message are required"
    });
  }

  // Build filter for target users
  const userFilter = {};

  if (targetRole && targetRole !== "all") {
    userFilter.role = targetRole;
  }

  // Fetch users
  const users = await User.find(userFilter).select("_id");

  if (!users.length) {
    return res.status(404).json({
      status: "error",
      message: "No users found to receive notification"
    });
  }

  // Create notification objects
  const notifications = users.map((user) => ({
    recipient: user._id,
    type: "system_announcement",
    title,
    message,
    priority: "high",
    isRead: false
  }));

  // Insert all notifications
  await Notification.insertMany(notifications);

  // Socket broadcast (if enabled)
  const socketBroadcast = req.app.get("socketBroadcast");

  if (socketBroadcast && socketBroadcast.broadcastSystemNotification) {
    socketBroadcast.broadcastSystemNotification({
      title,
      message,
      type: "system_announcement"
    });
  }

  // Log admin action
  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: "BROADCAST_NOTIFICATION",
    targetType: "System",
    summary: `Admin broadcasted notification to ${users.length} users`,
    metadata: new Map([
      ["title", title],
      ["recipientCount", users.length.toString()],
      ["targetRole", targetRole || "all"]
    ]),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent")
  });

  res.status(200).json({
    status: "success",
    message: `Notification sent to ${users.length} users`,
    data: {
      recipientCount: users.length
    }
  });

});

// =====================================================
// RECENT ACTIVITY
// =====================================================

/**
 * @desc    Get recent platform activity
 * @route   GET /api/admin/activity
 * @access  Private (Super Admin only)
 */
export const getRecentActivity = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  const activity = await AuditLog.find()
    .populate('actor', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    status: 'success',
    data: { activity }
  });
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function getUserActivityStats(userId, role) {
  const stats = {};

  if (role === 'client') {
    [stats.jobsPosted, stats.contractsCreated, stats.totalSpent] = await Promise.all([
      Job.countDocuments({ client: userId }),
      Contract.countDocuments({ client: userId }),
      Payment.aggregate([
        { $match: { client: userId, status: 'released' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(res => res[0]?.total || 0)
    ]);
  } else if (role === 'freelancer') {
    [stats.proposalsSubmitted, stats.contractsCompleted, stats.totalEarned] = await Promise.all([
      Proposal.countDocuments({ freelancer: userId }),
      Contract.countDocuments({ freelancer: userId, status: 'completed' }),
      Payment.aggregate([
        { $match: { freelancer: userId, status: 'released' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(res => res[0]?.total || 0)
    ]);
  }

  return stats;
}
