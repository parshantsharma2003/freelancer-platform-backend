import mongoose from 'mongoose';

/**
 * Middleware to validate MongoDB ObjectId parameters
 * Checks if the provided ID parameter is a valid MongoDB ObjectId
 */
export const validateObjectId = (req, res, next) => {
  // Get all ID parameters from the request
  const idParams = [
    req.params.id,
    req.params.jobId,
    req.params.proposalId,
    req.params.contractId,
    req.params.userId,
    req.params.freelancerId,
    req.params.inviteId,
    req.params.messageId,
    req.params.threadId,
  ].filter(Boolean); // Remove undefined values

  // Check if any ID parameter exists
  if (idParams.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No ID parameter provided'
    });
  }

  // Validate each ID parameter
  for (const id of idParams) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format: ${id}`
      });
    }
  }

  next();
};

export default validateObjectId;
