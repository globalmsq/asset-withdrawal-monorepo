# Blockchain Withdrawal System - Development Plan

## Development Conditions
1. **Queue System**: AWS SQS (LocalStack for local development)
2. **Blockchain Focus**: Polygon network only
3. **App Naming**: Purpose-specific naming required
4. **Database**: No migration files until explicitly requested
5. **Architecture**: Microservices with separate worker apps

## Current Implementation Status (2025-07-11)

### ✅ Completed Features
- **Withdrawal API** (api-server app)
  - POST /auth/register - User registration
  - POST /auth/login - User authentication with JWT
  - POST /withdrawal/request - Submit withdrawal request
  - GET /withdrawal/status/:id - Check withdrawal status
  - GET /withdrawal/history - Get user's withdrawal history
  - GET /withdrawal/queue/status - Check queue status (returns CloudWatch info for SQS)
  - GET /withdrawal/queue/items - Queue items info (AWS CLI guidance)
  - Swagger API documentation (/api-docs)
- **Queue System**
  - LocalStack SQS integration (LocalStackSQSQueue class)
  - AWS SQS stub for production
  - In-memory Queue for testing
  - Queue factory pattern (QueueFactory) with environment-based selection
  - Multiple queue support (tx-request, signed-tx, DLQs)
  - Async queue initialization with proper error handling
- **Transaction Processing** (tx-processor app)
  - Validation & Signing Worker
  - Transaction Sender Worker
  - Worker lifecycle management
  - Health check endpoints
  - Polygon blockchain integration (Amoy testnet)
  - EIP-1559 transaction support
  - Nonce management system
  - AWS Secrets Manager integration (LocalStack)
- **Transaction Monitoring** (tx-monitor app)
  - Transaction status tracking
  - Confirmation count monitoring
  - Periodic status updates (5-minute intervals)
  - Health check endpoints
- **Validation**
  - Address validation (Ethereum/Polygon addresses)
  - Amount validation (positive, 8 decimals, max 1M)
  - Network validation (polygon only)
  - Request validators with Joi
- **Database**
  - Prisma ORM + MySQL
  - Transaction Service with comprehensive CRUD operations
  - User Service with authentication support
  - Database connection management
- **Authentication & Security**
  - JWT-based user authentication
  - Role-based access control (USER, ADMIN)
  - Password hashing with bcrypt
  - Environment-based configuration
- **Infrastructure**
  - Nx monorepo management
  - Express.js + TypeScript
  - Docker Compose setup (MySQL + LocalStack)
  - Comprehensive Jest test environment
  - TypeScript strict mode
  - Environment-based configuration with dotenv
  - Docker Compose with shared environment variables (x-anchors)
  - Region configuration (ap-northeast-2)

### ❌ Not Implemented
- DLQ Handler for error recovery
- Transaction acceleration support
- AWS Secrets Manager production integration
- Automatic retry mechanism for failed transactions
- Admin API and Frontend
- Production AWS SQS integration
- API key authentication (for system-to-system communication)
- Real balance check with Redis cache
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
  - [x] AWSSQSQueue implementation (stub for future)
  - [x] Queue factory pattern for environment-based selection

#### 1.2 Worker Application Architecture ✅
- [x] Create `tx-processor` app
  - [x] Base Worker abstract class
  - [x] Worker lifecycle management
  - [x] Health check endpoints
- [x] Validation & Signing Worker
  - [x] Poll messages from tx-request queue (SQS)
  - [x] Balance validation (mock for now, Redis later)
  - [x] Transaction validation for Polygon
  - [x] Move to invalid-dlq on failure
- [x] Transaction Sender Worker
  - [x] Poll messages from signed-tx queue
  - [x] Broadcast to Polygon network
  - [x] Move to tx-dlq on failure
- [ ] DLQ Handler
  - [ ] Error classification system
  - [ ] Retry eligibility logic
  - [ ] Alert notification (stub)

#### 1.3 Polygon Blockchain Integration ✅
- [x] Ethers.js setup for Polygon
  - [x] Polygon RPC provider configuration
  - [x] Amoy testnet configuration
  - [x] Mainnet configuration (disabled by default)
- [x] Transaction signing module
  - [x] EIP-1559 support for Polygon
  - [x] Polygon-specific gas optimization
  - [x] Transaction builder for ERC-20 transfers
- [x] Polygon network management
  - [x] Gas price oracle integration
  - [x] Nonce management with Polygon considerations
  - [ ] Transaction acceleration support
