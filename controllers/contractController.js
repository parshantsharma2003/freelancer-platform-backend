import Contract from '../models/Contract.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import FreelancerProfile from '../models/FreelancerProfile.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { 
  validateTermsNotLocked,
  canViewContract,
  isValidTransition 
} from '../services/contractService.js';

// @desc    Create a contract
// @route   POST /api/contracts
// @access  Private (Clients only)
export const createContract = asyncHandler(async (req, res) => {
  const contractData = { ...req.body, client: req.user._id };

  const contract = await Contract.create(contractData);

  // Create notification for freelancer
  await Notification.create({
    recipient: contract.freelancer,
    type: 'contract_created',
    title: 'New Contract Created',
    message: `You have a new contract for "${contract.title}"`,
    relatedContract: contract._id,
    relatedUser: req.user._id,
    actionUrl: `/contracts/${contract._id}`,
    priority: 'high'
  });

  // Emit socket events for real-time updates
  try {
    const io = req.app.get('io');
    if (io) {
      // Notify client about contract creation
      io.to(`user:${req.user._id}`).emit('contract_created', {
        contractId: contract._id,
        title: contract.title,
        freelancerId: contract.freelancer,
        timestamp: new Date()
      });

      // Notify freelancer about contract creation
      io.to(`user:${contract.freelancer}`).emit('contract_created', {
        contractId: contract._id,
        title: contract.title,
        clientId: req.user._id,
        timestamp: new Date()
      });
    }
  } catch (socketError) {
    console.log('[Socket] Contract created event failed (non-critical):', socketError.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Contract created successfully',
    data: { contract }
  });
});

// @desc    Get my contracts
// @route   GET /api/contracts/my
// @access  Private
export const getMyContracts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = {
    $or: [
      { client: req.user._id },
      { freelancer: req.user._id }
    ]
  };

  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const contracts = await Contract.find(query)
    .populate('client', 'firstName lastName avatar')
    .populate('freelancer', 'firstName lastName avatar')
    .populate('job', 'title')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Contract.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      contracts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get contract by ID
// @route   GET /api/contracts/:id
// @access  Private (Contract participant only)
export const getContractById = asyncHandler(async (req, res) => {
  const contract = await Contract.findById(req.params.id)
    .populate('client', 'firstName lastName avatar email')
    .populate('freelancer', 'firstName lastName avatar email')
    .populate('job', 'title description');

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }
  // Check authorization
  const isAuthorized = 
    contract.client._id.toString() === req.user._id.toString() ||
    contract.freelancer._id.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this contract'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { contract }
  });
});

// @desc    Update contract
// @route   PUT /api/contracts/:id
// @access  Private
export const updateContract = asyncHandler(async (req, res) => {
  let contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  // Check authorization
  const isAuthorized = 
    contract.client.toString() === req.user._id.toString() ||
    contract.freelancer.toString() === req.user._id.toString();

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to update this contract'
    });
  }

  // 🔒 PREVENT TERMS EDIT AFTER ACTIVATION
  // Only allow edits to terms/scope in draft status
  if (contract.status !== 'draft' && (req.body.terms || req.body.description)) {
    return res.status(400).json({
      status: 'error',
      message: 'Cannot modify contract terms after activation. Terms are locked for active contracts.'
    });
  }

  // 🔒 PREVENT STATUS EDIT VIA THIS ENDPOINT
  // Status changes must go through the dedicated status endpoint
  if (req.body.status) {
    return res.status(400).json({
      status: 'error',
      message: 'Use PATCH /contracts/:id/status to update contract status'
    });
  }

  // Only allow updates to draft contracts or specific fields
  const allowedFields = ['title', 'description', 'terms', 'budget', 'startDate'];
  const updateData = {};
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  contract = await Contract.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    message: 'Contract updated successfully',
    data: { contract }
  });
});

// @desc    Submit work
// @route   POST /api/contracts/:id/submit
// @access  Private (Freelancer only)
export const submitWork = asyncHandler(async (req, res) => {
  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  // Check if user is the freelancer
  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to submit work for this contract'
    });
  }

  contract.workSubmissions.push({
    ...req.body,
    submittedAt: new Date(),
    status: 'pending'
  });

  await contract.save();

  // Create notification for client
  await Notification.create({
    recipient: contract.client,
    type: 'milestone_submitted',
    title: 'Work Submitted',
    message: `${req.user.firstName} submitted work for "${contract.title}"`,
    relatedContract: contract._id,
    relatedUser: req.user._id,
    actionUrl: `/contracts/${contract._id}`,
    priority: 'high'
  });

  res.status(200).json({
    status: 'success',
    message: 'Work submitted successfully',
    data: { contract }
  });
});

