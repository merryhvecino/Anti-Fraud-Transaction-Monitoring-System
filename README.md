# AF-TMS: Anti-Fraud Transaction Monitoring System

A comprehensive fraud detection and compliance monitoring platform designed specifically for New Zealand financial institutions.

## 🏛️ Overview

AF-TMS provides real-time transaction monitoring, intelligent fraud detection, and compliance tools to help New Zealand banks and financial service providers meet AML/CFT obligations while reducing operational costs and improving fraud detection capabilities.

### Key Features

- **Real-time Transaction Monitoring** - Monitor financial transactions as they occur
- **Intelligent Alert System** - Rule-based and ML-powered fraud detection
- **Case Management** - Comprehensive investigation workflow management
- **Compliance Reporting** - Automated SAR generation aligned with NZ regulations
- **Advanced Analytics** - Transaction pattern analysis and visualization
- **Role-based Security** - Multi-tier access control for different user roles

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Material-UI for modern, accessible interface
- D3.js for advanced data visualizations
- Socket.IO for real-time updates

**Backend:**
- Node.js with Express framework
- PostgreSQL for robust data storage
- Redis for session management and caching
- JWT-based authentication with RBAC

**Infrastructure:**
- Docker containerization
- Kubernetes-ready deployment
- Comprehensive logging and monitoring

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Redis 7+
- Docker (optional, recommended)

### Docker Deployment (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AF-TMS
   ```

2. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Initialize the database**
   ```bash
   # The database will be automatically initialized on first run
   # To seed sample data:
   docker-compose exec af-tms-app node backend/scripts/seedData.js
   ```

4. **Access the application**
   - Main Application: http://localhost:5000
   - Database Admin (optional): http://localhost:8080

### Manual Setup

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your database and security settings
   ```

3. **Set up database**
   ```bash
   # Create PostgreSQL database and user
   createdb af_tms_db
   createuser af_tms_user
   
   # Start the application (database tables will be created automatically)
   npm run dev:all
   ```

4. **Seed initial data**
   ```bash
   node backend/scripts/seedData.js
   ```

## 👥 Default User Accounts

After seeding, you can log in with these default accounts:

| Username | Password | Role | Access Level |
|----------|----------|------|--------------|
| admin | admin123 | Administrator | Full system access |
| supervisor | supervisor123 | Supervisor | Reports, rules, case management |
| analyst | analyst123 | Analyst | Alerts, cases, transactions |
| viewer | viewer123 | Viewer | Read-only access |

**⚠️ Important:** Change these passwords immediately in production!

## 📁 Project Structure

```
AF-TMS/
├── backend/                 # Node.js backend
│   ├── config/             # Database and app configuration
│   ├── middleware/         # Express middleware
│   ├── routes/             # API endpoints
│   ├── scripts/            # Utility scripts
│   └── utils/              # Helper functions
├── frontend/               # React frontend
│   ├── public/             # Static assets
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── contexts/       # React contexts
│       ├── hooks/          # Custom React hooks
│       ├── pages/          # Page components
│       ├── services/       # API services
│       └── types/          # TypeScript definitions
├── logs/                   # Application logs
├── docker-compose.yml      # Docker orchestration
├── Dockerfile             # Container definition
└── README.md              # This file
```

## 🔒 Security Features

- **JWT Authentication** with configurable expiration
- **Role-based Access Control** (RBAC)
- **Rate Limiting** to prevent abuse
- **Input Validation** using Joi schemas
- **SQL Injection Protection** with parameterized queries
- **Audit Logging** for all sensitive operations
- **Data Encryption** for sensitive fields

## 🇳🇿 New Zealand Compliance

AF-TMS is designed to meet New Zealand's specific regulatory requirements:

- **AML/CFT Act Compliance** - Built-in suspicious activity reporting
- **Reserve Bank Requirements** - Automated compliance reporting
- **FIU Integration** - Direct submission capabilities (configurable)
- **Local Currency Support** - NZD-focused calculations and reporting
- **Regulatory Thresholds** - Pre-configured NZ-specific limits

