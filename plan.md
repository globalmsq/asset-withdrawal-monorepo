# Blockchain Withdrawal System - Development Plan

## Development Conditions
1. **Queue System**: AWS SQS (LocalStack for local development)
2. **Blockchain Focus**: Polygon network only
3. **App Naming**: Purpose-specific naming required
4. **Database**: No migration files until explicitly requested
5. **Architecture**: Microservices with separate worker apps

## Current Implementation Status (2025-07-18)

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
  - Saves signed transactions to database for tracking
  - Redis-based nonce management (prevents conflicts)
  - Gas price caching with 30-second TTL
  - Retry count tracking for failed transactions
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
  - SignedTransaction model for signed transaction history
  - SignedTransactionService with full CRUD operations
  - Database connection management with singleton pattern
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

### ✅ Recently Completed (2025-07-18)
- **Redis-based Nonce Management**: Complete implementation with atomic operations
  - NonceCacheService with TTL and retry logic
  - Integration with signing-service
  - Proper error handling for infrastructure failures
- **Gas Price Caching System**: Dynamic gas price management
  - GasPriceCache with 30-second TTL
  - Automatic RPC fallback when cache expires
  - Pre-flight RPC health check before message processing
  - Prevents processing with incorrect gas prices during RPC failures

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

#### 1.3 Signing Service ✅ 
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
- [x] Infrastructure Management
  - [x] Redis-based nonce management
  - [x] Gas price caching system
  - [x] RPC health monitoring

#### 1.4 Nonce Management System ✅ COMPLETED
- [x] Redis Infrastructure
  - [x] Add Redis to Docker Compose
  - [x] Configure Redis persistence
  - [x] Set up Redis connection pooling
- [x] NonceCacheService Implementation
  - [x] Create service in signing-service package (not shared)
  - [x] Atomic increment operations
  - [x] TTL-based cleanup for old entries
  - [x] Connection retry logic
- [x] Signing Service Integration
  - [x] Replace in-memory nonce tracking with Redis
  - [x] Implement startup recovery logic
  - [x] Handle Redis connection errors (throw for SQS retry)
- [ ] Monitoring (Future enhancement)
  - [ ] Add nonce usage metrics
  - [ ] Alert on nonce conflicts
  - [ ] Track Redis connection health

#### 1.5 Transaction Broadcaster ❌
- [ ] Create `tx-broadcaster` app
  - [ ] Poll messages from signed-tx-queue
  - [ ] Broadcast to Polygon network
  - [ ] Move failed transactions to tx-dlq
- [ ] Error Handling
  - [ ] Detect and handle nonce conflicts
  - [ ] Implement nonce resync with blockchain
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
     - ✅ Now with Redis-based nonce management (2025-07-18)
     - ✅ Supports multiple instances without nonce conflicts
   - **tx-monitor**: Fully implemented but reserved for future phases

2. **Planned Services**:
   - **tx-broadcaster**: Will read from signed-tx-queue and broadcast to blockchain
   - **admin-api**: Administrative interface for system management

3. **Key Architectural Benefits**:
   - Single responsibility principle for each service
   - Enhanced security through service isolation
   - Horizontal scalability through queue-based architecture
   - Clear data flow: HTTP → Queue → Worker → Queue → Blockchain
   - Redis-based nonce management prevents transaction conflicts

### ✅ RESOLVED: Nonce Management Issue (2025-07-18)
The critical nonce management issue has been resolved:

1. **Previous Problem**:
   - Nonce was fetched from Polygon network at startup
   - Incremented locally (+1) for each transaction
   - No persistence of used nonces
   - Service restart caused nonce reuse, leading to transaction failures

2. **Implemented Solution**:
   - ✅ Redis-based nonce management per address
   - ✅ Track last used nonce for each signing address
   - ✅ On service restart:
     - Check Redis for last used nonce
     - Compare with network nonce
     - Use the higher value to prevent conflicts
   - ✅ Atomic nonce increment operations using Redis INCR

3. **Implementation Details**:
   - ✅ Added Redis to Docker Compose setup
   - ✅ Created NonceCacheService in signing-service package
   - ✅ Updated signing-service to use Redis for nonce tracking
   - ✅ Implemented recovery logic for service restarts
   - ✅ Added proper error handling (Redis errors trigger SQS retry)

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

### Current State (2025-07-18)
- Phase 1 core withdrawal processing system is partially complete
  - ✅ api-server: Fully implemented
  - ✅ signing-service: Fully implemented with database persistence
  - ✅ signed_transactions table: Implemented for transaction tracking
  - ❌ tx-broadcaster: Not yet implemented (critical for completing the flow)
- Queue system with LocalStack SQS integration is operational
- AWS Secrets Manager integration with additional encryption layer
- Infrastructure ready for horizontal scaling
- Redis-based nonce management preventing transaction conflicts
- Gas price caching for improved reliability

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
   - Location: `apps/signing-service/src/services/nonce-cache.service.ts`
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

## Implementation Review (2025-07-18)

