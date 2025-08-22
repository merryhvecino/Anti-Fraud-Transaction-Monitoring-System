/**
 * Simple AF-TMS Demo - Showcases Class-Based Architecture
 * 
 * This is a minimal demo showing the class-based patterns
 * without external dependencies.
 */

const express = require('express');
const cors = require('cors');

/**
 * Simple Demo Server - Class-Based Architecture Example
 */
class SimpleDemoServer {
  constructor() {
    this.app = express();
    this.port = 3001; // Use different port to avoid conflicts
  }

  setup() {
    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    
    // Log requests
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    // Routes
    this.setupRoutes();
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: '✅ AF-TMS Demo Server Running',
        mode: 'DEMONSTRATION',
        timestamp: new Date().toISOString(),
        architecture: 'Class-Based',
        port: this.port
      });
    });

    // Architecture explanation
    this.app.get('/api/architecture', (req, res) => {
      res.json({
        title: '🏗️ AF-TMS Class-Based Architecture',
        description: 'Demonstrates organized, maintainable, and scalable code structure',
        structure: {
          'BaseController': {
            purpose: 'Common HTTP response methods, validation, error handling',
            location: 'backend/core/BaseController.js',
            methods: ['sendSuccess()', 'sendError()', 'validateRequired()', 'asyncHandler()']
          },
          'BaseService': {
            purpose: 'Common database operations, query building, business logic',
            location: 'backend/core/BaseService.js', 
            methods: ['findById()', 'create()', 'update()', 'delete()', 'buildWhereClause()']
          },
          'Controllers': {
            'AuthController': 'Extends BaseController - handles login, registration, etc.',
            'TransactionController': 'Extends BaseController - handles transaction operations'
          },
          'Services': {
            'AuthService': 'Extends BaseService - authentication business logic',
            'TransactionService': 'Extends BaseService - transaction business logic'
          }
        },
        benefits: [
          '🔄 Code Reuse: Common functionality in base classes',
          '📐 Consistency: All components follow same patterns',
          '🛠️ Maintainability: Changes in one place affect all',
          '🧪 Testability: Each class has single responsibility',
          '📚 Self-Documenting: Clear structure and naming'
        ]
      });
    });

    // Demo login (shows controller pattern)
    this.app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password required',
          example: 'This demonstrates BaseController.validateRequired() pattern'
        });
      }

      // Simulate successful login
      res.json({
        success: true,
        message: 'Demo login successful',
        data: {
          token: 'demo-token-' + Date.now(),
          user: {
            id: 1,
            username: username,
            role: 'admin'
          }
        },
        note: '✨ This demonstrates BaseController.sendSuccess() pattern'
      });
    });

    // Demo data endpoints
    this.app.get('/api/transactions', (req, res) => {
      res.json({
        success: true,
        data: {
          items: [
            {
              id: 1,
              transaction_id: 'TXN001',
              amount: 15000,
              currency: 'NZD',
              type: 'transfer',
              status: 'completed',
              created_at: new Date().toISOString()
            },
            {
              id: 2,
              transaction_id: 'TXN002', 
              amount: 8500,
              currency: 'NZD',
              type: 'deposit',
              status: 'pending',
              created_at: new Date(Date.now() - 3600000).toISOString()
            }
          ],
          pagination: {
            currentPage: 1,
            totalRecords: 2,
            limit: 20
          }
        },
        note: '📊 This demonstrates TransactionService.findAll() pattern'
      });
    });

    this.app.get('/api/alerts', (req, res) => {
      res.json({
        success: true,
        data: {
          items: [
            {
              id: 1,
              alert_id: 'AL001',
              severity: 'high',
              status: 'new',
              rule: 'Large Transaction Alert',
              amount: 15000,
              created_at: new Date().toISOString()
            },
            {
              id: 2,
              alert_id: 'AL002',
              severity: 'medium', 
              status: 'investigating',
              rule: 'Pattern Detection',
              created_at: new Date(Date.now() - 7200000).toISOString()
            }
          ]
        },
        note: '⚠️ This demonstrates AlertService patterns'
      });
    });

    // Learning resources
    this.app.get('/api/learn', (req, res) => {
      res.json({
        title: '📖 Learning AF-TMS Class-Based Architecture',
        steps: [
          {
            step: 1,
            title: 'Study Base Classes',
            files: ['backend/core/BaseController.js', 'backend/core/BaseService.js'],
            learn: 'Understand common patterns and methods'
          },
          {
            step: 2,
            title: 'Examine Controllers',
            files: ['backend/controllers/AuthController.js', 'backend/controllers/TransactionController.js'],
            learn: 'See how base classes are extended'
          },
          {
            step: 3,
            title: 'Review Services',
            files: ['backend/services/AuthService.js', 'backend/services/TransactionService.js'],
            learn: 'Understand business logic patterns'
          },
          {
            step: 4,
            title: 'Read Documentation',
            files: ['LEARNING_GUIDE.md', 'README.md'],
            learn: 'Complete explanations and examples'
          }
        ],
        codeExample: {
          description: 'How to create a new feature',
          example: `
// 1. Create Service
class CustomerService extends BaseService {
  constructor() {
    super('customers'); // table name
  }
  
  async getCustomersByRisk(riskLevel) {
    return await this.findAll({ risk_rating: riskLevel });
  }
}

// 2. Create Controller  
class CustomerController extends BaseController {
  constructor() {
    super();
    this.customerService = new CustomerService();
  }
  
  async getCustomers(req, res) {
    try {
      const customers = await this.customerService.getCustomersByRisk(req.query.risk);
      return this.sendSuccess(res, customers);
    } catch (error) {
      throw error; // Base class handles errors
    }
  }
}

// 3. Register routes
app.use('/api/customers', new CustomerController().getRoutes());
          `
        }
      });
    });

    // Home route
    this.app.get('/', (req, res) => {
      res.json({
        title: '🚀 AF-TMS Class-Based Architecture Demo',
        description: 'A demonstration of clean, organized, maintainable code patterns',
        status: 'running',
        endpoints: {
          health: '/api/health',
          architecture: '/api/architecture', 
          login: 'POST /api/auth/login',
          transactions: '/api/transactions',
          alerts: '/api/alerts',
          learn: '/api/learn'
        },
        nextSteps: [
          '1. Visit /api/architecture to understand the structure',
          '2. Try POST /api/auth/login with any username/password',
          '3. Check /api/transactions and /api/alerts for demo data',
          '4. Read /api/learn for step-by-step guidance',
          '5. Study the actual code files mentioned in the responses'
        ],
        fullSystem: 'To run with database: Install PostgreSQL and use server-new.js'
      });
    });
  }

  start() {
    this.setup();
    
    this.app.listen(this.port, () => {
      console.log('\n🎉 AF-TMS Demo Server Started!');
      console.log('================================');
      console.log(`📍 Server: http://localhost:${this.port}`);
      console.log(`💚 Health: http://localhost:${this.port}/api/health`);
      console.log(`🏗️  Architecture: http://localhost:${this.port}/api/architecture`);
      console.log(`🔐 Login Demo: POST http://localhost:${this.port}/api/auth/login`);
      console.log(`💰 Transactions: http://localhost:${this.port}/api/transactions`);
      console.log(`⚠️  Alerts: http://localhost:${this.port}/api/alerts`);
      console.log(`📖 Learning: http://localhost:${this.port}/api/learn`);
      console.log('\n🎯 This demonstrates CLASS-BASED ARCHITECTURE');
      console.log('   - Organized code structure');
      console.log('   - Reusable base classes');
      console.log('   - Clear separation of concerns');
      console.log('   - Easy to learn and extend');
      console.log('\n📚 Study the files mentioned in /api/learn');
      console.log('================================\n');
    });
  }
}

// Start the demo
const demo = new SimpleDemoServer();
demo.start();
