import crypto from "crypto";
import User from "../models/User.js";
import {
  generateTokens,
  generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken
} from "../utils/jwtUtils.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { sendEmail } from "../utils/emailService.js";
import { sendSms } from "../utils/smsService.js";
import { calculateRiskScore } from "../services/fraudService.js";
import {
  getAuthCookieOptions,
  getClearAuthCookieOptions
} from "../utils/cookieOptions.js";
import { deleteOtpData, getOtpData, getTtlSeconds, setOtpData } from "../utils/otpStore.js";

const frontendBaseUrl = (
  process.env.FRONTEND_URL ||
  process.env.OAUTH_SUCCESS_REDIRECT ||
  "https://gentle-stone-05625c900.7.azurestaticapps.net"
).replace(/\/+$/, "");

const createVerificationToken = () => {
  const token = crypto.randomBytes(20).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
};

const createVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, codeHash };
};

const OTP_TTL_SECONDS = 10 * 60;
const OTP_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_SECONDS = 15 * 60;

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const createEmailOtp = () => {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  return { otp, otpHash };
};

const getOtpKeys = (email, flow = 'login') => ({
  otpKey: `auth:${flow}_otp:${email}`,
  cooldownKey: `auth:${flow}_otp:cooldown:${email}`,
  lockKey: `auth:${flow}_otp:lock:${email}`
});

const getPendingRegistrationKey = (email) => `auth:registration_pending:${email}`;

const sendOtpEmail = async ({ user, otp, purpose }) => {
  const subject = purpose === 'login'
    ? 'Your FreelancePro login code'
    : 'Verify your FreelancePro account';

  await sendEmail({
    to: user.email,
    subject,
    template: purpose === 'login' ? 'login-otp' : 'verification-otp',
    templateData: {
      name: user.firstName || user.email,
      otp,
      purpose,
      expiresInMinutes: Math.round(OTP_TTL_SECONDS / 60)
    }
  });
};

const queueOtpChallenge = async ({ user, purpose = 'login' }) => {
  const email = normalizeEmail(user.email);
  const { otpKey, cooldownKey, lockKey } = getOtpKeys(email, purpose);

  const lockTtl = await getTtlSeconds(lockKey);
  if (lockTtl > 0) {
    return {
      ok: false,
      statusCode: 429,
      message: `Too many failed attempts. Try again in ${lockTtl}s`
    };
  }

  const cooldownTtl = await getTtlSeconds(cooldownKey);
  if (cooldownTtl > 0) {
    return {
      ok: false,
      statusCode: 429,
      message: `Please wait ${cooldownTtl}s before requesting a new OTP`
    };
  }

  const { otp, otpHash } = createEmailOtp();

  await setOtpData(
    otpKey,
    {
      email,
      purpose,
      otpHash,
      attempts: 0,
      createdAt: new Date().toISOString()
    },
    OTP_TTL_SECONDS
  );

  await setOtpData(cooldownKey, { sent: true }, OTP_COOLDOWN_SECONDS);
  await sendOtpEmail({ user, otp, purpose });

  return {
    ok: true,
    otp,
    otpKey,
    purpose,
    email
  };
};