### Redis Integration for Nonce Management
1. **Redis Container Added**:
   - Added redis/redis-stack:latest to Docker Compose
   - Configured persistence with auto-save intervals
   - Exposed Redis on port 6379 and RedisInsight UI on port 8001
   - Health checks configured

2. **NonceCacheService Implementation**:
   - Created in `apps/signing-service/src/services/` (not in shared package)
   - Implements atomic nonce operations with Redis INCR
   - TTL set to 24 hours for automatic cleanup
   - Connection retry logic with max 10 attempts
   - Full test coverage

3. **Architecture Decision**:
   - Moved NonceCacheService from shared to signing-service package
   - Rationale: Service-specific logic should remain within the service
   - Redis dependency only needed in signing-service
   - Maintains better separation of concerns

4. **Signing Service Updated**:
   - Replaced NonceManager with NonceCacheService
   - TransactionSigner now uses Redis for atomic nonce operations
   - Initialize nonce on startup by comparing Redis and network values
   - Redis connection errors trigger SQS retry (infrastructure errors)
   - Full test coverage including Redis error scenarios

### Completed Tasks
- ✅ Created NonceCacheService with atomic operations
- ✅ Integrated Redis into signing-service
- ✅ Removed memory-based NonceManager
- ✅ Added proper error handling for Redis failures
- ✅ Updated all tests for Redis-based implementation

### Next Steps
- Implement tx-broadcaster service to complete withdrawal flow
- Add real balance validation in signing-service
- Implement monitoring for nonce usage and Redis health

## Architecture Decision: Nonce Conflict Handling

