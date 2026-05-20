import Contract from '../models/Contract.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import FreelancerProfile from '../models/FreelancerProfile.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { canViewContract, isValidTransition } from '../services/contractService.js';

/* -------------------------------------------------------------------------- */
/*                             CREATE CONTRACT                                */
/* -------------------------------------------------------------------------- */

export const createContract = asyncHandler(async (req, res) => {

  // Prevent Mass Assignment
  const allowedFields = [
    'title',
    'description',
    'terms',
    'budget',
    'freelancer',
    'job',
    'startDate'
  ];

  const contractData = { client: req.user._id };

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      contractData[field] = req.body[field];
    }
  });

  if (contractData.budget) {
    const rawType = String(contractData.budget.type || '').trim().toLowerCase();
    if (rawType === 'fixed-price' || rawType === 'fixed_price' || rawType === 'fixedprice') {
      contractData.budget.type = 'fixed';
    } else if (!rawType) {
      contractData.budget.type = 'fixed';
    }
  }

  const contract = await Contract.create({
    ...contractData,
    status: 'draft',
    statusHistory: [
      {
        status: 'draft',
        changedAt: new Date(),
        changedBy: req.user._id
      }
    ],
    agreementSigned: {
      client: {
        signed: true,
        signedAt: new Date(),
        ipAddress: req.ip
      },
      freelancer: {
        signed: false
      }
    }
  });

  await Notification.create({
    recipient: contract.freelancer,
    type: 'contract_created',
    title: 'New Contract Created',
    message: `You have a new contract for "${contract.title}" ready for review`,
    relatedContract: contract._id,
    relatedUser: req.user._id,
    actionUrl: `/contracts/${contract._id}`,
    priority: 'high'
  });

  try {
    const io = req.app.get('io');

    if (io) {
      io.to(`user:${req.user._id}`).emit('contract_created', {
        contractId: contract._id,
        title: contract.title
      });

      io.to(`user:${contract.freelancer}`).emit('contract_created', {
        contractId: contract._id,
        title: contract.title,
        status: contract.status
      });
    }
  } catch (err) {
    console.log('Socket emit failed:', err.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Contract created successfully',
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                              GET MY CONTRACTS                              */
/* -------------------------------------------------------------------------- */

export const getMyContracts = asyncHandler(async (req, res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status;

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
    .limit(limit)
    .lean();

  const total = await Contract.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      contracts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });

});


/* -------------------------------------------------------------------------- */
/*                             GET CONTRACT BY ID                             */
/* -------------------------------------------------------------------------- */

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

  const isAuthorized =
    contract.client._id.toString() === req.user._id.toString() ||
    contract.freelancer._id.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized'
    });
  }

  res.status(200).json({
    status: 'success',
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                             UPDATE CONTRACT                                */
/* -------------------------------------------------------------------------- */

export const updateContract = asyncHandler(async (req, res) => {

  let contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  const isAuthorized =
    contract.client.toString() === req.user._id.toString() ||
    req.user.role === 'super_admin';

  if (!isAuthorized) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized'
    });
  }

  if (contract.status !== 'draft' && (req.body.terms || req.body.description || req.body.budget)) {
    return res.status(400).json({
      status: 'error',
      message: 'Contract terms cannot be modified after activation'
    });
  }

  const allowedFields = [
    'title',
    'description',
    'terms',
    'budget',
    'startDate'
  ];

  const updateData = {};

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  contract = await Contract.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'Contract updated successfully',
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                         ACCEPT DRAFT CONTRACT                              */
/* -------------------------------------------------------------------------- */

export const acceptContract = asyncHandler(async (req, res) => {

  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Only the assigned freelancer can accept this contract'
    });
  }

  if (contract.status !== 'draft') {
    return res.status(400).json({
      status: 'error',
      message: 'Only draft contracts can be accepted'
    });
  }

  contract.status = 'active';
  contract.updatedAt = new Date();
  contract.agreementSigned = contract.agreementSigned || {};
  contract.agreementSigned.freelancer = {
    signed: true,
    signedAt: new Date(),
    ipAddress: req.ip
  };
  contract.statusHistory.push({
    status: 'active',
    changedAt: new Date(),
    changedBy: req.user._id
  });

  await contract.save();

  await Notification.create({
    recipient: contract.client,
    type: 'contract_created',
    title: 'Contract Accepted',
    message: `Your contract for "${contract.title}" has been accepted and is now active.`,
    relatedContract: contract._id,
    relatedUser: req.user._id,
    actionUrl: `/contracts/${contract._id}`,
    priority: 'high'
  });

  try {
    const io = req.app.get('io');
    if (io) {
      const payload = {
        contractId: contract._id,
        oldStatus: 'draft',
        newStatus: 'active',
        timestamp: new Date()
      };

      io.to(`user:${contract.client}`).emit('contract:updated', payload);
      io.to(`user:${contract.freelancer}`).emit('contract:updated', payload);
    }
  } catch (socketError) {
    console.log('[Socket] Contract accept event failed (non-critical):', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'Contract accepted successfully',
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                              SUBMIT WORK                                   */
/* -------------------------------------------------------------------------- */

export const submitWork = asyncHandler(async (req, res) => {

  const contract = await Contract.findById(req.params.id);

  if (!contract) {
    return res.status(404).json({
      status: 'error',
      message: 'Contract not found'
    });
  }

  if (contract.freelancer.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized'
    });
  }

  contract.workSubmissions.push({
    ...req.body,
    submittedAt: new Date(),
    status: 'pending'
  });

  await contract.save();

  await Notification.create({
    recipient: contract.client,
    type: 'work_submitted',
    title: 'Work Submitted',
    message: `${req.user.firstName} submitted work`,
    relatedContract: contract._id
  });

  res.status(200).json({
    status: 'success',
    message: 'Work submitted successfully',
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                         UPDATE CONTRACT STATUS                             */
/* -------------------------------------------------------------------------- */

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

  const isClient = contract.client.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'super_admin';

  if (!isClient && !isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized'
    });
  }

  if (!isValidTransition(contract.status, status)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid transition ${contract.status} → ${status}`
    });
  }

  const oldStatus = contract.status;

  contract.status = status;
  contract.updatedAt = new Date();

  contract.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: req.user._id
  });

  if (status === 'completed') {

    await Job.findByIdAndUpdate(contract.job, { status: 'completed' });

    await FreelancerProfile.findOneAndUpdate(
      { user: contract.freelancer },
      {
        $inc: {
          totalJobs: 1,
          totalEarnings: contract.budget?.amount || 0
        }
      }
    );

  }

  await contract.save();

  try {
    const io = req.app.get('io');
    if (io) {
      const payload = {
        contractId: contract._id,
        oldStatus,
        newStatus: contract.status,
        timestamp: new Date()
      };

      io.to(`user:${contract.client}`).emit('contract:updated', payload);
      io.to(`user:${contract.freelancer}`).emit('contract:updated', payload);
    }
  } catch (socketError) {
    console.log('[Socket] Contract status update event failed (non-critical):', socketError.message);
  }

  res.status(200).json({
    status: 'success',
    message: `Contract status updated`,
    data: { contract }
  });

});


/* -------------------------------------------------------------------------- */
/*                         CONTRACT AUDIT TRAIL                               */
/* -------------------------------------------------------------------------- */

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

  if (!canViewContract(contract, req.user._id, req.user.role)) {
    return res.status(403).json({
      status: 'error',
      message: 'Not authorized'
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
