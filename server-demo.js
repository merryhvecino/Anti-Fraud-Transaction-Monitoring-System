/**
 * AF-TMS Demo Server - Runs without database for demonstration
 * 
 * This is a simplified version that demonstrates the class-based architecture
 * without requiring PostgreSQL or Redis setup.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
require('dotenv').config();

const logger = require('./backend/utils/logger');

/**
 * Demo AF-TMS Server - No Database Required
 */
class AFTMSDemoServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.PORT || 5000;
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: "http://localhost:3000",
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    logger.info('Demo middleware configured');
  }

  setupDemoRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'healthy - DEMO MODE', 
        timestamp: new Date().toISOString(),
        version: '1.0.0-demo',
        mode: 'demonstration',
        features: ['class-based architecture', 'no database required']
      });
    });

    // API Documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'AF-TMS Demo API',
        mode: 'DEMONSTRATION',
        description: 'This is a demo version showcasing the class-based architecture',
        features: {
          'Class-Based Controllers': 'Organized, reusable controller classes',
          'Base Classes': 'Common functionality in BaseController and BaseService',
          'Clean Architecture': 'Separation of concerns with Controllers → Services → Database',
          'Easy to Learn': 'Well-documented, self-explanatory code structure'
        },
        endpoints: {
          health: '/api/health',
          docs: '/api/docs',
          demo: '/api/demo/*'
        },
        nextSteps: [
          'Install PostgreSQL to run the full system',
          'Or use Docker: docker-compose up -d',
          'See LEARNING_GUIDE.md for detailed explanations'
        ]
      });
    });

    // Demo authentication endpoint
    this.app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body;
      
      // Demo login - accepts any user
      if (username && password) {
        res.json({
          success: true,
          message: 'Demo login successful',
          data: {
            token: 'demo-jwt-token-' + Date.now(),
            user: {
              id: 1,
              username: username,
              firstName: 'Demo',
              lastName: 'User',
              role: 'admin',
              department: 'Demonstration'
            },
            expiresIn: '24h'
          },
          note: 'This is a demo - any username/password works'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Username and password required',
          hint: 'Any username/password will work in demo mode'
        });
      }
    });

    // Demo data endpoints
    this.app.get('/api/demo/transactions', (req, res) => {
      res.json({
        success: true,
        message: 'Demo transaction data',
        data: {
          items: [
            {
              id: 1,
              transaction_id: 'DEMO001',
              amount: 15000,
              currency: 'NZD',
              transaction_type: 'transfer',
              channel: 'online',
              status: 'completed',
              processed_at: new Date().toISOString(),
              from_account_number: 'ACC001',
              to_account_number: 'ACC002'
            },
            {
              id: 2,
              transaction_id: 'DEMO002',
              amount: 8500,
              currency: 'NZD',
              transaction_type: 'deposit',
              channel: 'mobile',
              status: 'completed',
              processed_at: new Date(Date.now() - 3600000).toISOString(),
              from_account_number: 'ACC003',
              to_account_number: 'ACC001'
            }
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 2,
            limit: 20
          }
        },
        note: 'This is demo data - in full system, this comes from PostgreSQL'
      });
    });

    this.app.get('/api/demo/alerts', (req, res) => {
      res.json({
        success: true,
        message: 'Demo alert data',
        data: {
          items: [
            {
              id: 1,
              alert_id: 'AL001',
              severity: 'high',
              status: 'new',
              alert_type: 'rule_based',
              details: { rule: 'Large transaction detected', amount: 15000 },
              created_at: new Date().toISOString()
            },
            {
              id: 2,
              alert_id: 'AL002',
              severity: 'medium',
              status: 'investigating',
              alert_type: 'pattern',
              details: { rule: 'Unusual pattern detected' },
              created_at: new Date(Date.now() - 7200000).toISOString()
            }
          ]
        },
        note: 'This is demo data - in full system, this comes from fraud detection rules'
      });
    });

    // Class-based architecture demonstration
    this.app.get('/api/demo/architecture', (req, res) => {
      res.json({
        title: 'AF-TMS Class-Based Architecture Demo',
        architecture: {
          'Base Classes': {
            'BaseController': 'Provides common HTTP response methods, error handling, validation',
            'BaseService': 'Provides common database operations, query building, logging',
            'BaseApiService': 'Frontend base class for API communication'
          },
          'Specific Classes': {
            'AuthController extends BaseController': 'Handles authentication endpoints',
            'TransactionController extends BaseController': 'Handles transaction endpoints',
            'AuthService extends BaseService': 'Business logic for authentication',
            'TransactionService extends BaseService': 'Business logic for transactions'
          },
          'Benefits': [
            'Code Reuse: Common functionality in base classes',
            'Consistency: All controllers follow same patterns',
            'Maintainability: Changes in one place affect all',
            'Testability: Each class has single responsibility',
            'Documentation: Self-explanatory structure'
          ]
        },
        example: {
          'Controller Pattern': `
class AuthController extends BaseController {
  async login(req, res) {
    try {
      this.validateRequired(req.body, ['username', 'password']);
      const result = await this.authService.authenticate(req.body);
      return this.sendSuccess(res, result, 'Login successful');
    } catch (error) {
      throw error; // Base class handles formatting
    }
  }
}`,
          'Service Pattern': `
class AuthService extends BaseService {
  async authenticate(credentials) {
    // Business logic here
    const user = await this.findUserByUsername(credentials.username);
    const isValid = await this.verifyPassword(credentials.password, user.hash);
    return { user: this.sanitizeUser(user), token: this.generateToken(user) };
  }
}`
        },
        nextSteps: [
          'Study the files in backend/core/ to understand base classes',
          'Look at backend/controllers/ and backend/services/ for implementations',
          'Read LEARNING_GUIDE.md for detailed explanations',
          'Try extending the system following the same patterns'
        ]
      });
    });

    // Serve frontend in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, 'frontend/build')));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
      });
    } else {
      // Development catch-all
      this.app.get('*', (req, res) => {
        res.json({
          message: '🚀 AF-TMS Demo Server - Class-Based Architecture',
          mode: 'DEMONSTRATION',
          description: 'This showcases the class-based architecture without requiring a database',
          frontend: 'Start React dev server: cd frontend && npm start',
          api: {
            health: '/api/health',
            docs: '/api/docs',
            architecture: '/api/demo/architecture',
            login: 'POST /api/auth/login',
            transactions: '/api/demo/transactions',
            alerts: '/api/demo/alerts'
          },
          learningResources: [
            'LEARNING_GUIDE.md - Complete tutorial',
            'backend/core/ - Base classes',
            'backend/controllers/ - Controller implementations',
            'backend/services/ - Service implementations'
          ]
        });
      });
    }

    logger.info('Demo routes configured');
  }

  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      console.error('Demo server error:', err);
      res.status(500).json({
        error: 'Demo server error',
        message: err.message,
        note: 'This is a demo version - full error handling available in production mode'
      });
    });
  }

  async startServer() {
    try {
      this.server = http.createServer(this.app);
      
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log('\n🎉 AF-TMS Demo Server Started Successfully!');
      console.log('=====================================');
      console.log(`📍 Server: http://localhost:${this.port}`);
      console.log(`📡 API: http://localhost:${this.port}/api`);
      console.log(`💚 Health: http://localhost:${this.port}/api/health`);
      console.log(`📚 Docs: http://localhost:${this.port}/api/docs`);
      console.log(`🏗️  Architecture: http://localhost:${this.port}/api/demo/architecture`);
      console.log(`🔐 Demo Login: POST http://localhost:${this.port}/api/auth/login`);
      console.log(`💰 Demo Transactions: http://localhost:${this.port}/api/demo/transactions`);
      console.log(`⚠️  Demo Alerts: http://localhost:${this.port}/api/demo/alerts`);
      console.log('\n📖 Learning Resources:');
      console.log('   - LEARNING_GUIDE.md (Complete tutorial)');
      console.log('   - backend/core/ (Base classes)');
      console.log('   - backend/controllers/ (Implementations)');
      console.log('\n🎯 This is a DEMO showcasing class-based architecture');
      console.log('   For full system: Install PostgreSQL or use Docker');
      console.log('=====================================\n');

    } catch (error) {
      console.error('Failed to start demo server:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      console.log('🚀 Starting AF-TMS Demo Server...');
      
      this.setupMiddleware();
      this.setupDemoRoutes();
      this.setupErrorHandling();
      await this.startServer();
      
    } catch (error) {
      console.error('Demo server initialization failed:', error);
      process.exit(1);
    }
  }
}

// Create and start the demo server
const demoServer = new AFTMSDemoServer();

if (require.main === module) {
  demoServer.initialize().catch((error) => {
    console.error('Failed to start AF-TMS Demo Server:', error);
    process.exit(1);
  });
}

module.exports = demoServer;
