# Blockchain Withdrawal System - Development Plan

## Development Conditions
1. **Queue System**: AWS SQS (LocalStack for local development)
2. **Blockchain Focus**: Polygon network only
3. **App Naming**: Purpose-specific naming required
4. **Database**: No migration files until explicitly requested
5. **Architecture**: Microservices with separate worker apps

## Current Implementation Status (2025-07-16)

### ✅ Completed Features
- **API Server** (api-server app)
  - POST /auth/register - User registration
  - POST /auth/login - User authentication with JWT
  - POST /withdrawal/request - Submit withdrawal request
  - GET /withdrawal/status/:id - Check withdrawal status
  - GET /withdrawal/history - Get user's withdrawal history
  - GET /withdrawal/queue/status - Check queue status
  - GET /withdrawal/queue/items - Queue items info
  - Swagger API documentation (/api-docs)
- **Signing Service** (signing-service app)
  - Queue message processing from tx-request-queue
  - Transaction validation (placeholder logic)
  - AWS Secrets Manager integration with encryption
  - Transaction signing for Polygon network
  - EIP-1559 transaction support
  - Sends signed transactions to signed-tx-queue
  - Audit logging and graceful shutdown
  - No HTTP API endpoints (pure worker)
- **Queue System**
  - LocalStack SQS integration (LocalStackSQSQueue class)
  - AWS SQS ready for production
  - In-memory Queue for testing
  - Queue factory pattern (QueueFactory) with environment-based selection
  - Multiple queue support (tx-request, signed-tx, DLQs)
  - Async queue initialization with proper error handling
- **Database**
  - Prisma ORM + MySQL
  - WithdrawalRequest model for tracking requests
  - Transaction model for blockchain transactions
  - Database connection management
- **Authentication & Security**
  - JWT-based user authentication
  - Role-based access control (USER, ADMIN)
  - Password hashing with bcrypt
  - Private key encryption in memory (AES-256-GCM)
- **Infrastructure**
  - Nx monorepo management
  - Express.js + TypeScript
  - Docker Compose setup (MySQL + LocalStack + SQS Admin UI)
  - Jest test environment
  - TypeScript strict mode
  - Environment-based configuration with dotenv
  - Docker Compose with shared environment variables
  - Region configuration (ap-northeast-2)

### ❌ Not Implemented
- **tx-broadcaster**: Service to read from signed-tx-queue and broadcast to blockchain
- **tx-monitor**: Transaction status monitoring (implemented but reserved for future use)
- DLQ Handler for error recovery
- Real balance validation in signing-service
- Admin API and Frontend
- API key authentication (for system-to-system communication)
- Redis cache for balance checks
- Withdrawal limits enforcement
- Webhook notifications
- Rate Limiting
- Monitoring/Alerting system (Prometheus/Grafana)

## Development Plan

### Phase 1: Core Withdrawal Processing System

#### 1.1 Queue Infrastructure Setup ✅
- [x] LocalStack Integration
  - [x] Create docker-compose.localstack.yaml
  - [x] LocalStack initialization scripts
  - [x] SQS queue creation (tx-request, signed-tx, dlq queues)
- [x] Queue Abstraction Layer
  - [x] IQueue interface definition
  - [x] LocalStackSQSQueue implementation
  - [x] AWSSQSQueue implementation ready for production
  - [x] Queue factory pattern for environment-based selection

#### 1.2 API Server ✅
- [x] Create `api-server` app
  - [x] Express.js setup with TypeScript
  - [x] Authentication endpoints (register/login)
  - [x] Withdrawal request endpoints
  - [x] Queue status monitoring endpoints
  - [x] Swagger documentation
- [x] Request Processing
  - [x] Receive withdrawal requests via HTTP
  - [x] Basic validation
  - [x] Store in database
  - [x] Send to tx-request-queue

#### 1.3 Signing Service ✅ (Needs Nonce Management Fix)
- [x] Create `signing-service` app
  - [x] Base Worker abstract class
  - [x] Worker lifecycle management
  - [x] No HTTP endpoints (pure worker)
