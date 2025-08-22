const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const ruleSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(500).optional(),
  ruleType: Joi.string().valid('amount', 'frequency', 'pattern', 'location', 'velocity').required(),
  conditions: Joi.object({
    // Amount-based rules
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    currency: Joi.string().length(3).optional(),
    
    // Frequency-based rules
    transactionCount: Joi.number().integer().min(1).optional(),
    timeWindow: Joi.string().valid('1h', '24h', '7d', '30d').optional(),
    
    // Pattern-based rules
    transactionTypes: Joi.array().items(Joi.string()).optional(),
    channels: Joi.array().items(Joi.string()).optional(),
    roundAmounts: Joi.boolean().optional(),
    
    // Location-based rules
    blockedCountries: Joi.array().items(Joi.string().length(2)).optional(),
    timeZoneMismatch: Joi.boolean().optional(),
    
    // Velocity-based rules
    velocityThreshold: Joi.number().min(0).optional(),
    velocityWindow: Joi.string().valid('1h', '24h', '7d').optional()
  }).required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  isActive: Joi.boolean().default(true)
});

const updateRuleSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(500).optional(),
  conditions: Joi.object().optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  isActive: Joi.boolean().optional()
});

// @route   GET /api/rules
// @desc    Get detection rules
// @access  Private (Analyst+)
router.get('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const ruleType = req.query.ruleType;
  const severity = req.query.severity;
  const isActive = req.query.isActive;
  const search = req.query.search;

  const offset = (page - 1) * limit;

  // Build dynamic query
  let queryParts = [];
  let queryParams = [];
  let paramCount = 0;

  if (ruleType) {
    paramCount++;
    queryParts.push(`rule_type = $${paramCount}`);
    queryParams.push(ruleType);
  }

  if (severity) {
    paramCount++;
    queryParts.push(`severity = $${paramCount}`);
    queryParams.push(severity);
  }

  if (isActive !== undefined) {
    paramCount++;
    queryParts.push(`is_active = $${paramCount}`);
    queryParams.push(isActive === 'true');
  }

  if (search) {
    paramCount++;
    queryParts.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount})`);
    queryParams.push(`%${search}%`);
  }

  const whereClause = queryParts.length > 0 ? ' WHERE ' + queryParts.join(' AND ') : '';

  // Count total records
  const countQuery = `SELECT COUNT(*) as total FROM detection_rules${whereClause}`;
  const countResult = await database.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get paginated results
  const dataQuery = `
    SELECT 
      r.*,
      u.username as created_by_username,
      COUNT(a.id) as triggered_alerts
    FROM detection_rules r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN alerts a ON r.id = a.rule_id
    ${whereClause}
    GROUP BY r.id, u.username
    ORDER BY r.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  queryParams.push(limit, offset);

  const dataResult = await database.query(dataQuery, queryParams);

  const totalPages = Math.ceil(total / limit);

  res.json({
    rules: dataResult.rows,
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords: total,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}));

// @route   GET /api/rules/:id
// @desc    Get single detection rule
// @access  Private (Analyst+)
router.get('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);

  if (isNaN(ruleId)) {
    return res.status(400).json({ error: 'Invalid rule ID' });
  }

  const query = `
    SELECT 
      r.*,
      u.username as created_by_username,
      COUNT(a.id) as triggered_alerts,
      COUNT(CASE WHEN a.status = 'false_positive' THEN 1 END) as false_positives
    FROM detection_rules r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN alerts a ON r.id = a.rule_id
    WHERE r.id = $1
    GROUP BY r.id, u.username
  `;

  const result = await database.query(query, [ruleId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  // Get recent alerts for this rule
  const alertsQuery = `
    SELECT 
      a.id,
      a.alert_id,
      a.severity,
      a.status,
      a.score,
      a.created_at,
      t.transaction_id,
      t.amount
    FROM alerts a
    LEFT JOIN transactions t ON a.transaction_id = t.id
    WHERE a.rule_id = $1
    ORDER BY a.created_at DESC
    LIMIT 10
  `;

  const alertsResult = await database.query(alertsQuery, [ruleId]);

  res.json({
    rule: {
      ...result.rows[0],
      recentAlerts: alertsResult.rows
    }
  });
}));

