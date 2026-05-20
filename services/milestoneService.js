import Milestone from '../models/Milestone.js';
import Contract from '../models/Contract.js';
import Payment from '../models/Payment.js';
import Notification from '../models/Notification.js';

/**
 * Check if contract has sufficient escrow balance for all milestones
 */
export const checkEscrowBalance = async (contractId) => {
  const milestones = await Milestone.find({ contract: contractId });
  const contract = await Contract.findById(contractId);

  const totalMilestoneAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
  const contractBudget = contract.budget.amount;

  return {
    totalRequired: totalMilestoneAmount,
    available: contractBudget,
    sufficient: contractBudget >= totalMilestoneAmount,
    shortfall: Math.max(0, totalMilestoneAmount - contractBudget)
  };
};

/**
 * Check if escrow funds are held for a milestone
 */
export const isEscrowHeld = async (milestoneId) => {
  const milestone = await Milestone.findById(milestoneId);
  return milestone?.escrow?.isHeld || false;
};

/**
 * Hold escrow funds when milestone is created
 * Called after payment deposit is confirmed
 */
export const holdEscrowFunds = async (milestoneId, paymentId) => {
  const existingMilestone = await Milestone.findById(milestoneId);
  if (!existingMilestone) {
    throw new Error('Milestone not found');
  }

  const milestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      'escrow.isHeld': true,
      'escrow.heldAmount': existingMilestone.amount,
      'escrow.heldAt': new Date(),
      'payment.paymentId': paymentId,
      status: 'funded',
      $push: {
        statusHistory: {
          status: 'funded',
          changedAt: new Date(),
          reason: 'Escrow funds held'
        }
      }
    },
    { new: true }
  );

  return milestone;
};

/**
 * Prevent double payment - check if already paid
 */
export const isAlreadyPaid = async (milestoneId) => {
  const milestone = await Milestone.findById(milestoneId);
  return milestone?.escrow?.paymentReleased || false;
};

/**
 * Mark milestone as in progress (freelancer only)
 */
export const startMilestoneWork = async (milestoneId, freelancerId) => {
  const milestone = await Milestone.findById(milestoneId);

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  const contract = await Contract.findById(milestone.contract);
  if (!contract || contract.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only assigned freelancer can start milestone work');
  }

  if (!milestone.escrow?.isHeld) {
    throw new Error('Milestone must be funded before starting work');
  }

  const allowedStartStatuses = ['funded', 'changes_requested'];
  if (!allowedStartStatuses.includes(milestone.status)) {
    throw new Error(
      `Milestone must be in funded or changes_requested status to start work. Current status: ${milestone.status}`
    );
  }

  const updatedMilestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      status: 'in_progress',
      $push: {
        statusHistory: {
          status: 'in_progress',
          changedAt: new Date(),
          changedBy: freelancerId,
          reason: 'Freelancer started milestone work'
        }
      }
    },
    { new: true }
  );

  return updatedMilestone;
};

/**
 * Release escrow funds to freelancer on approval
 * Integration with Stripe for actual fund transfer
 */
export const releaseEscrowFunds = async (
  milestoneId,
  contract,
  stripeAccountId,
  applicationFeePercent = 10
) => {
  // ✅ Prevent double payment
  if (await isAlreadyPaid(milestoneId)) {
    throw new Error('Funds already released for this milestone');
  }

  const milestone = await Milestone.findById(milestoneId);

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  // Calculate platform fee
  const platformFee = (milestone.amount * applicationFeePercent) / 100;
  const netAmount = milestone.amount - platformFee;

  // Create payment record
  const payment = await Payment.create({
    contract: contract._id,
    client: contract.client,
    freelancer: contract.freelancer,
    milestone: milestoneId,
    amount: milestone.amount,
    currency: contract.budget.currency || 'USD',
    type: 'release',
    status: 'completed',
    escrow: {
      isEscrowed: true,
      releasedAt: new Date(),
      releaseCondition: 'Milestone approved'
    },
    fees: {
      platformFee: {
        amount: platformFee,
        percentage: applicationFeePercent
      },
      totalFees: platformFee
    },
    netAmount: netAmount
  });

  // Update milestone with payment details
  const updatedMilestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      status: 'paid',
      'escrow.paymentReleased': true,
      'escrow.releaseTransactionId': payment._id.toString(),
      'escrow.releasedAt': new Date(),
      'payment.paymentId': payment._id,
      'payment.paidAt': new Date(),
      'payment.paidAmount': netAmount,
      'payment.platformFee': {
        amount: platformFee,
        percentage: applicationFeePercent
      },
      'payment.netAmount': netAmount,
      'payment.status': 'completed',
      $push: {
        statusHistory: {
          status: 'paid',
          changedAt: new Date(),
          reason: 'Escrow funds released to freelancer'
        }
      }
    },
    { new: true }
  );

  return {
    milestone: updatedMilestone,
    payment: payment,
    released: {
      grossAmount: milestone.amount,
      platformFee: platformFee,
      netAmount: netAmount
    }
  };
};

