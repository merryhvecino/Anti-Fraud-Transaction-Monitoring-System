/**
 * AuthController - Handles user authentication and authorization
 * 
 * This controller manages:
 * - User login and logout
 * - Token generation and validation
 * - Password management
 * - User registration (admin only)
 * 
 * Learn: Controllers handle HTTP requests, validate input, call services, and return responses
 */

const BaseController = require('../core/BaseController');
const AuthService = require('../services/AuthService');
const { authRateLimiter } = require('../middleware/rateLimiter');

class AuthController extends BaseController {
  constructor() {
    super();
    this.authService = new AuthService();
    
    // Bind methods to maintain 'this' context
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.register = this.register.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.getCurrentUser = this.getCurrentUser.bind(this);
  }

  /**
   * User login endpoint
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      // Validate required fields
      this.validateRequired(req.body, ['username', 'password']);
      
      const { username, password } = req.body;

      // Log login attempt
      this.logger.security('Login attempt', {
        username,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Authenticate user
      const result = await this.authService.authenticate(username, password);

      // Log successful login
      this.logUserAction('USER_LOGIN', req, 'user', result.user.id);
      
      this.logger.security('Login successful', {
        userId: result.user.id,
        username: result.user.username,
        ip: req.ip
      });

      return this.sendSuccess(res, {
        token: result.token,
        user: result.user,
        expiresIn: result.expiresIn
      }, 'Login successful');

    } catch (error) {
      // Log failed login attempt
      this.logger.security('Login failed', {
        username: req.body.username,
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return this.sendError(res, error.message, 401);
    }
  }

  /**
   * User logout endpoint
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      // Log logout
      this.logUserAction('USER_LOGOUT', req, 'user', req.user.id);
      
      this.logger.security('User logout', {
        userId: req.user.id,
        username: req.user.username,
        ip: req.ip
      });

      return this.sendSuccess(res, null, 'Logout successful');

    } catch (error) {
      return this.sendError(res, 'Logout failed', 500);
    }
  }

  /**
   * User registration endpoint (admin only)
   * POST /api/auth/register
   */
  async register(req, res) {
    try {
      // Validate required fields
      this.validateRequired(req.body, [
        'username', 'email', 'password', 'firstName', 'lastName'
      ]);

      const userData = req.body;
      
      // Create new user
      const newUser = await this.authService.createUser(userData);

      // Log user creation
      this.logUserAction('USER_CREATED', req, 'user', newUser.id, {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      });

      return this.sendSuccess(res, {
        user: newUser
      }, 'User registered successfully', 201);

    } catch (error) {
      if (error.message.includes('already exists')) {
        return this.sendError(res, error.message, 409);
      }
      return this.sendError(res, error.message, 400);
    }
  }

  /**
   * Change password endpoint
   * POST /api/auth/change-password
   */
  async changePassword(req, res) {
    try {
      // Validate required fields
      this.validateRequired(req.body, ['currentPassword', 'newPassword']);
      
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Change password
      await this.authService.changePassword(userId, currentPassword, newPassword);

      // Log password change
      this.logUserAction('PASSWORD_CHANGED', req, 'user', userId);
      
      this.logger.security('Password changed', {
        userId,
        username: req.user.username,
        ip: req.ip
      });

      return this.sendSuccess(res, null, 'Password changed successfully');

    } catch (error) {
      this.logger.security('Password change failed', {
        userId: req.user.id,
        error: error.message,
        ip: req.ip
      });

      return this.sendError(res, error.message, 400);
    }
  }

  /**
   * Get current user information
   * GET /api/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;
      const user = await this.authService.getUserById(userId);

      if (!user) {
        return this.sendError(res, 'User not found', 404);
      }

      return this.sendSuccess(res, { user }, 'User information retrieved');

    } catch (error) {
      return this.sendError(res, 'Failed to get user information', 500);
    }
  }

  /**
   * Get routes for this controller
   * Learn: This method returns all the routes that this controller handles
   */
  getRoutes() {
    const router = require('express').Router();
    const { authMiddleware } = require('../middleware/auth');

    // Apply rate limiting to all auth routes
    router.use(authRateLimiter);

    // Public routes
    router.post('/login', this.asyncHandler(this.login));
    
    // Protected routes
    router.post('/logout', authMiddleware, this.asyncHandler(this.logout));
    router.post('/register', authMiddleware, this.asyncHandler(this.register));
    router.post('/change-password', authMiddleware, this.asyncHandler(this.changePassword));
    router.get('/me', authMiddleware, this.asyncHandler(this.getCurrentUser));

    return router;
  }
}

module.exports = AuthController;