- [x] Transaction Signing Worker
  - [x] Poll messages from tx-request-queue (SQS)
  - [x] Validation logic (placeholder implementation)
  - [x] AWS Secrets Manager integration
  - [x] Transaction signing for Polygon
  - [x] Send to signed-tx-queue
  - [x] Move invalid requests to invalid-dlq
- [x] Security Features
  - [x] Encrypted private key storage in memory
  - [x] Audit logging
  - [x] Graceful shutdown

#### 1.4 Nonce Management System 🚨 CRITICAL
- [ ] Redis Infrastructure
  - [ ] Add Redis to Docker Compose
  - [ ] Configure Redis persistence
  - [ ] Set up Redis connection pooling
- [ ] NonceCacheService Implementation
  - [ ] Create service in shared package
  - [ ] Atomic increment operations
  - [ ] TTL-based cleanup for old entries
  - [ ] Connection retry logic
- [ ] Signing Service Integration
  - [ ] Replace in-memory nonce tracking
  - [ ] Implement startup recovery logic
  - [ ] Add nonce conflict detection
  - [ ] Implement retry mechanism for nonce conflicts
- [ ] Monitoring
  - [ ] Add nonce usage metrics
  - [ ] Alert on nonce conflicts
  - [ ] Track Redis connection health

#### 1.5 Transaction Broadcaster ❌
- [ ] Create `tx-broadcaster` app
  - [ ] Poll messages from signed-tx-queue
  - [ ] Broadcast to Polygon network
  - [ ] Handle nonce management (use Redis)
  - [ ] Move failed transactions to tx-dlq
- [ ] Error Handling
  - [ ] Retry logic for transient errors
  - [ ] Gas price adjustments
  - [ ] Network failure handling

#### 1.6 DLQ Handler ❌
- [ ] Error classification system
- [ ] Retry eligibility logic
- [ ] Alert notification system

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
1. **api-server**: Handles withdrawal requests and status queries
2. **signing-service**: Processes queue messages and signs transactions
3. **tx-broadcaster** (planned): Broadcasts signed transactions to blockchain
4. **tx-monitor** (implemented but reserved for future): Monitors blockchain transaction status
5. **admin-api** (Phase 2): Administrative operations and monitoring

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
AWS_REGION=ap-northeast-2  # Updated from ap-northeast-2
AWS_ACCESS_KEY_ID=test  # LocalStack default
AWS_SECRET_ACCESS_KEY=test  # LocalStack default

# Polygon Configuration
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CHAIN_ID=80002  # Amoy testnet

# Application Ports
WITHDRAWAL_API_PORT=3000
TX_PROCESSOR_PORT=3001
TX_MONITOR_PORT=3002
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

- **M1 (3 weeks)**: Core withdrawal processing system (partially complete)
  - ✅ api-server: Complete
  - ✅ signing-service: Complete
  - ❌ tx-broadcaster: Not implemented
- **M2 (6 weeks)**: Admin system development
- **M3 (9 weeks)**: Production ready
- **M4 (10+ weeks)**: API authentication system

## Review and Approval

This plan is based on the architecture defined in introduce.md and reflects the current implementation status with phased progression. Each phase is independently testable and designed for gradual transition to production environment.

## Implementation Review (2025-07-17)

### Recent Updates
1. **Docker Database Connection Fix**:
   - Changed Prisma schema from hardcoded localhost to `env("DATABASE_URL")`
   - Removed debug console.log statements from DatabaseService
   - Services now properly connect to MySQL container using 'mysql' hostname

### Summary of Architecture Changes
- **Service Separation**: Extracted signing functionality from tx-processor into dedicated signing-service
- **Enhanced Security**: Implemented encrypted private key storage with AES-256-GCM in signing-service
- **Simplified Architecture**: Clear separation of concerns with api-server → signing-service → tx-broadcaster flow
- **Queue-based Processing**: Pure worker services without HTTP endpoints for better scalability

### Current System State
1. **Implemented Services**:
   - **api-server**: Receives HTTP requests and sends to tx-request-queue
   - **signing-service**: Processes queue messages, signs transactions, sends to signed-tx-queue
   - **tx-monitor**: Fully implemented but reserved for future phases

