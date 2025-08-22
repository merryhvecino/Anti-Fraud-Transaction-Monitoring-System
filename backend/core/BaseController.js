/**
 * BaseController - Foundation class for all API controllers
 * 
 * This class provides common functionality that all controllers need:
 * - Response formatting
 * - Error handling
 * - Logging
 * - Validation helpers
 * 
 * Learn: All controllers extend this class to inherit common behavior
 */

const logger = require('../utils/logger');

class BaseController {
  constructor() {
    this.logger = logger;
  }

  /**
   * Send a successful response with data
   * @param {Object} res - Express response object
   * @param {*} data - Data to send
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
    const response = {
      success: true,
      message,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    this.logger.info('API Success Response', {
      statusCode,
      endpoint: res.req.path,
      method: res.req.method,
      userId: res.req.user?.id
    });

    return res.status(statusCode).json(response);
  }

  /**
   * Send an error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 400)
   * @param {*} details - Additional error details
   */
  sendError(res, message = 'An error occurred', statusCode = 400, details = null) {
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    if (details && process.env.NODE_ENV === 'development') {
      response.details = details;
    }

    this.logger.error('API Error Response', {
      statusCode,
      endpoint: res.req.path,
      method: res.req.method,
      error: message,
      userId: res.req.user?.id
    });

    return res.status(statusCode).json(response);
  }

  /**
   * Send a paginated response
   * @param {Object} res - Express response object
   * @param {Array} data - Array of data items
   * @param {Object} pagination - Pagination metadata
   * @param {string} message - Success message
   */
  sendPaginated(res, data, pagination, message = 'Data retrieved successfully') {
    return this.sendSuccess(res, {
      items: data,
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalRecords: pagination.totalRecords,
        limit: pagination.limit,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }, message);
  }

  /**
   * Handle async controller methods with automatic error catching
   * @param {Function} controllerMethod - The controller method to wrap
   * @returns {Function} - Express middleware function
   */
  asyncHandler(controllerMethod) {
    return async (req, res, next) => {
      try {
        await controllerMethod.call(this, req, res, next);
      } catch (error) {
        this.logger.error('Controller error', {
          error: error.message,
          stack: error.stack,
          endpoint: req.path,
          method: req.method,
          userId: req.user?.id
        });

        // Handle known error types
        if (error.name === 'ValidationError') {
          return this.sendError(res, 'Validation failed', 400, error.details);
        }

        if (error.code === '23505') { // PostgreSQL unique violation
          return this.sendError(res, 'Resource already exists', 409);
        }

        if (error.code === '23503') { // PostgreSQL foreign key violation
          return this.sendError(res, 'Referenced resource does not exist', 400);
        }

        // Default error response
        return this.sendError(res, 'Internal server error', 500);
      }
    };
  }

  /**
   * Validate required fields in request body
   * @param {Object} body - Request body
   * @param {Array} requiredFields - Array of required field names
   * @throws {Error} - Throws error if validation fails
   */
  validateRequired(body, requiredFields) {
    const missing = requiredFields.filter(field => !body[field]);
    
    if (missing.length > 0) {
      const error = new Error(`Missing required fields: ${missing.join(', ')}`);
      error.name = 'ValidationError';
      error.details = { missingFields: missing };
      throw error;
    }
  }

  /**
   * Parse and validate pagination parameters
   * @param {Object} query - Request query parameters
   * @returns {Object} - Parsed pagination parameters
   */
  parsePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Parse date range from query parameters
   * @param {Object} query - Request query parameters
   * @returns {Object} - Parsed date range
   */
  parseDateRange(query) {
    const { startDate, endDate } = query;
    
    return {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    };
  }

  /**
   * Log user action for audit purposes
   * @param {string} action - Action performed
   * @param {Object} req - Express request object
   * @param {string} resourceType - Type of resource affected
   * @param {string|number} resourceId - ID of resource affected
   * @param {Object} changes - Changes made (optional)
   */
  logUserAction(action, req, resourceType, resourceId, changes = {}) {
    this.logger.audit(action, req.user?.id, resourceType, resourceId, {
      ...changes,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = BaseController;
