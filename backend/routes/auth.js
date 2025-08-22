const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  password: Joi.string().min(6).max(128).required()
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  role: Joi.string().valid('admin', 'supervisor', 'analyst', 'viewer').default('analyst'),
  department: Joi.string().max(50).optional()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    })
});

// Apply rate limiting to auth routes
router.use(authRateLimiter);

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    logger.security('Login attempt with invalid data', {
      error: error.details[0].message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(400).json({ 
      error: 'Invalid input data',
      details: error.details[0].message 
    });
  }

  const { username, password } = value;

  // Get user from database
  const userQuery = await database.query(
    'SELECT id, username, email, password_hash, first_name, last_name, role, department, is_active FROM users WHERE username = $1',
    [username]
  );

  if (userQuery.rows.length === 0) {
    logger.security('Login attempt with non-existent username', {
      username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = userQuery.rows[0];

  // Check if user is active
  if (!user.is_active) {
    logger.security('Login attempt with inactive user account', {
      userId: user.id,
      username: user.username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Account is inactive' });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    logger.security('Login attempt with invalid password', {
      userId: user.id,
      username: user.username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { 
      userId: user.id,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'af-tms',
      audience: 'af-tms-users'
    }
  );

  // Update last login
  await database.query(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [user.id]
  );

  // Log successful login
  logger.audit('USER_LOGIN', user.id, 'user', user.id, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Return user data and token (excluding password hash)
  const userData = {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    department: user.department
  };

  res.json({
    message: 'Login successful',
    token,
    user: userData,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
}));

// @route   POST /api/auth/register
// @desc    Register new user (admin only)
// @access  Private (Admin)
router.post('/register', asyncHandler(async (req, res) => {
  // Note: In production, this should be protected by admin authentication
  // For initial setup, we'll allow registration without auth
  
  // Validate input
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid input data',
      details: error.details[0].message 
    });
  }

  const { username, email, password, firstName, lastName, role, department } = value;

  // Check if user already exists
  const existingUser = await database.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );

  if (existingUser.rows.length > 0) {
    return res.status(409).json({ error: 'User with this username or email already exists' });
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  const newUserQuery = await database.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name, role, department)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, username, email, first_name, last_name, role, department, created_at`,
    [username, email, passwordHash, firstName, lastName, role, department]
  );

  const newUser = newUserQuery.rows[0];

  // Log user creation
  logger.audit('USER_CREATED', newUser.id, 'user', newUser.id, {
    username: newUser.username,
    email: newUser.email,
    role: newUser.role,
    createdBy: req.user?.id || 'system'
  });

  // Return user data (excluding sensitive information)
  const userData = {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    firstName: newUser.first_name,
    lastName: newUser.last_name,
    role: newUser.role,
    department: newUser.department,
    createdAt: newUser.created_at
  };

  res.status(201).json({
    message: 'User registered successfully',
    user: userData
  });
}));

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', require('../middleware/auth').authMiddleware, asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid input data',
      details: error.details[0].message 
    });
  }

  const { currentPassword, newPassword } = value;
  const userId = req.user.id;

  // Get current password hash
  const userQuery = await database.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (userQuery.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userQuery.rows[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValidPassword) {
    logger.security('Password change attempt with invalid current password', {
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await database.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newPasswordHash, userId]
  );

  // Log password change
  logger.audit('PASSWORD_CHANGED', userId, 'user', userId, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.json({ message: 'Password changed successfully' });
}));

// @route   GET /api/auth/me
// @desc    Get current user data
// @access  Private
router.get('/me', require('../middleware/auth').authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const userQuery = await database.query(
    'SELECT id, username, email, first_name, last_name, role, department, last_login, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (userQuery.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userQuery.rows[0];
  const userData = {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    department: user.department,
    lastLogin: user.last_login,
    createdAt: user.created_at
  };

  res.json({ user: userData });
}));

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', require('../middleware/auth').authMiddleware, asyncHandler(async (req, res) => {
  // Log logout
  logger.audit('USER_LOGOUT', req.user.id, 'user', req.user.id, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.json({ message: 'Logout successful' });
}));

module.exports = router;
