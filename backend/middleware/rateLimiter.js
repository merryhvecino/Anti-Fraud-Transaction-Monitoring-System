const logger = require('../utils/logger');

// Simple in-memory rate limiter
const createRateLimiter = (windowMs, maxRequests) => {
  const store = new Map();
  
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (store.has(key)) {
      const requests = store.get(key).filter(timestamp => timestamp > windowStart);
      store.set(key, requests);
    } else {
      store.set(key, []);
    }
    
    const requests = store.get(key);
    
    if (requests.length >= maxRequests) {
      logger.security('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        requests: requests.length,
        maxRequests
      });
      
      return res.status(429).json({
        error: 'Too many requests, please try again later.',
        status: 429,
        timestamp: new Date().toISOString()
      });
    }
    
    requests.push(now);
    store.set(key, requests);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - requests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });
    
    next();
  };
};

// Create rate limiters
const rateLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // 100 requests
);

const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5 // 5 login attempts
);

const apiRateLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  60 // 60 requests per minute
);

module.exports = {
  rateLimiter,
  authRateLimiter,
  apiRateLimiter
};
