import { verifyAccessToken } from '../utils/jwtUtils.js';
import User from '../models/User.js';

/**
 * Socket authentication middleware
 * Verifies JWT token from socket handshake
 * Attaches user info to socket object
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      // Verify token
      const decoded = verifyAccessToken(token);
      const userId = decoded.sub || decoded.userId;

      if (!userId) {
        return next(new Error('Authentication error: Token missing subject claim'));
      }

      // Get user from database
      const user = await User.findById(userId).select('_id role email firstName');

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Allow socket connection even if account is inactive.
      // REST APIs still enforce account status via authMiddleware.

      // Attach user to socket
      socket.userId = user._id;
      socket.userRole = user.role;
      socket.userEmail = user.email;
      socket.userName = user.firstName;

      next();
    } catch (tokenError) {
      return next(new Error(`Authentication error: Invalid token - ${tokenError.message}`));
    }
  } catch (error) {
    return next(new Error(`Authentication error: ${error.message}`));
  }
};

/**
 * Verify socket has valid authentication
 */
export const isSocketAuthenticated = (socket) => {
  return socket.userId && socket.userRole;
};

/**
 * Check if socket user has specific role
 */
export const hasSocketRole = (socket, ...roles) => {
  return roles.includes(socket.userRole);
};
