# Blockchain Withdrawal System - Development Plan

## Development Conditions
1. **Queue System**: AWS SQS (LocalStack for local development)
2. **Blockchain Focus**: Polygon network only
3. **App Naming**: Purpose-specific naming required
4. **Database**: No migration files until explicitly requested
5. **Architecture**: Microservices with separate worker apps

## Current Implementation Status (2025-07-09)

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

#### 1.1 Queue Infrastructure Setup
- [ ] LocalStack Integration
  - [ ] Create docker-compose.localstack.yaml
  - [ ] LocalStack initialization scripts
  - [ ] SQS queue creation (tx-request, signed-tx, dlq queues)
- [ ] Queue Abstraction Layer
  - [ ] IQueue interface definition
  - [ ] LocalStackSQSQueue implementation
  - [ ] AWSSQSQueue implementation (stub for future)
  - [ ] Queue factory pattern for environment-based selection

#### 1.2 Worker Application Architecture
- [ ] Create `tx-processor` app
  - [ ] Base Worker abstract class
  - [ ] Worker lifecycle management
  - [ ] Health check endpoints
- [ ] Validation & Signing Worker
  - [ ] Poll messages from tx-request queue (SQS)
  - [ ] Balance validation (mock for now, Redis later)
  - [ ] Transaction validation for Polygon
  - [ ] Move to invalid-dlq on failure
- [ ] Transaction Sender Worker
  - [ ] Poll messages from signed-tx queue
  - [ ] Broadcast to Polygon network
  - [ ] Move to tx-dlq on failure
- [ ] DLQ Handler
  - [ ] Error classification system
  - [ ] Retry eligibility logic
  - [ ] Alert notification (stub)

#### 1.3 Polygon Blockchain Integration
- [x] Ethers.js setup for Polygon
  - [x] Polygon RPC provider configuration
  - [x] Amoy testnet configuration
  - [x] Mainnet configuration (disabled by default)
- [ ] Transaction signing module
  - [ ] EIP-1559 support for Polygon
  - [ ] Polygon-specific gas optimization
  - [ ] Transaction builder for ERC-20 transfers
- [ ] Polygon network management
  - [ ] Gas price oracle integration
  - [ ] Nonce management with Polygon considerations
  - [ ] Transaction acceleration support
- [ ] Key management
  - [ ] LocalStack Secrets Manager (development)
  - [ ] AWS Secrets Manager integration (production stub)

#### 1.4 Transaction Monitor Service
- [ ] Create `tx-monitor` app
  - [ ] Polygon transaction status tracking
  - [ ] Confirmation count monitoring
  - [ ] Chain reorganization detection
- [ ] Monitoring implementation
  - [ ] Poll pending transactions every 5 minutes
  - [ ] Alert for stuck transactions (30+ minutes)
  - [ ] Automatic retry mechanism
- [ ] Status synchronization
  - [ ] Update transaction status in database
  - [ ] PENDING → CONFIRMED workflow
  - [ ] FAILED transaction handling

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

## Architecture Overview

### Microservices Structure
1. **withdrawal-api**: Handles withdrawal requests and status queries
2. **tx-processor**: Processes and signs transactions
3. **tx-monitor**: Monitors blockchain transaction status
4. **admin-api** (Phase 2): Administrative operations and monitoring

### Queue Architecture
- **Development**: LocalStack SQS
- **Production**: AWS SQS
- **Queues**:
  - `tx-request-queue`: New withdrawal requests
  - `signed-tx-queue`: Signed transactions ready for broadcast
  - `invalid-dlq`: Invalid/failed validation requests
  - `tx-dlq`: Failed transaction broadcasts

### Blockchain Focus
- **Primary Network**: Polygon (MATIC)
- **Testnet**: Amoy
- **Supported Tokens**: ERC-20 on Polygon
- **No multi-chain support** in Phase 1

## Development Guidelines

### LocalStack Setup
```bash
# Start LocalStack with docker-compose
docker-compose -f docker/docker-compose.yaml up -d
docker-compose -f docker/docker-compose.localstack.yaml up -d

# Initialize SQS queues
./docker/scripts/init-localstack.sh
```

### Environment Configuration
```env
# Queue Configuration
QUEUE_TYPE=localstack  # or 'aws' for production
AWS_ENDPOINT=http://localhost:4566  # LocalStack endpoint
AWS_REGION=us-east-1

# Polygon Configuration
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CHAIN_ID=80002  # Amoy testnet
```

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