### Responsibility Separation
1. **signing-service**: 
   - Uses Redis to get atomic nonce values
   - Does NOT handle nonce conflicts (can't detect at signing time)
   - Throws errors for Redis connection issues (allows SQS retry)

2. **tx-broadcaster** (future implementation):
   - Detects nonce conflicts when broadcasting to blockchain
   - Implements nonce resync logic with network
   - Handles retry logic for nonce-related errors

### Error Handling Strategy
- **Infrastructure errors (Redis, DB, RPC)**: Throw error for SQS retry
  - These are temporary and should be retried
- **Message errors (invalid data)**: Send to DLQ
  - These are permanent and won't succeed on retry

## Gas Price Management Architecture (2025-07-18)

### Problem Statement
RPC failures during gas price fetching could lead to transaction signing with incorrect gas prices, potentially causing transaction failures or overpayment.

### Solution Design

#### 1. Gas Price Caching
- **GasPriceCache**: In-memory cache with 30-second TTL
- Reduces RPC calls and improves performance
- Automatic cache invalidation after TTL expiry

#### 2. Dynamic Gas Price Fetching
- **Cache-first approach**: Use cached values when available
- **Automatic refresh**: Fetch from RPC when cache expires
- **Pre-flight checks**: Verify RPC availability before processing messages

#### 3. Implementation Details
```typescript
class GasPriceCache {
  constructor(ttlSeconds: number = 30)
  get(): GasPrice | null
  set(gasPrice: GasPrice): void
  isValid(): boolean
  clear(): void
}
```

#### 4. SigningWorker Enhancement
- Checks gas price availability before processing batch
- Skips batch processing if RPC is unavailable
- Prevents message consumption during RPC outages

#### 5. TransactionSigner Updates
- Provider stored as class member for efficiency
- Automatic gas price fetching when cache expires
- No hardcoded fallback values - always use live data

### Benefits
- **Reliability**: Prevents signing with incorrect gas prices
- **Performance**: Reduces RPC calls through caching
- **Resilience**: Gracefully handles RPC failures
- **Cost Optimization**: Ensures accurate gas pricing

## Signed Transactions Table Implementation (2025-07-18)

### Implementation Status: ✅ COMPLETED (Phase 1)

The signed transactions feature has been successfully implemented with the following completed items:
- ✅ Database schema created (without rawTransaction field for security)
- ✅ SignedTransactionService with full CRUD operations
- ✅ Integration with signing-service to save all signed transactions
- ✅ Comprehensive unit tests with 100% coverage
- ✅ Retry count tracking for failed transactions

### Problem Statement
현재 signing-service에서 트랜잭션을 서명한 후, 그 내용이 데이터베이스에 기록되지 않고 단순히 signed-tx-queue로 전달되고 withdrawal_requests 테이블의 status만 업데이트되고 있습니다. 서명된 트랜잭션의 상세 정보를 추적하고 재시도 시 이력을 관리하기 위해 `signed_transactions` 테이블을 추가해야 합니다.

### Requirements
1. **Table Name**: `signed_transactions`
2. **Primary Key**: withdrawal_requests와 같은 타입 (BigInt autoincrement)
3. **관계**: withdrawal_requests의 requestId를 참조 (1:N 관계 - 재시도 가능)
4. **저장 데이터**: 트랜잭션 서명 정보 (txHash, nonce, gas 정보, addresses, value, timestamp 등)
5. **정렬**: 같은 requestId를 가진 레코드들은 날짜로 정렬 가능해야 함

### Database Schema Design

```prisma
model SignedTransaction {
  id                    BigInt              @id @default(autoincrement()) @db.UnsignedBigInt
  requestId             String              @db.VarChar(36) // UUID from withdrawal_requests
  txHash                String              @db.VarChar(66)
  nonce                 Int                 @db.UnsignedInt
  gasLimit              String              @db.VarChar(50)
  maxFeePerGas          String?             @db.VarChar(50) // EIP-1559
  maxPriorityFeePerGas  String?             @db.VarChar(50) // EIP-1559
  gasPrice              String?             @db.VarChar(50) // Legacy tx
  from                  String              @db.VarChar(42)
  to                    String              @db.VarChar(42)
  value                 String              @db.VarChar(50)
  data                  String?             @db.Text // Transaction data (for contract calls)
  chainId               Int                 @db.UnsignedInt
  retryCount            Int                 @default(0) // 재시도 횟수
  status                String              @default("SIGNED") @db.VarChar(20) // SIGNED, BROADCASTED, CONFIRMED, FAILED
  errorMessage          String?             @db.Text
  signedAt              DateTime            @default(now())
  broadcastedAt         DateTime?
  confirmedAt           DateTime?
  
  @@index([requestId])
  @@index([txHash])
  @@index([signedAt])
  @@index([status])
  @@map("signed_transactions")
}
```

### Implementation Tasks

#### 1. Database Layer
- [x] Update Prisma schema with `SignedTransaction` model
- [x] Create database service for signed transactions (`packages/database/src/services/signed-transaction.service.ts`)
- [x] Add methods: create, findByRequestId, findByTxHash, updateStatus, getLatestByRequestId

#### 2. Signing Service Updates
- [x] Modify `TransactionSigner.signTransaction()` to return complete transaction details
- [x] Update `SigningWorker.processMessage()` to:
  - Save signed transaction to DB after signing
  - Handle DB save failures appropriately
  - Ensure atomic operation: sign → save to DB → send to queue
- [x] Add retry count tracking for repeated signing attempts

#### 3. Transaction Processor (tx-broadcaster) Updates
- [ ] Read signed transaction details from DB instead of queue message
- [ ] Update signed transaction status to BROADCASTED after sending
- [ ] Record broadcast timestamp
- [ ] Handle retry logic using signed_transactions history

#### 4. Transaction Monitor Updates
- [ ] Update signed transaction status to CONFIRMED when tx is confirmed
- [ ] Record confirmation timestamp
- [ ] Link to blockchain transaction details

### Data Flow

1. **Signing Phase**:
   - SigningWorker receives WithdrawalRequest from queue
   - TransactionSigner signs the transaction
   - Save to signed_transactions table with status='SIGNED'
   - Send minimal message to signed-tx-queue (just requestId)
   - Update withdrawal_requests status to 'SIGNED'

2. **Broadcasting Phase**:
   - tx-broadcaster receives message from signed-tx-queue
   - Retrieves latest signed transaction from DB by requestId
   - Broadcasts to blockchain
   - Updates signed_transactions: status='BROADCASTED', broadcastedAt=now()
   - Updates withdrawal_requests status to 'BROADCASTING'

3. **Monitoring Phase**:
   - tx-monitor checks transaction status on blockchain
   - Updates signed_transactions: status='CONFIRMED', confirmedAt=now()
   - Updates withdrawal_requests status to 'COMPLETED'

### Benefits
1. **Audit Trail**: 모든 서명된 트랜잭션의 완전한 이력 보관
2. **Retry Management**: 같은 requestId에 대한 여러 시도 추적 가능
3. **Debugging**: 실패한 트랜잭션의 상세 정보 확인 가능
4. **Analytics**: 가스 사용량, nonce 관리, 성공률 등 분석 가능
5. **Recovery**: 시스템 장애 시 마지막 상태에서 복구 가능

### Testing Requirements
- [x] Unit tests for SignedTransactionService
- [x] Integration tests for signing → DB save → queue flow
- [x] Error handling tests (DB failure scenarios)
- [ ] Performance tests for high-volume scenarios

## Schema Changes - Raw Transaction Field Removal (2025-07-18)

### Change Summary
Completely removed the `rawTransaction` field from the `signed_transactions` table to avoid storing sensitive signed transaction data.

### Changes Made:
1. **Schema Update**:
   - Removed `rawTransaction String @db.Text` field entirely from the Prisma schema
   
2. **Service Updates**:
   - Removed `rawTransaction` from `CreateSignedTransactionDto` interface
   - Updated `SignedTransactionService.create()` method (no longer needs to handle rawTransaction)
   
3. **Worker Updates**:
   - Updated `signing-worker.ts` to not pass `rawTransaction` when creating signed transaction records
   
4. **SQL Schema Update**:
   - Removed `rawTransaction` column from `init.sql`

### Rationale:
- The raw transaction data contains the complete signed transaction which could be sensitive
- This data is already sent to the queue for broadcasting and doesn't need to be persisted in the database
- Reduces storage requirements and improves security
- The transaction can be reconstructed if needed from the other fields

### Migration Required:
```sql
ALTER TABLE signed_transactions DROP COLUMN rawTransaction;
```