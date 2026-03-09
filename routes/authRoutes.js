import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updatePassword,
  requestEmailVerification,
  verifyEmail,
  requestPhoneVerification,
  verifyPhone,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js';
import { startOAuth, handleOAuthCallback } from '../controllers/oauthController.js';
import { protect } from '../middleware/authMiddleware.js';
import { registerValidation, loginValidation } from '../middleware/validationMiddleware.js';
import { authRateLimiter, loginRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.post('/register', authRateLimiter, registerValidation, register);
router.post('/login', loginRateLimiter, loginValidation, login);
router.post('/refresh', refreshToken);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password/:token', authRateLimiter, resetPassword);
router.get('/oauth/:provider', startOAuth);
router.get('/oauth/:provider/callback', handleOAuthCallback);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/update-password', protect, updatePassword);
router.post('/request-email-verification', protect, requestEmailVerification);
router.post('/verify-email', protect, verifyEmail);
router.post('/request-phone-verification', protect, requestPhoneVerification);
router.post('/verify-phone', protect, verifyPhone);

export default router;
