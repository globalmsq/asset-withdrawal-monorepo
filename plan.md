# Blockchain Withdrawal System - Development Plan

## Current Implementation Status (2025-07-08)

### ✅ Completed Features
- **Withdrawal API**
  - POST /withdrawal/request - Submit withdrawal request
  - GET /withdrawal/status/:id - Check withdrawal status
  - GET /withdrawal/queue/status - Check queue status (debug)
- **Queue System**
  - In-memory Queue implementation (InMemoryQueue class)
  - Retry mechanism (max 3 attempts)
  - Queue Manager for multiple queues
- **Validation**
  - Address validation (Bitcoin, Ethereum, BSC, Polygon, etc.)
  - Amount validation (positive, 8 decimals, max 1M)
  - Network validation
- **Database**
  - Prisma ORM + MySQL
  - Transaction Service
  - User Service
  - Mock data support
- **Authentication**
  - JWT-based user authentication
  - Login/Register endpoints
  - Role-based access control (USER, ADMIN)
- **Documentation**
  - Swagger API documentation (/api-docs)
- **Infrastructure**
  - Express.js + TypeScript
  - Docker Compose setup
  - Jest test environment

### ❌ Not Implemented
- Blockchain integration (actual transaction signing/broadcasting)
- Queue Worker/Processor
- Admin API and Frontend
- Transaction Tracker
- Monitoring/Alerting system
- AWS SQS integration
- API key authentication (for system-to-system communication)
- Balance check and withdrawal limits
- Webhook notifications
- Rate Limiting

## Development Plan

### Phase 1: Core Withdrawal Processing System

#### 1.1 Queue Worker Implementation (Week 1)
- [ ] Validation & Signing Worker implementation
  - [ ] Poll messages from TX Request Queue
  - [ ] Balance check logic (Redis integration)
  - [ ] Transaction validation logic
  - [ ] Move to Invalid DLQ on failure
- [ ] Transaction Sender Worker implementation
  - [ ] Poll messages from Signed TX Queue
  - [ ] Broadcast to blockchain network
  - [ ] Move to TX DLQ on failure
- [ ] DLQ Handler implementation
  - [ ] Error analysis and classification
  - [ ] Determine retry eligibility
  - [ ] Alert notification logic

#### 1.2 Blockchain Integration (Week 2)
- [ ] Web3/Ethers.js library integration
- [ ] Transaction signing module implementation
  - [ ] EIP-1559 transaction support
  - [ ] Legacy transaction support
- [ ] Multi-network support
  - [ ] Ethereum Mainnet/Goerli
  - [ ] BSC Mainnet/Testnet
  - [ ] Polygon Mainnet/Mumbai
- [ ] Gas estimation and optimization logic
- [ ] Nonce management system
- [ ] Secret Manager integration (private key management)

#### 1.3 Transaction Tracker (Week 3)
- [ ] Blockchain status monitoring service
  - [ ] Query status by transaction hash
  - [ ] Track confirmation count
  - [ ] Detect reorganizations
- [ ] Cron Job implementation
  - [ ] 5-minute interval status check
  - [ ] Alert for 30+ minute pending transactions
  - [ ] Automatic retry for failed transactions
- [ ] Database status synchronization
  - [ ] PENDING → CONFIRMED transition
  - [ ] FAILED status handling

### Phase 2: Admin System Development

#### 2.1 Admin API (Week 4)
- [ ] Transaction management API
  - [ ] GET /admin/transactions - List transactions
  - [ ] GET /admin/transactions/:id - Transaction details
  - [ ] POST /admin/transactions/:id/retry - Manual retry
  - [ ] POST /admin/transactions/:id/cancel - Cancel transaction
- [ ] Statistics and analytics API
  - [ ] GET /admin/stats/daily - Daily statistics
  - [ ] GET /admin/stats/network - Network statistics
  - [ ] GET /admin/stats/status - Status distribution
- [ ] System management API
  - [ ] GET /admin/queues - Queue status
  - [ ] POST /admin/queues/pause - Pause queue
  - [ ] GET /admin/health - System health check
- [ ] DLQ management API
  - [ ] GET /admin/dlq/messages - List DLQ messages
  - [ ] POST /admin/dlq/reprocess - Reprocess messages
  - [ ] DELETE /admin/dlq/messages/:id - Permanent deletion

#### 2.2 Admin Frontend (Weeks 5-6)
- [ ] Next.js project setup
- [ ] Authentication and authorization UI
- [ ] Dashboard implementation
  - [ ] Real-time transaction status
  - [ ] Network status
  - [ ] Queue monitoring
- [ ] Transaction management interface
  - [ ] Search and filtering
  - [ ] Detail view
  - [ ] Manual operations
- [ ] System settings interface
  - [ ] Network configuration
  - [ ] Gas fee settings
  - [ ] Alert settings

### Phase 3: Production Readiness

