import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  startTimeLog,
  stopTimeLog,
  pauseTimeLog,
  resumeTimeLog,
  approveTimeLog,
  rejectTimeLog,
  getTimeEntries,
  getActiveTimeEntry,
  getWeeklyEntries,
  checkHourLimit,
  getInvoice,
  payWeekly,
  getTimeEntry
} from '../controllers/timeEntryController.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Start time entry - POST /api/time-entries/start
router.post('/start', startTimeLog);

// Get active time entry - GET /api/time-entries/active/:contractId
router.get('/active/:contractId', getActiveTimeEntry);

// Check weekly hour limit - GET /api/time-entries/:contractId/limit
router.get('/:contractId/limit', checkHourLimit);

// Get weekly entries - GET /api/time-entries/weekly/:contractId
router.get('/weekly/:contractId', getWeeklyEntries);

// Get weekly invoice - GET /api/time-entries/:contractId/invoice
router.get('/:contractId/invoice', getInvoice);

// Process weekly payment - POST /api/time-entries/:contractId/pay-weekly
router.post('/:contractId/pay-weekly', payWeekly);

// Time entry actions (MUST come before /:id route)
router.post('/:id/stop', stopTimeLog);
router.post('/:id/pause', pauseTimeLog);
router.post('/:id/resume', resumeTimeLog);
router.post('/:id/approve', approveTimeLog);
router.post('/:id/reject', rejectTimeLog);

// Get time entries for contract - GET /api/time-entries?contractId=xxx
router.get('/', getTimeEntries);

// Get single time entry - GET /api/time-entries/:id
router.get('/:id', getTimeEntry);

export default router;