2. **Planned Services**:
   - **tx-broadcaster**: Will read from signed-tx-queue and broadcast to blockchain
   - **admin-api**: Administrative interface for system management

3. **Key Architectural Benefits**:
   - Single responsibility principle for each service
   - Enhanced security through service isolation
   - Horizontal scalability through queue-based architecture
   - Clear data flow: HTTP → Queue → Worker → Queue → Blockchain

### Critical Issue: Nonce Management
The current signing-service implementation has a critical flaw in nonce management:

1. **Current Problem**:
   - Nonce is fetched from Polygon network at startup
   - Incremented locally (+1) for each transaction
   - No persistence of used nonces
   - Service restart causes nonce reuse, leading to transaction failures

2. **Required Solution**:
   - Redis-based nonce management per address
   - Track last used nonce for each signing address
   - On service restart:
     - Check Redis for last used nonce
     - Compare with network nonce
     - Use the higher value to prevent conflicts
   - Atomic nonce increment operations

3. **Implementation Plan**:
   - Add Redis to Docker Compose setup
   - Create NonceCacheService in shared package
   - Update signing-service to use Redis for nonce tracking
   - Implement recovery logic for service restarts

## Database Schema Update (2025-07-13)

### Major Architecture Change: Added WithdrawalRequest Model
The system was missing a critical model to track withdrawal requests separately from blockchain transactions. This has been fixed by introducing the WithdrawalRequest model.

```prisma
model WithdrawalRequest {
  id            BigInt       @id @default(autoincrement()) @db.UnsignedBigInt
  requestId     String       @unique @db.VarChar(50) // tx-timestamp-random format
  amount        String       @db.VarChar(50)
  currency      String       @db.VarChar(10)
  toAddress     String       @db.VarChar(42)
  tokenAddress  String       @db.VarChar(42)
  network       String       @db.VarChar(20)
  status        String       @default("PENDING") @db.VarChar(20)
  errorMessage  String?      @db.Text
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@index([status])
  @@index([requestId])
  @@map("withdrawal_requests")
}
```

### Updated Withdrawal Request Flow
1. **Request Creation**:
   - User submits withdrawal request via POST /withdrawal/request
   - System generates unique requestId (format: `tx-{timestamp}-{random}`)
   - Creates WithdrawalRequest record in DB with PENDING status
   - Sends request to SQS tx-request-queue

2. **Processing**:
   - tx-processor picks message from SQS
   - Updates WithdrawalRequest status: PENDING → VALIDATING → SIGNING → BROADCASTING
   - Validates balance, network, and transaction parameters

3. **Transaction Creation**:
   - Only when txHash is generated (after blockchain broadcast)
   - Creates Transaction record with actual blockchain transaction data
   - Links via requestId field

4. **Completion**:
   - tx-monitor tracks blockchain confirmations
   - Updates WithdrawalRequest status to COMPLETED/FAILED
   - Records error messages if failed

### API Endpoint Updates Implemented
1. **POST /withdrawal/request**:
   - Saves WithdrawalRequest to DB before sending to SQS
   - Determines currency from tokenAddress (ETH for zero address)
   - Returns requestId for status tracking

2. **GET /withdrawal/status/:id**:
   - Queries WithdrawalRequest table using requestId
   - Joins with Transaction table for txHash if available
   - Returns comprehensive status information

3. **GET /withdrawal/queue/status**:
   - Shows accurate queue size using AWS GetQueueAttributes
   - Counts processing requests from DB (VALIDATING/SIGNING/BROADCASTING states)
   - Returns structured response with tx-request metrics

4. **GET /withdrawal/queue/items**:
   - Retrieves actual messages from SQS queue
   - Uses non-destructive read (visibilityTimeout: 0)
   - Shows queue URL and message details

### Configuration Updates
- Removed userId field from WithdrawalRequest model
- Fixed Swagger documentation for Docker environment
- Updated all test files to match new schema
- Added proper AWS_REGION configuration in docker-compose

