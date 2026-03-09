import Dispute from '../models/Dispute.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as disputeService from '../services/disputeService.js';

// @desc    Raise a new dispute on a contract
// @route   POST /api/disputes
// @access  Private
export const raiseDispute = asyncHandler(async (req, res) => {
  const { contractId, reason, description } = req.body;

  if (!contractId || !reason) {
    return res.status(400).json({
      status: 'error',
      message: 'contractId and reason are required'
    });
  }

  try {
    const dispute = await disputeService.raiseDispute(
      req.user._id,
      contractId,
      reason,
      description
    );

    res.status(201).json({
      status: 'success',
      message: 'Dispute raised successfully. Escrow has been frozen.',
      data: { dispute }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Add evidence to a dispute
// @route   POST /api/disputes/:id/evidence
// @access  Private
export const addEvidence = asyncHandler(async (req, res) => {
  const { title, description, fileUrl, fileName, fileSize, fileType } = req.body;

  if (!title || !fileUrl) {
    return res.status(400).json({
      status: 'error',
      message: 'title and fileUrl are required'
    });
  }

  try {
    const dispute = await disputeService.addEvidence(req.user._id, req.params.id, {
      title,
      description,
      fileUrl,
      fileName,
      fileSize,
      fileType
    });

    res.status(200).json({
      status: 'success',
      message: 'Evidence added successfully',
      data: { dispute }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get disputes for current user
// @route   GET /api/disputes
// @access  Private
export const getMyDisputes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const result = await disputeService.getDisputesForUser(
      req.user._id,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get a specific dispute (with access control)
// @route   GET /api/disputes/:id
// @access  Private
export const getDispute = asyncHandler(async (req, res) => {
  try {
    const dispute = await disputeService.getDispute(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      data: { dispute }
    });
  } catch (error) {
    // Handle not found vs unauthorized
    if (error.message === 'You do not have access to this dispute') {
      return res.status(403).json({
        status: 'error',
        message: error.message
      });
    }
    return res.status(404).json({
      status: 'error',
      message: error.message
    });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// @desc    Get all open disputes (admin only)
// @route   GET /api/admin/disputes/open
// @access  Private (Admin only)
export const getOpenDisputes = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { page = 1, limit = 20 } = req.query;

  try {
    const result = await disputeService.getOpenDisputes(parseInt(page), parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get all resolved disputes (admin only)
// @route   GET /api/admin/disputes/resolved
// @access  Private (Admin only)
export const getResolvedDisputes = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { page = 1, limit = 20 } = req.query;

  try {
    const result = await disputeService.getResolvedDisputes(parseInt(page), parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Resolve a dispute (admin only)
// @route   PATCH /api/disputes/:id/resolve
// @access  Private (Admin only)
export const resolveDisputeHandler = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { resolution, resolutionNotes } = req.body;

  if (!resolution) {
    return res.status(400).json({
      status: 'error',
      message: 'resolution is required (refund-client, approve-freelancer, split-payment, or custom)'
    });
  }

  try {
    const dispute = await disputeService.resolveDispute(
      req.params.id,
      req.user._id,
      resolution,
      resolutionNotes
    );

    res.status(200).json({
      status: 'success',
      message: `Dispute resolved as: ${resolution}. Escrow has been unfrozen.`,
      data: { dispute }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Reject a dispute (admin only)
// @route   PATCH /api/disputes/:id/reject
// @access  Private (Admin only)
export const rejectDisputeHandler = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  const { resolutionNotes } = req.body;

  try {
    const dispute = await disputeService.rejectDispute(
      req.params.id,
      req.user._id,
      resolutionNotes
    );

    res.status(200).json({
      status: 'success',
      message: 'Dispute rejected. Escrow has been unfrozen.',
      data: { dispute }
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

// @desc    Get dispute statistics (admin only)
// @route   GET /api/admin/disputes/stats
// @access  Private (Admin only)
export const getDisputeStats = asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }

  try {
    const stats = await disputeService.getDisputeStats();

    res.status(200).json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});
