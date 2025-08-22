# AF-TMS Learning Guide
## Understanding Class-Based Architecture and Clean Code Patterns

This guide explains the class-based architecture used in AF-TMS and how to understand, extend, and maintain the codebase.

## 🎯 Learning Objectives

After reading this guide, you will understand:
- How class-based architecture improves code organization
- The role of different layers (Controllers, Services, Base Classes)
- How to extend the system with new features
- Best practices for maintainable code

---

## 📚 Architecture Overview

### Class Hierarchy Structure

```
BaseController ← AuthController, TransactionController, AlertController
BaseService ← AuthService, TransactionService, AlertService
BaseApiService ← AuthService, TransactionService (Frontend)
```

**Learn: Why use inheritance?**
- **Code Reuse**: Common functionality is written once in base classes
- **Consistency**: All controllers/services follow the same patterns
- **Maintainability**: Changes to common functionality are made in one place
- **Testing**: Base classes can be tested independently

---

## 🏗️ Backend Architecture

### 1. Base Classes (Foundation Layer)

#### BaseController.js
```javascript
class BaseController {
  // Common HTTP response methods
  sendSuccess(res, data, message, statusCode = 200)
  sendError(res, message, statusCode = 400, details = null)
  sendPaginated(res, data, pagination, message)
  
  // Error handling
  asyncHandler(controllerMethod)
  
  // Utility methods
  validateRequired(body, requiredFields)
  parsePagination(query)
  logUserAction(action, req, resourceType, resourceId, changes)
}
```

**Learn: What this provides:**
- **Consistent Responses**: All API endpoints return the same JSON structure
- **Error Handling**: Automatic error catching and formatting
- **Logging**: Standardized audit logging for all actions
- **Validation**: Common input validation patterns

#### BaseService.js
```javascript
class BaseService {
  constructor(tableName)
  
  // CRUD operations
  findById(id, selectFields)
  findAll(filters, pagination, selectFields)
  create(data)
  update(id, data)
  delete(id)
  
  // Query building
  buildWhereClause(filters)
  buildInsertClause(data)
  buildUpdateClause(data)
  
  // Validation
  validateRequired(data, requiredFields)
  validateTypes(data, schema)
}
```

**Learn: What this provides:**
- **Database Abstraction**: Common database operations
- **Query Building**: Dynamic SQL generation from objects
- **Validation**: Data validation before database operations
- **Logging**: Automatic operation logging

### 2. Specific Classes (Implementation Layer)

#### AuthController Example
```javascript
class AuthController extends BaseController {
  constructor() {
    super();
    this.authService = new AuthService();
    
    // Bind methods to maintain 'this' context
    this.login = this.login.bind(this);
  }
  
  async login(req, res) {
    try {
      // 1. Validate input
      this.validateRequired(req.body, ['username', 'password']);
      
      // 2. Call service
      const result = await this.authService.authenticate(username, password);
      
      // 3. Log action
      this.logUserAction('USER_LOGIN', req, 'user', result.user.id);
      
      // 4. Return response
      return this.sendSuccess(res, result, 'Login successful');
    } catch (error) {
      // 5. Handle errors (automatically caught by asyncHandler)
      throw error;
    }
  }
  
  getRoutes() {
    const router = express.Router();
    router.post('/login', this.asyncHandler(this.login));
    return router;
  }
}
```

**Learn: Controller Pattern:**
1. **Single Responsibility**: Each method handles one HTTP endpoint
2. **Validation First**: Always validate input before processing
3. **Service Delegation**: Controllers don't contain business logic
4. **Consistent Error Handling**: Use base class error handling
5. **Audit Logging**: Log all important actions

