const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const alertQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('new', 'investigating', 'escalated', 'closed', 'false_positive').optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  alertType: Joi.string().valid('rule_based', 'ml_anomaly', 'manual').optional(),
  assignedTo: Joi.number().integer().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional()
});

const updateAlertSchema = Joi.object({
  status: Joi.string().valid('new', 'investigating', 'escalated', 'closed', 'false_positive').optional(),
  assignedTo: Joi.number().integer().allow(null).optional(),
  notes: Joi.string().max(1000).optional(),
  resolution: Joi.string().max(500).optional()
});

const createAlertSchema = Joi.object({
  transactionId: Joi.number().integer().required(),
  alertType: Joi.string().valid('rule_based', 'ml_anomaly', 'manual').required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  description: Joi.string().max(500).required(),
  details: Joi.object().optional(),
  ruleId: Joi.number().integer().optional()
});

// @route   GET /api/alerts
// @desc    Get alerts with filtering and pagination
// @access  Private (Analyst+)
router.get('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate query parameters
  const { error, value } = alertQuerySchema.validate(req.query);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid query parameters',
      details: error.details[0].message 
    });
  }

  const {
    page,
    limit,
    status,
    severity,
    alertType,
    assignedTo,
    startDate,
    endDate,
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
      a.id,
      a.alert_id,
      a.alert_type,
      a.severity,
      a.status,
      a.score,
      a.details,
      a.created_at,
      a.updated_at,
      t.transaction_id,
      t.amount,
      t.currency,
      t.transaction_type,
      c.first_name as customer_first_name,
      c.last_name as customer_last_name,
      u.username as assigned_to_username,
      dr.name as rule_name
    FROM alerts a
    LEFT JOIN transactions t ON a.transaction_id = t.id
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN users u ON a.assigned_to = u.id
    LEFT JOIN detection_rules dr ON a.rule_id = dr.id
  `;

  // Add filters
  if (status) {
    paramCount++;
    queryParts.push(`a.status = $${paramCount}`);
    queryParams.push(status);
  }

  if (severity) {
    paramCount++;
    queryParts.push(`a.severity = $${paramCount}`);
    queryParams.push(severity);
  }

  if (alertType) {
    paramCount++;
    queryParts.push(`a.alert_type = $${paramCount}`);
    queryParams.push(alertType);
  }

  if (assignedTo) {
    paramCount++;
    queryParts.push(`a.assigned_to = $${paramCount}`);
    queryParams.push(assignedTo);
  }

  if (startDate) {
    paramCount++;
    queryParts.push(`a.created_at >= $${paramCount}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    paramCount++;
    queryParts.push(`a.created_at <= $${paramCount}`);
    queryParams.push(endDate);
  }

  if (search) {
    paramCount++;
    queryParts.push(`(
      a.alert_id ILIKE $${paramCount} OR
      t.transaction_id ILIKE $${paramCount} OR
      c.first_name ILIKE $${paramCount} OR
      c.last_name ILIKE $${paramCount} OR
      dr.name ILIKE $${paramCount}
    )`);
    queryParams.push(`%${search}%`);
  }

  // Role-based filtering - analysts only see assigned alerts or unassigned ones
  if (req.user.role === 'analyst') {
    paramCount++;
    queryParts.push(`(a.assigned_to = $${paramCount} OR a.assigned_to IS NULL)`);
    queryParams.push(req.user.id);
  }

  // Build WHERE clause
  const whereClause = queryParts.length > 0 ? ' WHERE ' + queryParts.join(' AND ') : '';

  // Count total records
  const countQuery = `
    SELECT COUNT(*) as total
    FROM alerts a
    LEFT JOIN transactions t ON a.transaction_id = t.id
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN detection_rules dr ON a.rule_id = dr.id
    ${whereClause}
  `;

  const countResult = await database.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get paginated results
  const dataQuery = `
    ${baseQuery}
    ${whereClause}
    ORDER BY a.severity DESC, a.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  queryParams.push(limit, offset);

  const dataResult = await database.query(dataQuery, queryParams);

  // Calculate pagination info
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  res.json({
    alerts: dataResult.rows,
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

// @route   GET /api/alerts/:id
// @desc    Get single alert by ID
// @access  Private (Analyst+)
router.get('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const alertId = parseInt(req.params.id);

  if (isNaN(alertId)) {
    return res.status(400).json({ error: 'Invalid alert ID' });
  }

  const query = `
    SELECT 
      a.*,
      t.transaction_id,
      t.amount,
      t.currency,
      t.transaction_type,
      t.channel,
      t.description as transaction_description,
      t.processed_at as transaction_date,
      c.first_name as customer_first_name,
      c.last_name as customer_last_name,
      c.email as customer_email,
      c.risk_rating as customer_risk_rating,
      u.username as assigned_to_username,
      dr.name as rule_name,
      dr.description as rule_description
    FROM alerts a
    LEFT JOIN transactions t ON a.transaction_id = t.id
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN users u ON a.assigned_to = u.id
    LEFT JOIN detection_rules dr ON a.rule_id = dr.id
    WHERE a.id = $1
  `;

  const result = await database.query(query, [alertId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  const alert = result.rows[0];

  // Check permissions for analysts
  if (req.user.role === 'analyst' && alert.assigned_to && alert.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Access denied to this alert' });
  }

  res.json({ alert });
}));

// @route   PUT /api/alerts/:id
// @desc    Update alert status and assignment
// @access  Private (Analyst+)
router.put('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const alertId = parseInt(req.params.id);

  if (isNaN(alertId)) {
    return res.status(400).json({ error: 'Invalid alert ID' });
  }

  // Validate input
  const { error, value } = updateAlertSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid update data',
      details: error.details[0].message 
    });
  }

  // Check if alert exists and user has permission
  const alertQuery = await database.query(
    'SELECT assigned_to, status FROM alerts WHERE id = $1',
    [alertId]
  );

  if (alertQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  const currentAlert = alertQuery.rows[0];

  // Check permissions for analysts
  if (req.user.role === 'analyst' && currentAlert.assigned_to && currentAlert.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Access denied to this alert' });
  }

  const updates = [];
  const params = [];
  let paramCount = 0;

  // Build update query dynamically
  Object.keys(value).forEach(key => {
    const dbField = key === 'assignedTo' ? 'assigned_to' : key;
    paramCount++;
    updates.push(`${dbField} = $${paramCount}`);
    params.push(value[key]);
  });

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Add updated_at timestamp
  paramCount++;
  updates.push(`updated_at = $${paramCount}`);
  params.push(new Date());

  // Add alert ID for WHERE clause
  paramCount++;
  params.push(alertId);

  const updateQuery = `
    UPDATE alerts 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await database.query(updateQuery, params);
  const updatedAlert = result.rows[0];

  // Log the update
  logger.audit('ALERT_UPDATED', req.user.id, 'alert', alertId, {
    oldValues: currentAlert,
    newValues: value,
    updatedBy: req.user.username
  });

  // Send real-time update via socket if available
  const io = req.app.get('socketio');
  if (io) {
    io.emit('alert_updated', {
      id: alertId,
      status: updatedAlert.status,
      assignedTo: updatedAlert.assigned_to,
      updatedAt: updatedAlert.updated_at
    });
  }

  res.json({ 
    message: 'Alert updated successfully',
    alert: updatedAlert
  });
}));