const splitFullName = (fullName = '', fallbackFirstName = '', fallbackLastName = '') => {
  if (fallbackFirstName || fallbackLastName) {
    return {
      firstName: String(fallbackFirstName || '').trim(),
      lastName: String(fallbackLastName || '').trim()
    };
  }

  const cleaned = String(fullName).trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ').filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '-' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

export const register = asyncHandler(async (req, res) => {
  const { fullName, firstName: rawFirstName, lastName: rawLastName, email, phone, password, role } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const { firstName, lastName } = splitFullName(fullName, rawFirstName, rawLastName);

  if (!role) {
    return res.status(400).json({
      status: "error",
      message: "Role is required"
    });
  }

  if (!firstName || !lastName) {
    return res.status(400).json({
      status: "error",
      message: "Full name is required"
    });
  }

  const existingUser = await User.findOne({
    $or: [normalizedEmail ? { email: normalizedEmail } : null, phone ? { phone } : null].filter(Boolean)
  });

  if (existingUser) {
    return res.status(400).json({
      status: "error",
      message: "User already exists"
    });
  }

  const pendingRegistrationKey = getPendingRegistrationKey(normalizedEmail);
  const existingPendingRegistration = await getOtpData(pendingRegistrationKey);

  if (existingPendingRegistration) {
    return res.status(409).json({
      status: "error",
      message: "Verification is already pending for this email. Please check your inbox or resend the OTP."
    });
  }

  await setOtpData(
    pendingRegistrationKey,
    {
      email: normalizedEmail,
      phone: phone || undefined,
      password,
      firstName,
      lastName,
      role,
      createdAt: new Date().toISOString()
    },
    OTP_TTL_SECONDS
  );

  const challenge = await queueOtpChallenge({
    user: {
      email: normalizedEmail,
      firstName,
      lastName,
    },
    purpose: 'registration'
  });

  if (!challenge.ok) {
    await deleteOtpData(pendingRegistrationKey);

    return res.status(challenge.statusCode).json({
      status: "error",
      message: challenge.message
    });
  }

  res.status(201).json({
    status: "success",
    message: "Verification OTP sent. Your account will be created after the OTP is verified.",
    data: {
      requiresEmailVerification: true,
      pendingRegistration: true,
      verificationMethod: "otp",
      email: normalizedEmail,
      otpExpiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
      ...(process.env.NODE_ENV === "production" ? {} : { verificationOtp: challenge.otp })
    }
  });
});

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Email and password are required"
    });
  }

  const user = await User.findOne({ email }).select("+password +refreshToken");

  if (!user) {
    return res.status(401).json({
      status: "error",
      message: "Invalid credentials"
    });
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(401).json({
      status: "error",
      message: "Invalid credentials"
    });
  }

  if (user.email && !user.emailVerified) {
    const challenge = await queueOtpChallenge({ user, purpose: 'verification' });

    if (!challenge.ok) {
      return res.status(challenge.statusCode).json({
        status: "error",
        message: challenge.message
      });
    }

    return res.status(403).json({
      status: "error",
      message: "Please verify your email with the OTP we sent",
      data: {
        requiresEmailVerification: true,
        verificationMethod: "otp",
        email: user.email,
        otpExpiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
        ...(process.env.NODE_ENV === "production" ? {} : { verificationOtp: challenge.otp })
      }
    });
  }

  // --- Fraud Check Logic ---
  const risk = calculateRiskScore(user);
  
  // Ensure the fraud object exists on the user model before assignment
  if (!user.fraud) user.fraud = {};
  user.fraud.riskScore = risk;

  if (risk > 80) {
    return res.status(403).json({
      status: "error",
      message: "Account flagged for fraud review"
    });
  }
  // -------------------------

  const { accessToken, refreshToken } = generateTokens(user._id, user.role);

  user.refreshToken = hashToken(refreshToken);
  user.lastLogin = new Date();
  user.lastLoginIp = req.ip;
  user.lastLoginUserAgent = req.headers["user-agent"];

  await user.save();

  res.cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000));

  res.cookie(
    "refreshToken",
    refreshToken,
    getAuthCookieOptions(7 * 24 * 60 * 60 * 1000)
  );

  res.json({
    status: "success",
    data: { user, accessToken, refreshToken }
  });
});

/*
|--------------------------------------------------------------------------
| SESSION STATUS
|--------------------------------------------------------------------------
*/