#### AuthService Example
```javascript
class AuthService extends BaseService {
  constructor() {
    super('users'); // Set table name
  }
  
  async authenticate(username, password) {
    // 1. Find user
    const user = await this.findUserByUsername(username);
    
    // 2. Validate user exists and is active
    if (!user || !user.is_active) {
      throw new Error('Invalid credentials');
    }
    
    // 3. Verify password
    const isValid = await this.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    
    // 4. Generate token
    const token = this.generateToken(user);
    
    // 5. Update last login
    await this.updateLastLogin(user.id);
    
    // 6. Return sanitized result
    return {
      user: this.sanitizeUser(user),
      token,
      expiresIn: this.jwtExpiresIn
    };
  }
}
```

**Learn: Service Pattern:**
1. **Business Logic**: Contains all application business rules
2. **Data Validation**: Validates business rules, not just format
3. **Error Handling**: Throws descriptive errors for controllers to catch
4. **Data Transformation**: Converts between database and API formats
5. **Security**: Handles sensitive operations like password hashing

---

## 🎨 Frontend Architecture

### 1. Base API Service

#### BaseApiService.ts
```typescript
export class BaseApiService {
  protected client: AxiosInstance;
  
  constructor(baseURL: string = '/api') {
    this.client = axios.create({ baseURL });
    this.setupInterceptors();
  }
  
  // HTTP methods
  protected async get<T>(url: string): Promise<T>
  protected async post<T>(url: string, data?: any): Promise<T>
  protected async put<T>(url: string, data?: any): Promise<T>
  protected async delete<T>(url: string): Promise<T>
  
  // Utilities
  protected buildQueryString(params: Record<string, any>): string
  protected async uploadFile<T>(url: string, file: File): Promise<T>
}
```

### 2. Specific Services

#### AuthService.ts
```typescript
export class AuthService extends BaseApiService {
  constructor() {
    super('/api/auth');
  }
  
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    console.log('🔐 Attempting login for user:', credentials.username);
    
    const response = await this.post<LoginResponse>('/login', credentials);
    
    if (response.token) {
      localStorage.setItem('af-tms-token', response.token);
      console.log('✅ Login successful, token stored');
    }
    
    return response;
  }
}
```

**Learn: Frontend Service Pattern:**
1. **API Abstraction**: Wraps HTTP calls with business context
2. **Error Handling**: Converts HTTP errors to user-friendly messages
3. **State Management**: Manages authentication tokens and user state
4. **Logging**: Provides debugging information in development
5. **Type Safety**: Uses TypeScript for compile-time error checking

---

## 🔧 How to Extend the System

### Adding a New Feature (Example: Customer Management)

#### 1. Create the Service
```javascript
// backend/services/CustomerService.js
const BaseService = require('../core/BaseService');

class CustomerService extends BaseService {
  constructor() {
    super('customers'); // Set table name
  }
  
  async getCustomersByRiskRating(riskRating) {
    // Custom business logic
    const query = `
      SELECT * FROM customers 
      WHERE risk_rating = $1 AND is_active = true
      ORDER BY created_at DESC
    `;
    
    const result = await this.executeQuery(query, [riskRating]);
    return result.rows;
  }
  
  async updateRiskRating(customerId, newRating, reason) {
    // Validate business rules
    const validRatings = ['low', 'medium', 'high'];
    if (!validRatings.includes(newRating)) {
      throw new Error('Invalid risk rating');
    }
    
    // Update with audit trail
    const updated = await this.update(customerId, {
      risk_rating: newRating,
      risk_rating_reason: reason,
      risk_rating_updated_at: new Date()
    });
    
    this.logger.info('Customer risk rating updated', {
      customerId,
      oldRating: 'previous', // Get from database
      newRating,
      reason
    });
    
    return updated;
  }
}

module.exports = CustomerService;
```