// @route   POST /api/alerts
// @desc    Create new manual alert
// @access  Private (Analyst+)
router.post('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = createAlertSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid alert data',
      details: error.details[0].message 
    });
  }

  const { transactionId, alertType, severity, description, details, ruleId } = value;

  // Verify transaction exists
  const transactionQuery = await database.query(
    'SELECT from_account_id FROM transactions WHERE id = $1',
    [transactionId]
  );

  if (transactionQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Get customer ID from transaction
  const customerQuery = await database.query(
    'SELECT customer_id FROM accounts WHERE id = $1',
    [transactionQuery.rows[0].from_account_id]
  );

  const customerId = customerQuery.rows[0]?.customer_id;

  // Generate unique alert ID
  const alertId = `AL${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  // Create alert
  const insertQuery = `
    INSERT INTO alerts (
      alert_id, transaction_id, customer_id, rule_id, alert_type, 
      severity, details, assigned_to
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const alertDetails = {
    description,
    ...details,
    createdBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  const result = await database.query(insertQuery, [
    alertId,
    transactionId,
    customerId,
    ruleId,
    alertType,
    severity,
    alertDetails,
    req.user.id // Auto-assign to creator
  ]);

  const newAlert = result.rows[0];

  // Log alert creation
  logger.audit('ALERT_CREATED', req.user.id, 'alert', newAlert.id, {
    alertId: newAlert.alert_id,
    transactionId,
    alertType,
    severity,
    createdBy: req.user.username
  });

  // Send real-time notification
  const io = req.app.get('socketio');
  if (io) {
    io.emit('new_alert', {
      id: newAlert.id,
      alertId: newAlert.alert_id,
      severity: newAlert.severity,
      alertType: newAlert.alert_type,
      createdAt: newAlert.created_at
    });
  }

  res.status(201).json({
    message: 'Alert created successfully',
    alert: newAlert
  });
}));

// @route   GET /api/alerts/dashboard/stats
// @desc    Get alert statistics for dashboard
// @access  Private (Analyst+)
router.get('/dashboard/stats', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const timeframe = req.query.timeframe || '24h';
  
  let timeCondition = '';
  switch (timeframe) {
    case '24h':
      timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
      break;
    case '7d':
      timeCondition = "created_at >= NOW() - INTERVAL '7 days'";
      break;
    case '30d':
      timeCondition = "created_at >= NOW() - INTERVAL '30 days'";
      break;
    default:
      timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
  }

  // Role-based filtering for analysts
  let roleFilter = '';
  let roleParams = [];
  if (req.user.role === 'analyst') {
    roleFilter = ' AND (assigned_to = $1 OR assigned_to IS NULL)';
    roleParams = [req.user.id];
  }

  // Get basic stats
  const statsQuery = `
    SELECT 
      COUNT(*) as total_alerts,
      COUNT(CASE WHEN status = 'new' THEN 1 END) as new_alerts,
      COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating_alerts,
      COUNT(CASE WHEN status = 'escalated' THEN 1 END) as escalated_alerts,
      COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
      COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts
    FROM alerts 
    WHERE ${timeCondition}${roleFilter}
  `;

  // Get severity breakdown
  const severityQuery = `
    SELECT 
      severity,
      COUNT(*) as count
    FROM alerts 
    WHERE ${timeCondition}${roleFilter}
    GROUP BY severity
    ORDER BY 
      CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END
  `;

  // Get type breakdown
  const typeQuery = `
    SELECT 
      alert_type,
      COUNT(*) as count
    FROM alerts 
    WHERE ${timeCondition}${roleFilter}
    GROUP BY alert_type
    ORDER BY count DESC
  `;

  const [statsResult, severityResult, typeResult] = await Promise.all([
    database.query(statsQuery, roleParams),
    database.query(severityQuery, roleParams),
    database.query(typeQuery, roleParams)
  ]);

  res.json({
    timeframe,
    stats: statsResult.rows[0],
    breakdowns: {
      bySeverity: severityResult.rows,
      byType: typeResult.rows
    }
  });
}));

module.exports = router;
