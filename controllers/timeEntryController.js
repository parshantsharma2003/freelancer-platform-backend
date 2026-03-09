import TimeEntry from '../models/TimeEntry.js';
import Contract from '../models/Contract.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  startTimeEntry,
  stopTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  checkWeeklyHourLimit,
  approveTimeEntry,
  rejectTimeEntry,
  getTimeEntriesForContract,
  getWeeklyTimeEntries,
  generateWeeklyInvoice,
  processWeeklyPayment,
  getCurrentActiveTimeEntry,
  getTimeEntryById,
  getWeekStartDate
} from '../services/timeEntryService.js';

// @desc    Start time entry
// @route   POST /api/time-entries/start
// @access  Private (Freelancer only)
export const startTimeLog = asyncHandler(async (req, res) => {
  const { contractId, description } = req.body;

  if (!contractId) {
    return res.status(400).json({
      status: 'error',
      message: 'Contract ID is required'
    });
  }

  // Verify contract exists and user is freelancer
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only freelancer can log time'
    });
  }

  // Verify hourly contract
  if (contract.budget.type !== 'hourly') {
    return res.status(400).json({
      status: 'error',
      message: 'Time logging only available for hourly contracts'
    });
  }

  try {
    const timeEntry = await startTimeEntry(
      contractId,
      req.user._id,
      contract.budget.hourlyRate,
      description
    );

    // Emit socket event
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(contract.client, {
          title: 'Time Tracking Started',
          message: `Freelancer started time tracking on: "${contract.title}"`,
          contractId: contractId,
          timeEntryId: timeEntry._id
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify time start:', socketError.message);
    }

    res.status(201).json({
      status: 'success',
      message: 'Time entry started',
      data: { timeEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Stop time entry
// @route   POST /api/time-entries/:id/stop
// @access  Private (Freelancer only)
export const stopTimeLog = asyncHandler(async (req, res) => {
  const timeEntry = await TimeEntry.findById(req.params.id);

  if (!timeEntry) {
    return res.status(404).json({
      status: 'error',
      message: 'Time entry not found'
    });
  }

  if (timeEntry.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only the logged freelancer can stop this entry'
    });
  }

  try {
    const stoppedEntry = await stopTimeEntry(req.params.id, req.user._id);
    const contract = await Contract.findById(stoppedEntry.contract);

    // Notify client
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        const durationHours = (stoppedEntry.duration / 60).toFixed(2);
        socketBroadcast.notifyUser(contract.client, {
          title: 'Time Entry Pending Approval',
          message: `${durationHours} hours logged - awaiting your approval`,
          contractId: contract._id,
          timeEntryId: stoppedEntry._id,
          duration: stoppedEntry.duration,
          billableAmount: stoppedEntry.billableAmount
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify time stop:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Time entry stopped',
      data: {
        timeEntry: stoppedEntry,
        summary: {
          duration: stoppedEntry.duration,
          durationHours: (stoppedEntry.duration / 60).toFixed(2),
          billableAmount: stoppedEntry.billableAmount,
          platformFee: stoppedEntry.platformFee,
          netAmount: stoppedEntry.netAmount
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Pause time entry
// @route   POST /api/time-entries/:id/pause
// @access  Private (Freelancer only)
export const pauseTimeLog = asyncHandler(async (req, res) => {
  const timeEntry = await TimeEntry.findById(req.params.id);

  if (!timeEntry) {
    return res.status(404).json({
      status: 'error',
      message: 'Time entry not found'
    });
  }

  if (timeEntry.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only the logged freelancer can pause this entry'
    });
  }

  try {
    const pausedEntry = await pauseTimeEntry(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      message: 'Time entry paused',
      data: { timeEntry: pausedEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Resume time entry
// @route   POST /api/time-entries/:id/resume
// @access  Private (Freelancer only)
export const resumeTimeLog = asyncHandler(async (req, res) => {
  const timeEntry = await TimeEntry.findById(req.params.id);

  if (!timeEntry) {
    return res.status(404).json({
      status: 'error',
      message: 'Time entry not found'
    });
  }

  if (timeEntry.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only the logged freelancer can resume this entry'
    });
  }

  try {
    const resumedEntry = await resumeTimeEntry(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      message: 'Time entry resumed',
      data: { timeEntry: resumedEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Approve time entry
// @route   POST /api/time-entries/:id/approve
// @access  Private (Client only)
export const approveTimeLog = asyncHandler(async (req, res) => {
  const timeEntry = await TimeEntry.findById(req.params.id);

  if (!timeEntry) {
    return res.status(404).json({
      status: 'error',
      message: 'Time entry not found'
    });
  }

  if (timeEntry.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can approve time entries'
    });
  }

  try {
    const approvedEntry = await approveTimeEntry(req.params.id, req.user._id);

    // Notify freelancer
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(approvedEntry.freelancer, {
          title: 'Time Entry Approved',
          message: `Your time entry has been approved for $${approvedEntry.billableAmount}`,
          contractId: approvedEntry.contract,
          timeEntryId: approvedEntry._id,
          amount: approvedEntry.billableAmount
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify approval:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Time entry approved',
      data: { timeEntry: approvedEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Reject time entry
// @route   POST /api/time-entries/:id/reject
// @access  Private (Client only)
export const rejectTimeLog = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const timeEntry = await TimeEntry.findById(req.params.id);

  if (!timeEntry) {
    return res.status(404).json({
      status: 'error',
      message: 'Time entry not found'
    });
  }

  if (timeEntry.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can reject time entries'
    });
  }

  try {
    const rejectedEntry = await rejectTimeEntry(req.params.id, req.user._id, reason);

    // Notify freelancer
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(rejectedEntry.freelancer, {
          title: 'Time Entry Rejected',
          message: `Your time entry was rejected. Reason: ${reason || 'No reason provided'}`,
          contractId: rejectedEntry.contract,
          timeEntryId: rejectedEntry._id
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify rejection:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Time entry rejected',
      data: { timeEntry: rejectedEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get time entries for contract
// @route   GET /api/time-entries?contractId=xxx
// @access  Private
export const getTimeEntries = asyncHandler(async (req, res) => {
  const { contractId } = req.query;

  if (!contractId) {
    return res.status(400).json({
      status: 'error',
      message: 'Contract ID is required'
    });
  }

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const isClient = contract.client.toString() === req.user._id.toString();
  const isFreelancer = contract.freelancer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'super_admin';

  if (!isClient && !isFreelancer && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view these time entries'
    });
  }

  try {
    const timeEntries = await getTimeEntriesForContract(
      contractId,
      req.user._id,
      req.user.role
    );

    // Calculate stats
    const stats = {
      total: timeEntries.length,
      approved: 0,
      rejected: 0,
      pending: 0,
      totalHours: 0,
      approvedHours: 0,
      totalBillableAmount: 0,
      approvedAmount: 0
    };

    timeEntries.forEach(entry => {
      const hours = entry.duration / 60;
      stats.totalHours += hours;
      stats.totalBillableAmount += entry.billableAmount;

      if (entry.status === 'approved') {
        stats.approved++;
        stats.approvedHours += hours;
        stats.approvedAmount += entry.billableAmount;
      } else if (entry.status === 'rejected') {
        stats.rejected++;
      } else {
        stats.pending++;
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        timeEntries,
        stats
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get current active time entry
// @route   GET /api/time-entries/active/:contractId
// @access  Private (Freelancer)
export const getActiveTimeEntry = asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only freelancer can check active entries'
    });
  }

  try {
    const activeEntry = await getCurrentActiveTimeEntry(contractId, req.user._id);

    if (!activeEntry) {
      return res.status(200).json({
        status: 'success',
        data: { timeEntry: null }
      });
    }

    // Calculate elapsed time
    const elapsedMinutes = Math.floor((new Date() - activeEntry.startTime) / (1000 * 60));
    const elapsedHours = (elapsedMinutes / 60).toFixed(2);

    res.status(200).json({
      status: 'success',
      data: {
        timeEntry: activeEntry,
        elapsed: {
          minutes: elapsedMinutes,
          hours: elapsedHours
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get weekly time entries
// @route   GET /api/time-entries/weekly/:contractId
// @access  Private
export const getWeeklyEntries = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { weekDate } = req.query;

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const isClient = contract.client.toString() === req.user._id.toString();
  const isFreelancer = contract.freelancer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'super_admin';

  if (!isClient && !isFreelancer && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view these time entries'
    });
  }

  try {
    const weeklyStats = await getWeeklyTimeEntries(
      contractId,
      req.user._id,
      req.user.role,
      weekDate ? new Date(weekDate) : new Date()
    );

    res.status(200).json({
      status: 'success',
      data: {
        weekly: weeklyStats,
        weeklyLimit: contract.budget.weeklyHourLimit || 40
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Check weekly hour limit
// @route   GET /api/time-entries/:contractId/limit
// @access  Private (Freelancer)
export const checkHourLimit = asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only freelancer can check hour limit'
    });
  }

  try {
    const limit = await checkWeeklyHourLimit(contractId, req.user._id);

    res.status(200).json({
      status: 'success',
      data: { limit }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get weekly invoice
// @route   GET /api/time-entries/:contractId/invoice
// @access  Private
export const getInvoice = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { weekDate } = req.query;

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const isClient = contract.client.toString() === req.user._id.toString();
  const isFreelancer = contract.freelancer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'super_admin';

  if (!isClient && !isFreelancer && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this invoice'
    });
  }

  try {
    const invoice = await generateWeeklyInvoice(
      contractId,
      weekDate ? new Date(weekDate) : new Date()
    );

    res.status(200).json({
      status: 'success',
      data: { invoice }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Process weekly payment
// @route   POST /api/time-entries/:contractId/pay-weekly
// @access  Private (Client/Admin)
export const payWeekly = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { weekDate } = req.body;

  // Verify authorization
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can process payments'
    });
  }

  try {
    const payment = await processWeeklyPayment(
      contractId,
      weekDate ? new Date(weekDate) : new Date()
    );

    // Emit socket event
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(contract.freelancer, {
          title: 'Weekly Payment Processed',
          message: `You received $${payment.amount} for ${payment.hours} hours worked`,
          contractId: contractId,
          amount: payment.amount,
          hours: payment.hours
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify payment:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Weekly payment processed',
      data: { payment }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get single time entry
// @route   GET /api/time-entries/:id
// @access  Private
export const getTimeEntry = asyncHandler(async (req, res) => {
  try {
    const timeEntry = await getTimeEntryById(req.params.id);

    if (!timeEntry) {
      return res.status(404).json({
        status: 'error',
        message: 'Time entry not found'
      });
    }

    // Verify authorization
    const isClient = timeEntry.client._id.toString() === req.user._id.toString();
    const isFreelancer = timeEntry.freelancer._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'super_admin';

    if (!isClient && !isFreelancer && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view this time entry'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { timeEntry }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});
