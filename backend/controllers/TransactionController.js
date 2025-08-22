/**
 * TransactionController - Handles transaction-related HTTP requests
 * 
 * This controller manages:
 * - Transaction listing with filters and pagination
 * - Transaction details retrieval
 * - Bulk transaction import
 * - Transaction analytics and reporting
 * 
 * Learn: Controllers are the entry point for HTTP requests.
 * They validate input, call services, and format responses.
 */

const BaseController = require('../core/BaseController');
const TransactionService = require('../services/TransactionService');
const { authorize } = require('../middleware/auth');

class TransactionController extends BaseController {
  constructor() {
    super();
    this.transactionService = new TransactionService();
    
    // Bind methods to maintain 'this' context
    this.getTransactions = this.getTransactions.bind(this);
    this.getTransactionById = this.getTransactionById.bind(this);
    this.bulkImport = this.bulkImport.bind(this);
    this.getAnalytics = this.getAnalytics.bind(this);
  }

  /**
   * Get transactions with filtering and pagination
   * GET /api/transactions
   * 
   * Query parameters:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - startDate: Filter by start date (ISO string)
   * - endDate: Filter by end date (ISO string)
   * - minAmount: Minimum transaction amount
   * - maxAmount: Maximum transaction amount
   * - currency: Currency filter (e.g., 'NZD')
   * - transactionType: Type filter ('transfer', 'deposit', etc.)
   * - channel: Channel filter ('atm', 'online', etc.)
   * - status: Status filter ('completed', 'pending', etc.)
   * - search: Text search in transaction details
   */
  async getTransactions(req, res) {
    try {
      // Parse and validate pagination parameters
      const pagination = this.parsePagination(req.query);
      
      // Parse date range
      const dateRange = this.parseDateRange(req.query);
      
      // Build filters object
      const filters = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
        currency: req.query.currency,
        transactionType: req.query.transactionType,
        channel: req.query.channel,
        status: req.query.status,
        search: req.query.search,
        accountId: req.query.accountId ? parseInt(req.query.accountId) : undefined,
        customerId: req.query.customerId ? parseInt(req.query.customerId) : undefined
      };

      // Log the request for audit purposes
      this.logger.info('Transactions requested', {
        userId: req.user.id,
        filters: this.sanitizeFilters(filters),
        pagination
      });

      // Get transactions from service
      const result = await this.transactionService.getTransactions(filters, pagination);
      
      // Return paginated response
      return this.sendPaginated(res, result.transactions, result.pagination);

    } catch (error) {
      this.logger.error('Error getting transactions', {
        error: error.message,
        userId: req.user.id,
        query: req.query
      });
      throw error;
    }
  }

  /**
   * Get single transaction by ID
   * GET /api/transactions/:id
   */
  async getTransactionById(req, res) {
    try {
      const transactionId = parseInt(req.params.id);
      
      // Validate transaction ID
      if (isNaN(transactionId)) {
        return this.sendError(res, 'Invalid transaction ID', 400);
      }

      // Get transaction from service
      const transaction = await this.transactionService.getTransactionById(transactionId);
      
      if (!transaction) {
        return this.sendError(res, 'Transaction not found', 404);
      }

      // Log access for audit
      this.logUserAction('TRANSACTION_VIEWED', req, 'transaction', transactionId);

      return this.sendSuccess(res, { transaction }, 'Transaction retrieved successfully');

    } catch (error) {
      this.logger.error('Error getting transaction by ID', {
        error: error.message,
        transactionId: req.params.id,
        userId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Bulk import transactions
   * POST /api/transactions/bulk
   * 
   * Request body:
   * {
   *   "transactions": [
   *     {
   *       "transactionId": "TXN001",
   *       "fromAccountNumber": "ACC001",
   *       "toAccountNumber": "ACC002",
   *       "amount": 1000.00,
   *       "currency": "NZD",
   *       "transactionType": "transfer",
   *       "channel": "online",
   *       "description": "Payment for services",
   *       ...
   *     }
   *   ]
   * }
   */
  async bulkImport(req, res) {
    try {
      // Validate required fields
      this.validateRequired(req.body, ['transactions']);
      
      const { transactions } = req.body;
      
      // Validate transactions array
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return this.sendError(res, 'Transactions must be a non-empty array', 400);
      }
      
      if (transactions.length > 1000) {
        return this.sendError(res, 'Maximum 1000 transactions per batch', 400);
      }

      // Validate each transaction
      for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];
        try {
          this.validateRequired(txn, [
            'transactionId', 'fromAccountNumber', 'toAccountNumber',
            'amount', 'transactionType', 'channel'
          ]);
        } catch (validationError) {
          return this.sendError(res, 
            `Transaction ${i + 1}: ${validationError.message}`, 400);
        }
      }

      this.logger.info('Bulk transaction import started', {
        userId: req.user.id,
        transactionCount: transactions.length,
        importedBy: req.user.username
      });

      // Process bulk import
      const result = await this.transactionService.bulkImport(transactions);

      // Log successful import
      this.logUserAction('BULK_TRANSACTION_IMPORT', req, 'transactions', 'bulk', {
        totalTransactions: transactions.length,
        successful: result.successful,
        failed: result.failed
      });

      return this.sendSuccess(res, result, 'Bulk import completed', 201);

    } catch (error) {
      this.logger.error('Bulk transaction import failed', {
        error: error.message,
        userId: req.user.id,
        transactionCount: req.body.transactions?.length
      });
      throw error;
    }
  }

  /**
   * Get transaction analytics
   * GET /api/transactions/analytics/summary
   * 
   * Query parameters:
   * - timeframe: '24h', '7d', '30d', '90d' (default: '24h')
   */
  async getAnalytics(req, res) {
    try {
      const timeframe = req.query.timeframe || '24h';
      
      // Validate timeframe
      const validTimeframes = ['24h', '7d', '30d', '90d'];
      if (!validTimeframes.includes(timeframe)) {
        return this.sendError(res, 'Invalid timeframe. Use: 24h, 7d, 30d, or 90d', 400);
      }

      this.logger.info('Transaction analytics requested', {
        userId: req.user.id,
        timeframe
      });

      // Get analytics from service
      const analytics = await this.transactionService.getAnalytics(timeframe);

      return this.sendSuccess(res, analytics, 'Analytics retrieved successfully');

    } catch (error) {
      this.logger.error('Error getting transaction analytics', {
        error: error.message,
        userId: req.user.id,
        timeframe: req.query.timeframe
      });
      throw error;
    }
  }

  /**
   * Search transactions with advanced filters
   * POST /api/transactions/search
   */
  async searchTransactions(req, res) {
    try {
      const { query, filters, dateRange, sortBy, sortOrder } = req.body;
      
      const searchParams = {
        query,
        filters,
        dateRange,
        sortBy: sortBy || 'processed_at',
        sortOrder: sortOrder || 'desc'
      };

      this.logger.info('Advanced transaction search', {
        userId: req.user.id,
        searchParams: this.sanitizeFilters(searchParams)
      });

      const result = await this.transactionService.advancedSearch(searchParams);

      return this.sendSuccess(res, result, 'Search completed successfully');

    } catch (error) {
      this.logger.error('Transaction search failed', {
        error: error.message,
        userId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Get transaction statistics for dashboard
   * GET /api/transactions/stats
   */
  async getTransactionStats(req, res) {
    try {
      const timeframe = req.query.timeframe || '24h';
      
      this.logger.info('Transaction stats requested', {
        userId: req.user.id,
        timeframe
      });

      const stats = await this.transactionService.getTransactionStats(timeframe);

      return this.sendSuccess(res, stats, 'Transaction statistics retrieved');

    } catch (error) {
      this.logger.error('Error getting transaction stats', {
        error: error.message,
        userId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Helper method to sanitize filters for logging
   * @param {Object} filters - Filters object
   * @returns {Object} - Sanitized filters
   */
  sanitizeFilters(filters) {
    const sanitized = { ...filters };
    
    // Remove sensitive or large data from logs
    const sensitiveFields = ['accountDetails', 'customerData'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[FILTERED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Get routes for this controller
   * Learn: This method defines all routes handled by this controller
   */
  getRoutes() {
    const router = require('express').Router();

    // All routes require authentication and analyst+ role
    router.use(authorize(['analyst', 'supervisor', 'admin']));

    // Transaction routes
    router.get('/', this.asyncHandler(this.getTransactions));
    router.get('/analytics/summary', this.asyncHandler(this.getAnalytics));
    router.get('/stats', this.asyncHandler(this.getTransactionStats));
    router.get('/:id', this.asyncHandler(this.getTransactionById));
    
    // Bulk import (supervisor+ only)
    router.post('/bulk', 
      authorize(['supervisor', 'admin']), 
      this.asyncHandler(this.bulkImport)
    );
    
    // Advanced search
    router.post('/search', this.asyncHandler(this.searchTransactions));

    return router;
  }
}

module.exports = TransactionController;
