/**
 * BaseService - Foundation class for all business logic services
 * 
 * This class provides common functionality for all services:
 * - Database operations
 * - Logging
 * - Error handling
 * - Data validation
 * 
 * Learn: Services contain business logic and database operations.
 * Controllers call services to perform operations.
 */

const database = require('../config/database');
const logger = require('../utils/logger');

class BaseService {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = database;
    this.logger = logger;
  }

  /**
   * Find a record by ID
   * @param {number} id - Record ID
   * @param {Array} selectFields - Fields to select (optional)
   * @returns {Object|null} - Found record or null
   */
  async findById(id, selectFields = ['*']) {
    try {
      const fields = selectFields.join(', ');
      const query = `SELECT ${fields} FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Error finding ${this.tableName} by ID`, { 
        id, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find all records with optional filtering and pagination
   * @param {Object} filters - Filter conditions
   * @param {Object} pagination - Pagination parameters
   * @param {Array} selectFields - Fields to select
   * @returns {Object} - {data: Array, total: number}
   */
  async findAll(filters = {}, pagination = {}, selectFields = ['*']) {
    try {
      const { limit, offset } = pagination;
      const { whereClause, params } = this.buildWhereClause(filters);
      const fields = selectFields.join(', ');
      
      // Count total records
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated data
      let dataQuery = `SELECT ${fields} FROM ${this.tableName} ${whereClause}`;
      if (limit) {
        dataQuery += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      if (offset) {
        dataQuery += ` OFFSET $${params.length + 1}`;
        params.push(offset);
      }

      const dataResult = await this.db.query(dataQuery, params);

      return {
        data: dataResult.rows,
        total
      };
    } catch (error) {
      this.logger.error(`Error finding all ${this.tableName}`, { 
        filters, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create a new record
   * @param {Object} data - Data to insert
   * @returns {Object} - Created record
   */
  async create(data) {
    try {
      const { fields, values, placeholders } = this.buildInsertClause(data);
      
      const query = `
        INSERT INTO ${this.tableName} (${fields})
        VALUES (${placeholders})
        RETURNING *
      `;
      
      const result = await this.db.query(query, values);
      const created = result.rows[0];

      this.logger.info(`Created ${this.tableName}`, { 
        id: created.id, 
        data: this.sanitizeLogData(data) 
      });

      return created;
    } catch (error) {
      this.logger.error(`Error creating ${this.tableName}`, { 
        data: this.sanitizeLogData(data), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update a record by ID
   * @param {number} id - Record ID
   * @param {Object} data - Data to update
   * @returns {Object|null} - Updated record or null
   */
  async update(id, data) {
    try {
      const { setClause, values } = this.buildUpdateClause(data);
      values.push(id);

      const query = `
        UPDATE ${this.tableName} 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      const updated = result.rows[0];

      if (updated) {
        this.logger.info(`Updated ${this.tableName}`, { 
          id, 
          data: this.sanitizeLogData(data) 
        });
      }

      return updated || null;
    } catch (error) {
      this.logger.error(`Error updating ${this.tableName}`, { 
        id, 
        data: this.sanitizeLogData(data), 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete a record by ID
   * @param {number} id - Record ID
   * @returns {boolean} - True if deleted, false if not found
   */
  async delete(id) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [id]);
      
      const deleted = result.rowCount > 0;
      if (deleted) {
        this.logger.info(`Deleted ${this.tableName}`, { id });
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Error deleting ${this.tableName}`, { 
        id, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if a record exists
   * @param {Object} conditions - Conditions to check
   * @returns {boolean} - True if exists, false otherwise
   */
  async exists(conditions) {
    try {
      const { whereClause, params } = this.buildWhereClause(conditions);
      const query = `SELECT 1 FROM ${this.tableName} ${whereClause} LIMIT 1`;
      const result = await this.db.query(query, params);
      
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error(`Error checking existence in ${this.tableName}`, { 
        conditions, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Execute a custom query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object} - Query result
   */
  async executeQuery(query, params = []) {
    try {
      return await this.db.query(query, params);
    } catch (error) {
      this.logger.error('Error executing custom query', { 
        query, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Build WHERE clause from filter object
   * @param {Object} filters - Filter conditions
   * @returns {Object} - {whereClause: string, params: Array}
   */
  buildWhereClause(filters) {
    const conditions = [];
    const params = [];
    let paramCount = 0;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        paramCount++;
        
        if (Array.isArray(value)) {
          conditions.push(`${key} = ANY($${paramCount})`);
          params.push(value);
        } else if (typeof value === 'string' && value.includes('%')) {
          conditions.push(`${key} ILIKE $${paramCount}`);
          params.push(value);
        } else {
          conditions.push(`${key} = $${paramCount}`);
          params.push(value);
        }
      }
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    return { whereClause, params };
  }

  /**
   * Build INSERT clause from data object
   * @param {Object} data - Data to insert
   * @returns {Object} - {fields: string, values: Array, placeholders: string}
   */
  buildInsertClause(data) {
    const fields = Object.keys(data).join(', ');
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    return { fields, values, placeholders };
  }

  /**
   * Build UPDATE SET clause from data object
   * @param {Object} data - Data to update
   * @returns {Object} - {setClause: string, values: Array}
   */
  buildUpdateClause(data) {
    const updates = [];
    const values = [];
    let paramCount = 0;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        paramCount++;
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    });

    const setClause = updates.join(', ');
    
    return { setClause, values };
  }

  /**
   * Remove sensitive data from logs
   * @param {Object} data - Data to sanitize
   * @returns {Object} - Sanitized data
   */
  sanitizeLogData(data) {
    const sensitiveFields = ['password', 'password_hash', 'token', 'secret'];
    const sanitized = { ...data };

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Validate required fields
   * @param {Object} data - Data to validate
   * @param {Array} requiredFields - Required field names
   * @throws {Error} - Validation error
   */
  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field]);
    
    if (missing.length > 0) {
      const error = new Error(`Missing required fields: ${missing.join(', ')}`);
      error.name = 'ValidationError';
      error.details = { missingFields: missing };
      throw error;
    }
  }

  /**
   * Validate data types
   * @param {Object} data - Data to validate
   * @param {Object} schema - Validation schema
   * @throws {Error} - Validation error
   */
  validateTypes(data, schema) {
    const errors = [];

    Object.entries(schema).forEach(([field, expectedType]) => {
      if (data[field] !== undefined) {
        const actualType = typeof data[field];
        if (actualType !== expectedType) {
          errors.push(`${field} must be ${expectedType}, got ${actualType}`);
        }
      }
    });

    if (errors.length > 0) {
      const error = new Error(`Type validation failed: ${errors.join(', ')}`);
      error.name = 'ValidationError';
      error.details = { typeErrors: errors };
      throw error;
    }
  }
}

module.exports = BaseService;