#### 2. Create the Controller
```javascript
// backend/controllers/CustomerController.js
const BaseController = require('../core/BaseController');
const CustomerService = require('../services/CustomerService');

class CustomerController extends BaseController {
  constructor() {
    super();
    this.customerService = new CustomerService();
    
    this.getCustomers = this.getCustomers.bind(this);
    this.updateRiskRating = this.updateRiskRating.bind(this);
  }
  
  async getCustomers(req, res) {
    try {
      const pagination = this.parsePagination(req.query);
      const filters = {
        riskRating: req.query.riskRating,
        search: req.query.search
      };
      
      const result = await this.customerService.findAll(filters, pagination);
      
      return this.sendPaginated(res, result.data, {
        currentPage: pagination.page,
        totalPages: Math.ceil(result.total / pagination.limit),
        totalRecords: result.total,
        limit: pagination.limit,
        hasNext: pagination.page * pagination.limit < result.total,
        hasPrev: pagination.page > 1
      });
    } catch (error) {
      throw error; // Caught by asyncHandler
    }
  }
  
  async updateRiskRating(req, res) {
    try {
      const customerId = parseInt(req.params.id);
      this.validateRequired(req.body, ['riskRating', 'reason']);
      
      const { riskRating, reason } = req.body;
      
      const updated = await this.customerService.updateRiskRating(
        customerId, 
        riskRating, 
        reason
      );
      
      this.logUserAction('CUSTOMER_RISK_UPDATED', req, 'customer', customerId, {
        newRiskRating: riskRating,
        reason
      });
      
      return this.sendSuccess(res, { customer: updated }, 'Risk rating updated');
    } catch (error) {
      throw error;
    }
  }
  
  getRoutes() {
    const router = require('express').Router();
    
    router.get('/', 
      authorize(['analyst', 'supervisor', 'admin']),
      this.asyncHandler(this.getCustomers)
    );
    
    router.put('/:id/risk-rating',
      authorize(['supervisor', 'admin']),
      this.asyncHandler(this.updateRiskRating)
    );
    
    return router;
  }
}

module.exports = CustomerController;
```

#### 3. Register the Routes
```javascript
// server.js (add this line)
const customerRoutes = require('./backend/controllers/CustomerController');
app.use('/api/customers', new customerRoutes().getRoutes());
```

#### 4. Create Frontend Service
```typescript
// frontend/src/services/CustomerService.ts
import { BaseApiService } from './BaseApiService';
import { Customer, CustomerFilters } from '../types';

export class CustomerService extends BaseApiService {
  constructor() {
    super('/api/customers');
  }
  
  async getCustomers(filters: CustomerFilters = {}) {
    const queryString = this.buildQueryString(filters);
    return await this.get<PaginatedResponse<Customer>>(`/${queryString}`);
  }
  
  async updateRiskRating(customerId: number, riskRating: string, reason: string) {
    return await this.put(`/${customerId}/risk-rating`, {
      riskRating,
      reason
    });
  }
}

export const customerService = new CustomerService();
```

---

## 🎯 Best Practices

### 1. Error Handling
```javascript
// ✅ Good: Let base class handle errors
async createAlert(req, res) {
  try {
    this.validateRequired(req.body, ['transactionId', 'severity']);
    const alert = await this.alertService.create(req.body);
    return this.sendSuccess(res, { alert }, 'Alert created');
  } catch (error) {
    throw error; // Base class will format and log
  }
}

// ❌ Bad: Manual error handling
async createAlert(req, res) {
  try {
    // ... logic
  } catch (error) {
    res.status(500).json({ error: error.message }); // Inconsistent format
  }
}
```

### 2. Validation
```javascript
// ✅ Good: Use base class validation
this.validateRequired(req.body, ['username', 'password']);

// ✅ Good: Business rule validation in service
if (amount > this.MAX_TRANSACTION_AMOUNT) {
  throw new Error('Transaction amount exceeds limit');
}

// ❌ Bad: No validation
const { username, password } = req.body; // Could be undefined
```