/**
 * Submit milestone work
 */
export const submitMilestoneWork = async (
  milestoneId,
  freelancerId,
  submissionData
) => {
  const milestone = await Milestone.findById(milestoneId);

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  // Add escrow protection. Reconcile from payment record if webhook/milestone sync lagged.
  if (!milestone.escrow.isHeld) {
    const escrowDeposit = await Payment.findOne({
      milestone: milestoneId,
      type: 'deposit',
      status: 'held-in-escrow'
    }).sort({ createdAt: -1 });

    if (escrowDeposit) {
      milestone.escrow.isHeld = true;
      milestone.escrow.heldAmount = escrowDeposit.amount;
      milestone.escrow.heldAt = milestone.escrow.heldAt || new Date();
      if (milestone.status === 'pending') {
        milestone.status = 'funded';
      }
      await milestone.save();
    }
  }

  if (!milestone.escrow.isHeld) {
    throw new Error('Milestone must be funded before submitting work');
  }

  // Only freelancer can submit work
  const contract = await Contract.findById(milestone.contract);
  if (contract.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only assigned freelancer can submit work');
  }

  const allowedSubmissionStatuses = ['in_progress'];
  if (!allowedSubmissionStatuses.includes(milestone.status)) {
    throw new Error(
      `Milestone must be in in_progress status before submission. Current status: ${milestone.status}`
    );
  }

  const updatedMilestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      status: 'submitted',
      'submission.submittedAt': new Date(),
      'submission.submittedBy': freelancerId,
      'submission.description': submissionData.description,
      'submission.attachments': submissionData.attachments || [],
      'submission.submissionNotes': submissionData.notes || '',
      $push: {
        statusHistory: {
          status: 'submitted',
          changedAt: new Date(),
          changedBy: freelancerId,
          reason: 'Work submitted for review'
        }
      }
    },
    { new: true }
  ).populate('submission.submittedBy', 'firstName lastName');

  return updatedMilestone;
};
/**
 * Approve milestone work (client only)
 */
export const approveMilestoneWork = async (
  milestoneId,
  clientId,
  approvalData
) => {
  const milestone = await Milestone.findById(milestoneId);

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  // Only client can approve
  const contract = await Contract.findById(milestone.contract);
  if (contract.client.toString() !== clientId.toString()) {
    throw new Error('Only client can approve milestone work');
  }

  // Can only approve if submitted
  if (milestone.status !== 'submitted') {
    throw new Error(
      `Milestone must be in 'submitted' status to approve. Current status: ${milestone.status}`
    );
  }

  // Check if revision requested
  if (approvalData.revisionRequested) {
    const updatedMilestone = await Milestone.findByIdAndUpdate(
      milestoneId,
      {
        status: 'changes_requested',
        'approval.approvedAt': new Date(),
        'approval.approvedBy': clientId,
        'approval.feedback': approvalData.feedback || '',
        'approval.revisionRequested': true,
        'approval.revisionNotes': approvalData.revisionNotes || '',
        $push: {
          statusHistory: {
            status: 'changes_requested',
            changedAt: new Date(),
            changedBy: clientId,
            reason: 'Revision requested'
          }
        }
      },
      { new: true }
    ).populate('approval.approvedBy', 'firstName lastName');

    return {
      milestone: updatedMilestone,
      requiresRevision: true
    };
  }

  // Approve milestone
  const updatedMilestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      status: 'approved',
      'approval.approvedAt': new Date(),
      'approval.approvedBy': clientId,
      'approval.feedback': approvalData.feedback || '',
      'approval.revisionRequested': false,
      $push: {
        statusHistory: {
          status: 'approved',
          changedAt: new Date(),
          changedBy: clientId,
          reason: 'Work approved by client'
        }
      }
    },
    { new: true }
  ).populate('approval.approvedBy', 'firstName lastName');

  return {
    milestone: updatedMilestone,
    requiresRevision: false
  };
};

