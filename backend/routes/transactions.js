const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const transactionQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  accountId: Joi.number().integer().optional(),
  customerId: Joi.number().integer().optional(),
  minAmount: Joi.number().optional(),
  maxAmount: Joi.number().optional(),
  currency: Joi.string().length(3).uppercase().optional(),
  transactionType: Joi.string().valid('transfer', 'deposit', 'withdrawal', 'payment').optional(),
  channel: Joi.string().valid('atm', 'online', 'mobile', 'branch', 'wire').optional(),
  status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled').optional(),
  search: Joi.string().max(100).optional()
});

const bulkTransactionSchema = Joi.object({
  transactions: Joi.array().items(
    Joi.object({
      transactionId: Joi.string().max(100).required(),
      fromAccountNumber: Joi.string().max(50).required(),
      toAccountNumber: Joi.string().max(50).required(),
      amount: Joi.number().positive().precision(2).required(),
      currency: Joi.string().length(3).uppercase().default('NZD'),
      transactionType: Joi.string().valid('transfer', 'deposit', 'withdrawal', 'payment').required(),
      channel: Joi.string().valid('atm', 'online', 'mobile', 'branch', 'wire').required(),
      description: Joi.string().max(500).optional(),
      referenceNumber: Joi.string().max(100).optional(),
      ipAddress: Joi.string().ip().optional(),
      deviceFingerprint: Joi.string().max(255).optional(),
      locationCountry: Joi.string().length(2).uppercase().optional(),
      locationCity: Joi.string().max(50).optional(),
      processedAt: Joi.date().iso().optional()
    })
  ).min(1).max(1000).required()
});

// @route   GET /api/transactions
// @desc    Get transactions with filtering and pagination
// @access  Private (Analyst+)
router.get('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate query parameters
  const { error, value } = transactionQuerySchema.validate(req.query);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid query parameters',
      details: error.details[0].message 
    });
  }

  const {
    page,
    limit,
    startDate,
    endDate,
    accountId,
    customerId,
    minAmount,
    maxAmount,
    currency,
    transactionType,
    channel,
    status,
    search
  } = value;

  const offset = (page - 1) * limit;

  // Build dynamic query
  let queryParts = [];
  let queryParams = [];
  let paramCount = 0;

  // Base query
  let baseQuery = `
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
      fa.account_number as from_account_number,
      fc.first_name as from_customer_first_name,
      fc.last_name as from_customer_last_name,
      ta.account_number as to_account_number,
      tc.first_name as to_customer_first_name,
      tc.last_name as to_customer_last_name,
      t.ip_address,
      t.location_country,
      t.location_city
    FROM transactions t
    LEFT JOIN accounts fa ON t.from_account_id = fa.id
    LEFT JOIN customers fc ON fa.customer_id = fc.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    LEFT JOIN customers tc ON ta.customer_id = tc.id
  `;

  // Add filters
  if (startDate) {
    paramCount++;
    queryParts.push(`t.processed_at >= $${paramCount}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    paramCount++;
    queryParts.push(`t.processed_at <= $${paramCount}`);
    queryParams.push(endDate);
  }

  if (accountId) {
    paramCount++;
    queryParts.push(`(t.from_account_id = $${paramCount} OR t.to_account_id = $${paramCount})`);
    queryParams.push(accountId);
  }

  if (customerId) {
    paramCount++;
    queryParts.push(`(fa.customer_id = $${paramCount} OR ta.customer_id = $${paramCount})`);
    queryParams.push(customerId);
  }

  if (minAmount) {
    paramCount++;
    queryParts.push(`t.amount >= $${paramCount}`);
    queryParams.push(minAmount);
  }

  if (maxAmount) {
    paramCount++;
    queryParts.push(`t.amount <= $${paramCount}`);
    queryParams.push(maxAmount);
  }

  if (currency) {
    paramCount++;
    queryParts.push(`t.currency = $${paramCount}`);
    queryParams.push(currency);
  }

  if (transactionType) {
    paramCount++;
    queryParts.push(`t.transaction_type = $${paramCount}`);
    queryParams.push(transactionType);
  }

  if (channel) {
    paramCount++;
    queryParts.push(`t.channel = $${paramCount}`);
    queryParams.push(channel);
  }

  if (status) {
    paramCount++;
    queryParts.push(`t.status = $${paramCount}`);
    queryParams.push(status);
  }

  if (search) {
    paramCount++;
    queryParts.push(`(
      t.transaction_id ILIKE $${paramCount} OR
      t.description ILIKE $${paramCount} OR
      t.reference_number ILIKE $${paramCount} OR
      fa.account_number ILIKE $${paramCount} OR
      ta.account_number ILIKE $${paramCount}
    )`);
    queryParams.push(`%${search}%`);
  }

  // Build WHERE clause
  const whereClause = queryParts.length > 0 ? ' WHERE ' + queryParts.join(' AND ') : '';

  // Count total records
  const countQuery = `
    SELECT COUNT(*) as total
    FROM transactions t
    LEFT JOIN accounts fa ON t.from_account_id = fa.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    ${whereClause}
  `;

  const countResult = await database.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get paginated results
  const dataQuery = `
    ${baseQuery}
    ${whereClause}
    ORDER BY t.processed_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  queryParams.push(limit, offset);

  const dataResult = await database.query(dataQuery, queryParams);

  // Calculate pagination info
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  res.json({
    transactions: dataResult.rows,
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords: total,
      limit,
      hasNext,
      hasPrev
    }
  });
}));

