import crypto from 'crypto';
import User from '../models/User.js';
import { generateTokens, verifyRefreshToken } from '../utils/jwtUtils.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { sendEmail } from '../utils/emailService.js';
import { sendSms } from '../utils/smsService.js';

const createVerificationToken = () => {
  const token = crypto.randomBytes(20).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

const createVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, codeHash };
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req, res) => {
  const { email, phone, password, firstName, lastName, role, provider, providerUserId } = req.body;

  if (!email && !phone && !provider) {
    return res.status(400).json({
      status: 'error',
      message: 'Email, phone, or OAuth provider is required'
    });
  }

  if (!provider && !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Password is required for email/phone registration'
    });
  }

  const existingUser = await User.findOne({
    $or: [
      email ? { email } : null,
      phone ? { phone } : null,
      provider && providerUserId ? { 'oauthProviders.provider': provider, 'oauthProviders.providerUserId': providerUserId } : null
    ].filter(Boolean)
  });

  if (existingUser) {
    return res.status(400).json({
      status: 'error',
      message: 'User already exists with these credentials'
    });
  }

  const user = await User.create({
    email,
    phone,
    password,
    firstName,
    lastName,
    role: role || 'client',
    accountStatus: provider ? 'active' : 'pending_verification',
    emailVerified: Boolean(provider && email),
    isVerified: Boolean(provider),
    phoneVerified: false,
    oauthProviders: provider ? [{ provider, providerUserId, email }] : []
  });

  const { accessToken, refreshToken } = generateTokens(user._id, user.role);

  user.refreshToken = refreshToken;
  await user.save();

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.register',
    targetType: 'User',
    targetId: user._id,
    summary: 'User registration',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully',
    data: {
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accountStatus: user.accountStatus
      },
      accessToken,
      refreshToken
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res) => {
  const { email, phone, identifier, password, provider, providerUserId } = req.body;

  let query = {};

  if (provider && providerUserId) {
    query = { 'oauthProviders.provider': provider, 'oauthProviders.providerUserId': providerUserId };
  } else if (email || phone || identifier) {
    query = {
      $or: [
        email ? { email } : null,
        phone ? { phone } : null,
        identifier ? { email: identifier } : null,
        identifier ? { phone: identifier } : null
      ].filter(Boolean)
    };
  }

  if (!Object.keys(query).length) {
    return res.status(400).json({
      status: 'error',
      message: 'Login identifier is required'
    });
  }

  const user = await User.findOne(query).select('+password');

  if (!user) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid credentials'
    });
  }

  if (!user.isActive || ['suspended', 'closed'].includes(user.accountStatus)) {
    return res.status(401).json({
      status: 'error',
      message: 'Your account is not active'
    });
  }

  if (!provider) {
    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }
  }

  const { accessToken, refreshToken } = generateTokens(user._id, user.role);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  user.lastLoginIp = req.ip;
  user.lastLoginUserAgent = req.headers['user-agent'];
  await user.save();

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.login',
    targetType: 'User',
    targetId: user._id,
    summary: 'User login',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        accountStatus: user.accountStatus,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
      },
      accessToken,
      refreshToken
    }
  });
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      status: 'error',
      message: 'Refresh token required'
    });
  }

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id, user.role);

    // Update refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.status(200).json({
      status: 'success',
      data: tokens
    });

  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired refresh token'
    });
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res) => {
  // Clear refresh token
  req.user.refreshToken = null;
  await req.user.save();

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'auth.logout',
    targetType: 'User',
    targetId: req.user._id,
    summary: 'User logout',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// @desc    Update password
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    return res.status(401).json({
      status: 'error',
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  await logAuditEvent({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'auth.password_update',
    targetType: 'User',
    targetId: req.user._id,
    summary: 'Password updated',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully'
  });
});

// @desc    Request email verification
// @route   POST /api/auth/request-email-verification
// @access  Private
export const requestEmailVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.email) {
    return res.status(400).json({
      status: 'error',
      message: 'Email is required to verify'
    });
  }

  const { token, tokenHash } = createVerificationToken();
  user.emailVerification = {
    tokenHash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 30)
  };

  await user.save();

  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: 'Verify your email',
    text: `Verify your email: ${verifyUrl}`,
    html: `<p>Verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
  });

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.email_verification_requested',
    targetType: 'User',
    targetId: user._id,
    summary: 'Requested email verification',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Verification email sent',
    data: process.env.NODE_ENV === 'production' ? undefined : { token }
  });
});

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Private
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      status: 'error',
      message: 'Verification token is required'
    });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    _id: req.user._id,
    'emailVerification.tokenHash': tokenHash,
    'emailVerification.expiresAt': { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid or expired token'
    });
  }

  user.emailVerified = true;
  user.isVerified = true;
  user.emailVerification.verifiedAt = new Date();
  user.accountStatus = user.accountStatus === 'pending_verification' ? 'active' : user.accountStatus;
  await user.save();

  await sendSms({
    to: user.phone,
    body: `Your FreelancePro verification code is ${code}`
  });

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.email_verified',
    targetType: 'User',
    targetId: user._id,
    summary: 'Email verified',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully'
  });
});

// @desc    Request phone verification
// @route   POST /api/auth/request-phone-verification
// @access  Private
export const requestPhoneVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.phone) {
    return res.status(400).json({
      status: 'error',
      message: 'Phone number is required to verify'
    });
  }

  const { code, codeHash } = createVerificationCode();
  user.phoneVerification = {
    codeHash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 10)
  };
  await user.save();

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.phone_verification_requested',
    targetType: 'User',
    targetId: user._id,
    summary: 'Requested phone verification',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Verification code sent',
    data: process.env.NODE_ENV === 'production' ? undefined : { code }
  });
});

// @desc    Verify phone
// @route   POST /api/auth/verify-phone
// @access  Private
export const verifyPhone = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      status: 'error',
      message: 'Verification code is required'
    });
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  const user = await User.findOne({
    _id: req.user._id,
    'phoneVerification.codeHash': codeHash,
    'phoneVerification.expiresAt': { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid or expired code'
    });
  }

  user.phoneVerified = true;
  user.isVerified = true;
  user.phoneVerification.verifiedAt = new Date();
  user.accountStatus = user.accountStatus === 'pending_verification' ? 'active' : user.accountStatus;
  await user.save();

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.phone_verified',
    targetType: 'User',
    targetId: user._id,
    summary: 'Phone verified',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Phone verified successfully'
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: 'error',
      message: 'Email is required'
    });
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if user exists or not for security
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with this email, a password reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.passwordReset = {
    token: resetTokenHash,
    expiresAt: new Date(Date.now() + 3600000) // 1 hour
  };

  await user.save();

  // In production, send actual email
  // For now, just log the token (you can implement sendEmail later)
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  
  console.log(`Password reset URL: ${resetUrl}`);
  
  // TODO: Uncomment when email service is configured
  // await sendEmail({
  //   to: user.email,
  //   subject: 'Password Reset Request',
  //   html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p>`
  // });

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.forgot_password',
    targetType: 'User',
    targetId: user._id,
    summary: 'Password reset requested',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'If an account exists with this email, a password reset link has been sent'
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      status: 'error',
      message: 'Password is required'
    });
  }

  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    'passwordReset.token': resetTokenHash,
    'passwordReset.expiresAt': { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid or expired reset token'
    });
  }

  user.password = password;
  user.passwordReset = undefined;
  await user.save();

  await logAuditEvent({
    actor: user._id,
    actorRole: user.role,
    action: 'auth.password_reset',
    targetType: 'User',
    targetId: user._id,
    summary: 'Password reset completed',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Password reset successfully'
  });
});
