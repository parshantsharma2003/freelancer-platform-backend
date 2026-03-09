import express from 'express';
import {
  createOrUpdateProfile,
  getMyProfile,
  getClientById,
  getClientAnalytics
} from '../controllers/clientController.js';
import { protect, clientOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes (Clients only)
router.post('/profile', protect, clientOnly, createOrUpdateProfile);
router.get('/me/profile', protect, clientOnly, getMyProfile);
router.get('/analytics/dashboard', protect, clientOnly, getClientAnalytics);

// Public routes
router.get('/:id', objectIdValidation, getClientById);

export default router;
