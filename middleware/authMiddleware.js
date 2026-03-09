import { verifyAccessToken } from '../utils/jwtUtils.js';
import User from '../models/User.js';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized. Please login.'
      });
    }

    try {
      // Verify token
      const decoded = verifyAccessToken(token);

      // Get user from token
      const user = await User.findById(decoded.userId).select('-password -refreshToken');

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'User not found. Token invalid.'
        });
      }

      if (!user.isActive || user.accountStatus === 'suspended' || user.accountStatus === 'closed') {
        return res.status(401).json({
          status: 'error',
          message: 'Your account is not active.'
        });
      }

      // Attach user to request
      req.user = user;
      next();

    } catch (error) {
      return res.status(401).json({
        status: 'error',
        message: 'Token verification failed. Please login again.'
      });
    }

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Authentication error',
      error: error.message
    });
  }
};

// Role-based access control
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

// Admin only middleware
export const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin only.'
    });
  }
  next();
};

// Super Admin only middleware - highest level access
export const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Super Admin only.'
    });
  }
  next();
};

// Admin or Super Admin middleware
export const adminOrSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin access required.'
    });
  }
  next();
};

// Freelancer only middleware
export const freelancerOnly = (req, res, next) => {
  if (req.user.role !== 'freelancer') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Freelancers only.'
    });
  }
  next();
};

// Client only middleware
export const clientOnly = (req, res, next) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Clients only.'
    });
  }
  next();
};

// Check if user owns the resource
export const checkOwnership = (model) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const resource = await model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          status: 'error',
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource or is admin/super_admin
      const isOwner = resource.user?.toString() === req.user._id.toString() ||
                      resource.client?.toString() === req.user._id.toString() ||
                      resource.freelancer?.toString() === req.user._id.toString();

      if (!isOwner && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to access this resource'
        });
      }

      req.resource = resource;
      next();

    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Error checking resource ownership',
        error: error.message
      });
    }
  };
};
