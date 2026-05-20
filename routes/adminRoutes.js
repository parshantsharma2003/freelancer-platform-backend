import express from "express";

import {
  adminLogin,
  getPlatformStats,
  createUser,
  getAllUsers,
  getUserDetails,
  updateUser,
  updateUserStatus,
  toggleUserApproval,
  deleteUser,
  createAdminJob,
  getAllJobs,
  getJobById,
  updateAdminJob,
  deleteAdminJob,
  flagJob,
  getAllProposals,
  updateProposal,
  deleteProposal,
  getAllContracts,
  updateContract,
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
} from "../controllers/adminController.js";

import { protect, superAdminOnly } from "../middleware/authMiddleware.js";
import {
  objectIdValidation,
  paginationValidation
} from "../middleware/validationMiddleware.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*                         PUBLIC ADMIN AUTH ROUTE                            */
/* -------------------------------------------------------------------------- */

router.post("/login", adminLogin);

/* -------------------------------------------------------------------------- */
/*                ALL ROUTES BELOW REQUIRE SUPER ADMIN ACCESS                 */
/* -------------------------------------------------------------------------- */

router.use(protect, superAdminOnly);

/* -------------------------------------------------------------------------- */
/*                          DASHBOARD & ANALYTICS                             */
/* -------------------------------------------------------------------------- */

router.get("/stats", getPlatformStats);
router.get("/activity", getRecentActivity);

/* -------------------------------------------------------------------------- */
/*                                AUDIT LOGS                                  */
/* -------------------------------------------------------------------------- */

router.get("/audit-logs", paginationValidation, getAuditLogs);

/* -------------------------------------------------------------------------- */
/*                             USER MANAGEMENT                                */
/* -------------------------------------------------------------------------- */

router.get("/users", paginationValidation, getAllUsers);

router.post(
  "/users",
  createUser
);

router.get(
  "/users/:id",
  objectIdValidation,
  getUserDetails
);

router.put(
  "/users/:id",
  objectIdValidation,
  updateUser
);

router.patch(
  "/users/:id/status",
  objectIdValidation,
  updateUserStatus
);

router.put(
  "/users/:id/status",
  objectIdValidation,
  updateUserStatus
);

router.patch(
  "/users/:id/approval",
  objectIdValidation,
  toggleUserApproval
);

router.delete(
  "/users/:id",
  objectIdValidation,
  deleteUser
);

/* -------------------------------------------------------------------------- */
/*                              JOB MANAGEMENT                                */
/* -------------------------------------------------------------------------- */

router.get("/jobs", paginationValidation, getAllJobs);

router.post(
  "/jobs",
  createAdminJob
);

router.get(
  "/jobs/:id",
  objectIdValidation,
  getJobById
);

router.put(
  "/jobs/:id",
  objectIdValidation,
  updateAdminJob
);

router.delete(
  "/jobs/:id",
  objectIdValidation,
  deleteAdminJob
);

router.patch(
  "/jobs/:id/flag",
  objectIdValidation,
  flagJob
);

router.put(
  "/jobs/:id/flag",
  objectIdValidation,
  flagJob
);

/* -------------------------------------------------------------------------- */
/*                           PROPOSAL MANAGEMENT                              */
/* -------------------------------------------------------------------------- */

router.get("/proposals", paginationValidation, getAllProposals);

router.put(
  "/proposals/:id",
  objectIdValidation,
  updateProposal
);

router.delete(
  "/proposals/:id",
  objectIdValidation,
  deleteProposal
);

/* -------------------------------------------------------------------------- */
/*                           CONTRACT MANAGEMENT                              */
/* -------------------------------------------------------------------------- */

router.get("/contracts", paginationValidation, getAllContracts);

router.put(
  "/contracts/:id",
  objectIdValidation,
  updateContract
);

router.patch(
  "/contracts/:id/status",
  objectIdValidation,
  updateContractStatus
);

/* -------------------------------------------------------------------------- */
/*                            PAYMENT MANAGEMENT                              */
/* -------------------------------------------------------------------------- */

router.get("/payments", paginationValidation, getAllPayments);

router.patch(
  "/payments/:id/override",
  objectIdValidation,
  overridePaymentStatus
);

/* -------------------------------------------------------------------------- */
/*                           DISPUTE MANAGEMENT                               */
/* -------------------------------------------------------------------------- */

router.get("/disputes", paginationValidation, getAllDisputes);

router.patch(
  "/disputes/:id/resolve",
  objectIdValidation,
  resolveDispute
);

/* -------------------------------------------------------------------------- */
/*                            REVIEW MANAGEMENT                               */
/* -------------------------------------------------------------------------- */

router.get("/reviews", paginationValidation, getAllReviews);

router.delete(
  "/reviews/:id",
  objectIdValidation,
  deleteReview
);

/* -------------------------------------------------------------------------- */
/*                        FREELANCER MANAGEMENT                               */
/* -------------------------------------------------------------------------- */

router.patch(
  "/freelancers/:id/featured",
  objectIdValidation,
  toggleFeatured
);

router.put(
  "/freelancers/:id/featured",
  objectIdValidation,
  toggleFeatured
);

/* -------------------------------------------------------------------------- */
/*                         PLATFORM SETTINGS                                  */
/* -------------------------------------------------------------------------- */

router.get("/settings", getPlatformSettings);

/* -------------------------------------------------------------------------- */
/*                        ADMIN NOTIFICATIONS                                 */
/* -------------------------------------------------------------------------- */

router.post(
  "/notifications/broadcast",
  broadcastNotification
);

export default router;
