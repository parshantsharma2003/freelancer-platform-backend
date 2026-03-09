import express from 'express';
import {
  getProfile,
  updateProfile,
  getUserById,
  deleteAccount
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.delete('/account', protect, deleteAccount);

// Public routes
router.get('/:id', objectIdValidation, getUserById);

export default router;
