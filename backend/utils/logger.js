const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    const stackString = stack ? `\n${stack}` : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}${stackString}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'af-tms.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // File transport for error logs only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Security logging functions
logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, {
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'security'
  });
};

// Audit logging functions
logger.audit = (action, userId, resourceType, resourceId, changes = {}) => {
  logger.info(`[AUDIT] ${action}`, {
    userId,
    resourceType,
    resourceId,
    changes,
    timestamp: new Date().toISOString(),
    type: 'audit'
  });
};

// Compliance logging functions
logger.compliance = (message, meta = {}) => {
  logger.info(`[COMPLIANCE] ${message}`, {
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'compliance'
  });
};

// Transaction logging functions
logger.transaction = (transactionId, action, meta = {}) => {
  logger.info(`[TRANSACTION] ${action}`, {
    transactionId,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'transaction'
  });
};

// Alert logging functions
logger.alert = (alertId, action, meta = {}) => {
  logger.info(`[ALERT] ${action}`, {
    alertId,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'alert'
  });
};

module.exports = logger;