// @route   GET /api/transactions/:id
// @desc    Get single transaction by ID
// @access  Private (Analyst+)
router.get('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id);

  if (isNaN(transactionId)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }

  const query = `
    SELECT 
      t.*,
      fa.account_number as from_account_number,
      fi.name as from_institution_name,
      fc.first_name as from_customer_first_name,
      fc.last_name as from_customer_last_name,
      fc.email as from_customer_email,
      ta.account_number as to_account_number,
      ti.name as to_institution_name,
      tc.first_name as to_customer_first_name,
      tc.last_name as to_customer_last_name,
      tc.email as to_customer_email
    FROM transactions t
    LEFT JOIN accounts fa ON t.from_account_id = fa.id
    LEFT JOIN institutions fi ON fa.institution_id = fi.id
    LEFT JOIN customers fc ON fa.customer_id = fc.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    LEFT JOIN institutions ti ON ta.institution_id = ti.id
    LEFT JOIN customers tc ON ta.customer_id = tc.id
    WHERE t.id = $1
  `;

  const result = await database.query(query, [transactionId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
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

  const alertsResult = await database.query(alertsQuery, [transactionId]);

  const transaction = {
    ...result.rows[0],
    alerts: alertsResult.rows
  };

  res.json({ transaction });
}));

// @route   POST /api/transactions/bulk
// @desc    Bulk import transactions
// @access  Private (Supervisor+)
router.post('/bulk', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = bulkTransactionSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid transaction data',
      details: error.details[0].message 
    });
  }

  const { transactions } = value;
  const client = await database.getClient();
  
  try {
    await client.query('BEGIN');

    const inserted = [];
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];
      
      try {
        // Get account IDs
        const fromAccountQuery = await client.query(
          'SELECT id FROM accounts WHERE account_number = $1',
          [txn.fromAccountNumber]
        );

        const toAccountQuery = await client.query(
          'SELECT id FROM accounts WHERE account_number = $1',
          [txn.toAccountNumber]
        );

        if (fromAccountQuery.rows.length === 0) {
          errors.push({
            index: i,
            transactionId: txn.transactionId,
            error: `From account ${txn.fromAccountNumber} not found`
          });
          continue;
        }

        if (toAccountQuery.rows.length === 0) {
          errors.push({
            index: i,
            transactionId: txn.transactionId,
            error: `To account ${txn.toAccountNumber} not found`
          });
          continue;
        }

        const fromAccountId = fromAccountQuery.rows[0].id;
        const toAccountId = toAccountQuery.rows[0].id;

        // Insert transaction
        const insertQuery = `
          INSERT INTO transactions (
            transaction_id, from_account_id, to_account_id, amount, currency,
            transaction_type, channel, description, reference_number,
            ip_address, device_fingerprint, location_country, location_city,
            processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id, transaction_id
        `;

        const insertResult = await client.query(insertQuery, [
          txn.transactionId,
          fromAccountId,
          toAccountId,
          txn.amount,
          txn.currency,
          txn.transactionType,
          txn.channel,
          txn.description,
          txn.referenceNumber,
          txn.ipAddress,
          txn.deviceFingerprint,
          txn.locationCountry,
          txn.locationCity,
          txn.processedAt || new Date()
        ]);

        inserted.push({
          id: insertResult.rows[0].id,
          transactionId: insertResult.rows[0].transaction_id
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

    // Log bulk import
    logger.audit('BULK_TRANSACTION_IMPORT', req.user.id, 'transactions', 'bulk', {
      totalTransactions: transactions.length,
      successful: inserted.length,
      failed: errors.length,
      importedBy: req.user.username
    });

    res.json({
      message: 'Bulk import completed',
      summary: {
        total: transactions.length,
        successful: inserted.length,
        failed: errors.length
      },
      inserted,
      errors: errors.slice(0, 10) // Limit error details to first 10
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Bulk transaction import failed', {
      error: error.message,
      userId: req.user.id,
      transactionCount: transactions.length
    });
    throw error;
  } finally {
    client.release();
  }
}));