#### 3.1 Infrastructure Migration (Week 7)
- [ ] AWS SQS integration
  - [ ] Queue creation scripts
  - [ ] DLQ configuration
  - [ ] Message attribute definitions
- [ ] AWS Secrets Manager setup
  - [ ] Private key migration
  - [ ] IAM Role configuration
  - [ ] Key rotation policy
- [ ] Amazon EKS deployment
  - [ ] Kubernetes manifests
  - [ ] Helm Chart configuration
  - [ ] Auto-scaling setup

#### 3.2 Monitoring and Alerting (Week 8)
- [ ] Prometheus setup
  - [ ] Metrics collection configuration
  - [ ] Custom metrics definition
  - [ ] Recording Rules
- [ ] Grafana dashboards
  - [ ] System metrics dashboard
  - [ ] Business metrics dashboard
  - [ ] Alert rules configuration
- [ ] CloudWatch integration
  - [ ] Log collection
  - [ ] Metric filters
  - [ ] Alarm configuration
- [ ] Alert Manager configuration
  - [ ] Alert routing
  - [ ] PagerDuty integration
  - [ ] Slack notifications

#### 3.3 Security and Performance Optimization (Week 9)
- [ ] Rate Limiting implementation
  - [ ] IP-based limiting
  - [ ] User-based limiting
  - [ ] API key-based limiting
- [ ] Balance checking system
  - [ ] Redis cache implementation
  - [ ] Real-time synchronization
  - [ ] Double-check logic
- [ ] Withdrawal limit management
  - [ ] Daily limits
  - [ ] Per-transaction limits
  - [ ] Network-specific limits
- [ ] Security hardening
  - [ ] SQL Injection prevention
  - [ ] XSS prevention
  - [ ] CSRF tokens
  - [ ] Audit logging

### Phase 4: API Authentication System (Week 10+)

#### 4.1 API Key System Design
- [ ] ApiKey model design
  ```
  - id: UUID
  - key: Hashed API key
  - name: Description
  - userId: Creator
  - permissions: JSON (allowed operations)
  - rateLimit: Requests per minute
  - ipWhitelist: Allowed IP list
  - expiresAt: Expiration date (optional)
  - lastUsedAt: Last usage timestamp
  - createdAt/updatedAt
  ```

#### 4.2 API Key Management Features
- [ ] API key creation endpoint
- [ ] API key listing
- [ ] API key deactivation
- [ ] API key renewal
- [ ] Usage history query

#### 4.3 Authentication Middleware
- [ ] API key validation middleware
- [ ] Rate limiting enforcement
- [ ] IP whitelist verification
- [ ] Permission checking logic
- [ ] Usage tracking

## API Authentication Strategy

### Development Approach
1. **Current Development (Phase 1-3)**: No authentication for withdrawal APIs
   - Focus on core functionality implementation
   - Faster development and testing cycle
   - APIs accessible only from internal network/development environment

2. **Future Implementation (Phase 4)**: Add API key authentication
   - Implement API key system for system-to-system communication
   - Gradual migration with optional authentication period
   - Full authentication enforcement in production

### Authentication Architecture
- **User Authentication (JWT) - Already Implemented**
  - Purpose: Admin Dashboard access and system configuration
  - Endpoints: /auth/*, /admin/*
  - Lifetime: 24 hours (configurable)
  - Used by: System administrators

- **API Authentication (API Key) - To Be Implemented**
  - Purpose: External system access to withdrawal APIs
  - Endpoints: /withdrawal/*, /webhook/*
  - Lifetime: Long-lived (revocable)
  - Used by: External systems calling withdrawal APIs

### Implementation Timeline
- **Now**: Continue without authentication on withdrawal APIs
- **Phase 4**: Design and implement API key system
- **Before Production**: Make API keys mandatory for all external calls

## Risk Management

### Technical Risks
1. **Blockchain Network Instability**
   - Multiple RPC endpoint configuration
   - Fallback mechanism
   - Retry logic

2. **Transaction Failures**
   - Automatic gas adjustment
   - Optimized nonce management
   - Manual intervention tools

3. **Security Threats**
   - Private key encryption
   - Minimal access permissions
   - Regular security audits

### Operational Risks
1. **High Volume Withdrawals**
   - Queue-based load distribution
   - Auto-scaling
   - Rate limiting

2. **System Failures**
   - Multi-AZ deployment
   - Automatic recovery mechanisms
   - Detailed monitoring

## Milestones

- **M1 (3 weeks)**: Core withdrawal processing system complete
- **M2 (6 weeks)**: Admin system development complete
- **M3 (9 weeks)**: Production ready
- **M4 (10+ weeks)**: API authentication system

## Review and Approval

This plan is based on the architecture defined in introduce.md and reflects the current implementation status with phased progression. Each phase is independently testable and designed for gradual transition to production environment.