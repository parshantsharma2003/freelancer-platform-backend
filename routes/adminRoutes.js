import express from 'express';
import {
  adminLogin,
  getPlatformStats,
  getAllUsers,
  getUserDetails,
  updateUser,
  updateUserStatus,
  toggleUserApproval,
  deleteUser,
  getAllJobs,
  getJobById,
  updateAdminJob,
  deleteAdminJob,
  flagJob,
  getAllProposals,
  deleteProposal,
  getAllContracts,
  updateContractStatus,
  getAllPayments,
  overridePaymentStatus,
  getAllDisputes,
  resolveDispute,
  getAllReviews,
  deleteReview,
  getPlatformSettings,
  broadcastNotification,
  getRecentActivity,
  toggleFeatured,
  getAuditLogs
} from '../controllers/adminController.js';
import { protect, superAdminOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// =====================================================
// SUPER ADMIN AUTHENTICATION (PUBLIC)
// =====================================================
router.post('/login', adminLogin);

// =====================================================
// ALL ROUTES BELOW REQUIRE SUPER ADMIN AUTHENTICATION
// =====================================================
router.use(protect, superAdminOnly);

// Dashboard & Statistics
router.get('/stats', getPlatformStats);
router.get('/activity', getRecentActivity);

// Audit Logs
router.get('/audit-logs', paginationValidation, getAuditLogs);

// User Management
router.get('/users', paginationValidation, getAllUsers);
router.get('/users/:id', objectIdValidation, getUserDetails);
router.put('/users/:id', objectIdValidation, updateUser);
router.put('/users/:id/status', objectIdValidation, updateUserStatus);
router.patch('/users/:id/approval', objectIdValidation, toggleUserApproval);
router.delete('/users/:id', objectIdValidation, deleteUser);

// Job Management
router.get('/jobs', paginationValidation, getAllJobs);
router.get('/jobs/:id', objectIdValidation, getJobById);
router.put('/jobs/:id', objectIdValidation, updateAdminJob);
router.delete('/jobs/:id', objectIdValidation, deleteAdminJob);
router.put('/jobs/:id/flag', objectIdValidation, flagJob);

// Proposal Management
router.get('/proposals', paginationValidation, getAllProposals);
router.delete('/proposals/:id', objectIdValidation, deleteProposal);

// Contract Management
router.get('/contracts', paginationValidation, getAllContracts);
router.patch('/contracts/:id/status', objectIdValidation, updateContractStatus);

// Payment Management
router.get('/payments', paginationValidation, getAllPayments);
router.patch('/payments/:id/override', objectIdValidation, overridePaymentStatus);

// Dispute Management
router.get('/disputes', paginationValidation, getAllDisputes);
router.patch('/disputes/:id/resolve', objectIdValidation, resolveDispute);

// Review Management
router.get('/reviews', paginationValidation, getAllReviews);
router.delete('/reviews/:id', objectIdValidation, deleteReview);

// Freelancer Management
router.put('/freelancers/:id/featured', objectIdValidation, toggleFeatured);

// Platform Settings
router.get('/settings', getPlatformSettings);

// Notifications & Broadcasts
router.post('/notifications/broadcast', broadcastNotification);

export default router;