// @route   POST /api/rules
// @desc    Create new detection rule
// @access  Private (Supervisor+)
router.post('/', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = ruleSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid rule data',
      details: error.details[0].message 
    });
  }

  const { name, description, ruleType, conditions, severity, isActive } = value;

  // Check if rule with same name exists
  const existingRule = await database.query(
    'SELECT id FROM detection_rules WHERE name = $1',
    [name]
  );

  if (existingRule.rows.length > 0) {
    return res.status(409).json({ error: 'Rule with this name already exists' });
  }

  // Create rule
  const insertQuery = `
    INSERT INTO detection_rules (
      name, description, rule_type, conditions, severity, is_active, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await database.query(insertQuery, [
    name,
    description,
    ruleType,
    JSON.stringify(conditions),
    severity,
    isActive,
    req.user.id
  ]);

  const newRule = result.rows[0];

  // Log rule creation
  logger.audit('RULE_CREATED', req.user.id, 'rule', newRule.id, {
    name: newRule.name,
    ruleType: newRule.rule_type,
    severity: newRule.severity,
    conditions: conditions,
    createdBy: req.user.username
  });

  res.status(201).json({
    message: 'Detection rule created successfully',
    rule: newRule
  });
}));

// @route   PUT /api/rules/:id
// @desc    Update detection rule
// @access  Private (Supervisor+)
router.put('/:id', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);

  if (isNaN(ruleId)) {
    return res.status(400).json({ error: 'Invalid rule ID' });
  }

  // Validate input
  const { error, value } = updateRuleSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid update data',
      details: error.details[0].message 
    });
  }

  // Check if rule exists
  const ruleQuery = await database.query(
    'SELECT * FROM detection_rules WHERE id = $1',
    [ruleId]
  );

  if (ruleQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const currentRule = ruleQuery.rows[0];

  const updates = [];
  const params = [];
  let paramCount = 0;

  // Build update query dynamically
  Object.keys(value).forEach(key => {
    const dbField = key === 'isActive' ? 'is_active' : key;
    paramCount++;
    if (key === 'conditions') {
      updates.push(`${dbField} = $${paramCount}`);
      params.push(JSON.stringify(value[key]));
    } else {
      updates.push(`${dbField} = $${paramCount}`);
      params.push(value[key]);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Add updated_at timestamp
  paramCount++;
  updates.push(`updated_at = $${paramCount}`);
  params.push(new Date());

  // Add rule ID for WHERE clause
  paramCount++;
  params.push(ruleId);

  const updateQuery = `
    UPDATE detection_rules 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await database.query(updateQuery, params);
  const updatedRule = result.rows[0];

  // Log rule update
  logger.audit('RULE_UPDATED', req.user.id, 'rule', ruleId, {
    oldValues: currentRule,
    newValues: value,
    updatedBy: req.user.username
  });

  res.json({ 
    message: 'Detection rule updated successfully',
    rule: updatedRule
  });
}));

// @route   DELETE /api/rules/:id
// @desc    Delete detection rule
// @access  Private (Admin)
router.delete('/:id', authorize(['admin']), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);

  if (isNaN(ruleId)) {
    return res.status(400).json({ error: 'Invalid rule ID' });
  }

  // Check if rule exists
  const ruleQuery = await database.query(
    'SELECT name FROM detection_rules WHERE id = $1',
    [ruleId]
  );

  if (ruleQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const ruleName = ruleQuery.rows[0].name;

  // Check if rule has associated alerts
  const alertsQuery = await database.query(
    'SELECT COUNT(*) as count FROM alerts WHERE rule_id = $1',
    [ruleId]
  );

  const alertCount = parseInt(alertsQuery.rows[0].count);

  if (alertCount > 0) {
    return res.status(400).json({ 
      error: 'Cannot delete rule with associated alerts',
      alertCount 
    });
  }

  // Delete rule
  await database.query('DELETE FROM detection_rules WHERE id = $1', [ruleId]);

  // Log rule deletion
  logger.audit('RULE_DELETED', req.user.id, 'rule', ruleId, {
    ruleName,
    deletedBy: req.user.username
  });

  res.json({ message: 'Detection rule deleted successfully' });
}));

