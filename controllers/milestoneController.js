import Milestone from '../models/Milestone.js';
import Contract from '../models/Contract.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  checkEscrowBalance,
  isAlreadyPaid,
  submitMilestoneWork,
  approveMilestoneWork,
  rejectMilestoneWork,
  releaseEscrowFunds,
  getContractProgress,
  notifyMilestoneStatusChange
} from '../services/milestoneService.js';

// @desc    Create milestones for a contract
// @route   POST /api/milestones
// @access  Private (Client only)
export const createMilestones = asyncHandler(async (req, res) => {
  const { contractId, milestones: milestonesData } = req.body;

  // Verify contract exists and user is client
  const contract = await Contract.findById(contractId);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can create milestones'
    });
  }

  // Check contract type is fixed-price
  if (contract.budget.type !== 'fixed') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones only available for fixed-price contracts'
    });
  }

  // Validate total milestone amount doesn't exceed contract budget
  const totalAmount = milestonesData.reduce((sum, m) => sum + m.amount, 0);
  if (totalAmount > contract.budget.amount) {
    return res.status(400).json({
      status: 'error',
      message: `Total milestone amount (${totalAmount}) exceeds contract budget (${contract.budget.amount})`
    });
  }

  // Create milestones
  const createdMilestones = await Milestone.insertMany(
    milestonesData.map(m => ({
      contract: contractId,
      title: m.title,
      description: m.description || '',
      amount: m.amount,
      dueDate: m.dueDate,
      status: 'pending',
      statusHistory: [{
        status: 'pending',
        changedAt: new Date(),
        changedBy: req.user._id
      }]
    }))
  );

  // Emit socket event
  try {
    const socketBroadcast = req.app.get('socketBroadcast');
    if (socketBroadcast) {
      socketBroadcast.notifyUser(contract.freelancer, {
        title: 'Milestones Created',
        message: `${createdMilestones.length} milestones created for contract: ${contract.title}`,
        contractId: contractId,
        milestonesCount: createdMilestones.length
      });
    }
  } catch (socketError) {
    console.log('[Socket] Failed to notify milestone creation:', socketError.message);
  }

  res.status(201).json({
    status: 'success',
    message: `${createdMilestones.length} milestones created successfully`,
    data: {
      milestones: createdMilestones,
      socketHint: {
        note: 'For real-time milestone updates, both client and freelancer should emit socket event "contract:join"',
        contractId: contractId,
        example: `socket.emit('contract:join', '${contractId}')`
      }
    }
  });
});

// @desc    Get milestones for a contract
// @route   GET /api/milestones?contractId=xyz
// @access  Private
export const getMilestones = asyncHandler(async (req, res) => {
  const { contractId } = req.query;

  if (!contractId) {
    return res.status(400).json({
      status: 'error',
      message: 'contractId query parameter is required'
    });
  }

  // Check authorization
  const contract = await Contract.findById(contractId);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const isAuthorized =
    contract.client.toString() === req.user._id.toString() ||
    contract.freelancer.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view contract milestones'
    });
  }

  const milestones = await Milestone.find({ contract: contractId })
    .populate('submission.submittedBy', 'firstName lastName')
    .populate('approval.approvedBy', 'firstName lastName')
    .sort({ createdAt: 1 });

  // Get progress stats
  const progress = await getContractProgress(contractId);

  res.status(200).json({
    status: 'success',
    data: {
      milestones,
      progress
    }
  });
});

// @desc    Get single milestone
// @route   GET /api/milestones/:id
// @access  Private
export const getMilestoneById = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id)
    .populate('contract', 'client freelancer title budget')
    .populate('submission.submittedBy', 'firstName lastName email')
    .populate('approval.approvedBy', 'firstName lastName email')
    .populate('payment.paymentId');

  if (!milestone) {
    return res.status(404).json({
      status: 'error',
      message: 'Milestone not found'
    });
  }

  // Check authorization
  const contract = milestone.contract;
  const isAuthorized =
    contract.client.toString() === req.user._id.toString() ||
    contract.freelancer.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this milestone'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { milestone }
  });
});

