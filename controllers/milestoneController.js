import Milestone from '../models/Milestone.js';
import Contract from '../models/Contract.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  checkEscrowBalance,
  isAlreadyPaid,
  startMilestoneWork,
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

  if (!Array.isArray(milestonesData) || milestonesData.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'At least one milestone is required'
    });
  }

  // Verify contract exists and user is client
  const contract = await Contract.findById(contractId);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones can only be created on active contracts'
    });
  }

  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can create milestones'
    });
  }

  // Check contract type is fixed-price
  const normalizedBudgetType = String(contract?.budget?.type || 'fixed').toLowerCase();
  const isFixedContract = ['fixed', 'fixed-price', 'fixed_price', 'fixedprice'].includes(normalizedBudgetType);

  if (!isFixedContract) {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones only available for fixed-price contracts'
    });
  }

  const normalizedMilestones = milestonesData.map((milestone) => ({
    title: String(milestone.title || '').trim(),
    description: String(milestone.description || '').trim(),
    amount: Number(milestone.amount),
    dueDate: milestone.dueDate
  }));

  if (normalizedMilestones.some((milestone) => !milestone.title || !milestone.description || !milestone.dueDate)) {
    return res.status(400).json({
      status: 'error',
      message: 'Each milestone must include a title, description, amount, and deadline'
    });
  }

  if (normalizedMilestones.some((milestone) => !Number.isFinite(milestone.amount) || milestone.amount <= 0)) {
    return res.status(400).json({
      status: 'error',
      message: 'Each milestone amount must be a valid positive number'
    });
  }

  const now = new Date();
  if (normalizedMilestones.some((milestone) => !milestone.dueDate || new Date(milestone.dueDate) <= now)) {
    return res.status(400).json({
      status: 'error',
      message: 'Each milestone due date must be in the future'
    });
  }

  // Validate total milestone amount equals contract budget
  const totalAmount = normalizedMilestones.reduce((sum, m) => sum + m.amount, 0);
  const contractTotalAmount = Number(contract?.budget?.amount || 0);
  if (Math.abs(totalAmount - contractTotalAmount) > 0.01) {
    return res.status(400).json({
      status: 'error',
      message: `Total milestone amount (${totalAmount}) must match contract amount (${contractTotalAmount})`
    });
  }

  // Create milestones
  const existingCount = await Milestone.countDocuments({ contract: contractId });
  const createdMilestones = await Milestone.insertMany(
    normalizedMilestones.map((m, index) => ({
      contract: contractId,
      title: m.title,
      description: m.description || '',
      amount: m.amount,
      dueDate: m.dueDate,
      orderIndex: existingCount + index,
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

// @desc    Delete milestone before funding
// @route   DELETE /api/milestones/:id
// @access  Private (Client only)
export const deleteMilestone = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id);

  if (!milestone) {
    return res.status(404).json({
      status: 'error',
      message: 'Milestone not found'
    });
  }

  const contract = await Contract.findById(milestone.contract);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones can only be deleted on active contracts before funding'
    });
  }

  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can delete milestones'
    });
  }

  if (milestone.escrow?.isHeld || milestone.status !== 'pending') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestone can only be deleted before funding'
    });
  }

  const remainingMilestones = await Milestone.find({
    contract: contract._id,
    _id: { $ne: milestone._id }
  }).sort({ orderIndex: 1, createdAt: 1 });

  await Milestone.deleteOne({ _id: milestone._id });

  await Promise.all(
    remainingMilestones.map((item, index) => Milestone.findByIdAndUpdate(item._id, { orderIndex: index }))
  );

  res.status(200).json({
    status: 'success',
    message: 'Milestone deleted successfully'
  });
});

// @desc    Start milestone work
// @route   POST /api/milestones/:id/start-work
// @access  Private (Freelancer only)
export const startMilestoneWorkHandler = asyncHandler(async (req, res) => {
  try {
    const milestone = await startMilestoneWork(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      message: 'Milestone marked as in progress',
      data: { milestone }
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
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
    .populate('comments.user', 'firstName lastName avatar')
    .sort({ orderIndex: 1, createdAt: 1 });

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
    .populate('comments.user', 'firstName lastName avatar email')
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

// @desc    Reorder milestones in a contract
// @route   POST /api/milestones/reorder
// @access  Private (Client only)
export const reorderMilestones = asyncHandler(async (req, res) => {
  const { contractId, milestoneIds } = req.body;

  if (!contractId || !Array.isArray(milestoneIds) || milestoneIds.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'contractId and milestoneIds are required'
    });
  }

  const contract = await Contract.findById(contractId);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones can only be reordered on active contracts before funding'
    });
  }

  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can reorder milestones'
    });
  }

  const milestones = await Milestone.find({ contract: contractId });
  if (milestones.length !== milestoneIds.length) {
    return res.status(400).json({
      status: 'error',
      message: 'milestoneIds must include all milestones for this contract'
    });
  }

  const milestonesById = new Map(milestones.map((milestone) => [milestone._id.toString(), milestone]));
  const unknownId = milestoneIds.find((id) => !milestonesById.has(String(id)));
  if (unknownId) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid milestone id in reorder list'
    });
  }

  const hasFundedMilestone = milestoneIds.some((id) => {
    const milestone = milestonesById.get(String(id));
    return milestone?.escrow?.isHeld;
  });

  if (hasFundedMilestone) {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones cannot be reordered after funding'
    });
  }

  await Promise.all(
    milestoneIds.map((id, index) => Milestone.findByIdAndUpdate(id, { orderIndex: index }))
  );

  res.status(200).json({
    status: 'success',
    message: 'Milestones reordered successfully'
  });
});

