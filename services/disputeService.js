import Dispute from '../models/Dispute.js';
import Contract from '../models/Contract.js';
import Payment from '../models/Payment.js';

/**
 * Raise a new dispute on a contract
 */
export const raiseDispute = async (raiserId, contractId, reason, description) => {
  // Verify contract exists
  const contract = await Contract.findById(contractId);
  if (!contract) {
    throw new Error('Contract not found');
  }

  // Verify raiser is party to contract
  if (
    contract.client.toString() !== raiserId.toString() &&
    contract.freelancer.toString() !== raiserId.toString()
  ) {
    throw new Error('Only contract parties can raise disputes');
  }

  // Check if dispute already exists for this contract
  const existingDispute = await Dispute.findOne({
    contract: contractId,
    status: 'open'
  });

  if (existingDispute) {
    throw new Error('An open dispute already exists for this contract');
  }

  // Validate reason
  if (!reason || reason.trim().length < 10) {
    throw new Error('Reason must be at least 10 characters');
  }

  // Create dispute
  const dispute = new Dispute({
    contract: contractId,
    client: contract.client,
    freelancer: contract.freelancer,
    raisedBy: raiserId,
    reason: reason.trim(),
    description: description ? description.trim() : '',
    status: 'open'
  });

  await dispute.save();

  // Freeze escrow immediately
  await freezeEscrow(contractId, dispute._id);

  // Populate before returning
  await dispute.populate([
    { path: 'raisedBy', select: 'firstName lastName email' },
    { path: 'client', select: 'firstName lastName' },
    { path: 'freelancer', select: 'firstName lastName' },
    { path: 'contract', select: '_id' }
  ]);

  return dispute;
};

/**
 * Add evidence to a dispute
 */