export const getSessionStatus = asyncHandler(async (req, res) => {
  const accessToken = req.cookies?.accessToken;
  const refreshTokenValue = req.cookies?.refreshToken;

  const clearAndReturnAnonymous = () => {
    const clearOptions = getClearAuthCookieOptions();
    res.clearCookie("accessToken", clearOptions);
    res.clearCookie("refreshToken", clearOptions);
    return res.status(200).json({
      status: "success",
      data: { authenticated: false, user: null, accessToken: null }
    });
  };

  if (!accessToken && !refreshTokenValue) {
    return clearAndReturnAnonymous();
  }

  if (accessToken) {
    try {
      const decoded = verifyAccessToken(accessToken);
      const user = await User.findById(decoded.sub).select("-password -refreshToken");

      if (user && user.isActive && !["suspended", "closed"].includes(user.accountStatus)) {
        return res.status(200).json({
          status: "success",
          data: { authenticated: true, user, accessToken }
        });
      }
    } catch {
      // Fall through to refresh token check.
    }
  }

  if (refreshTokenValue) {
    try {
      const decoded = verifyRefreshToken(refreshTokenValue);
      const user = await User.findById(decoded.sub).select("-password +refreshToken");

      if (user && user.refreshToken === hashToken(refreshTokenValue)) {
        const newAccessToken = generateAccessToken(user._id, user.role);

        res.cookie("accessToken", newAccessToken, getAuthCookieOptions(15 * 60 * 1000));

        return res.status(200).json({
          status: "success",
          data: {
            authenticated: true,
            user,
            accessToken: newAccessToken
          }
        });
      }
    } catch {
      // Treat invalid/expired cookies as anonymous.
    }
  }

  return clearAndReturnAnonymous();
});

/*
|--------------------------------------------------------------------------
| REFRESH TOKEN
|--------------------------------------------------------------------------
*/

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Refresh token required"
    });
  }

  const decoded = verifyRefreshToken(token);

  const user = await User.findById(decoded.sub).select("+refreshToken");

  if (!user || user.refreshToken !== hashToken(token)) {
    return res.status(401).json({
      status: "error",
      message: "Invalid refresh token"
    });
  }

  const tokens = generateTokens(user._id, user.role);

  user.refreshToken = hashToken(tokens.refreshToken);
  await user.save();

  res.cookie(
    "accessToken",
    tokens.accessToken,
    getAuthCookieOptions(15 * 60 * 1000)
  );

  res.cookie(
    "refreshToken",
    tokens.refreshToken,
    getAuthCookieOptions(7 * 24 * 60 * 60 * 1000)
  );

  res.json({
    status: "success",
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user
    }
  });
});

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

export const logout = asyncHandler(async (req, res) => {
  req.user.refreshToken = null;
  await req.user.save();

  const clearOptions = getClearAuthCookieOptions();

  res.clearCookie("accessToken", clearOptions);
  res.clearCookie("refreshToken", clearOptions);

  res.json({
    status: "success",
    message: "Logged out successfully"
  });
});

/*
|--------------------------------------------------------------------------
| GET CURRENT USER
|--------------------------------------------------------------------------
*/

export const getMe = asyncHandler(async (req, res) => {
  res.json({
    status: "success",
    data: { user: req.user }
  });
});

/*
|--------------------------------------------------------------------------
| UPDATE PASSWORD
|--------------------------------------------------------------------------
*/

export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");

  const isPasswordValid = await user.comparePassword(currentPassword);

  if (!isPasswordValid) {
    return res.status(401).json({
      status: "error",
      message: "Current password incorrect"
    });
  }

  user.password = newPassword;
  await user.save();

  res.json({
    status: "success",
    message: "Password updated"
  });
});

/*
|--------------------------------------------------------------------------
| REQUEST EMAIL VERIFICATION
|--------------------------------------------------------------------------
*/

export const requestEmailVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user?.email) {
    return res.status(400).json({
      status: "error",
      message: "Add an email address before requesting verification"
    });
  }

  if (user.emailVerified) {
    return res.status(200).json({
      status: "success",
      message: "Email is already verified"
    });
  }

  const { token, tokenHash } = createVerificationToken();

  user.emailVerification = {
    tokenHash,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  };

  await user.save();

  const verifyUrl = `${frontendBaseUrl}/verify-email/${token}`;

  await sendEmail({
    to: user.email,
    subject: "Verify Email",
    html: `<a href="${verifyUrl}">${verifyUrl}</a>`
  });

  res.json({
    status: "success",
    message: "Verification email sent",
    data: process.env.NODE_ENV === "production" ? undefined : { token }
  });
});

