// User and Authentication Types
export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'supervisor' | 'analyst' | 'viewer';
  department?: string;
  lastLogin?: string;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
  expiresIn: string;
}

// Transaction Types
export interface Transaction {
  id: number;
  transaction_id: string;
  amount: number;
  currency: string;
  transaction_type: 'transfer' | 'deposit' | 'withdrawal' | 'payment';
  channel: 'atm' | 'online' | 'mobile' | 'branch' | 'wire';
  description?: string;
  reference_number?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processed_at: string;
  created_at: string;
  from_account_number?: string;
  from_customer_first_name?: string;
  from_customer_last_name?: string;
  to_account_number?: string;
  to_customer_first_name?: string;
  to_customer_last_name?: string;
  ip_address?: string;
  location_country?: string;
  location_city?: string;
  alerts?: Alert[];
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  accountId?: number;
  customerId?: number;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  transactionType?: string;
  channel?: string;
  status?: string;
  search?: string;
}

// Alert Types
export interface Alert {
  id: number;
  alert_id: string;
  alert_type: 'rule_based' | 'ml_anomaly' | 'manual';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'investigating' | 'escalated' | 'closed' | 'false_positive';
  score?: number;
  details?: Record<string, any>;
  created_at: string;
  updated_at: string;
  transaction_id?: string;
  amount?: number;
  currency?: string;
  transaction_type?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  assigned_to_username?: string;
  rule_name?: string;
}

export interface AlertFilters {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  alertType?: string;
  assignedTo?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface AlertUpdate {
  status?: string;
  assignedTo?: number | null;
  notes?: string;
  resolution?: string;
}

// Case Types
export interface Case {
  id: number;
  case_number: string;
  title: string;
  description?: string;
  case_type: 'fraud' | 'aml' | 'sanctions' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'investigating' | 'pending_closure' | 'closed';
  estimated_loss?: number;
  actual_loss?: number;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  assigned_to_username?: string;
  created_by_username?: string;
  alert_count?: number;
  alerts?: Alert[];
}

export interface CaseFilters {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  caseType?: string;
  assignedTo?: number;
  createdBy?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface CreateCaseRequest {
  title: string;
  description: string;
  caseType: string;
  priority?: string;
  assignedTo?: number;
  estimatedLoss?: number;
  alertIds?: number[];
}

export interface UpdateCaseRequest {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedTo?: number | null;
  estimatedLoss?: number;
  actualLoss?: number;
  resolutionNotes?: string;
}

// Rule Types
export interface DetectionRule {
  id: number;
  name: string;
  description?: string;
  rule_type: 'amount' | 'frequency' | 'pattern' | 'location' | 'velocity';
  conditions: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_username?: string;
  triggered_alerts?: number;
  false_positives?: number;
  recentAlerts?: Alert[];
}

export interface RuleTemplate {
  name: string;
  description: string;
  ruleType: string;
  conditions: Record<string, any>;
  severity: string;
}

// Report Types
export interface ReportRequest {
  type: 'transaction_summary' | 'alert_summary' | 'case_summary' | 'compliance_metrics';
  startDate: string;
  endDate: string;
  format?: 'json' | 'csv' | 'pdf';
  filters?: Record<string, any>;
}

export interface SARRequest {
  caseId: number;
  filingInstitutionId: number;
  subjectInformation: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    address?: string;
    phoneNumber?: string;
    email?: string;
    identification?: Record<string, any>;
  };
  suspiciousActivity: {
    activityType: string;
    description: string;
    transactionPatterns?: Record<string, any>[];
    timeframe: {
      from: string;
      to: string;
    };
  };
  incidentDateFrom: string;
  incidentDateTo: string;
  totalAmount: number;
  currency?: string;
  filingReason: string;
}

// Dashboard Types
export interface DashboardStats {
  totalAlerts: number;
  newAlerts: number;
  investigatingAlerts: number;
  escalatedAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  totalCases: number;
  openCases: number;
  closedCases: number;
  urgentCases: number;
  totalTransactions: number;
  totalVolume: number;
  averageAmount: number;
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

export interface TimeSeriesData {
  date: string;
  count: number;
  volume?: number;
}

// API Response Types
export interface PaginatedResponse<T> {
  data?: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  error?: string;
  details?: string;
}

// Socket Event Types
export interface SocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

// Filter and Search Types
export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface SearchFilters {
  query: string;
  filters: Record<string, any>;
  dateRange: DateRange;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Notification Types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

// Form Types
export interface FormError {
  field: string;
  message: string;
}

export interface FormState<T> {
  data: T;
  errors: FormError[];
  isSubmitting: boolean;
  isDirty: boolean;
}

// Utility Types
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'new' | 'investigating' | 'escalated' | 'closed' | 'false_positive';
export type CaseStatus = 'open' | 'investigating' | 'pending_closure' | 'closed';
export type UserRole = 'admin' | 'supervisor' | 'analyst' | 'viewer';
export type TransactionType = 'transfer' | 'deposit' | 'withdrawal' | 'payment';
export type TransactionChannel = 'atm' | 'online' | 'mobile' | 'branch' | 'wire';
