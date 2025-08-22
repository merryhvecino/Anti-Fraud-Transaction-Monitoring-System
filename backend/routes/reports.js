const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const sarSchema = Joi.object({
  caseId: Joi.number().integer().required(),
  filingInstitutionId: Joi.number().integer().required(),
  subjectInformation: Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    dateOfBirth: Joi.date().optional(),
    address: Joi.string().optional(),
    phoneNumber: Joi.string().optional(),
    email: Joi.string().email().optional(),
    identification: Joi.object().optional()
  }).required(),
  suspiciousActivity: Joi.object({
    activityType: Joi.string().required(),
    description: Joi.string().min(10).required(),
    transactionPatterns: Joi.array().items(Joi.object()).optional(),
    timeframe: Joi.object({
      from: Joi.date().required(),
      to: Joi.date().required()
    }).required()
  }).required(),
  incidentDateFrom: Joi.date().required(),
  incidentDateTo: Joi.date().required(),
  totalAmount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('NZD'),
  filingReason: Joi.string().min(10).required()
});

const reportQuerySchema = Joi.object({
  type: Joi.string().valid('transaction_summary', 'alert_summary', 'case_summary', 'compliance_metrics').required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  format: Joi.string().valid('json', 'csv', 'pdf').default('json'),
  filters: Joi.object().optional()
});

