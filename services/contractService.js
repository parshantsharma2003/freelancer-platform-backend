import Contract from '../models/Contract.js';

/**
 * Valid state transitions for contracts
 * Define which statuses can transition to which other statuses
 */
const VALID_TRANSITIONS = {
  draft: ['active'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
  disputed: ['resolved']
};

/**
 * Check if a status transition is valid
 */
export const isValidTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true; // No change
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
};

/**
 * Create a new contract (called when proposal is accepted)
 */
export const createContractFromProposal = async (proposal, job) => {
  const existingContract = await Contract.findOne({ proposal: proposal._id });
  if (existingContract) {
    return existingContract;
  }

  const proposedBudgetAmount =
    typeof proposal.proposedBudget === 'object'
      ? proposal.proposedBudget.amount
      : proposal.proposedBudget;
  const proposedBudgetType =
    typeof proposal.proposedBudget === 'object'
      ? proposal.proposedBudget.type
      : job.budget.type;
  const proposedBudgetCurrency =
    typeof proposal.proposedBudget === 'object'
      ? proposal.proposedBudget.currency
      : job.budget.currency;

  const contractData = {
    job: job._id,
    client: job.client,
    freelancer: proposal.freelancer,
    proposal: proposal._id,
    title: job.title,
    description: job.description,
    budget: {
      amount: proposedBudgetAmount,
      type: proposedBudgetType,
      currency: proposedBudgetCurrency || 'USD'
    },
    terms: job.description,
    status: 'active', // Automatically active when created from accepted proposal
    startDate: new Date(),
    statusHistory: [
      {
        status: 'active',
        changedAt: new Date(),
        changedBy: job.client
      }
    ],
    agreementSigned: {
      client: {
        signed: false
      },
      freelancer: {
        signed: false
      }
    }
  };

  // Add milestones if contract type is fixed with milestones
  if (proposal.milestones && proposal.milestones.length > 0) {
    contractData.milestones = proposal.milestones.map(m => ({
      title: m.title,
      description: m.description,
      amount: m.amount,
      dueDate: m.dueDate,
      status: 'pending'
    }));
  }

  const contract = await Contract.create(contractData);
  return contract;
};

/**
 * Update contract status with validation and audit logging
 * Only specific transitions are allowed
 */
export const updateContractStatus = async (contract, newStatus, userId, role) => {
  // Validate transition
  if (!isValidTransition(contract.status, newStatus)) {
    throw new Error(
      `Invalid status transition from ${contract.status} to ${newStatus}`
    );
  }

  // Authorization checks
  const isClient = contract.client.toString() === userId;
  const isFreelancer = contract.freelancer.toString() === userId;

  // Only client can pause or cancel
  if ((newStatus === 'paused' || newStatus === 'cancelled') && !isClient) {
    throw new Error('Only the client can pause or cancel a contract');
  }

  // Only system (payment controller) should complete contracts
  if (newStatus === 'completed' && role !== 'system' && !isClient) {
    throw new Error('Only the system can mark contracts as completed');
  }

  // Update status and add to history
  const oldStatus = contract.status;
  contract.status = newStatus;
  contract.updatedAt = new Date();

  // Add audit log entry
  contract.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy: userId
  });

  // Set end date if completing
  if (newStatus === 'completed') {
    contract.endDate = new Date();
  }

  await contract.save();

  return {
    contract,
    transition: {
      from: oldStatus,
      to: newStatus,
      changedBy: userId,
      changedAt: new Date()
    }
  };
};

/**
 * Prevent editing scope/terms after contract is active
 */
export const validateTermsNotLocked = (contract) => {
  // Terms are locked once contract transitions from draft to active
  if (contract.status !== 'draft') {
    throw new Error('Cannot modify contract terms after activation');
  }
};

/**
 * Get contract audit trail (status history)
 */
export const getContractAuditTrail = async (contractId) => {
  const contract = await Contract.findById(contractId)
    .select('statusHistory')
    .populate('statusHistory.changedBy', 'firstName lastName email');

  return contract?.statusHistory || [];
};

/**
 * Check if user can view contract
 */
export const canViewContract = (contract, userId, userRole) => {
  const isClient = contract.client.toString() === userId;
  const isFreelancer = contract.freelancer.toString() === userId;
  const isAdmin = userRole === 'super_admin';

  return isClient || isFreelancer || isAdmin;
};

/**
 * Check if user can update contract
 */
export const canUpdateContract = (contract, userId, allowedRoles = []) => {
  const isClient = contract.client.toString() === userId;
  return isClient || allowedRoles.includes('system');
};