### 3. Logging
```javascript
// ✅ Good: Use structured logging
this.logger.info('Transaction processed', {
  transactionId: transaction.id,
  amount: transaction.amount,
  userId: req.user.id
});

// ✅ Good: Use audit logging
this.logUserAction('TRANSACTION_APPROVED', req, 'transaction', transactionId);

// ❌ Bad: Console logging
console.log('Transaction processed'); // No context
```

### 4. Database Operations
```javascript
// ✅ Good: Use service methods
const transactions = await this.transactionService.findAll(filters, pagination);

// ✅ Good: Use query builder
const { whereClause, params } = this.buildWhereClause(filters);

// ❌ Bad: Raw SQL in controller
const result = await database.query('SELECT * FROM transactions WHERE ...');
```

---

## 🧪 Testing Patterns

### Testing Controllers
```javascript
const AuthController = require('../controllers/AuthController');

describe('AuthController', () => {
  let controller;
  let mockService;
  
  beforeEach(() => {
    mockService = {
      authenticate: jest.fn()
    };
    controller = new AuthController();
    controller.authService = mockService;
  });
  
  test('login should return success response', async () => {
    const mockReq = {
      body: { username: 'test', password: 'test123' },
      user: { id: 1 },
      ip: '127.0.0.1'
    };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    mockService.authenticate.mockResolvedValue({
      user: { id: 1, username: 'test' },
      token: 'mock-token'
    });
    
    await controller.login(mockReq, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          token: 'mock-token'
        })
      })
    );
  });
});
```

---

## 🚀 Advanced Patterns

### 1. Middleware Composition
```javascript
// Compose multiple middleware for complex authorization
router.post('/sensitive-action',
  authMiddleware,                    // Require authentication
  authorize(['admin']),              // Require admin role
  rateLimiter.create({ max: 5 }),   // Strict rate limiting
  this.asyncHandler(this.sensitiveAction)
);
```

### 2. Service Composition
```javascript
class ComplexService extends BaseService {
  constructor() {
    super('main_table');
    this.alertService = new AlertService();
    this.auditService = new AuditService();
  }
  
  async processComplexOperation(data) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Main operation
      const result = await this.create(data);
      
      // Create related alert
      await this.alertService.createSystemAlert({
        entityId: result.id,
        message: 'Complex operation completed'
      });
      
      // Log audit trail
      await this.auditService.logOperation('COMPLEX_OP', result.id);
      
      await client.query('COMMIT');
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### 3. Event-Driven Architecture
```javascript
class EventEmittingService extends BaseService {
  constructor() {
    super('events');
    this.eventBus = require('../utils/eventBus');
  }
  
  async createTransaction(data) {
    const transaction = await this.create(data);
    
    // Emit event for other services to handle
    this.eventBus.emit('transaction.created', {
      transactionId: transaction.id,
      amount: transaction.amount,
      customerId: transaction.customer_id
    });
    
    return transaction;
  }
}

// Other services can listen for events
class FraudDetectionService {
  constructor() {
    this.eventBus = require('../utils/eventBus');
    this.eventBus.on('transaction.created', this.analyzeTransaction.bind(this));
  }
  
  async analyzeTransaction(transactionData) {
    // Run fraud detection algorithms
    if (this.isSuspicious(transactionData)) {
      await this.createAlert(transactionData);
    }
  }
}
```

---

## 📖 Summary

This class-based architecture provides:

1. **Consistency**: All components follow the same patterns
2. **Reusability**: Common functionality is inherited from base classes
3. **Maintainability**: Changes to common behavior are made in one place
4. **Testability**: Each class has a single responsibility and clear dependencies
5. **Extensibility**: New features follow established patterns
6. **Documentation**: Code is self-documenting through clear class structure

**Next Steps:**
1. Study the base classes to understand common patterns
2. Look at specific implementations to see how they extend base functionality
3. Practice by adding new features following the established patterns
4. Write tests for your new classes using the testing patterns shown

Remember: **Good architecture makes simple things easy and complex things possible!**