// @desc    Update contract status with validation
// @route   PATCH /api/contracts/:id/status
// @access  Private (Client can pause/cancel, system can complete)
export const updateContractStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      status: 'error',
      message: 'Status is required'
    });
  }

  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  // Check authorization
  const isClient = contract.client.toString() === req.user._id.toString();
  const isFreelancer = contract.freelancer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'super_admin';

  if (!isClient && !isFreelancer && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to update this contract'
    });
  }

  // Validate transition
  if (!isValidTransition(contract.status, status)) {
    const validTransitions = {
      draft: ['active'],
      active: ['paused', 'completed', 'cancelled'],
      paused: ['active', 'cancelled'],
      completed: [],
      cancelled: [],
      disputed: ['resolved']
    };
    
    return res.status(400).json({
      status: 'error',
      message: `Invalid status transition from ${contract.status} to ${status}. Valid transitions: ${
        validTransitions[contract.status]?.join(', ') || 'none'
      }`
    });
  }

  // Authorization for specific status changes
  // Only client can pause or cancel
  if ((status === 'paused' || status === 'cancelled') && !isClient) {
    return res.status(403).json({
      status: 'error',
      message: `Only the client can ${status} a contract`
    });
  }

  // Only system (via payment webhook) should normally complete, but allow admin/client for manual completion
  if (status === 'completed' && !isClient && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Only the client or system can mark contract as completed'
    });
  }

  // Update status
  const oldStatus = contract.status;
  contract.status = status;
  contract.updatedAt = new Date();

  // Add audit log entry
  contract.statusHistory.push({
    status: status,
    changedAt: new Date(),
    changedBy: req.user._id
  });

  // Set end date if completing
  if (status === 'completed') {
    contract.endDate = new Date();
  }

  await contract.save();

  // Update job status based on contract status
  if (status === 'completed') {
    await Job.findByIdAndUpdate(contract.job, { status: 'completed' });

    // Update freelancer stats
    await FreelancerProfile.findOneAndUpdate(
      { user: contract.freelancer },
      { 
        $inc: { 
          totalJobs: 1,
          totalEarnings: contract.totalPaid || contract.budget.amount
        }
      }
    );
  } else if (status === 'paused') {
    await Job.findByIdAndUpdate(contract.job, { status: 'paused' });
  } else if (status === 'cancelled') {
    await Job.findByIdAndUpdate(contract.job, { status: 'open' });
  }

  // Create notifications based on status change
  const notificationData = {
    paused: {
      type: 'contract_paused',
      title: 'Contract Paused',
      message: `Contract "${contract.title}" has been paused`
    },
    cancelled: {
      type: 'contract_cancelled',
      title: 'Contract Cancelled',
      message: `Contract "${contract.title}" has been cancelled`
    },
    completed: {
      type: 'contract_completed',
      title: 'Contract Completed',
      message: `Contract "${contract.title}" has been marked as completed`
    },
    active: {
      type: 'contract_resumed',
      title: 'Contract Resumed',
      message: `Contract "${contract.title}" has been resumed`
    }
  };

  if (notificationData[status]) {
    const { type, title, message } = notificationData[status];
    
    // Notify the other party
    const recipientId = isClient ? contract.freelancer : contract.client;
    await Notification.create({
      recipient: recipientId,
      type: type,
      title: title,
      message: message,
      relatedContract: contract._id,
      relatedUser: req.user._id,
      actionUrl: `/contracts/${contract._id}`,
      priority: 'high'
    });
  }

  console.log(`[Contract] Status updated: ${contract._id} ${oldStatus} → ${status} by user ${req.user._id}`);

  res.status(200).json({
    status: 'success',
    message: `Contract status updated to ${status}`,
    data: {
      contract,
      transition: {
        from: oldStatus,
        to: status,
        changedAt: new Date(),
        changedBy: req.user._id
      }
    }
  });
});

// @desc    Get contract audit trail (status history)
// @route   GET /api/contracts/:id/audit
// @access  Private (Contract participant only)
export const getContractAuditTrail = asyncHandler(async (req, res) => {
  const contract = await Contract.findById(req.params.id)
    .select('statusHistory title status')
    .populate('statusHistory.changedBy', 'firstName lastName email');

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  // Check authorization
  if (!canViewContract(contract, req.user._id, req.user.role)) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized to view this contract audit trail'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      contractId: contract._id,
      title: contract.title,
      currentStatus: contract.status,
      auditTrail: contract.statusHistory
    }
  });
});