### Current State (2025-07-16)
- Phase 1 core withdrawal processing system is partially complete
  - ✅ api-server: Fully implemented
  - ✅ signing-service: Fully implemented
  - ❌ tx-broadcaster: Not yet implemented (critical for completing the flow)
- Queue system with LocalStack SQS integration is operational
- AWS Secrets Manager integration with additional encryption layer
- Infrastructure ready for horizontal scaling

### Immediate Next Steps
1. **Implement tx-broadcaster service** (critical for completing withdrawal flow)
   - Read signed transactions from signed-tx-queue
   - Broadcast to Polygon network
   - Handle transaction errors and retries
   - Update transaction status in database

2. **Complete signing-service validation logic**
   - Implement real balance checks
   - Add withdrawal limits validation
   - Enhanced security checks

3. **Phase 2: Admin System Development**
   - Admin API for transaction management
   - DLQ handler for error recovery
   - Monitoring dashboard

## Technical Notes

### Signing Service Architecture
- **Purpose**: Dedicated service for secure transaction signing
- **Security**: Implements defense-in-depth with AWS Secrets Manager + AES-256-GCM encryption
- **Scalability**: Stateless worker design allows horizontal scaling
- **Audit Trail**: Comprehensive logging for all signing operations

### Queue Architecture Benefits
- **Decoupling**: Services communicate asynchronously through queues
- **Resilience**: Failed messages automatically moved to DLQs
- **Scalability**: Multiple workers can process messages in parallel
- **Observability**: Queue metrics provide system health insights

### Development Environment
- **LocalStack**: Emulates AWS services locally
- **SQS Admin UI**: Visual queue monitoring at http://localhost:3999
- **Docker Compose**: Single command to start all services
- **Hot Reload**: Development servers auto-restart on code changes

## Nonce Management Architecture

### Problem Statement
The current implementation has a critical flaw where nonces are managed in-memory, causing transaction failures after service restarts due to nonce reuse.

### Solution Design

#### 1. Redis-based Nonce Cache
```typescript
interface NonceCache {
  // Get current nonce for address (atomic operation)
  getAndIncrement(address: string): Promise<number>;
  
  // Set nonce for address (used during recovery)
  set(address: string, nonce: number): Promise<void>;
  
  // Get current nonce without incrementing
  get(address: string): Promise<number | null>;
  
  // Clear nonce for address (for testing/recovery)
  clear(address: string): Promise<void>;
}
```

#### 2. Nonce Recovery Logic
```typescript
class NonceManager {
  async initialize(address: string): Promise<void> {
    // 1. Get last used nonce from Redis
    const cachedNonce = await redis.get(`nonce:${address}`);
    
    // 2. Get current nonce from blockchain
    const networkNonce = await provider.getTransactionCount(address);
    
    // 3. Use the higher value
    const startNonce = Math.max(cachedNonce || 0, networkNonce);
    
    // 4. Set in Redis
    await redis.set(`nonce:${address}`, startNonce);
  }
  
  async getNextNonce(address: string): Promise<number> {
    // Atomic increment and return
    return await redis.incr(`nonce:${address}`);
  }
}
```

#### 3. Implementation Steps
1. **Add Redis to Docker Compose**:
   - Redis container with persistence
   - Exposed port for development: 6379
   - Volume for data persistence

2. **Create NonceCacheService**:
   - Location: `packages/shared/src/services/nonce-cache.service.ts`
   - Redis client initialization
   - Atomic operations using INCR
   - Connection retry logic
   - Error handling

3. **Update SigningService**:
   - Remove in-memory nonce tracking
   - Initialize nonce from Redis on startup
   - Use atomic increment for each transaction
   - Handle nonce conflicts gracefully

4. **Add Monitoring**:
   - Track nonce usage per address
   - Alert on nonce conflicts
   - Monitor Redis health

### Benefits
- **Reliability**: Survives service restarts
- **Scalability**: Supports multiple signing-service instances
- **Atomicity**: Prevents race conditions
- **Observability**: Easy to monitor and debug