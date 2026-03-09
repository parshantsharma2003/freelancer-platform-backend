import { asyncHandler } from '../middleware/errorHandler.js';
import savedSearchService from '../services/savedSearchService.js';

// @desc    Create a new saved search
// @route   POST /api/saved-searches
// @access  Private (Freelancers only)
export const createSavedSearch = asyncHandler(async (req, res) => {
  const { name, filters, notificationSettings } = req.body;

  // Validate required fields
  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Search name is required'
    });
  }

  const savedSearch = await savedSearchService.createSavedSearch(
    req.user._id,
    {
      name,
      filters: filters || {},
      notificationSettings: notificationSettings || {}
    }
  );

  res.status(201).json({
    status: 'success',
    message: 'Saved search created successfully',
    data: savedSearch
  });
});

// @desc    Get all saved searches for current user
// @route   GET /api/saved-searches
// @access  Private (Freelancers only)
export const getSavedSearches = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await savedSearchService.getSavedSearchesForFreelancer(
    req.user._id,
    page,
    limit
  );

  res.status(200).json({
    status: 'success',
    data: result.data,
    pagination: result.pagination
  });
});

// @desc    Get a specific saved search
// @route   GET /api/saved-searches/:id
// @access  Private
export const getSavedSearch = asyncHandler(async (req, res) => {
  const savedSearch = await savedSearchService.getSavedSearch(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    data: savedSearch
  });
});

// @desc    Update a saved search
// @route   PATCH /api/saved-searches/:id
// @access  Private
export const updateSavedSearch = asyncHandler(async (req, res) => {
  const { name, filters, notificationSettings, isActive } = req.body;

  const savedSearch = await savedSearchService.updateSavedSearch(
    req.params.id,
    req.user._id,
    {
      name,
      filters,
      notificationSettings,
      isActive
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'Saved search updated successfully',
    data: savedSearch
  });
});

// @desc    Delete a saved search
// @route   DELETE /api/saved-searches/:id
// @access  Private
export const deleteSavedSearch = asyncHandler(async (req, res) => {
  await savedSearchService.deleteSavedSearch(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Saved search deleted successfully'
  });
});

// @desc    Get saved search statistics
// @route   GET /api/saved-searches/stats
// @access  Private
export const getSavedSearchStats = asyncHandler(async (req, res) => {
  const stats = await savedSearchService.getSavedSearchStats(req.user._id);

  res.status(200).json({
    status: 'success',
    data: stats
  });
});
