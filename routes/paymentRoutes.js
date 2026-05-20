import express from 'express';
import {
  createPayment,
  releasePayment,
  refundPayment,
  getMyPayments,
  getPaymentById,
  getPaymentStats,
  getEarningsByMonth,
  createConnectAccount,
  createConnectAccountLink,
  getConnectStatus,
  createConnectLoginLink
} from '../controllers/paymentController.js';
import { protect, freelancerOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.post('/', protect, createPayment);
router.post('/:id/release', protect, objectIdValidation, releasePayment);
router.post('/:id/refund', protect, objectIdValidation, refundPayment);
router.get('/my', protect, paginationValidation, getMyPayments);
router.get('/stats/summary', protect, getPaymentStats);
router.get('/stats/earnings', protect, getEarningsByMonth);
router.get('/:id', protect, objectIdValidation, getPaymentById);

// Stripe Connect (freelancers)
router.post('/connect/account', protect, freelancerOnly, createConnectAccount);
router.post('/connect/account-link', protect, freelancerOnly, createConnectAccountLink);
router.get('/connect/status', protect, freelancerOnly, getConnectStatus);
router.post('/connect/login-link', protect, freelancerOnly, createConnectLoginLink);

export default router;
