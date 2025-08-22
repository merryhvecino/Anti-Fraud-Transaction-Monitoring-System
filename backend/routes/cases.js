const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const caseQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('open', 'investigating', 'pending_closure', 'closed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  caseType: Joi.string().valid('fraud', 'aml', 'sanctions', 'other').optional(),
  assignedTo: Joi.number().integer().optional(),
  createdBy: Joi.number().integer().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional()
});

const createCaseSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().max(2000).required(),
  caseType: Joi.string().valid('fraud', 'aml', 'sanctions', 'other').required(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  assignedTo: Joi.number().integer().optional(),
  estimatedLoss: Joi.number().min(0).optional(),
  alertIds: Joi.array().items(Joi.number().integer()).optional()
});

const updateCaseSchema = Joi.object({
  title: Joi.string().min(5).max(200).optional(),
  description: Joi.string().max(2000).optional(),
  status: Joi.string().valid('open', 'investigating', 'pending_closure', 'closed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  assignedTo: Joi.number().integer().allow(null).optional(),
  estimatedLoss: Joi.number().min(0).optional(),
  actualLoss: Joi.number().min(0).optional(),
  resolutionNotes: Joi.string().max(2000).optional()
});

// @route   GET /api/cases
// @desc    Get cases with filtering and pagination
// @access  Private (Analyst+)
router.get('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate query parameters
  const { error, value } = caseQuerySchema.validate(req.query);
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
    priority,
    caseType,
    assignedTo,
    createdBy,
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
      c.id,
      c.case_number,
      c.title,
      c.case_type,
      c.priority,
      c.status,
      c.estimated_loss,
      c.actual_loss,
      c.created_at,
      c.updated_at,
      c.closed_at,
      assigned.username as assigned_to_username,
      creator.username as created_by_username,
      COUNT(ca.alert_id) as alert_count
    FROM cases c
    LEFT JOIN users assigned ON c.assigned_to = assigned.id
    LEFT JOIN users creator ON c.created_by = creator.id
    LEFT JOIN case_alerts ca ON c.id = ca.case_id
  `;

  // Add filters
  if (status) {
    paramCount++;
    queryParts.push(`c.status = $${paramCount}`);
    queryParams.push(status);
  }

  if (priority) {
    paramCount++;
    queryParts.push(`c.priority = $${paramCount}`);
    queryParams.push(priority);
  }

  if (caseType) {
    paramCount++;
    queryParts.push(`c.case_type = $${paramCount}`);
    queryParams.push(caseType);
  }

  if (assignedTo) {
    paramCount++;
    queryParts.push(`c.assigned_to = $${paramCount}`);
    queryParams.push(assignedTo);
  }

  if (createdBy) {
    paramCount++;
    queryParts.push(`c.created_by = $${paramCount}`);
    queryParams.push(createdBy);
  }

  if (startDate) {
    paramCount++;
    queryParts.push(`c.created_at >= $${paramCount}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    paramCount++;
    queryParts.push(`c.created_at <= $${paramCount}`);
    queryParams.push(endDate);
  }

  if (search) {
    paramCount++;
    queryParts.push(`(
      c.case_number ILIKE $${paramCount} OR
      c.title ILIKE $${paramCount} OR
      c.description ILIKE $${paramCount}
    )`);
    queryParams.push(`%${search}%`);
  }

  // Role-based filtering for analysts
  if (req.user.role === 'analyst') {
    paramCount++;
    queryParts.push(`(c.assigned_to = $${paramCount} OR c.created_by = $${paramCount})`);
    queryParams.push(req.user.id);
  }

  // Build WHERE clause
  const whereClause = queryParts.length > 0 ? ' WHERE ' + queryParts.join(' AND ') : '';

  // Count total records
  const countQuery = `
    SELECT COUNT(DISTINCT c.id) as total
    FROM cases c
    LEFT JOIN case_alerts ca ON c.id = ca.case_id
    ${whereClause}
  `;

  const countResult = await database.query(countQuery, queryParams);
  const total = parseInt(countResult.rows[0].total);

  // Get paginated results
  const dataQuery = `
    ${baseQuery}
    ${whereClause}
    GROUP BY c.id, assigned.username, creator.username
    ORDER BY 
      CASE c.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      c.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  queryParams.push(limit, offset);

  const dataResult = await database.query(dataQuery, queryParams);

  // Calculate pagination info
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  res.json({
    cases: dataResult.rows,
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

// @route   GET /api/cases/:id
// @desc    Get single case by ID with associated alerts
// @access  Private (Analyst+)
router.get('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const caseId = parseInt(req.params.id);

  if (isNaN(caseId)) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }

  // Get case details
  const caseQuery = `
    SELECT 
      c.*,
      assigned.username as assigned_to_username,
      assigned.first_name as assigned_to_first_name,
      assigned.last_name as assigned_to_last_name,
      creator.username as created_by_username,
      creator.first_name as created_by_first_name,
      creator.last_name as created_by_last_name
    FROM cases c
    LEFT JOIN users assigned ON c.assigned_to = assigned.id
    LEFT JOIN users creator ON c.created_by = creator.id
    WHERE c.id = $1
  `;

  const caseResult = await database.query(caseQuery, [caseId]);

  if (caseResult.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const caseData = caseResult.rows[0];

  // Check permissions for analysts
  if (req.user.role === 'analyst') {
    if (caseData.assigned_to !== req.user.id && caseData.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this case' });
    }
  }

  // Get associated alerts
  const alertsQuery = `
    SELECT 
      a.id,
      a.alert_id,
      a.alert_type,
      a.severity,
      a.status,
      a.score,
      a.created_at,
      t.transaction_id,
      t.amount,
      t.currency
    FROM alerts a
    INNER JOIN case_alerts ca ON a.id = ca.alert_id
    LEFT JOIN transactions t ON a.transaction_id = t.id
    WHERE ca.case_id = $1
    ORDER BY a.created_at DESC
  `;

  const alertsResult = await database.query(alertsQuery, [caseId]);

  res.json({
    case: {
      ...caseData,
      alerts: alertsResult.rows
    }
  });
}));

// @route   POST /api/cases
// @desc    Create new case
// @access  Private (Analyst+)
router.post('/', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = createCaseSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid case data',
      details: error.details[0].message 
    });
  }

  const { title, description, caseType, priority, assignedTo, estimatedLoss, alertIds } = value;

  const client = await database.getClient();
  
  try {
    await client.query('BEGIN');

    // Generate case number
    const caseNumber = `CASE${new Date().getFullYear()}${Date.now().toString().slice(-6)}`;

    // Create case
    const insertQuery = `
      INSERT INTO cases (
        case_number, title, description, case_type, priority, 
        assigned_to, created_by, estimated_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const caseResult = await client.query(insertQuery, [
      caseNumber,
      title,
      description,
      caseType,
      priority,
      assignedTo,
      req.user.id,
      estimatedLoss
    ]);

    const newCase = caseResult.rows[0];

    // Associate alerts with case if provided
    if (alertIds && alertIds.length > 0) {
      for (const alertId of alertIds) {
        await client.query(
          'INSERT INTO case_alerts (case_id, alert_id) VALUES ($1, $2)',
          [newCase.id, alertId]
        );

        // Update alert status to investigating
        await client.query(
          'UPDATE alerts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['investigating', alertId]
        );
      }
    }

    await client.query('COMMIT');

    // Log case creation
    logger.audit('CASE_CREATED', req.user.id, 'case', newCase.id, {
      caseNumber: newCase.case_number,
      title: newCase.title,
      caseType: newCase.case_type,
      priority: newCase.priority,
      associatedAlerts: alertIds || [],
      createdBy: req.user.username
    });

    // Send real-time notification
    const io = req.app.get('socketio');
    if (io) {
      io.emit('new_case', {
        id: newCase.id,
        caseNumber: newCase.case_number,
        title: newCase.title,
        priority: newCase.priority,
        createdAt: newCase.created_at
      });
    }

    res.status(201).json({
      message: 'Case created successfully',
      case: newCase
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Case creation failed', {
      error: error.message,
      userId: req.user.id,
      caseData: value
    });
    throw error;
  } finally {
    client.release();
  }
}));

