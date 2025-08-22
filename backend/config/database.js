const { Pool } = require('pg');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'af_tms_db',
      user: process.env.DB_USER || 'af_tms_user',
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async initialize() {
    try {
      // Test connection
      const client = await this.pool.connect();
      logger.info('Database connection established successfully');
      client.release();

      // Create tables if they don't exist
      await this.createTables();
      logger.info('Database tables initialized');
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          role VARCHAR(20) DEFAULT 'analyst' CHECK (role IN ('admin', 'supervisor', 'analyst', 'viewer')),
          department VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Financial institutions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS institutions (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          code VARCHAR(10) UNIQUE NOT NULL,
          type VARCHAR(20) NOT NULL CHECK (type IN ('bank', 'credit_union', 'finance_company')),
          swift_code VARCHAR(11),
          address TEXT,
          contact_email VARCHAR(100),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Customers table
      await client.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          customer_id VARCHAR(50) UNIQUE NOT NULL,
          institution_id INTEGER REFERENCES institutions(id),
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          date_of_birth DATE,
          email VARCHAR(100),
          phone VARCHAR(20),
          address TEXT,
          country VARCHAR(2) DEFAULT 'NZ',
          risk_rating VARCHAR(10) DEFAULT 'low' CHECK (risk_rating IN ('low', 'medium', 'high')),
          kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'failed')),
          pep_status BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Accounts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id SERIAL PRIMARY KEY,
          account_number VARCHAR(50) UNIQUE NOT NULL,
          customer_id INTEGER REFERENCES customers(id),
          institution_id INTEGER REFERENCES institutions(id),
          account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit', 'loan')),
          currency VARCHAR(3) DEFAULT 'NZD',
          balance DECIMAL(15,2) DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'frozen', 'suspended')),
          opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP
        )
      `);

      // Transactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          transaction_id VARCHAR(100) UNIQUE NOT NULL,
          from_account_id INTEGER REFERENCES accounts(id),
          to_account_id INTEGER REFERENCES accounts(id),
          amount DECIMAL(15,2) NOT NULL,
          currency VARCHAR(3) DEFAULT 'NZD',
          transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('transfer', 'deposit', 'withdrawal', 'payment')),
          channel VARCHAR(20) NOT NULL CHECK (channel IN ('atm', 'online', 'mobile', 'branch', 'wire')),
          description TEXT,
          reference_number VARCHAR(100),
          ip_address INET,
          device_fingerprint VARCHAR(255),
          location_country VARCHAR(2),
          location_city VARCHAR(50),
          status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Detection rules table
      await client.query(`
        CREATE TABLE IF NOT EXISTS detection_rules (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('amount', 'frequency', 'pattern', 'location', 'velocity')),
          conditions JSONB NOT NULL,
          severity VARCHAR(10) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
          is_active BOOLEAN DEFAULT true,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Alerts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          alert_id VARCHAR(100) UNIQUE NOT NULL,
          transaction_id INTEGER REFERENCES transactions(id),
          rule_id INTEGER REFERENCES detection_rules(id),
          customer_id INTEGER REFERENCES customers(id),
          alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('rule_based', 'ml_anomaly', 'manual')),
          severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
          status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'escalated', 'closed', 'false_positive')),
          score DECIMAL(5,2),
          details JSONB,
          assigned_to INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Cases table
      await client.query(`
        CREATE TABLE IF NOT EXISTS cases (
          id SERIAL PRIMARY KEY,
          case_number VARCHAR(50) UNIQUE NOT NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT,
          case_type VARCHAR(20) NOT NULL CHECK (case_type IN ('fraud', 'aml', 'sanctions', 'other')),
          priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'pending_closure', 'closed')),
          assigned_to INTEGER REFERENCES users(id),
          created_by INTEGER REFERENCES users(id),
          estimated_loss DECIMAL(15,2),
          actual_loss DECIMAL(15,2),
          resolution_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP
        )
      `);

      // Case alerts relationship table
      await client.query(`
        CREATE TABLE IF NOT EXISTS case_alerts (
          id SERIAL PRIMARY KEY,
          case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
          alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(case_id, alert_id)
        )
      `);

      // Suspicious Activity Reports (SARs) table
      await client.query(`
        CREATE TABLE IF NOT EXISTS suspicious_activity_reports (
          id SERIAL PRIMARY KEY,
          sar_number VARCHAR(50) UNIQUE NOT NULL,
          case_id INTEGER REFERENCES cases(id),
          filing_institution_id INTEGER REFERENCES institutions(id),
          subject_information JSONB NOT NULL,
          suspicious_activity JSONB NOT NULL,
          report_date DATE NOT NULL,
          incident_date_from DATE,
          incident_date_to DATE,
          total_amount DECIMAL(15,2),
          currency VARCHAR(3) DEFAULT 'NZD',
          filing_reason TEXT NOT NULL,
          status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'acknowledged')),
          submitted_by INTEGER REFERENCES users(id),
          submitted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Audit logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          action VARCHAR(50) NOT NULL,
          resource_type VARCHAR(50) NOT NULL,
          resource_id VARCHAR(100),
          old_values JSONB,
          new_values JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_processed_at ON transactions(processed_at);
        CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
        CREATE INDEX IF NOT EXISTS idx_transactions_from_account ON transactions(from_account_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
        CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
        CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
        CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
        CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_customers_risk_rating ON customers(risk_rating);
      `);

      await client.query('COMMIT');
      logger.info('Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating database tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Query executed', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Query error', { text, error: error.message });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close() {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

module.exports = new Database();