// @route   POST /api/rules/:id/test
// @desc    Test detection rule against historical data
// @access  Private (Supervisor+)
router.post('/:id/test', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id);
  const { startDate, endDate, limit = 100 } = req.body;

  if (isNaN(ruleId)) {
    return res.status(400).json({ error: 'Invalid rule ID' });
  }

  // Get rule details
  const ruleQuery = await database.query(
    'SELECT * FROM detection_rules WHERE id = $1',
    [ruleId]
  );

  if (ruleQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const rule = ruleQuery.rows[0];
  const conditions = rule.conditions;

  // Build test query based on rule type and conditions
  let testQuery = '';
  let params = [];

  switch (rule.rule_type) {
    case 'amount':
      testQuery = `
        SELECT t.*, 'Amount threshold exceeded' as trigger_reason
        FROM transactions t
        WHERE processed_at >= $1 AND processed_at <= $2
      `;
      params = [startDate, endDate];
      
      if (conditions.minAmount) {
        testQuery += ` AND amount >= $${params.length + 1}`;
        params.push(conditions.minAmount);
      }
      if (conditions.maxAmount) {
        testQuery += ` AND amount <= $${params.length + 1}`;
        params.push(conditions.maxAmount);
      }
      if (conditions.currency) {
        testQuery += ` AND currency = $${params.length + 1}`;
        params.push(conditions.currency);
      }
      break;

    case 'frequency':
      testQuery = `
        WITH frequent_accounts AS (
          SELECT 
            from_account_id,
            COUNT(*) as txn_count,
            'High frequency transactions' as trigger_reason
          FROM transactions
          WHERE processed_at >= $1 AND processed_at <= $2
          GROUP BY from_account_id
          HAVING COUNT(*) >= $3
        )
        SELECT t.*, fa.trigger_reason
        FROM transactions t
        INNER JOIN frequent_accounts fa ON t.from_account_id = fa.from_account_id
        WHERE t.processed_at >= $1 AND t.processed_at <= $2
      `;
      params = [startDate, endDate, conditions.transactionCount || 10];
      break;

    case 'pattern':
      testQuery = `
        SELECT t.*, 'Pattern match detected' as trigger_reason
        FROM transactions t
        WHERE processed_at >= $1 AND processed_at <= $2
      `;
      params = [startDate, endDate];
      
      if (conditions.transactionTypes && conditions.transactionTypes.length > 0) {
        testQuery += ` AND transaction_type = ANY($${params.length + 1})`;
        params.push(conditions.transactionTypes);
      }
      if (conditions.channels && conditions.channels.length > 0) {
        testQuery += ` AND channel = ANY($${params.length + 1})`;
        params.push(conditions.channels);
      }
      if (conditions.roundAmounts) {
        testQuery += ` AND amount % 1000 = 0`;
      }
      break;

    case 'location':
      testQuery = `
        SELECT t.*, 'Suspicious location detected' as trigger_reason
        FROM transactions t
        WHERE processed_at >= $1 AND processed_at <= $2
      `;
      params = [startDate, endDate];
      
      if (conditions.blockedCountries && conditions.blockedCountries.length > 0) {
        testQuery += ` AND location_country = ANY($${params.length + 1})`;
        params.push(conditions.blockedCountries);
      }
      break;

    default:
      return res.status(400).json({ error: 'Rule type not supported for testing' });
  }

  testQuery += ` ORDER BY processed_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const result = await database.query(testQuery, params);

    // Log rule test
    logger.audit('RULE_TESTED', req.user.id, 'rule', ruleId, {
      ruleName: rule.name,
      testPeriod: { startDate, endDate },
      matchCount: result.rows.length,
      testedBy: req.user.username
    });

    res.json({
      message: 'Rule test completed',
      rule: {
        id: rule.id,
        name: rule.name,
        ruleType: rule.rule_type
      },
      testPeriod: { startDate, endDate },
      matches: result.rows,
      matchCount: result.rows.length
    });

  } catch (error) {
    logger.error('Rule test failed', {
      error: error.message,
      ruleId,
      testPeriod: { startDate, endDate }
    });
    
    res.status(500).json({
      error: 'Rule test failed',
      details: error.message
    });
  }
}));

// @route   GET /api/rules/templates
// @desc    Get predefined rule templates
// @access  Private (Supervisor+)
router.get('/templates', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  const templates = [
    {
      name: 'Large Cash Transaction',
      description: 'Detects cash transactions over NZD 10,000',
      ruleType: 'amount',
      conditions: {
        minAmount: 10000,
        currency: 'NZD',
        transactionTypes: ['deposit', 'withdrawal']
      },
      severity: 'high'
    },
    {
      name: 'High Frequency Wire Transfers',
      description: 'Detects accounts with more than 10 wire transfers in 24 hours',
      ruleType: 'frequency',
      conditions: {
        transactionCount: 10,
        timeWindow: '24h',
        channels: ['wire']
      },
      severity: 'medium'
    },
    {
      name: 'Round Amount Structuring',
      description: 'Detects multiple round amount transactions',
      ruleType: 'pattern',
      conditions: {
        roundAmounts: true,
        transactionCount: 3,
        timeWindow: '24h'
      },
      severity: 'medium'
    },
    {
      name: 'High Risk Country Transfer',
      description: 'Detects transfers to/from high-risk countries',
      ruleType: 'location',
      conditions: {
        blockedCountries: ['AF', 'IR', 'KP', 'SY'], // Example high-risk countries
        minAmount: 1000
      },
      severity: 'high'
    },
    {
      name: 'Rapid Velocity Transaction',
      description: 'Detects rapid consecutive transactions',
      ruleType: 'velocity',
      conditions: {
        velocityThreshold: 50000,
        velocityWindow: '1h'
      },
      severity: 'critical'
    }
  ];

  res.json({ templates });
}));

module.exports = router;