## 📊 Features Deep Dive

### Transaction Monitoring
- Real-time transaction ingestion from core banking systems
- Synthetic data generator for testing and demonstrations
- Advanced filtering and search capabilities
- Transaction network analysis and visualization

### Alert Management
- Configurable rule-based detection engine
- Machine learning anomaly detection (extensible)
- Priority-based alert queuing
- Collaborative investigation tools

### Case Management
- End-to-end investigation workflow
- Evidence collection and documentation
- Team collaboration features
- Automated escalation rules

### Reporting & SAR
- Automated Suspicious Activity Report generation
- Compliance metrics and KPI dashboards
- Exportable reports (PDF, Excel, CSV)
- Regulatory submission tracking

## 🔧 Configuration

### Environment Variables

Key configuration options:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=af_tms_db
DB_USER=af_tms_user
DB_PASSWORD=your_secure_password

# Security
JWT_SECRET=your_super_secure_jwt_secret
BCRYPT_ROUNDS=12
ENCRYPTION_KEY=your_32_character_encryption_key

# New Zealand Compliance
NZ_COMPLIANCE_MODE=true
NZ_FIU_REPORTING_ENDPOINT=https://fiu.police.govt.nz/api

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Detection Rules

The system comes with pre-configured detection rules for common fraud patterns:

- Large cash transactions (>NZD 10,000)
- High-frequency wire transfers
- Round amount structuring
- International high-risk transfers
- Velocity-based anomalies

Rules can be customized through the web interface or API.

## 🧪 Development

### Development Setup

```bash
# Install dependencies
npm run install:all

# Start development servers
npm run dev:all

# Run tests
npm test

# Type checking
npm run type-check
```

### API Documentation

The system provides RESTful APIs for all functionality:

- `GET /api/health` - System health check
- `POST /api/auth/login` - User authentication
- `GET /api/transactions` - Transaction listing with filters
- `GET /api/alerts` - Alert management
- `GET /api/cases` - Case management
- `POST /api/reports/sar` - SAR creation

## 📈 Monitoring & Observability

- Comprehensive application logging with Winston
- Real-time system health monitoring
- Performance metrics collection
- Audit trail for all user actions
- Error tracking and alerting

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   # Set NODE_ENV to production
   export NODE_ENV=production
   
   # Configure production database
   # Set secure JWT secrets
   # Configure HTTPS/TLS
   ```

2. **Database Migration**
   ```bash
   # Backup existing data
   # Run database migrations
   # Verify data integrity
   ```

3. **Security Hardening**
   - Change all default passwords
   - Configure firewall rules
   - Set up SSL/TLS certificates
   - Enable audit logging
   - Configure backup strategies

### Kubernetes Deployment

The application is Kubernetes-ready. Example manifests:

```yaml
# See deployment/ directory for complete Kubernetes manifests
apiVersion: apps/v1
kind: Deployment
metadata:
  name: af-tms-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: af-tms
  template:
    metadata:
      labels:
        app: af-tms
    spec:
      containers:
      - name: af-tms
        image: af-tms:latest
        ports:
        - containerPort: 5000
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Documentation**: Check this README and inline code comments
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Email**: support@af-tms.nz (example - configure as needed)

## 🔮 Roadmap

### Phase 1 (Current)
- ✅ Core transaction monitoring
- ✅ Basic alert management
- ✅ User authentication and RBAC
- ✅ PostgreSQL integration

### Phase 2 (Next)
- 🔄 Advanced ML detection models
- 🔄 Enhanced data visualizations
- 🔄 Mobile-responsive interface
- 🔄 API rate limiting and throttling

### Phase 3 (Future)
- 📋 Cross-institutional data sharing
- 📋 Advanced behavioral analytics
- 📋 Automated response actions
- 📋 Integration with external threat feeds

---

**AF-TMS** - Protecting New Zealand's financial system through intelligent fraud detection and compliance automation.

Built with ❤️ for New Zealand financial institutions.