export const addEvidence = async (userId, disputeId, evidenceData) => {
  const { title, description, fileUrl, fileName, fileSize, fileType } = evidenceData;

  const dispute = await Dispute.findById(disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  // Check if user can add evidence
  if (!dispute.canUserAddEvidence(userId)) {
    throw new Error('Only involved parties can add evidence to open disputes');
  }

  // Validate evidence data
  if (!title || title.trim().length === 0) {
    throw new Error('Evidence title is required');
  }

  if (!fileUrl) {
    throw new Error('File URL is required');
  }

  // Add evidence
  dispute.evidence.push({
    uploadedBy: userId,
    title: title.trim(),
    description: description ? description.trim() : '',
    fileUrl,
    fileName: fileName || 'document',
    fileSize: fileSize || 0,
    fileType: fileType || 'unknown',
    uploadedAt: new Date()
  });

  await dispute.save();

  // Populate before returning
  await dispute.populate([
    { path: 'raisedBy', select: 'firstName lastName' },
    { path: 'evidence.uploadedBy', select: 'firstName lastName' }
  ]);

  return dispute;
};

/**
 * Freeze escrow for a contract (prevents payment release)
 */
const freezeEscrow = async (contractId, disputeId) => {
  // Find payment for this contract
  const payment = await Payment.findOne({
    contract: contractId,
    status: { $in: ['pending', 'processing', 'held-in-escrow'] }
  });

  if (payment) {
    payment.frozen = true;
    payment.frozenReason = `Dispute ${disputeId} opened`;
    payment.frozenAt = new Date();
    await payment.save();
  }

  return { success: true, frozenPayment: payment ? payment._id : null };
};

/**
 * Unfreeze escrow (when dispute is resolved)
 */
const unfreezeEscrow = async (contractId) => {
  const payment = await Payment.findOne({
    contract: contractId,
    frozen: true
  });

  if (payment) {
    payment.frozen = false;
    payment.frozenAt = null;
    await payment.save();
  }

  return { success: true };
};

/**
 * Resolve a dispute (admin action)
 */
export const resolveDispute = async (disputeId, adminId, resolution, resolutionNotes) => {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  // Check if dispute can be resolved
  if (!dispute.canBeResolved()) {
    throw new Error('Only open disputes can be resolved');
  }

  // Validate resolution reason
  const validReasons = ['refund-client', 'approve-freelancer', 'split-payment', 'custom'];
  if (!validReasons.includes(resolution)) {
    throw new Error(`Invalid resolution reason. Must be one of: ${validReasons.join(', ')}`);
  }

  // Update dispute
  dispute.status = 'resolved';
  dispute.resolvingReason = resolution;
  dispute.resolvingReason = resolution;
  dispute.resolvedBy = adminId;
  dispute.resolvedAt = new Date();
  dispute.resolutionNotes = resolutionNotes || '';

  await dispute.save();

  // Unfreeze escrow
  await unfreezeEscrow(dispute.contract);

  // Handle resolution based on reason
  await handleResolution(dispute, resolution);

  // Populate before returning
  await dispute.populate([
    { path: 'raisedBy', select: 'firstName lastName' },
    { path: 'resolvedBy', select: 'firstName lastName' },
    { path: 'client', select: 'firstName lastName' },
    { path: 'freelancer', select: 'firstName lastName' }
  ]);

  return dispute;
};

/**
 * Handle the resolution outcome
 */
const handleResolution = async (dispute, resolution) => {
  const payment = await Payment.findOne({ contract: dispute.contract });

  if (!payment) {
    return;
  }

  switch (resolution) {
    case 'refund-client':
      // Refund client and mark contract as disputed
      payment.status = 'refunded';
      payment.refundedAt = new Date();
      payment.refundReason = 'Dispute resolved - refund to client';
      await payment.save();

      // Update contract status
      await Contract.findByIdAndUpdate(dispute.contract, {
        status: 'disputed',
        disputeOutcome: 'refund-client'
      });
      break;

    case 'approve-freelancer':
      // Release payment to freelancer
      payment.status = 'completed';
      payment.completedAt = new Date();
      await payment.save();

      // Update contract status
      await Contract.findByIdAndUpdate(dispute.contract, {
        status: 'completed',
        disputeOutcome: 'approve-freelancer'
      });
      break;

    case 'split-payment':
      // Split payment between parties (implementation depends on your system)
      // For now, mark as custom handling required
      payment.status = 'custom-handling';
      payment.customNotes = 'Dispute resolved with split payment arrangement';
      await payment.save();

      await Contract.findByIdAndUpdate(dispute.contract, {
        status: 'disputed',
        disputeOutcome: 'split-payment'
      });
      break;

    case 'custom':
      // Admin will handle manually
      payment.status = 'custom-handling';
      payment.customNotes = 'Dispute resolved with custom arrangement';
      await payment.save();

      await Contract.findByIdAndUpdate(dispute.contract, {
        status: 'disputed',
        disputeOutcome: 'custom'
      });
      break;

    default:
      break;
  }
};

/**
 * Reject a dispute (mark as invalid)
 */
export const rejectDispute = async (disputeId, adminId, resolutionNotes) => {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  if (!dispute.canBeResolved()) {
    throw new Error('Only open disputes can be rejected');
  }

  dispute.status = 'rejected';
  dispute.resolvedBy = adminId;
  dispute.resolvedAt = new Date();
  dispute.resolutionNotes = resolutionNotes || 'Dispute rejected by admin';

  await dispute.save();

  // Unfreeze escrow
  await unfreezeEscrow(dispute.contract);

  // Resume contract to completed
  await Contract.findByIdAndUpdate(dispute.contract, {
    status: 'completed',
    disputeOutcome: 'rejected'
  });

  // Populate before returning
  await dispute.populate([
    { path: 'raisedBy', select: 'firstName lastName' },
    { path: 'resolvedBy', select: 'firstName lastName' }
  ]);

  return dispute;
};

/**
 * Get disputes for a user (with access control)
 */
export const getDisputesForUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const total = await Dispute.countDocuments({
    $or: [
      { client: userId },
      { freelancer: userId }
    ]
  });

  const disputes = await Dispute.find({
    $or: [
      { client: userId },
      { freelancer: userId }
    ]
  })
    .populate('raisedBy', 'firstName lastName avatar')
    .populate('client', 'firstName lastName')
    .populate('freelancer', 'firstName lastName')
    .populate('evidence.uploadedBy', 'firstName lastName')
    .populate('resolvedBy', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const pages = Math.ceil(total / limit);

  return {
    disputes,
    pagination: { total, page, limit, pages }
  };
};

/**
 * Get a specific dispute (with access control)
 */
export const getDispute = async (disputeId, userId, userRole) => {

  const dispute = await Dispute.findById(disputeId);

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  const isInvolved = dispute.isUserInvolved(userId);
  const isAdmin = userRole === 'super_admin';

  if (!isInvolved && !isAdmin) {
    throw new Error('You do not have access to this dispute');
  }

  await dispute.populate([
    { path: 'raisedBy', select: 'firstName lastName avatar email' },
    { path: 'client', select: 'firstName lastName avatar' },
    { path: 'freelancer', select: 'firstName lastName avatar' },
    { path: 'evidence.uploadedBy', select: 'firstName lastName' },
    { path: 'resolvedBy', select: 'firstName lastName' },
    { path: 'contract', select: '_id status' }
  ]);

  return dispute;
};

/**
 * Get all open disputes (admin only)
 */
export const getOpenDisputes = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const total = await Dispute.countDocuments({ status: 'open' });

  const disputes = await Dispute.find({ status: 'open' })
    .populate('raisedBy', 'firstName lastName')
    .populate('client', 'firstName lastName')
    .populate('freelancer', 'firstName lastName')
    .populate('evidence.uploadedBy', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const pages = Math.ceil(total / limit);

  return {
    disputes,
    pagination: { total, page, limit, pages }
  };
};

/**
 * Get all resolved disputes (admin only)
 */
export const getResolvedDisputes = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const total = await Dispute.countDocuments({ status: { $in: ['resolved', 'rejected'] } });

  const disputes = await Dispute.find({ status: { $in: ['resolved', 'rejected'] } })
    .populate('raisedBy', 'firstName lastName')
    .populate('resolvedBy', 'firstName lastName')
    .populate('contract', '_id')
    .sort({ resolvedAt: -1 })
    .skip(skip)
    .limit(limit);

  const pages = Math.ceil(total / limit);

  return {
    disputes,
    pagination: { total, page, limit, pages }
  };
};

/**
 * Get statistics on disputes
 */
export const getDisputeStats = async () => {
  const total = await Dispute.countDocuments();
  const open = await Dispute.countDocuments({ status: 'open' });
  const resolved = await Dispute.countDocuments({ status: 'resolved' });
  const rejected = await Dispute.countDocuments({ status: 'rejected' });
  const frozenEscrows = await Dispute.countDocuments({ escrowFrozen: true });

  const avgResolutionTimeMs = await Dispute.aggregate([
    {
      $match: { resolvedAt: { $ne: null }, createdAt: { $ne: null } }
    },
    {
      $project: {
        resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] }
      }
    },
    {
      $group: {
        _id: null,
        avgTime: { $avg: '$resolutionTime' }
      }
    }
  ]);

  const avgResolutionTime = avgResolutionTimeMs[0]
    ? Math.round(avgResolutionTimeMs[0].avgTime / (1000 * 60 * 60)) // Convert to hours
    : 0;

  return {
    total,
    open,
    resolved,
    rejected,
    frozenEscrows,
    avgResolutionTimeHours: avgResolutionTime,
    resolutionRate: total > 0 ? ((resolved + rejected) / total * 100).toFixed(2) : 0
  };
};
