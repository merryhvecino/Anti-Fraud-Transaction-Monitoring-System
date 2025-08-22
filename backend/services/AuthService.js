/**
 * AuthService - Business logic for authentication and user management
 * 
 * This service handles:
 * - User authentication and password verification
 * - JWT token generation and validation
 * - User creation and management
 * - Password hashing and security
 * 
 * Learn: Services contain business logic and are called by controllers.
 * They interact with the database and implement security rules.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const BaseService = require('../core/BaseService');

class AuthService extends BaseService {
  constructor() {
    super('users'); // Set the table name for user operations
    
    // JWT configuration
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  }

  /**
   * Authenticate a user with username and password
   * @param {string} username - User's username
   * @param {string} password - User's password
   * @returns {Object} - {user, token, expiresIn}
   */
  async authenticate(username, password) {
    try {
      // Find user by username
      const user = await this.findUserByUsername(username);
      
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is inactive');
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Update last login timestamp
      await this.updateLastLogin(user.id);

      // Generate JWT token
      const token = this.generateToken(user);

      // Remove sensitive data from user object
      const userResponse = this.sanitizeUser(user);

      this.logger.info('User authenticated successfully', {
        userId: user.id,
        username: user.username
      });

      return {
        user: userResponse,
        token,
        expiresIn: this.jwtExpiresIn
      };

    } catch (error) {
      this.logger.error('Authentication failed', {
        username,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new user account
   * @param {Object} userData - User data
   * @returns {Object} - Created user (sanitized)
   */
  async createUser(userData) {
    try {
      const {
        username,
        email,
        password,
        firstName,
        lastName,
        role = 'analyst',
        department
      } = userData;

      // Validate password strength
      this.validatePassword(password);

      // Check if username or email already exists
      const existingUser = await this.findExistingUser(username, email);
      if (existingUser) {
        throw new Error('User with this username or email already exists');
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);

      // Create user data
      const newUserData = {
        username,
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role,
        department
      };

      // Create user in database
      const createdUser = await this.create(newUserData);

      this.logger.info('New user created', {
        userId: createdUser.id,
        username: createdUser.username,
        role: createdUser.role
      });

      return this.sanitizeUser(createdUser);

    } catch (error) {
      this.logger.error('User creation failed', {
        username: userData.username,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Change user password
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user
      const user = await this.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      this.validatePassword(newPassword);

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password in database
      await this.update(userId, { password_hash: newPasswordHash });

      this.logger.info('Password changed successfully', { userId });

    } catch (error) {
      this.logger.error('Password change failed', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user by ID (with sanitization)
   * @param {number} userId - User ID
   * @returns {Object|null} - Sanitized user data
   */
  async getUserById(userId) {
    try {
      const user = await this.findById(userId);
      return user ? this.sanitizeUser(user) : null;
    } catch (error) {
      this.logger.error('Error getting user by ID', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Object|null} - User data or null
   */
  async findUserByUsername(username) {
    try {
      const query = `
        SELECT * FROM users 
        WHERE username = $1
      `;
      const result = await this.executeQuery(query, [username]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error finding user by username', {
        username,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if user with username or email already exists
   * @param {string} username - Username
   * @param {string} email - Email
   * @returns {Object|null} - Existing user or null
   */
  async findExistingUser(username, email) {
    try {
      const query = `
        SELECT id, username, email 
        FROM users 
        WHERE username = $1 OR email = $2
      `;
      const result = await this.executeQuery(query, [username, email]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error checking existing user', {
        username,
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   * @param {number} userId - User ID
   */
  async updateLastLogin(userId) {
    try {
      await this.update(userId, { last_login: new Date() });
    } catch (error) {
      // Don't throw error for last login update failure
      this.logger.warn('Failed to update last login', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User object
   * @returns {string} - JWT token
   */
  generateToken(user) {
    try {
      const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        department: user.department
      };

      return jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.jwtExpiresIn,
        issuer: 'af-tms',
        audience: 'af-tms-users'
      });
    } catch (error) {
      this.logger.error('Error generating JWT token', {
        userId: user.id,
        error: error.message
      });
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} - Decoded token payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'af-tms',
        audience: 'af-tms-users'
      });
    } catch (error) {
      this.logger.error('Token verification failed', {
        error: error.message
      });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Hash password using bcrypt
   * @param {string} password - Plain text password
   * @returns {string} - Hashed password
   */
  async hashPassword(password) {
    try {
      return await bcrypt.hash(password, this.bcryptRounds);
    } catch (error) {
      this.logger.error('Password hashing failed', {
        error: error.message
      });
      throw new Error('Failed to secure password');
    }
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {boolean} - True if valid
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Password verification failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @throws {Error} - If password is invalid
   */
  validatePassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Check for complexity requirements
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new Error(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }
  }

  /**
   * Remove sensitive data from user object
   * @param {Object} user - User object
   * @returns {Object} - Sanitized user object
   */
  sanitizeUser(user) {
    const {
      password_hash,
      ...sanitizedUser
    } = user;

    // Convert snake_case to camelCase for frontend
    return {
      id: sanitizedUser.id,
      username: sanitizedUser.username,
      email: sanitizedUser.email,
      firstName: sanitizedUser.first_name,
      lastName: sanitizedUser.last_name,
      role: sanitizedUser.role,
      department: sanitizedUser.department,
      isActive: sanitizedUser.is_active,
      lastLogin: sanitizedUser.last_login,
      createdAt: sanitizedUser.created_at,
      updatedAt: sanitizedUser.updated_at
    };
  }
}

module.exports = AuthService;