// @route   GET /api/transactions/analytics/summary
// @desc    Get transaction analytics summary
// @access  Private (Analyst+)
router.get('/analytics/summary', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const timeframe = req.query.timeframe || '24h'; // 24h, 7d, 30d, 90d
  
  let timeCondition = '';
  switch (timeframe) {
    case '24h':
      timeCondition = "processed_at >= NOW() - INTERVAL '24 hours'";
      break;
    case '7d':
      timeCondition = "processed_at >= NOW() - INTERVAL '7 days'";
      break;
    case '30d':
      timeCondition = "processed_at >= NOW() - INTERVAL '30 days'";
      break;
    case '90d':
      timeCondition = "processed_at >= NOW() - INTERVAL '90 days'";
      break;
    default:
      timeCondition = "processed_at >= NOW() - INTERVAL '24 hours'";
  }

  // Get basic metrics
  const metricsQuery = `
    SELECT 
      COUNT(*) as total_transactions,
      SUM(amount) as total_volume,
      AVG(amount) as avg_amount,
      COUNT(DISTINCT from_account_id) as unique_senders,
      COUNT(DISTINCT to_account_id) as unique_receivers
    FROM transactions 
    WHERE ${timeCondition}
  `;

  // Get transaction type breakdown
  const typeBreakdownQuery = `
    SELECT 
      transaction_type,
      COUNT(*) as count,
      SUM(amount) as volume
    FROM transactions 
    WHERE ${timeCondition}
    GROUP BY transaction_type
    ORDER BY count DESC
  `;

  // Get channel breakdown
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

  // Get hourly distribution (for charts)
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

  const [metricsResult, typeResult, channelResult, hourlyResult] = await Promise.all([
    database.query(metricsQuery),
    database.query(typeBreakdownQuery),
    database.query(channelBreakdownQuery),
    database.query(hourlyQuery)
  ]);

  res.json({
    timeframe,
    metrics: metricsResult.rows[0],
    breakdowns: {
      byType: typeResult.rows,
      byChannel: channelResult.rows,
      byHour: hourlyResult.rows
    }
  });
}));

module.exports = router;
