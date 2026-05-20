import express from 'express';
import {
  getProfile,
  updateProfile,
  getUserById,
  deleteAccount,
  getWalletSummary,
  requestWalletWithdrawal
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.delete('/account', protect, deleteAccount);
router.get('/wallet', protect, getWalletSummary);
router.post('/wallet/withdraw', protect, requestWalletWithdrawal);

// Public routes
router.get('/:id', objectIdValidation, getUserById);

export default router;