// @desc    Submit milestone work
// @route   POST /api/milestones/:id/submit
// @access  Private (Freelancer only)
export const submitMilestoneWorkHandler = asyncHandler(async (req, res) => {
  try {
    const milestone = await submitMilestoneWork(
      req.params.id,
      req.user._id,
      {
        description: req.body.description,
        attachments: req.body.attachments || [],
        notes: req.body.notes
      }
    );

    // Get contract for notifications
    const contract = await Contract.findById(milestone.contract);

    // Send notification
    await notifyMilestoneStatusChange(milestone, contract, 'submitted');

    // Emit socket event
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(contract.client, {
          title: 'Milestone Work Submitted',
          message: `Freelancer submitted work for: "${milestone.title}"`,
          contractId: contract._id,
          milestoneId: milestone._id
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify submission:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Milestone work submitted successfully',
      data: { milestone }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Approve milestone work
// @route   POST /api/milestones/:id/approve
// @access  Private (Client only)
export const approveMilestoneHandler = asyncHandler(async (req, res) => {
  try {
    // Check if already paid
    if (await isAlreadyPaid(req.params.id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Funds have already been released for this milestone'
      });
    }

    // Approve milestone
    const result = await approveMilestoneWork(
      req.params.id,
      req.user._id,
      {
        feedback: req.body.feedback,
        revisionRequested: req.body.revisionRequested || false,
        revisionNotes: req.body.revisionNotes
      }
    );

    const milestone = result.milestone;
    const contract = await Contract.findById(milestone.contract);

    if (result.requiresRevision) {
      // Notify freelancer of revision request
      await notifyMilestoneStatusChange(milestone, contract, 'rejected');

      return res.status(200).json({
        status: 'success',
        message: 'Revision requested',
        data: { milestone, requiresRevision: true }
      });
    }

    // Approved - prepare for payment release
    await notifyMilestoneStatusChange(milestone, contract, 'approved');

    // Emit socket event
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(contract.freelancer, {
          title: 'Milestone Approved',
          message: `Your milestone "${milestone.title}" has been approved!`,
          contractId: contract._id,
          milestoneId: milestone._id,
          amount: milestone.amount
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify approval:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Milestone approved. Payment will be released shortly.',
      data: { milestone, requiresRevision: false, readyForPayment: true }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Release payment for approved milestone
// @route   POST /api/milestones/:id/release-payment
// @access  Private (Client triggers, system processes)
export const releaseMilestonePayment = asyncHandler(async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);

    if (!milestone) {
      return res.status(404).json({
        status: 'error',
        message: 'Milestone not found'
      });
    }

    // Check authorization
    const contract = await Contract.findById(milestone.contract);

    if (contract.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Only client can release payment'
      });
    }

    // Check status
    if (milestone.status !== 'approved') {
      return res.status(400).json({
        status: 'error',
        message: `Milestone must be in 'approved' status to release payment. Current status: ${milestone.status}`
      });
    }

    // Prevent double payment
    if (milestone.escrow.paymentReleased) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment has already been released for this milestone'
      });
    }

    // Release funds (integrate with Stripe)
    const paymentResult = await releaseEscrowFunds(
      req.params.id,
      contract,
      null, // stripeAccountId - would be set in production
      10 // applicationFeePercent - 10%
    );

    // Send payment notification
    await notifyMilestoneStatusChange(paymentResult.milestone, contract, 'paid');

    // Emit socket event
    try {
      const socketBroadcast = req.app.get('socketBroadcast');
      if (socketBroadcast) {
        socketBroadcast.notifyUser(contract.freelancer, {
          title: 'Payment Released',
          message: `You received $${paymentResult.released.netAmount} for milestone: "${milestone.title}"`,
          contractId: contract._id,
          milestoneId: milestone._id,
          amount: paymentResult.released.netAmount
        });
      }
    } catch (socketError) {
      console.log('[Socket] Failed to notify payment:', socketError.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment released successfully',
      data: {
        milestone: paymentResult.milestone,
        payment: paymentResult.payment,
        released: paymentResult.released
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get contract progress
// @route   GET /api/milestones/contract/:contractId/progress
// @access  Private
export const getContractProgressHandler = asyncHandler(async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.contractId);

    if (!contract) {
      return res.status(404).json({
        status: 'error',
        message: 'Contract not found'
      });
    }

    // Check authorization
    const isAuthorized =
      contract.client.toString() === req.user._id.toString() ||
      contract.freelancer.toString() === req.user._id.toString() ||
      req.user.role === 'super_admin';

    if (!isAuthorized) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized'
      });
    }

    const progress = await getContractProgress(req.params.contractId);

    res.status(200).json({
      status: 'success',
      data: progress
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});
