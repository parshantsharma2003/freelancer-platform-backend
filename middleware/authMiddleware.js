import { verifyAccessToken } from "../utils/jwtUtils.js";
import User from "../models/User.js";

/*
|--------------------------------------------------------------------------
| Protect Routes
|--------------------------------------------------------------------------
*/

export const protect = async (req, res, next) => {
  try {
    const tokenCandidates = [];
    let bearerToken;

    /*
    |--------------------------------------------------------------------------
    | 1. Check Authorization Header
    |--------------------------------------------------------------------------
    */

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      bearerToken = req.headers.authorization.split(" ")[1];
      tokenCandidates.push(bearerToken);
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Check Cookies (Secure Login Flow)
    |--------------------------------------------------------------------------
    */

    if (
      req.cookies?.accessToken &&
      req.cookies.accessToken !== bearerToken
    ) {
      tokenCandidates.push(req.cookies.accessToken);
    }

    if (tokenCandidates.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Not authorized. Please login."
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Verify JWT
    |--------------------------------------------------------------------------
    */

    let decoded = null;

    for (const token of tokenCandidates) {
      try {
        decoded = verifyAccessToken(token);
        break;
      } catch {
        // Try next token source if available.
      }
    }

    if (!decoded) {
      return res.status(401).json({
        status: "error",
        message: "Token invalid or expired"
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Fetch User
    |--------------------------------------------------------------------------
    */

    const user = await User.findById(decoded.sub).select(
      "-password -refreshToken"
    );

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "User not found"
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Account Status Check
    |--------------------------------------------------------------------------
    */

    if (!user.isActive || ["suspended", "closed"].includes(user.accountStatus)) {
      return res.status(403).json({
        status: "error",
        message: "Your account is not active"
      });
    }

    // --- Fraud Check Logic ---
    if (user.fraud?.riskScore > 80) {
      return res.status(403).json({
        status: "error",
        message: "Account flagged for fraud review"
      });
    }
    // -------------------------

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      status: "error",
      message: "Token invalid or expired"
    });
  }
};

/*
|--------------------------------------------------------------------------
| Role-Based Access Control
|--------------------------------------------------------------------------
*/

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "You do not have permission to perform this action"
      });
    }

    next();
  };
};

/*
|--------------------------------------------------------------------------
| Admin Only
|--------------------------------------------------------------------------
*/

export const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({
      status: "error",
      message: "Access denied. Admin only."
    });
  }

  next();
};

/*
|--------------------------------------------------------------------------
| Super Admin Only
|--------------------------------------------------------------------------
*/

export const superAdminOnly = (req, res, next) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({
      status: "error",
      message: "Access denied. Super Admin only."
    });
  }

  next();
};

/*
|--------------------------------------------------------------------------
| Admin OR Super Admin
|--------------------------------------------------------------------------
*/

export const adminOrSuperAdmin = (req, res, next) => {
  if (!["admin", "super_admin"].includes(req.user.role)) {
    return res.status(403).json({
      status: "error",
      message: "Admin access required"
    });
  }

  next();
};

/*
|--------------------------------------------------------------------------
| Freelancer Only
|--------------------------------------------------------------------------
*/

export const freelancerOnly = (req, res, next) => {
  if (req.user.role !== "freelancer") {
    return res.status(403).json({
      status: "error",
      message: "Freelancers only"
    });
  }

  next();
};

/*
|--------------------------------------------------------------------------
| Client Only
|--------------------------------------------------------------------------
*/

export const clientOnly = (req, res, next) => {
  if (req.user.role !== "client") {
    return res.status(403).json({
      status: "error",
      message: "Clients only"
    });
  }

  next();
};

/*
|--------------------------------------------------------------------------
| Ownership Check Middleware
|--------------------------------------------------------------------------
*/

export const checkOwnership = (model) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;

      const resource = await model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          status: "error",
          message: "Resource not found"
        });
      }

      const isOwner =
        resource.user?.toString() === req.user._id.toString() ||
        resource.client?.toString() === req.user._id.toString() ||
        resource.freelancer?.toString() === req.user._id.toString();

      if (
        !isOwner &&
        !["admin", "super_admin"].includes(req.user.role)
      ) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to access this resource"
        });
      }

      req.resource = resource;

      next();
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: "Ownership verification failed",
        error: error.message
      });
    }
  };
};