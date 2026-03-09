import express from 'express';
import {
  createSavedSearch,
  getSavedSearches,
  getSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getSavedSearchStats
} from '../controllers/savedSearchController.js';
import { protect } from '../middleware/authMiddleware.js';
import { objectIdValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Statistics endpoint (must be before :id param to avoid route conflicts)
router.get('/stats', getSavedSearchStats);

// Create new saved search
router.post('/', createSavedSearch);

// Get all saved searches for current user
router.get('/', getSavedSearches);

// Get specific saved search
router.get('/:id', objectIdValidation, getSavedSearch);

// Update saved search
router.patch('/:id', objectIdValidation, updateSavedSearch);

// Delete saved search
router.delete('/:id', objectIdValidation, deleteSavedSearch);

export default router;