/*
|--------------------------------------------------------------------------
| VERIFY EMAIL
|--------------------------------------------------------------------------
*/

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      status: "error",
      message: "Verification token is required"
    });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    _id: req.user._id,
    "emailVerification.tokenHash": tokenHash,
    "emailVerification.expiresAt": { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired token"
    });
  }

  user.emailVerified = true;
  user.isVerified = true;
  user.accountStatus = "active";
  user.emailVerification = {
    tokenHash: null,
    expiresAt: null,
    verifiedAt: new Date()
  };

  await user.save();

  res.json({
    status: "success",
    message: "Email verified successfully"
  });
});

/*
|--------------------------------------------------------------------------
| VERIFY EMAIL BY TOKEN (PUBLIC LINK)
|--------------------------------------------------------------------------
*/

export const verifyEmailByToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({
      status: "error",
      message: "Verification token is required"
    });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    "emailVerification.tokenHash": tokenHash,
    "emailVerification.expiresAt": { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired token"
    });
  }

  user.emailVerified = true;
  user.isVerified = true;
  if (user.accountStatus === "pending_verification") {
    user.accountStatus = "active";
  }
  user.emailVerification = {
    tokenHash: null,
    expiresAt: null,
    verifiedAt: new Date()
  };

  await user.save();

  res.json({
    status: "success",
    message: "Email verified successfully"
  });
});

/*
|--------------------------------------------------------------------------
| REQUEST PHONE VERIFICATION
|--------------------------------------------------------------------------
*/

export const requestPhoneVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user?.phone) {
    return res.status(400).json({
      status: "error",
      message: "Add a phone number before requesting verification"
    });
  }

  if (user.phoneVerified) {
    return res.status(200).json({
      status: "success",
      message: "Phone is already verified"
    });
  }

  const { code, codeHash } = createVerificationCode();

  user.phoneVerification = {
    codeHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  };

  await user.save();

  await sendSms({
    to: user.phone,
    body: `Your verification code is ${code}`
  });

  res.json({
    status: "success",
    message: "Verification code sent"
  });
});

/*
|--------------------------------------------------------------------------
| VERIFY PHONE
|--------------------------------------------------------------------------
*/

