const bcrypt = require('bcryptjs');
const database = require('../config/database');
const logger = require('../utils/logger');

class DataSeeder {
  async seedDefaultUsers() {
    logger.info('Seeding default users...');
    
    const defaultUsers = [
      {
        username: 'admin',
        email: 'admin@af-tms.nz',
        password: 'admin123',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'admin',
        department: 'IT'
      },
      {
        username: 'supervisor',
        email: 'supervisor@af-tms.nz',
        password: 'supervisor123',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'supervisor',
        department: 'Compliance'
      },
      {
        username: 'analyst',
        email: 'analyst@af-tms.nz',
        password: 'analyst123',
        firstName: 'John',
        lastName: 'Doe',
        role: 'analyst',
        department: 'Fraud Detection'
      },
      {
        username: 'viewer',
        email: 'viewer@af-tms.nz',
        password: 'viewer123',
        firstName: 'Mary',
        lastName: 'Johnson',
        role: 'viewer',
        department: 'Audit'
      }
    ];

    for (const user of defaultUsers) {
      try {
        // Check if user already exists
        const existingUser = await database.query(
          'SELECT id FROM users WHERE username = $1',
          [user.username]
        );

        if (existingUser.rows.length === 0) {
          const hashedPassword = await bcrypt.hash(user.password, 12);
          
          await database.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, role, department)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.username, user.email, hashedPassword, user.firstName, user.lastName, user.role, user.department]
          );
          
          logger.info(`Created user: ${user.username}`);
        } else {
          logger.info(`User already exists: ${user.username}`);
        }
      } catch (error) {
        logger.error(`Error creating user ${user.username}:`, error);
      }
    }
  }

  async seedDefaultInstitutions() {
    logger.info('Seeding default institutions...');
    
    const defaultInstitutions = [
      {
        name: 'ANZ Bank New Zealand',
        code: 'ANZ',
        type: 'bank',
        swift_code: 'ANZBNZ22',
        address: '1 Victoria Street, Wellington 6011, New Zealand',
        contact_email: 'compliance@anz.co.nz'
      },
      {
        name: 'Bank of New Zealand',
        code: 'BNZ',
        type: 'bank',
        swift_code: 'BKNZNZ22',
        address: '80 Queen Street, Auckland 1010, New Zealand',
        contact_email: 'compliance@bnz.co.nz'
      },
      {
        name: 'Westpac New Zealand',
        code: 'WBC',
        type: 'bank',
        swift_code: 'WPACNZ2W',
        address: '16 Takutai Square, Auckland 1010, New Zealand',
        contact_email: 'compliance@westpac.co.nz'
      }
    ];

    for (const institution of defaultInstitutions) {
      try {
        const existing = await database.query(
          'SELECT id FROM institutions WHERE code = $1',
          [institution.code]
        );

        if (existing.rows.length === 0) {
          await database.query(
            `INSERT INTO institutions (name, code, type, swift_code, address, contact_email)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [institution.name, institution.code, institution.type, institution.swift_code, institution.address, institution.contact_email]
          );
          
          logger.info(`Created institution: ${institution.name}`);
        } else {
          logger.info(`Institution already exists: ${institution.name}`);
        }
      } catch (error) {
        logger.error(`Error creating institution ${institution.name}:`, error);
      }
    }
  }

  async seedDefaultRules() {
    logger.info('Seeding default detection rules...');
    
    // Get admin user ID for rule creation
    const adminUser = await database.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );
    
    if (adminUser.rows.length === 0) {
      logger.error('Admin user not found, skipping rule seeding');
      return;
    }
    
    const adminUserId = adminUser.rows[0].id;
    
    const defaultRules = [
      {
        name: 'Large Cash Transaction - NZD 10,000+',
        description: 'Detects cash transactions over NZD 10,000 threshold',
        rule_type: 'amount',
        conditions: {
          minAmount: 10000,
          currency: 'NZD',
          transactionTypes: ['deposit', 'withdrawal']
        },
        severity: 'high'
      },
      {
        name: 'High Frequency Wire Transfers',
        description: 'Detects accounts with more than 5 wire transfers in 24 hours',
        rule_type: 'frequency',
        conditions: {
          transactionCount: 5,
          timeWindow: '24h',
          channels: ['wire']
        },
        severity: 'medium'
      },
      {
        name: 'Round Amount Structuring',
        description: 'Detects multiple round amount transactions indicating structuring',
        rule_type: 'pattern',
        conditions: {
          roundAmounts: true,
          transactionCount: 3,
          timeWindow: '24h'
        },
        severity: 'medium'
      },
      {
        name: 'International High-Risk Transfer',
        description: 'Detects large transfers to high-risk countries',
        rule_type: 'location',
        conditions: {
          blockedCountries: ['AF', 'IR', 'KP', 'SY'],
          minAmount: 5000
        },
        severity: 'critical'
      }
    ];

    for (const rule of defaultRules) {
      try {
        const existing = await database.query(
          'SELECT id FROM detection_rules WHERE name = $1',
          [rule.name]
        );

        if (existing.rows.length === 0) {
          await database.query(
            `INSERT INTO detection_rules (name, description, rule_type, conditions, severity, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [rule.name, rule.description, rule.rule_type, JSON.stringify(rule.conditions), rule.severity, adminUserId]
          );
          
          logger.info(`Created rule: ${rule.name}`);
        } else {
          logger.info(`Rule already exists: ${rule.name}`);
        }
      } catch (error) {
        logger.error(`Error creating rule ${rule.name}:`, error);
      }
    }
  }

  async seedSampleData() {
    logger.info('Seeding sample customers and accounts...');
    
    // Get institutions for sample data
    const institutions = await database.query('SELECT id FROM institutions LIMIT 3');
    if (institutions.rows.length === 0) {
      logger.error('No institutions found, skipping sample data seeding');
      return;
    }

    // Sample customers
    const sampleCustomers = [
      {
        customer_id: 'CUST001',
        institution_id: institutions.rows[0].id,
        first_name: 'Alice',
        last_name: 'Williams',
        email: 'alice.williams@email.com',
        country: 'NZ',
        risk_rating: 'low'
      },
      {
        customer_id: 'CUST002',
        institution_id: institutions.rows[0].id,
        first_name: 'Bob',
        last_name: 'Brown',
        email: 'bob.brown@email.com',
        country: 'NZ',
        risk_rating: 'medium'
      },
      {
        customer_id: 'CUST003',
        institution_id: institutions.rows[1].id,
        first_name: 'Charlie',
        last_name: 'Davis',
        email: 'charlie.davis@email.com',
        country: 'NZ',
        risk_rating: 'high'
      }
    ];

    for (const customer of sampleCustomers) {
      try {
        const existing = await database.query(
          'SELECT id FROM customers WHERE customer_id = $1',
          [customer.customer_id]
        );

        if (existing.rows.length === 0) {
          const result = await database.query(
            `INSERT INTO customers (customer_id, institution_id, first_name, last_name, email, country, risk_rating)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [customer.customer_id, customer.institution_id, customer.first_name, customer.last_name, customer.email, customer.country, customer.risk_rating]
          );
          
          const customerId = result.rows[0].id;
          
          // Create sample accounts for each customer
          await database.query(
            `INSERT INTO accounts (account_number, customer_id, institution_id, account_type, currency, balance)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [`ACC${customer.customer_id}001`, customerId, customer.institution_id, 'checking', 'NZD', Math.floor(Math.random() * 50000) + 10000]
          );
          
          logger.info(`Created customer and account: ${customer.customer_id}`);
        }
      } catch (error) {
        logger.error(`Error creating customer ${customer.customer_id}:`, error);
      }
    }
  }

  async run() {
    try {
      logger.info('Starting data seeding process...');
      
      await this.seedDefaultUsers();
      await this.seedDefaultInstitutions();
      await this.seedDefaultRules();
      await this.seedSampleData();
      
      logger.info('Data seeding completed successfully');
    } catch (error) {
      logger.error('Data seeding failed:', error);
      throw error;
    }
  }
}

// Run seeding if called directly
if (require.main === module) {
  const seeder = new DataSeeder();
  
  database.initialize()
    .then(() => seeder.run())
    .then(() => {
      logger.info('Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding process failed:', error);
      process.exit(1);
    });
}

module.exports = DataSeeder;
