/**
 * AF-TMS Server - Class-based Architecture
 * 
 * This is the main server file that:
 * - Sets up Express application with middleware
 * - Initializes database connection
 * - Registers class-based controllers and routes
 * - Starts the HTTP server with Socket.IO
 * 
 * Learn: This demonstrates how to organize a Node.js application
 * using class-based controllers and services.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import utilities and configuration
const logger = require('./backend/utils/logger');
const database = require('./backend/config/database');

// Import middleware
const { authMiddleware } = require('./backend/middleware/auth');
const { errorHandler, notFoundHandler } = require('./backend/middleware/errorHandler');
const { rateLimiter } = require('./backend/middleware/RateLimiter');

// Import class-based controllers
const AuthController = require('./backend/controllers/AuthController');
const TransactionController = require('./backend/controllers/TransactionController');

/**
 * Main Application Class
 * 
 * Learn: This class encapsulates the entire application setup,
 * making it easier to test and maintain.
 */
class AFTMSServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.io = null;
    this.port = process.env.PORT || 5000;
    
    // Initialize controllers
    this.initializeControllers();
  }

  /**
   * Initialize all controllers
   * Learn: Controllers are instantiated here and stored as properties
   */
  initializeControllers() {
    this.authController = new AuthController();
    this.transactionController = new TransactionController();
    
    // Add more controllers as needed
    // this.alertController = new AlertController();
    // this.caseController = new CaseController();
    
    logger.info('Controllers initialized');
  }

  /**
   * Set up Express middleware
   * Learn: Middleware is applied in order and affects all routes
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf; // Store raw body for webhooks if needed
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?.id
        });
      });
      
      next();
    });

    // Rate limiting
    this.app.use(rateLimiter);

    logger.info('Middleware configured');
  }

  /**
   * Set up application routes using class-based controllers
   * Learn: Each controller provides its own routes through getRoutes() method
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      });
    });

    // API Documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'AF-TMS API Documentation',
        version: '1.0.0',
        description: 'Anti-Fraud Transaction Monitoring System API',
        endpoints: {
          auth: '/api/auth',
          transactions: '/api/transactions',
          alerts: '/api/alerts',
          cases: '/api/cases',
          reports: '/api/reports',
          rules: '/api/rules'
        },
        documentation: 'See LEARNING_GUIDE.md for detailed examples'
      });
    });

    // Register controller routes
    this.app.use('/api/auth', this.authController.getRoutes());
    this.app.use('/api/transactions', this.transactionController.getRoutes());
    
    // Add more routes as controllers are implemented
    // this.app.use('/api/alerts', this.alertController.getRoutes());
    // this.app.use('/api/cases', this.caseController.getRoutes());

    // Serve static files from React build in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, 'frontend/build')));
      
      // React app catch-all handler
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
      });
    } else {
      // Development mode - serve a simple message for non-API routes
      this.app.get('*', (req, res) => {
        res.json({
          message: 'AF-TMS Development Server',
          frontend: 'Run `npm start` in the frontend directory',
          api: {
            health: '/api/health',
            docs: '/api/docs',
            auth: '/api/auth',
            transactions: '/api/transactions'
          }
        });
      });
    }

    logger.info('Routes configured');
  }

  /**
   * Set up Socket.IO for real-time features
   * Learn: Socket.IO enables real-time communication between server and clients
   */
  setupSocketIO() {
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { 
        socketId: socket.id,
        ip: socket.handshake.address 
      });
      
      // Handle user joining rooms (for targeted notifications)
      socket.on('join_room', (room) => {
        socket.join(room);
        logger.info('Client joined room', { 
          socketId: socket.id, 
          room 
        });
      });
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', { 
          socketId: socket.id, 
          reason 
        });
      });

      // Handle ping/pong for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });

    // Make io accessible to controllers
    this.app.set('socketio', this.io);

    logger.info('Socket.IO configured');
  }

  /**
   * Set up error handling middleware
   * Learn: Error handlers should be registered after all other middleware and routes
   */
  setupErrorHandling() {
    // 404 handler for unmatched routes
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise
      });
      
      // In production, you might want to gracefully shutdown
      if (process.env.NODE_ENV === 'production') {
        this.gracefulShutdown();
      }
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      
      // Exit the process
      process.exit(1);
    });

    logger.info('Error handling configured');
  }

  /**
   * Initialize database connection
   * Learn: Database should be initialized before starting the server
   */
  async initializeDatabase() {
    try {
      await database.initialize();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Start the HTTP server
   * Learn: Server startup should be done after all configuration is complete
   */
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

      logger.info('AF-TMS Server started', {
        port: this.port,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        nodeVersion: process.version
      });

    } catch (error) {
      logger.error('Server startup failed', {
        error: error.message,
        port: this.port
      });
      throw error;
    }
  }

  /**
   * Initialize and start the complete application
   * Learn: This method orchestrates the entire application startup process
   */
  async initialize() {
    try {
      logger.info('Initializing AF-TMS Server...');
      
      // Setup application components in order
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();
      
      // Initialize database
      await this.initializeDatabase();
      
      // Start server
      await this.startServer();
      
      // Setup Socket.IO after server is running
      this.setupSocketIO();
      
      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();
      
      logger.info('AF-TMS Server initialization complete');
      
      // Log useful information for developers
      if (process.env.NODE_ENV === 'development') {
        console.log('\n🚀 AF-TMS Development Server Running');
        console.log(`📍 Server: http://localhost:${this.port}`);
        console.log(`📡 API: http://localhost:${this.port}/api`);
        console.log(`💚 Health: http://localhost:${this.port}/api/health`);
        console.log(`📚 Docs: http://localhost:${this.port}/api/docs`);
        console.log('📖 Learning Guide: See LEARNING_GUIDE.md\n');
      }

    } catch (error) {
      logger.error('Server initialization failed', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Set up graceful shutdown handlers
   * Learn: Proper shutdown ensures data integrity and connection cleanup
   */
  setupShutdownHandlers() {
    const signals = ['SIGTERM', 'SIGINT'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, initiating graceful shutdown...`);
        this.gracefulShutdown();
      });
    });
  }

  /**
   * Graceful shutdown process
   * Learn: Clean shutdown prevents data corruption and connection leaks
   */
  async gracefulShutdown() {
    try {
      logger.info('Starting graceful shutdown...');
      
      // Stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }
      
      // Close Socket.IO connections
      if (this.io) {
        this.io.close();
        logger.info('Socket.IO server closed');
      }
      
      // Close database connections
      await database.close();
      logger.info('Database connections closed');
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Get application statistics (useful for monitoring)
   */
  getStats() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      socketConnections: this.io ? this.io.engine.clientsCount : 0
    };
  }
}

// Create and initialize the server
const server = new AFTMSServer();

// Start the server if this file is run directly
if (require.main === module) {
  server.initialize().catch((error) => {
    console.error('Failed to start AF-TMS Server:', error);
    process.exit(1);
  });
}

// Export server instance for testing
module.exports = server;
