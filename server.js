const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import routes and middleware
const authRoutes = require('./backend/routes/auth');
const transactionRoutes = require('./backend/routes/transactions');
const alertRoutes = require('./backend/routes/alerts');
const caseRoutes = require('./backend/routes/cases');
const reportRoutes = require('./backend/routes/reports');
const ruleRoutes = require('./backend/routes/rules');

const authMiddleware = require('./backend/middleware/auth');
const errorHandler = require('./backend/middleware/errorHandler');
const rateLimiter = require('./backend/middleware/rateLimiter');

// Import services
const logger = require('./backend/utils/logger');
const database = require('./backend/config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/alerts', authMiddleware, alertRoutes);
app.use('/api/cases', authMiddleware, caseRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/rules', authMiddleware, ruleRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// Socket.IO for real-time alerts
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join_room', (room) => {
    socket.join(room);
    logger.info(`Client ${socket.id} joined room: ${room}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io accessible to other modules
app.set('socketio', io);

const PORT = process.env.PORT || 5000;

// Initialize database and start server
database.initialize()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`AF-TMS Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated');
  });
});

module.exports = { app, io };