// @desc    Edit milestone before funding
// @route   PATCH /api/milestones/:id
// @access  Private (Client only)
export const updateMilestone = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id);
  if (!milestone) {
    return res.status(404).json({
      status: 'error',
      message: 'Milestone not found'
    });
  }

  const contract = await Contract.findById(milestone.contract);
  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestones can only be edited on active contracts before funding'
    });
  }

  if (contract.client.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only client can edit milestones'
    });
  }

  if (milestone.escrow?.isHeld || milestone.status !== 'pending') {
    return res.status(400).json({
      status: 'error',
      message: 'Milestone can only be edited before funding'
    });
  }

  const allowedFields = ['title', 'description', 'amount', 'dueDate'];
  const updateData = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updateData[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
  });

  if (updateData.title !== undefined && !updateData.title) {
    return res.status(400).json({
      status: 'error',
      message: 'Milestone title is required'
    });
  }

  if (updateData.description !== undefined && !updateData.description) {
    return res.status(400).json({
      status: 'error',
      message: 'Milestone description is required'
    });
  }

  if (updateData.amount !== undefined) {
    updateData.amount = Number(updateData.amount);
    if (!Number.isFinite(updateData.amount) || updateData.amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Milestone amount must be a valid positive number'
      });
    }
  }

  if (updateData.dueDate !== undefined) {
    const dueDate = new Date(updateData.dueDate);
    if (!Number.isFinite(dueDate.getTime()) || dueDate <= new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Milestone due date must be in the future'
      });
    }
  }

  // Validate total milestones amount still matches contract amount.
  const contractMilestones = await Milestone.find({ contract: contract._id });
  const recomputedTotal = contractMilestones.reduce((sum, item) => {
    if (item._id.toString() === milestone._id.toString()) {
      return sum + Number(updateData.amount ?? item.amount);
    }
    return sum + Number(item.amount);
  }, 0);

  const contractTotalAmount = Number(contract?.budget?.amount || 0);
  if (Math.abs(recomputedTotal - contractTotalAmount) > 0.01) {
    return res.status(400).json({
      status: 'error',
      message: `Total milestone amount (${recomputedTotal}) must match contract amount (${contractTotalAmount})`
    });
  }

  Object.assign(milestone, updateData);
  await milestone.save();

  res.status(200).json({
    status: 'success',
    message: 'Milestone updated successfully',
    data: { milestone }
  });
});

// @desc    Add attachment to milestone
// @route   POST /api/milestones/:id/attachments
// @access  Private (Client/Freelancer in contract)
export const addMilestoneAttachment = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id).populate('contract', 'client freelancer');
  if (!milestone) {
    return res.status(404).json({ status: 'error', message: 'Milestone not found' });
  }

  const isParticipant =
    milestone.contract.client.toString() === req.user._id.toString() ||
    milestone.contract.freelancer.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isParticipant) {
    return res.status(403).json({ status: 'error', message: 'Not authorized' });
  }

  const { name, url, type, size } = req.body;
  if (!name || !url) {
    return res.status(400).json({ status: 'error', message: 'name and url are required' });
  }

  milestone.attachments.push({
    name,
    url,
    type: type || 'application/octet-stream',
    size: Number(size) || 0,
    uploadedBy: req.user._id,
    uploadedAt: new Date()
  });

  await milestone.save();

  res.status(201).json({
    status: 'success',
    message: 'Attachment added',
    data: { milestone }
  });
});

// @desc    Add comment to milestone
// @route   POST /api/milestones/:id/comments
// @access  Private (Client/Freelancer in contract)
export const addMilestoneComment = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findById(req.params.id).populate('contract', 'client freelancer');
  if (!milestone) {
    return res.status(404).json({ status: 'error', message: 'Milestone not found' });
  }

  const isParticipant =
    milestone.contract.client.toString() === req.user._id.toString() ||
    milestone.contract.freelancer.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isParticipant) {
    return res.status(403).json({ status: 'error', message: 'Not authorized' });
  }

  const content = String(req.body.content || '').trim();
  if (!content) {
    return res.status(400).json({ status: 'error', message: 'Comment content is required' });
  }

  milestone.comments.push({
    user: req.user._id,
    content,
    createdAt: new Date()
  });

  await milestone.save();
  await milestone.populate('comments.user', 'firstName lastName avatar');

  res.status(201).json({
    status: 'success',
    message: 'Comment added',
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

    // Fetch milestone to check escrow status
    const milestoneData = await Milestone.findById(req.params.id);
    if (!milestoneData) {
      return res.status(404).json({
        status: 'error',
        message: 'Milestone not found'
      });
    }

    // Add validation before approval: Milestone must be funded
    if (!milestoneData.escrow.isHeld) {
      return res.status(400).json({
        status: 'error',
        message: 'Milestone not funded in escrow'
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
          message: `You received ₹${paymentResult.released.netAmount} for milestone: "${milestone.title}"`,
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

// @desc    Get milestone attachment metadata
// @route   GET /api/milestones/:id/attachments/:index
// @access  Private
export const getMilestoneAttachmentMetadata = asyncHandler(async (req, res) => {
  const { id, index } = req.params;

  const milestone = await Milestone.findById(id);

  if (!milestone) {
    return res.status(404).json({
      status: 'error',
      message: 'Milestone not found'
    });
  }

  // Check authorization
  const contract = await Contract.findById(milestone.contract);
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

  // Get attachment from submission.attachments
  const attachments = milestone.submission?.attachments || [];
  const attachmentIndex = parseInt(index);

  if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
    return res.status(404).json({
      status: 'error',
      message: 'Attachment not found'
    });
  }

  const attachment = attachments[attachmentIndex];

  res.status(200).json({
    status: 'success',
    data: {
      attachment: {
        name: attachment.name || 'attachment',
        url: attachment.url,
        uploadedAt: attachment.uploadedAt
      }
    }
  });
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
