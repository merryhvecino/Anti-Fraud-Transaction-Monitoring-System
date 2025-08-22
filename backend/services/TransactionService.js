/**
 * TransactionService - Business logic for transaction operations
 * 
 * This service handles:
 * - Transaction data retrieval and filtering
 * - Bulk transaction processing
 * - Transaction analytics and statistics
 * - Data validation and business rules
 * 
 * Learn: Services contain the core business logic of the application.
 * They interact with the database and implement business rules.
 */

const BaseService = require('../core/BaseService');

class TransactionService extends BaseService {
  constructor() {
    super('transactions'); // Set the primary table name
  }

  /**
   * Get transactions with advanced filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination parameters
   * @returns {Object} - {transactions: Array, pagination: Object}
   */
  async getTransactions(filters = {}, pagination = {}) {
    try {
      const { limit, offset, page } = pagination;
      
      // Build the complex query with joins
      const baseQuery = `
        SELECT 
          t.id,
          t.transaction_id,
          t.amount,
          t.currency,
          t.transaction_type,
          t.channel,
          t.description,
          t.reference_number,
          t.status,
          t.processed_at,
          t.created_at,
          t.ip_address,
          t.location_country,
          t.location_city,
          fa.account_number as from_account_number,
          fc.first_name as from_customer_first_name,
          fc.last_name as from_customer_last_name,
          ta.account_number as to_account_number,
          tc.first_name as to_customer_first_name,
          tc.last_name as to_customer_last_name
        FROM transactions t
        LEFT JOIN accounts fa ON t.from_account_id = fa.id
        LEFT JOIN customers fc ON fa.customer_id = fc.id
        LEFT JOIN accounts ta ON t.to_account_id = ta.id
        LEFT JOIN customers tc ON ta.customer_id = tc.id
      `;

      // Build WHERE clause from filters
      const { whereClause, params } = this.buildTransactionWhereClause(filters);

      // Count total records
      const countQuery = `
        SELECT COUNT(*) as total
        FROM transactions t
        LEFT JOIN accounts fa ON t.from_account_id = fa.id
        LEFT JOIN accounts ta ON t.to_account_id = ta.id
        ${whereClause}
      `;
      
      const countResult = await this.executeQuery(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated data
      let dataQuery = `${baseQuery} ${whereClause} ORDER BY t.processed_at DESC`;
      
      if (limit) {
        dataQuery += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      
      if (offset) {
        dataQuery += ` OFFSET $${params.length + 1}`;
        params.push(offset);
      }

      const dataResult = await this.executeQuery(dataQuery, params);

      // Calculate pagination metadata
      const totalPages = limit ? Math.ceil(total / limit) : 1;
      const paginationMeta = {
        currentPage: page || 1,
        totalPages,
        totalRecords: total,
        limit: limit || total,
        hasNext: page ? page < totalPages : false,
        hasPrev: page ? page > 1 : false
      };

      this.logger.info('Transactions retrieved', {
        total,
        filtered: dataResult.rows.length,
        filters: this.sanitizeLogData(filters)
      });

      return {
        transactions: dataResult.rows,
        pagination: paginationMeta
      };

    } catch (error) {
      this.logger.error('Error getting transactions', {
        filters: this.sanitizeLogData(filters),
        pagination,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get a single transaction by ID with full details
   * @param {number} transactionId - Transaction ID
   * @returns {Object|null} - Transaction details or null
   */
  async getTransactionById(transactionId) {
    try {
      const query = `
        SELECT 
          t.*,
          fa.account_number as from_account_number,
          fi.name as from_institution_name,
          fc.first_name as from_customer_first_name,
          fc.last_name as from_customer_last_name,
          fc.email as from_customer_email,
          fc.risk_rating as from_customer_risk_rating,
          ta.account_number as to_account_number,
          ti.name as to_institution_name,
          tc.first_name as to_customer_first_name,
          tc.last_name as to_customer_last_name,
          tc.email as to_customer_email,
          tc.risk_rating as to_customer_risk_rating
        FROM transactions t
        LEFT JOIN accounts fa ON t.from_account_id = fa.id
        LEFT JOIN institutions fi ON fa.institution_id = fi.id
        LEFT JOIN customers fc ON fa.customer_id = fc.id
        LEFT JOIN accounts ta ON t.to_account_id = ta.id
        LEFT JOIN institutions ti ON ta.institution_id = ti.id
        LEFT JOIN customers tc ON ta.customer_id = tc.id
        WHERE t.id = $1
      `;

      const result = await this.executeQuery(query, [transactionId]);
      const transaction = result.rows[0];

      if (!transaction) {
        return null;
      }

      // Get related alerts for this transaction
      const alertsQuery = `
        SELECT 
          id,
          alert_id,
          alert_type,
          severity,
          status,
          score,
          details,
          created_at
        FROM alerts 
        WHERE transaction_id = $1
        ORDER BY created_at DESC
      `;

      const alertsResult = await this.executeQuery(alertsQuery, [transactionId]);

      // Combine transaction with alerts
      const transactionWithAlerts = {
        ...transaction,
        alerts: alertsResult.rows
      };

      this.logger.info('Transaction retrieved by ID', {
        transactionId,
        alertCount: alertsResult.rows.length
      });

      return transactionWithAlerts;

    } catch (error) {
      this.logger.error('Error getting transaction by ID', {
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Bulk import transactions
   * @param {Array} transactions - Array of transaction data
   * @returns {Object} - Import summary
   */
  async bulkImport(transactions) {
    const client = await this.db.getClient();
    const imported = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];
        
        try {
          // Validate and process each transaction
          const processedTxn = await this.processTransactionForImport(txn, client);
          imported.push({
            index: i,
            transactionId: processedTxn.transaction_id,
            id: processedTxn.id
          });

        } catch (txnError) {
          errors.push({
            index: i,
            transactionId: txn.transactionId,
            error: txnError.message
          });
        }
      }

      await client.query('COMMIT');

      const summary = {
        total: transactions.length,
        successful: imported.length,
        failed: errors.length,
        imported,
        errors: errors.slice(0, 10) // Limit error details
      };

      this.logger.info('Bulk import completed', summary);

      return summary;

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Bulk import failed', {
        error: error.message,
        transactionCount: transactions.length
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process a single transaction for import
   * @param {Object} txnData - Transaction data
   * @param {Object} client - Database client
   * @returns {Object} - Processed transaction
   */
  async processTransactionForImport(txnData, client) {
    // Validate required fields
    this.validateRequired(txnData, [
      'transactionId', 'fromAccountNumber', 'toAccountNumber',
      'amount', 'transactionType', 'channel'
    ]);

    // Get account IDs
    const fromAccountQuery = await client.query(
      'SELECT id FROM accounts WHERE account_number = $1',
      [txnData.fromAccountNumber]
    );

    const toAccountQuery = await client.query(
      'SELECT id FROM accounts WHERE account_number = $1',
      [txnData.toAccountNumber]
    );

    if (fromAccountQuery.rows.length === 0) {
      throw new Error(`From account ${txnData.fromAccountNumber} not found`);
    }

    if (toAccountQuery.rows.length === 0) {
      throw new Error(`To account ${txnData.toAccountNumber} not found`);
    }

    // Validate business rules
    await this.validateTransactionBusinessRules(txnData);

    // Insert transaction
    const insertQuery = `
      INSERT INTO transactions (
        transaction_id, from_account_id, to_account_id, amount, currency,
        transaction_type, channel, description, reference_number,
        ip_address, device_fingerprint, location_country, location_city,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const insertResult = await client.query(insertQuery, [
      txnData.transactionId,
      fromAccountQuery.rows[0].id,
      toAccountQuery.rows[0].id,
      txnData.amount,
      txnData.currency || 'NZD',
      txnData.transactionType,
      txnData.channel,
      txnData.description,
      txnData.referenceNumber,
      txnData.ipAddress,
      txnData.deviceFingerprint,
      txnData.locationCountry,
      txnData.locationCity,
      txnData.processedAt || new Date()
    ]);

    return insertResult.rows[0];
  }

  /**
   * Validate transaction business rules
   * @param {Object} txnData - Transaction data
   */
  async validateTransactionBusinessRules(txnData) {
    // Amount validation
    if (txnData.amount <= 0) {
      throw new Error('Transaction amount must be positive');
    }

    if (txnData.amount > 1000000) { // NZD 1M limit
      throw new Error('Transaction amount exceeds maximum limit');
    }

    // Currency validation
    const validCurrencies = ['NZD', 'AUD', 'USD', 'EUR', 'GBP'];
    if (txnData.currency && !validCurrencies.includes(txnData.currency)) {
      throw new Error(`Invalid currency: ${txnData.currency}`);
    }

    // Transaction type validation
    const validTypes = ['transfer', 'deposit', 'withdrawal', 'payment'];
    if (!validTypes.includes(txnData.transactionType)) {
      throw new Error(`Invalid transaction type: ${txnData.transactionType}`);
    }

    // Channel validation
    const validChannels = ['atm', 'online', 'mobile', 'branch', 'wire'];
    if (!validChannels.includes(txnData.channel)) {
      throw new Error(`Invalid channel: ${txnData.channel}`);
    }
  }

  /**
   * Get transaction analytics for specified timeframe
   * @param {string} timeframe - Time period ('24h', '7d', '30d', '90d')
   * @returns {Object} - Analytics data
   */
  async getAnalytics(timeframe) {
    try {
      const timeCondition = this.getTimeCondition(timeframe);

      // Basic metrics
      const metricsQuery = `
        SELECT 
          COUNT(*) as total_transactions,
          SUM(amount) as total_volume,
          AVG(amount) as avg_amount,
          COUNT(DISTINCT from_account_id) as unique_senders,
          COUNT(DISTINCT to_account_id) as unique_receivers,
          COUNT(CASE WHEN currency != 'NZD' THEN 1 END) as foreign_currency_count
        FROM transactions 
        WHERE ${timeCondition}
      `;

      // Transaction type breakdown
      const typeBreakdownQuery = `
        SELECT 
          transaction_type,
          COUNT(*) as count,
          SUM(amount) as volume,
          AVG(amount) as avg_amount
        FROM transactions 
        WHERE ${timeCondition}
        GROUP BY transaction_type
        ORDER BY volume DESC
      `;

      // Channel breakdown
      const channelBreakdownQuery = `
        SELECT 
          channel,
          COUNT(*) as count,
          SUM(amount) as volume
        FROM transactions 
        WHERE ${timeCondition}
        GROUP BY channel
        ORDER BY count DESC
      `;

      // Hourly distribution
      const hourlyQuery = `
        SELECT 
          EXTRACT(hour FROM processed_at) as hour,
          COUNT(*) as count,
          SUM(amount) as volume
        FROM transactions 
        WHERE ${timeCondition}
        GROUP BY EXTRACT(hour FROM processed_at)
        ORDER BY hour
      `;

      // Risk indicators
      const riskQuery = `
        SELECT 
          COUNT(CASE WHEN amount > 10000 THEN 1 END) as large_transactions,
          COUNT(CASE WHEN location_country != 'NZ' THEN 1 END) as international_transactions,
          COUNT(CASE WHEN EXTRACT(hour FROM processed_at) NOT BETWEEN 8 AND 18 THEN 1 END) as after_hours_transactions
        FROM transactions 
        WHERE ${timeCondition}
      `;

      const [metricsResult, typeResult, channelResult, hourlyResult, riskResult] = await Promise.all([
        this.executeQuery(metricsQuery),
        this.executeQuery(typeBreakdownQuery),
        this.executeQuery(channelBreakdownQuery),
        this.executeQuery(hourlyQuery),
        this.executeQuery(riskQuery)
      ]);

      const analytics = {
        timeframe,
        generatedAt: new Date().toISOString(),
        metrics: metricsResult.rows[0],
        breakdowns: {
          byType: typeResult.rows,
          byChannel: channelResult.rows,
          byHour: hourlyResult.rows
        },
        riskIndicators: riskResult.rows[0]
      };

      this.logger.info('Transaction analytics generated', {
        timeframe,
        totalTransactions: analytics.metrics.total_transactions
      });

      return analytics;

    } catch (error) {
      this.logger.error('Error generating transaction analytics', {
        timeframe,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Build WHERE clause for transaction filters
   * @param {Object} filters - Filter object
   * @returns {Object} - {whereClause: string, params: Array}
   */
  buildTransactionWhereClause(filters) {
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Date range filters
    if (filters.startDate) {
      paramCount++;
      conditions.push(`t.processed_at >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`t.processed_at <= $${paramCount}`);
      params.push(filters.endDate);
    }

    // Amount filters
    if (filters.minAmount !== undefined) {
      paramCount++;
      conditions.push(`t.amount >= $${paramCount}`);
      params.push(filters.minAmount);
    }

    if (filters.maxAmount !== undefined) {
      paramCount++;
      conditions.push(`t.amount <= $${paramCount}`);
      params.push(filters.maxAmount);
    }

    // Exact match filters
    const exactMatchFields = ['currency', 'transaction_type', 'channel', 'status'];
    exactMatchFields.forEach(field => {
      if (filters[field]) {
        paramCount++;
        conditions.push(`t.${field} = $${paramCount}`);
        params.push(filters[field]);
      }
    });

    // Account filters
    if (filters.accountId) {
      paramCount++;
      conditions.push(`(t.from_account_id = $${paramCount} OR t.to_account_id = $${paramCount})`);
      params.push(filters.accountId);
    }

    if (filters.customerId) {
      paramCount++;
      conditions.push(`(fa.customer_id = $${paramCount} OR ta.customer_id = $${paramCount})`);
      params.push(filters.customerId);
    }

    // Text search
    if (filters.search) {
      paramCount++;
      conditions.push(`(
        t.transaction_id ILIKE $${paramCount} OR
        t.description ILIKE $${paramCount} OR
        t.reference_number ILIKE $${paramCount} OR
        fa.account_number ILIKE $${paramCount} OR
        ta.account_number ILIKE $${paramCount}
      )`);
      params.push(`%${filters.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    return { whereClause, params };
  }

  /**
   * Get time condition for SQL queries
   * @param {string} timeframe - Time period
   * @returns {string} - SQL time condition
   */
  getTimeCondition(timeframe) {
    const timeConditions = {
      '24h': "processed_at >= NOW() - INTERVAL '24 hours'",
      '7d': "processed_at >= NOW() - INTERVAL '7 days'",
      '30d': "processed_at >= NOW() - INTERVAL '30 days'",
      '90d': "processed_at >= NOW() - INTERVAL '90 days'"
    };

    return timeConditions[timeframe] || timeConditions['24h'];
  }

  /**
   * Get transaction statistics for dashboard
   * @param {string} timeframe - Time period
   * @returns {Object} - Statistics data
   */
  async getTransactionStats(timeframe) {
    try {
      const timeCondition = this.getTimeCondition(timeframe);

      const statsQuery = `
        SELECT 
          COUNT(*) as total_count,
          SUM(amount) as total_volume,
          AVG(amount) as average_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount,
          COUNT(CASE WHEN amount > 10000 THEN 1 END) as large_transactions,
          COUNT(DISTINCT transaction_type) as transaction_types,
          COUNT(DISTINCT channel) as channels_used
        FROM transactions 
        WHERE ${timeCondition}
      `;

      const result = await this.executeQuery(statsQuery);
      const stats = result.rows[0];

      // Calculate percentage changes (mock for now)
      // In real implementation, compare with previous period
      stats.growth_rate = Math.floor(Math.random() * 20) - 5; // -5% to +15%

      this.logger.info('Transaction stats generated', {
        timeframe,
        totalCount: stats.total_count
      });

      return {
        timeframe,
        stats,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error generating transaction stats', {
        timeframe,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TransactionService;