// @route   POST /api/reports/sar
// @desc    Create Suspicious Activity Report
// @access  Private (Supervisor+)
router.post('/sar', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = sarSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid SAR data',
      details: error.details[0].message 
    });
  }

  const {
    caseId,
    filingInstitutionId,
    subjectInformation,
    suspiciousActivity,
    incidentDateFrom,
    incidentDateTo,
    totalAmount,
    currency,
    filingReason
  } = value;

  // Verify case exists and user has permission
  const caseQuery = await database.query(
    'SELECT id, case_number, title FROM cases WHERE id = $1',
    [caseId]
  );

  if (caseQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Verify institution exists
  const institutionQuery = await database.query(
    'SELECT id, name FROM institutions WHERE id = $1',
    [filingInstitutionId]
  );

  if (institutionQuery.rows.length === 0) {
    return res.status(404).json({ error: 'Filing institution not found' });
  }

  // Generate SAR number
  const sarNumber = `SAR${new Date().getFullYear()}${Date.now().toString().slice(-8)}`;

  // Create SAR
  const insertQuery = `
    INSERT INTO suspicious_activity_reports (
      sar_number, case_id, filing_institution_id, subject_information,
      suspicious_activity, report_date, incident_date_from, incident_date_to,
      total_amount, currency, filing_reason, submitted_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;

  const result = await database.query(insertQuery, [
    sarNumber,
    caseId,
    filingInstitutionId,
    JSON.stringify(subjectInformation),
    JSON.stringify(suspiciousActivity),
    new Date(),
    incidentDateFrom,
    incidentDateTo,
    totalAmount,
    currency,
    filingReason,
    req.user.id
  ]);

  const newSar = result.rows[0];

  // Log SAR creation
  logger.compliance('SAR_CREATED', {
    sarNumber: newSar.sar_number,
    caseId,
    totalAmount,
    currency,
    submittedBy: req.user.username,
    filingInstitution: institutionQuery.rows[0].name
  });

  // Audit log
  logger.audit('SAR_CREATED', req.user.id, 'sar', newSar.id, {
    sarNumber: newSar.sar_number,
    caseId,
    totalAmount,
    currency
  });

  res.status(201).json({
    message: 'SAR created successfully',
    sar: {
      id: newSar.id,
      sarNumber: newSar.sar_number,
      status: newSar.status,
      reportDate: newSar.report_date,
      totalAmount: newSar.total_amount,
      currency: newSar.currency
    }
  });
}));

// @route   GET /api/reports/sar
// @desc    Get list of SARs
// @access  Private (Supervisor+)
router.get('/sar', authorize(['supervisor', 'admin']), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      s.id,
      s.sar_number,
      s.status,
      s.report_date,
      s.incident_date_from,
      s.incident_date_to,
      s.total_amount,
      s.currency,
      s.submitted_at,
      c.case_number,
      c.title as case_title,
      i.name as institution_name,
      u.username as submitted_by_username
    FROM suspicious_activity_reports s
    LEFT JOIN cases c ON s.case_id = c.id
    LEFT JOIN institutions i ON s.filing_institution_id = i.id
    LEFT JOIN users u ON s.submitted_by = u.id
    ORDER BY s.report_date DESC
    LIMIT $1 OFFSET $2
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM suspicious_activity_reports
  `;

  const [dataResult, countResult] = await Promise.all([
    database.query(query, [limit, offset]),
    database.query(countQuery)
  ]);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    sars: dataResult.rows,
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

// @route   PUT /api/reports/sar/:id/submit
// @desc    Submit SAR to authorities
// @access  Private (Admin)
router.put('/sar/:id/submit', authorize(['admin']), asyncHandler(async (req, res) => {
  const sarId = parseInt(req.params.id);

  if (isNaN(sarId)) {
    return res.status(400).json({ error: 'Invalid SAR ID' });
  }

  // Get SAR details
  const sarQuery = await database.query(
    'SELECT * FROM suspicious_activity_reports WHERE id = $1',
    [sarId]
  );

  if (sarQuery.rows.length === 0) {
    return res.status(404).json({ error: 'SAR not found' });
  }

  const sar = sarQuery.rows[0];

  if (sar.status !== 'draft') {
    return res.status(400).json({ error: 'SAR has already been submitted' });
  }

  // Update SAR status to submitted
  const updateQuery = `
    UPDATE suspicious_activity_reports 
    SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;

  const result = await database.query(updateQuery, [sarId]);
  const updatedSar = result.rows[0];

  // Log SAR submission
  logger.compliance('SAR_SUBMITTED', {
    sarNumber: updatedSar.sar_number,
    submittedAt: updatedSar.submitted_at,
    submittedBy: req.user.username
  });

  // In a real implementation, this would send the SAR to the appropriate authorities
  // For now, we'll just log it
  logger.info('SAR submission would be sent to NZ FIU', {
    sarNumber: updatedSar.sar_number,
    endpoint: process.env.NZ_FIU_REPORTING_ENDPOINT
  });

  res.json({
    message: 'SAR submitted successfully',
    sar: updatedSar
  });
}));

// @route   POST /api/reports/generate
// @desc    Generate analytical reports
// @access  Private (Analyst+)
router.post('/generate', authorize(['analyst', 'supervisor', 'admin']), asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = reportQuerySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid report parameters',
      details: error.details[0].message 
    });
  }

  const { type, startDate, endDate, format, filters } = value;

  let reportData = {};
  
  switch (type) {
    case 'transaction_summary':
      reportData = await generateTransactionSummary(startDate, endDate, filters);
      break;
    case 'alert_summary':
      reportData = await generateAlertSummary(startDate, endDate, filters, req.user);
      break;
    case 'case_summary':
      reportData = await generateCaseSummary(startDate, endDate, filters, req.user);
      break;
    case 'compliance_metrics':
      reportData = await generateComplianceMetrics(startDate, endDate, filters);
      break;
    default:
      return res.status(400).json({ error: 'Invalid report type' });
  }

  // Log report generation
  logger.audit('REPORT_GENERATED', req.user.id, 'report', type, {
    type,
    startDate,
    endDate,
    format,
    generatedBy: req.user.username
  });

  res.json({
    message: 'Report generated successfully',
    type,
    generatedAt: new Date().toISOString(),
    dateRange: { startDate, endDate },
    data: reportData
  });
}));

// Helper functions for report generation
async function generateTransactionSummary(startDate, endDate, filters) {
  const baseCondition = `processed_at >= $1 AND processed_at <= $2`;
  const params = [startDate, endDate];
  
  // Basic metrics
  const metricsQuery = `
    SELECT 
      COUNT(*) as total_transactions,
      SUM(amount) as total_volume,
      AVG(amount) as average_amount,
      COUNT(DISTINCT from_account_id) as unique_senders,
      COUNT(DISTINCT to_account_id) as unique_receivers
    FROM transactions 
    WHERE ${baseCondition}
  `;

  // Transaction type breakdown
  const typeQuery = `
    SELECT 
      transaction_type,
      COUNT(*) as count,
      SUM(amount) as volume,
      AVG(amount) as avg_amount
    FROM transactions 
    WHERE ${baseCondition}
    GROUP BY transaction_type
    ORDER BY volume DESC
  `;

  // Channel breakdown
  const channelQuery = `
    SELECT 
      channel,
      COUNT(*) as count,
      SUM(amount) as volume
    FROM transactions 
    WHERE ${baseCondition}
    GROUP BY channel
    ORDER BY count DESC
  `;

  // Daily volume trend
  const trendQuery = `
    SELECT 
      DATE(processed_at) as date,
      COUNT(*) as count,
      SUM(amount) as volume
    FROM transactions 
    WHERE ${baseCondition}
    GROUP BY DATE(processed_at)
    ORDER BY date
  `;

  const [metricsResult, typeResult, channelResult, trendResult] = await Promise.all([
    database.query(metricsQuery, params),
    database.query(typeQuery, params),
    database.query(channelQuery, params),
    database.query(trendQuery, params)
  ]);

  return {
    summary: metricsResult.rows[0],
    breakdowns: {
      byType: typeResult.rows,
      byChannel: channelResult.rows
    },
    trends: {
      daily: trendResult.rows
    }
  };
}

async function generateAlertSummary(startDate, endDate, filters, user) {
  let roleFilter = '';
  let params = [startDate, endDate];
  
  // Add role-based filtering for analysts
  if (user.role === 'analyst') {
    roleFilter = ' AND (assigned_to = $3 OR assigned_to IS NULL)';
    params.push(user.id);
  }

  const baseCondition = `created_at >= $1 AND created_at <= $2${roleFilter}`;

  // Basic metrics
  const metricsQuery = `
    SELECT 
      COUNT(*) as total_alerts,
      COUNT(CASE WHEN status = 'new' THEN 1 END) as new_alerts,
      COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating_alerts,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_alerts,
      COUNT(CASE WHEN status = 'false_positive' THEN 1 END) as false_positive_alerts,
      AVG(score) as average_score
    FROM alerts 
    WHERE ${baseCondition}
  `;

  // Severity breakdown
  const severityQuery = `
    SELECT 
      severity,
      COUNT(*) as count,
      AVG(score) as avg_score
    FROM alerts 
    WHERE ${baseCondition}
    GROUP BY severity
    ORDER BY 
      CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END
  `;

  // Type breakdown
  const typeQuery = `
    SELECT 
      alert_type,
      COUNT(*) as count
    FROM alerts 
    WHERE ${baseCondition}
    GROUP BY alert_type
    ORDER BY count DESC
  `;

  const [metricsResult, severityResult, typeResult] = await Promise.all([
    database.query(metricsQuery, params),
    database.query(severityQuery, params),
    database.query(typeQuery, params)
  ]);

  return {
    summary: metricsResult.rows[0],
    breakdowns: {
      bySeverity: severityResult.rows,
      byType: typeResult.rows
    }
  };
}

async function generateCaseSummary(startDate, endDate, filters, user) {
  let roleFilter = '';
  let params = [startDate, endDate];
  
  // Add role-based filtering for analysts
  if (user.role === 'analyst') {
    roleFilter = ' AND (assigned_to = $3 OR created_by = $3)';
    params.push(user.id);
  }

  const baseCondition = `created_at >= $1 AND created_at <= $2${roleFilter}`;

  // Basic metrics
  const metricsQuery = `
    SELECT 
      COUNT(*) as total_cases,
      COUNT(CASE WHEN status = 'open' THEN 1 END) as open_cases,
      COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating_cases,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_cases,
      SUM(estimated_loss) as total_estimated_loss,
      SUM(actual_loss) as total_actual_loss,
      AVG(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at))/86400) as avg_resolution_days
    FROM cases 
    WHERE ${baseCondition}
  `;

  // Type breakdown
  const typeQuery = `
    SELECT 
      case_type,
      COUNT(*) as count,
      SUM(estimated_loss) as estimated_loss,
      SUM(actual_loss) as actual_loss
    FROM cases 
    WHERE ${baseCondition}
    GROUP BY case_type
    ORDER BY count DESC
  `;

  // Priority breakdown
  const priorityQuery = `
    SELECT 
      priority,
      COUNT(*) as count
    FROM cases 
    WHERE ${baseCondition}
    GROUP BY priority
    ORDER BY 
      CASE priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END
  `;

  const [metricsResult, typeResult, priorityResult] = await Promise.all([
    database.query(metricsQuery, params),
    database.query(typeQuery, params),
    database.query(priorityQuery, params)
  ]);

  return {
    summary: metricsResult.rows[0],
    breakdowns: {
      byType: typeResult.rows,
      byPriority: priorityResult.rows
    }
  };
}

async function generateComplianceMetrics(startDate, endDate, filters) {
  const params = [startDate, endDate];
  const baseCondition = `report_date >= $1 AND report_date <= $2`;

  // SAR metrics
  const sarQuery = `
    SELECT 
      COUNT(*) as total_sars,
      COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_sars,
      COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_sars,
      SUM(total_amount) as total_reported_amount
    FROM suspicious_activity_reports 
    WHERE ${baseCondition}
  `;

  // SAR by institution
  const institutionQuery = `
    SELECT 
      i.name as institution_name,
      COUNT(s.id) as sar_count,
      SUM(s.total_amount) as total_amount
    FROM institutions i
    LEFT JOIN suspicious_activity_reports s ON i.id = s.filing_institution_id
      AND s.report_date >= $1 AND s.report_date <= $2
    GROUP BY i.id, i.name
    ORDER BY sar_count DESC
  `;

  const [sarResult, institutionResult] = await Promise.all([
    database.query(sarQuery, params),
    database.query(institutionQuery, params)
  ]);

  return {
    sarMetrics: sarResult.rows[0],
    institutionBreakdown: institutionResult.rows
  };
}

module.exports = router;
