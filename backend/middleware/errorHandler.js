const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    body: req.body
  });

  // Default error response
  let status = 500;
  let message = 'Internal Server Error';
  let details = {};

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
    details = err.details || {};
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid ID format';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    status = 409;
    message = 'Resource already exists';
    details = { constraint: err.constraint };
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    status = 400;
    message = 'Referenced resource does not exist';
    details = { constraint: err.constraint };
  } else if (err.code === '23514') { // PostgreSQL check violation
    status = 400;
    message = 'Data violates constraints';
    details = { constraint: err.constraint };
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired';
  } else if (err.status || err.statusCode) {
    status = err.status || err.statusCode;
    message = err.message;
  }

  // Security logging for authentication/authorization errors
  if (status === 401 || status === 403) {
    logger.security('Authentication/Authorization error', {
      status,
      message,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
  }

  // Don't leak internal error details in production
  const response = {
    error: message,
    status,
    timestamp: new Date().toISOString()
  };

  // Include error details in development mode
  if (process.env.NODE_ENV === 'development') {
    response.details = details;
    response.stack = err.stack;
  }

  res.status(status).json(response);
};

// 404 handler
const notFoundHandler = (req, res) => {
  logger.warn('404 - Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  res.status(404).json({
    error: 'Route not found',
    status: 404,
    timestamp: new Date().toISOString(),
    path: req.url
  });
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