/**
 * Reject milestone work
 */
export const rejectMilestoneWork = async (
  milestoneId,
  clientId,
  rejectionData
) => {
  const milestone = await Milestone.findById(milestoneId);

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  // Only client can reject
  const contract = await Contract.findById(milestone.contract);
  if (contract.client.toString() !== clientId.toString()) {
    throw new Error('Only client can reject milestone work');
  }

  // Can only reject if submitted
  if (milestone.status !== 'submitted') {
    throw new Error('Can only reject submitted milestones');
  }

  const updatedMilestone = await Milestone.findByIdAndUpdate(
    milestoneId,
    {
      status: 'rejected',
      'approval.approvedAt': new Date(),
      'approval.approvedBy': clientId,
      'approval.feedback': rejectionData.feedback || '',
      $push: {
        statusHistory: {
          status: 'rejected',
          changedAt: new Date(),
          changedBy: clientId,
          reason: 'Work rejected'
        }
      }
    },
    { new: true }
  ).populate('approval.approvedBy', 'firstName lastName');

  return updatedMilestone;
};

/**
 * Get contract milestone progress
 */
export const getContractProgress = async (contractId) => {
  const milestones = await Milestone.find({ contract: contractId })
    .sort({ createdAt: 1 });

  const total = milestones.length;
  const completed = milestones.filter(m => m.status === 'paid').length;
  const inReview = milestones.filter(m => m.status === 'submitted').length;
  const pending = milestones.filter(m => ['pending', 'funded', 'changes_requested', 'in_progress'].includes(m.status)).length;

  const totalBudget = milestones.reduce((sum, m) => sum + m.amount, 0);
  const releasedAmount = milestones
    .filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + m.amount, 0);

  return {
    totalMilestones: total,
    completedMilestones: completed,
    inReviewMilestones: inReview,
    pendingMilestones: pending,
    percentComplete: total > 0 ? (completed / total) * 100 : 0,
    budgetBreakdown: {
      total: totalBudget,
      released: releasedAmount,
      pending: totalBudget - releasedAmount,
      percentReleased: totalBudget > 0 ? (releasedAmount / totalBudget) * 100 : 0
    },
    milestones: milestones
  };
};

/**
 * Notify parties of milestone status change
 */
export const notifyMilestoneStatusChange = async (
  milestone,
  contract,
  changeType
) => {
  const notifications = {
    submitted: {
      recipient: contract.client,
      title: 'Milestone Work Submitted',
      message: `Freelancer submitted work for milestone: "${milestone.title}"`,
      type: 'milestone_submitted'
    },
    approved: {
      recipient: contract.freelancer,
      title: 'Milestone Approved',
      message: `Your milestone "${milestone.title}" has been approved!`,
      type: 'milestone_approved',
      priority: 'high'
    },
    paid: {
      recipient: contract.freelancer,
      title: 'Payment Released',
      message: `You received ${milestone.amount} for milestone: "${milestone.title}"`,
      type: 'milestone_paid',
      priority: 'high'
    },
    rejected: {
      recipient: contract.freelancer,
      title: 'Milestone Rejected',
      message: `Your milestone "${milestone.title}" needs revision`,
      type: 'milestone_rejected'
    }
  };

  const notifData = notifications[changeType];
  if (notifData) {
    await Notification.create({
      recipient: notifData.recipient,
      type: notifData.type,
      title: notifData.title,
      message: notifData.message,
      relatedContract: contract._id,
      relatedMilestone: milestone._id,
      actionUrl: `/contracts/${contract._id}/milestones/${milestone._id}`,
      priority: notifData.priority || 'medium'
    });
  }
};