// @route   PUT /api/cases/:id
// @desc    Update case
// @access  Private (Analyst+)
router.put('/:id', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const caseId = parseInt(req.params.id);

  if (isNaN(caseId)) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }

  // Validate input
  const { error, value } = updateCaseSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid update data',
      details: error.details[0].message 
    });
  }

  // Check if case exists and user has permission
  const caseQuery = await database.query(
    'SELECT assigned_to, created_by, status FROM cases WHERE id = $1',
    [caseId]
  );

  if (caseQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const currentCase = caseQuery.rows[0];

  // Check permissions for analysts
  if (req.user.role === 'analyst') {
    if (currentCase.assigned_to !== req.user.id && currentCase.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this case' });
    }
  }

  const updates = [];
  const params = [];
  let paramCount = 0;

  // Build update query dynamically
  Object.keys(value).forEach(key => {
    const dbField = key === 'assignedTo' ? 'assigned_to' :
                   key === 'estimatedLoss' ? 'estimated_loss' :
                   key === 'actualLoss' ? 'actual_loss' :
                   key === 'resolutionNotes' ? 'resolution_notes' :
                   key === 'caseType' ? 'case_type' : key;
    
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

  // If status is being set to closed, add closed_at timestamp
  if (value.status === 'closed') {
    paramCount++;
    updates.push(`closed_at = $${paramCount}`);
    params.push(new Date());
  }

  // Add case ID for WHERE clause
  paramCount++;
  params.push(caseId);

  const updateQuery = `
    UPDATE cases 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await database.query(updateQuery, params);
  const updatedCase = result.rows[0];

  // Log the update
  logger.audit('CASE_UPDATED', req.user.id, 'case', caseId, {
    oldValues: currentCase,
    newValues: value,
    updatedBy: req.user.username
  });

  // Send real-time update
  const io = req.app.get('socketio');
  if (io) {
    io.emit('case_updated', {
      id: caseId,
      status: updatedCase.status,
      assignedTo: updatedCase.assigned_to,
      updatedAt: updatedCase.updated_at
    });
  }

  res.json({ 
    message: 'Case updated successfully',
    case: updatedCase
  });
}));

// @route   POST /api/cases/:id/alerts
// @desc    Add alert to case
// @access  Private (Analyst+)
router.post('/:id/alerts', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const caseId = parseInt(req.params.id);
  const { alertId } = req.body;

  if (isNaN(caseId) || !alertId) {
    return res.status(400).json({ error: 'Invalid case ID or alert ID' });
  }

  // Verify case exists and user has permission
  const caseQuery = await database.query(
    'SELECT assigned_to, created_by FROM cases WHERE id = $1',
    [caseId]
  );

  if (caseQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const caseData = caseQuery.rows[0];

  // Check permissions for analysts
  if (req.user.role === 'analyst') {
    if (caseData.assigned_to !== req.user.id && caseData.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this case' });
    }
  }

  // Verify alert exists
  const alertQuery = await database.query(
    'SELECT id FROM alerts WHERE id = $1',
    [alertId]
  );

  if (alertQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  try {
    // Add alert to case
    await database.query(
      'INSERT INTO case_alerts (case_id, alert_id) VALUES ($1, $2)',
      [caseId, alertId]
    );

    // Update alert status
    await database.query(
      'UPDATE alerts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['investigating', alertId]
    );

    // Log the association
    logger.audit('ALERT_ADDED_TO_CASE', req.user.id, 'case', caseId, {
      alertId,
      addedBy: req.user.username
    });

    res.json({ message: 'Alert added to case successfully' });

  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Alert is already associated with this case' });
    }
    throw error;
  }
}));

// @route   GET /api/cases/dashboard/stats
// @desc    Get case statistics for dashboard
// @access  Private (Analyst+)
router.get('/dashboard/stats', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  const timeframe = req.query.timeframe || '30d';
  
  let timeCondition = '';
  switch (timeframe) {
    case '7d':
      timeCondition = "created_at >= NOW() - INTERVAL '7 days'";
      break;
    case '30d':
      timeCondition = "created_at >= NOW() - INTERVAL '30 days'";
      break;
    case '90d':
      timeCondition = "created_at >= NOW() - INTERVAL '90 days'";
      break;
    default:
      timeCondition = "created_at >= NOW() - INTERVAL '30 days'";
  }

  // Role-based filtering for analysts
  let roleFilter = '';
  let roleParams = [];
  if (req.user.role === 'analyst') {
    roleFilter = ' AND (assigned_to = $1 OR created_by = $1)';
    roleParams = [req.user.id];
  }

  // Get basic stats
  const statsQuery = `
    SELECT 
      COUNT(*) as total_cases,
      COUNT(CASE WHEN status = 'open' THEN 1 END) as open_cases,
      COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating_cases,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_cases,
      COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_cases,
      SUM(estimated_loss) as total_estimated_loss,
      SUM(actual_loss) as total_actual_loss
    FROM cases 
    WHERE ${timeCondition}${roleFilter}
  `;

  // Get type breakdown
  const typeQuery = `
    SELECT 
      case_type,
      COUNT(*) as count,
      SUM(estimated_loss) as estimated_loss
    FROM cases 
    WHERE ${timeCondition}${roleFilter}
    GROUP BY case_type
    ORDER BY count DESC
  `;

  // Get priority breakdown
  const priorityQuery = `
    SELECT 
      priority,
      COUNT(*) as count
    FROM cases 
    WHERE ${timeCondition}${roleFilter}
    GROUP BY priority
    ORDER BY 
      CASE priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END
  `;

  const [statsResult, typeResult, priorityResult] = await Promise.all([
    database.query(statsQuery, roleParams),
    database.query(typeQuery, roleParams),
    database.query(priorityQuery, roleParams)
  ]);

  res.json({
    timeframe,
    stats: statsResult.rows[0],
    breakdowns: {
      byType: typeResult.rows,
      byPriority: priorityResult.rows
    }
  });
}));

module.exports = router;