export const verifyPhone = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  const user = await User.findOne({
    _id: req.user._id,
    "phoneVerification.codeHash": codeHash,
    "phoneVerification.expiresAt": { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired code"
    });
  }

  user.phoneVerified = true;
  user.isVerified = true;
  user.phoneVerification = {
    codeHash: null,
    expiresAt: null,
    verifiedAt: new Date()
  };

  await user.save();

  res.json({
    status: "success",
    message: "Phone verified successfully"
  });
});

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({
      status: "success",
      message:
        "If an account exists with this email, a password reset link has been sent"
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.passwordReset = {
    token: resetTokenHash,
    expiresAt: new Date(Date.now() + 3600000)
  };

  await user.save();

  const resetUrl = `${frontendBaseUrl}/reset-password/${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    html: `<a href="${resetUrl}">${resetUrl}</a>`
  });

  res.json({
    status: "success",
    message: "Password reset link sent"
  });
});

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    "passwordReset.token": resetTokenHash,
    "passwordReset.expiresAt": { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired reset token"
    });
  }

  user.password = password;
  user.passwordReset = undefined;

  await user.save();

  res.json({
    status: "success",
    message: "Password reset successfully"
  });
});

/*
|--------------------------------------------------------------------------
| REQUEST LOGIN OTP (EMAIL)
|--------------------------------------------------------------------------
*/

export const requestLoginOtp = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({
      status: "error",
      message: "Email is required"
    });
  }

  const user = await User.findOne({ email }).select("_id email emailVerified role firstName lastName");
  const pendingRegistrationKey = getPendingRegistrationKey(email);
  const pendingRegistration = user ? null : await getOtpData(pendingRegistrationKey);

  if (!user && !pendingRegistration) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  const otpTarget = user || pendingRegistration;
  const challenge = await queueOtpChallenge({
    user: otpTarget,
    purpose: user ? (user.emailVerified ? 'login' : 'verification') : 'registration'
  });

  if (!challenge.ok) {
    return res.status(challenge.statusCode).json({
      status: "error",
      message: challenge.message
    });
  }

  res.status(200).json({
    status: "success",
    message: user
      ? (user.emailVerified
      ? "OTP sent to your email"
      : "Verification OTP sent to your email")
      : "Verification OTP sent to your email",
    data: {
      email,
      requiresEmailVerification: user ? !user.emailVerified : true,
      verificationMethod: "otp",
      otpExpiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
      ...(process.env.NODE_ENV === "production" ? {} : { otp: challenge.otp })
    }
  });
});

/*
|--------------------------------------------------------------------------
| VERIFY LOGIN OTP (EMAIL)
|--------------------------------------------------------------------------
*/

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || "").trim();

  if (!email || !otp) {
    return res.status(400).json({
      status: "error",
      message: "Email and OTP are required"
    });
  }

  let user = await User.findOne({ email }).select("+refreshToken");
  const pendingRegistrationKey = getPendingRegistrationKey(email);
  const pendingRegistration = user ? null : await getOtpData(pendingRegistrationKey);

  if (!user && !pendingRegistration) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  const otpPurpose = user ? (user.emailVerified ? 'login' : 'verification') : 'registration';
  const { otpKey, cooldownKey, lockKey } = getOtpKeys(email, otpPurpose);

  const lockTtl = await getTtlSeconds(lockKey);
  if (lockTtl > 0) {
    return res.status(429).json({
      status: "error",
      message: `Too many failed attempts. Try again in ${lockTtl}s`
    });
  }

  const otpData = await getOtpData(otpKey);
  if (!otpData?.otpHash) {
    return res.status(400).json({
      status: "error",
      message: "OTP invalid or expired"
    });
  }

  const attempts = Number(otpData.attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpData(otpKey);
    await setOtpData(lockKey, { locked: true }, OTP_LOCK_SECONDS);
    return res.status(429).json({
      status: "error",
      message: "Maximum OTP attempts exceeded. Try again later"
    });
  }

  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const isValidOtp = otpHash === otpData.otpHash;

  if (!isValidOtp) {
    const nextAttempts = attempts + 1;
    const ttl = await getTtlSeconds(otpKey);
    if (ttl > 0) {
      await setOtpData(
        otpKey,
        {
          ...otpData,
          attempts: nextAttempts
        },
        ttl
      );
    }

    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtpData(otpKey);
      await setOtpData(lockKey, { locked: true }, OTP_LOCK_SECONDS);
      return res.status(429).json({
        status: "error",
        message: "Maximum OTP attempts exceeded. Try again later"
      });
    }

    return res.status(400).json({
      status: "error",
      message: `Invalid OTP. ${OTP_MAX_ATTEMPTS - nextAttempts} attempts remaining`
    });
  }

  await deleteOtpData(otpKey);
  await deleteOtpData(cooldownKey);
  await deleteOtpData(lockKey);

  const isPendingRegistration = !user && !!pendingRegistration;
  const wasUnverified = user ? !user.emailVerified : true;

  if (isPendingRegistration) {
    const registrationPassword = pendingRegistration.password;

    user = await User.create({
      email,
      phone: pendingRegistration.phone || undefined,
      password: registrationPassword,
      firstName: pendingRegistration.firstName,
      lastName: pendingRegistration.lastName,
      role: pendingRegistration.role,
      accountStatus: "active",
      emailVerified: true,
      isVerified: true
    });

    await deleteOtpData(pendingRegistrationKey);
  }

  if (wasUnverified && !isPendingRegistration) {
    user.emailVerified = true;
    user.isVerified = true;
    user.accountStatus = "active";
    user.emailVerification = {
      tokenHash: null,
      expiresAt: null,
      verifiedAt: new Date()
    };
  }

  const { accessToken, refreshToken } = generateTokens(user._id, user.role);
  user.refreshToken = hashToken(refreshToken);
  user.lastLogin = new Date();
  user.lastLoginIp = req.ip;
  user.lastLoginUserAgent = req.headers["user-agent"];
  await user.save();

  res.cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000));
  res.cookie("refreshToken", refreshToken, getAuthCookieOptions(7 * 24 * 60 * 60 * 1000));

  res.status(200).json({
    status: "success",
    message: wasUnverified
      ? "OTP verified. Registration completed successfully"
      : "OTP verified. Login successful",
    data: { user, accessToken, refreshToken }
  });
});