- [x] Key management
  - [x] LocalStack Secrets Manager (development)
  - [ ] AWS Secrets Manager integration (production stub)

#### 1.4 Transaction Monitor Service ✅
- [x] Create `tx-monitor` app
  - [x] Polygon transaction status tracking
  - [x] Confirmation count monitoring
  - [x] Chain reorganization detection
- [x] Monitoring implementation
  - [x] Poll pending transactions every 5 minutes
  - [x] Alert for stuck transactions (30+ minutes)
  - [ ] Automatic retry mechanism
- [x] Status synchronization
  - [x] Update transaction status in database
  - [x] PENDING → CONFIRMED workflow
  - [x] FAILED transaction handling

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

- **M1 (3 weeks)**: Core withdrawal processing system complete ✅
- **M2 (6 weeks)**: Admin system development complete
- **M3 (9 weeks)**: Production ready
- **M4 (10+ weeks)**: API authentication system

## Review and Approval

This plan is based on the architecture defined in introduce.md and reflects the current implementation status with phased progression. Each phase is independently testable and designed for gradual transition to production environment.

## Implementation Review (2025-07-11)

### Summary of Recent Changes
- **Configuration Refactoring**: Simplified api-server configuration by removing complex validation and using a direct config object with dotenv
- **Queue Integration Enhancement**: Updated withdrawal routes to use QueueFactory pattern with async initialization
- **AWS Region Update**: Changed from ap-northeast-2 to ap-northeast-2 for all AWS services
- **Docker Compose Improvements**: Added x-anchors for shared environment variables and better volume management
- **LocalStack Enhancement**: Updated initialization script with region support

### Key Technical Improvements
1. **Simplified Configuration Management**
   - Removed complex AppConfig interface and validation functions
   - Direct config object with environment variable loading via dotenv
   - Added queue configuration support (type, region, endpoint, credentials)

2. **Queue System Updates**
   - Async queue initialization in withdrawal routes
   - Proper error handling for queue initialization failures
   - Updated queue status endpoints to reflect SQS limitations
   - Clear guidance for monitoring queues via AWS CloudWatch and CLI

3. **Infrastructure Enhancements**
   - Docker Compose uses YAML anchors for shared LocalStack credentials
   - Improved volume naming (mysql-data, localstack-data)
   - Better environment variable management in docker-compose
   - LocalStack script supports configurable AWS region

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

### Current State (2025-07-11)
- Phase 1 core withdrawal processing system is complete (M1 milestone achieved)
- All three microservices (api-server, tx-processor, tx-monitor) are fully implemented
- Queue system with LocalStack SQS integration is operational with improved configuration
- Polygon blockchain integration with Amoy testnet is functional
- Infrastructure is better prepared for production deployment

### Next Steps
- Phase 2: Admin API development for transaction management
- DLQ handler implementation for automatic error recovery
- Production AWS infrastructure preparation with ap-northeast-2 region
- Complete AWS SQS production implementation in QueueFactory

## Database Schema Mismatch Fix (2025-07-14) - RESOLVED

### Issue
The error indicates that the `blockchain` column doesn't exist in the `withdrawal_requests` table in the database, but it's defined in the Prisma schema.

### Root Cause
The Prisma schema (schema.prisma) includes a `blockchain` field on line 33:
```prisma
blockchain    String?      @db.VarChar(20) // polygon, bsc, etc.
```

However, the actual database table doesn't have this column, causing the error when Prisma tries to access it.

### Solution Required
The database needs to be migrated to add the missing `blockchain` column. According to CLAUDE.md guidelines, migration files should only be created when explicitly requested.

### Required Schema Change
Add the `blockchain` column to the `withdrawal_requests` table:
- Column name: `blockchain`
- Type: VARCHAR(20)
- Nullable: Yes
- Default: NULL

### Migration Command
When ready to apply the migration:
```bash
npm run db:migrate
```

### Note
The withdrawal route code doesn't currently use the blockchain field in the create operation, so once the column is added to match the schema, the error should be resolved.

### Resolution
After further analysis, the `blockchain` field was determined to be redundant with the `network` field. The blockchain column has been removed from:
1. Prisma schema (removed from WithdrawalRequest model)
2. init.sql (removed from withdrawal_requests table)
3. Withdrawal routes (removed from getSymbolFromTokenAddress function)
4. Token service (removed blockchain parameter from all methods, defaults to 'polygon')
5. Type definitions (removed from WithdrawalRequest interface)

All tests pass and the code now works without the blockchain column.