const jwt = require('jsonwebtoken');
const database = require('../config/database');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      logger.security('Authentication attempt without token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      logger.security('Authentication attempt with malformed token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. Invalid token format.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist and are active
    const userQuery = await database.query(
      'SELECT id, username, email, role, is_active, department FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userQuery.rows.length === 0) {
      logger.security('Authentication attempt with token for non-existent user', {
        userId: decoded.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. User not found.' });
    }

    const user = userQuery.rows[0];
    
    if (!user.is_active) {
      logger.security('Authentication attempt with token for inactive user', {
        userId: user.id,
        username: user.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. User account is inactive.' });
    }

    // Attach user to request
    req.user = user;
    
    // Update last activity (could be done asynchronously to improve performance)
    database.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    ).catch(error => {
      logger.error('Failed to update user last login', { userId: user.id, error });
    });

    // Log successful authentication for audit purposes
    logger.audit('USER_AUTHENTICATED', user.id, 'user', user.id, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.security('Authentication attempt with invalid token', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. Invalid token.' });
    }
    
    if (error.name === 'TokenExpiredError') {
      logger.security('Authentication attempt with expired token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({ error: 'Access denied. Token expired.' });
    }
    
    logger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

// Role-based authorization middleware
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.security('Authorization denied', {
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Permission check for specific resources
const checkResourcePermission = (resourceType, action = 'read') => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const resourceId = req.params.id;

      // Admin users have access to everything
      if (user.role === 'admin') {
        return next();
      }

      // Supervisor can access most resources in their department
      if (user.role === 'supervisor') {
        // Add department-based logic here if needed
        return next();
      }

      // Analyst and viewer permissions
      switch (resourceType) {
        case 'case':
          // Check if user is assigned to the case or created it
          const caseQuery = await database.query(
            'SELECT assigned_to, created_by FROM cases WHERE id = $1',
            [resourceId]
          );
          
          if (caseQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
          }
          
          const caseData = caseQuery.rows[0];
          if (caseData.assigned_to === user.id || caseData.created_by === user.id) {
            return next();
          }
          break;

        case 'alert':
          // Check if user is assigned to the alert
          const alertQuery = await database.query(
            'SELECT assigned_to FROM alerts WHERE id = $1',
            [resourceId]
          );
          
          if (alertQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
          }
          
          const alertData = alertQuery.rows[0];
          if (!alertData.assigned_to || alertData.assigned_to === user.id) {
            return next();
          }
          break;

        default:
          // For other resources, allow if user has analyst role or higher
          if (['analyst', 'supervisor', 'admin'].includes(user.role)) {
            return next();
          }
      }

      logger.security('Resource access denied', {
        userId: user.id,
        username: user.username,
        resourceType,
        resourceId,
        action,
        path: req.path
      });

      return res.status(403).json({ error: 'Access denied to this resource.' });
    } catch (error) {
      logger.error('Resource permission check error', {
        error: error.message,
        userId: req.user?.id,
        resourceType,
        resourceId: req.params.id
      });
      return res.status(500).json({ error: 'Error checking resource permissions.' });
    }
  };
};

module.exports = {
  authMiddleware,
  authorize,
  checkResourcePermission
};
