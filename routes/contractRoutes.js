import express from 'express';
import {
  createContract,
  getMyContracts,
  getContractById,
  updateContract,
  acceptContract,
  submitWork,
  updateContractStatus,
  getContractAuditTrail
} from '../controllers/contractController.js';
import { protect, clientOnly, freelancerOnly } from '../middleware/authMiddleware.js';
import { objectIdValidation, paginationValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes
router.post('/', protect, clientOnly, createContract);
router.get('/my', protect, paginationValidation, getMyContracts);

// Must come before /:id routes
router.patch('/:id/status', protect, objectIdValidation, updateContractStatus);
router.get('/:id/audit', protect, objectIdValidation, getContractAuditTrail);

// Standard CRUD routes
router.get('/:id', protect, objectIdValidation, getContractById);
router.put('/:id', protect, objectIdValidation, updateContract);
router.post('/:id/accept', protect, freelancerOnly, objectIdValidation, acceptContract);
router.post('/:id/submit', protect, objectIdValidation, submitWork);

export default router;
