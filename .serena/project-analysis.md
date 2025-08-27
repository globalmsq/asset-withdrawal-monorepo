# Asset Withdrawal System - Project Analysis

## Project Overview
The Asset Withdrawal System is a Polygon-focused blockchain withdrawal system built as a TypeScript monorepo using Nx. It handles cryptocurrency withdrawal requests, processes transactions securely using AWS SQS (LocalStack for development), and tracks transaction status.

## Architecture

### Monorepo Structure
```
asset-withdrawal-monorepo/
├── apps/                    # Application services
│   ├── api-server/         # REST API for withdrawal requests
│   ├── signing-service/    # Transaction signing with AWS Secrets Manager
│   ├── tx-broadcaster/     # Transaction broadcasting to blockchain
│   ├── tx-monitor/         # Transaction monitoring and WebSocket service
│   └── test-console/       # CLI testing tool
├── packages/               # Shared packages
│   ├── database/          # Prisma database services
│   └── shared/            # Common utilities, types, and services
├── docker/                # Docker configurations
├── prisma/               # Database schema and migrations
└── scripts/              # Utility scripts
```

## Core Services

### 1. API Server (`apps/api-server`)
- **Purpose**: REST API gateway for withdrawal requests
- **Key Features**:
  - JWT authentication
  - User management
  - Withdrawal request submission
  - Request status tracking
- **Technologies**: Express, JWT, Swagger
- **Entry**: `src/main.ts`
- **Routes**: 
  - `/auth` - Authentication endpoints
  - `/withdrawal` - Withdrawal operations

### 2. Signing Service (`apps/signing-service`)
- **Purpose**: Signs transactions using AWS Secrets Manager
- **Key Features**:
  - Multi-chain support
  - Nonce management with caching
  - Gas price optimization
  - Queue-based processing
- **Technologies**: AWS SDK, ethers.js, Redis
- **Entry**: `src/main.ts`
- **Core Components**:
  - `TransactionSigner` - Main signing logic
  - `NonceCache` - Nonce management
  - `SecretsManager` - AWS integration

### 3. Transaction Broadcaster (`apps/tx-broadcaster`)
- **Purpose**: Broadcasts signed transactions to blockchain
- **Key Features**:
  - Nonce pool management (Redis)
  - Retry logic for failed transactions
  - Multi-chain support
  - Transaction status tracking
- **Technologies**: ethers.js, Redis, AWS SQS
- **Entry**: `src/main.ts`
- **Core Components**:
  - `Broadcaster` - Transaction submission
  - `NonceManager` - Advanced nonce handling
  - `RetryService` - Failure recovery

### 4. Transaction Monitor (`apps/tx-monitor`)
- **Purpose**: Monitors transaction status and provides real-time updates
- **Key Features**:
  - WebSocket server for real-time updates
  - Transaction confirmation tracking
  - Gas price monitoring and retry logic
  - Polling and WebSocket optimization
- **Technologies**: WebSocket, ethers.js
- **Entry**: `src/main.ts`
- **Core Components**:
  - `MonitorService` - Transaction tracking
  - `WebSocketService` - Real-time updates
  - `GasRetryService` - Gas optimization

### 5. Test Console (`apps/test-console`)
- **Purpose**: CLI tool for testing the system
- **Key Features**:
  - Interactive testing commands
  - Batch request submission
  - Status checking
  - Error simulation
- **Technologies**: CLI, API client
- **Entry**: `src/main.ts`

## Shared Packages

### Database Package (`packages/database`)
- **Purpose**: Prisma-based database services
- **Services**:
  - `UserService` - User management
  - `WithdrawalRequestService` - Request handling
  - `SignedTransactionService` - Transaction tracking
  - `SentTransactionService` - Broadcast tracking
- **Database**: MySQL via Prisma ORM

### Shared Package (`packages/shared`)
- **Purpose**: Common utilities and types
- **Components**:
  - **Config**: Chain and token configurations
  - **Providers**: Blockchain provider factory
  - **Queue**: SQS queue abstractions
  - **Redis**: Nonce pool service
  - **Types**: Shared TypeScript types
  - **Utils**: Retry logic, error handling
  - **Validators**: Input validation schemas

## Transaction Flow

1. **Request Submission** (API Server)
   - User submits withdrawal request
   - Request validated and stored in database
   - Message sent to signing queue

2. **Transaction Signing** (Signing Service)
   - Retrieves request from queue
   - Fetches private key from AWS Secrets
   - Signs transaction with proper nonce
   - Sends to broadcast queue

3. **Transaction Broadcasting** (TX Broadcaster)
   - Gets nonce from Redis pool
   - Broadcasts to blockchain
   - Updates database status
   - Sends to monitor queue

4. **Transaction Monitoring** (TX Monitor)
   - Polls blockchain for confirmations
   - Updates status via WebSocket
   - Handles gas price issues
   - Finalizes transaction status

## Key Technologies

### Blockchain
- **Ethers.js v6**: Ethereum/Polygon interaction
- **Polygon Network**: Primary blockchain
- **Hardhat**: Local development network

### Infrastructure
- **Docker**: Containerization
- **LocalStack**: AWS service emulation
- **Redis**: Caching and nonce pool
- **MySQL**: Primary database

### Messaging
- **AWS SQS**: Queue management
- **WebSocket**: Real-time updates

### Development
- **Nx**: Monorepo management
- **TypeScript**: Primary language
- **Jest**: Testing framework
- **Prisma**: Database ORM

## Security Features

1. **Authentication**: JWT-based with bcrypt password hashing
2. **Key Management**: AWS Secrets Manager for private keys
3. **Input Validation**: Zod schemas for all inputs
4. **Rate Limiting**: Express rate limiter
5. **Helmet**: Security headers
6. **CORS**: Configured access control

## Development Commands

```bash
# Start development
pnpm run dev:local     # Start Docker + dev servers

# Quality checks
pnpm run lint          # Linting
pnpm run typecheck     # TypeScript validation
pnpm run test          # Run tests

# Database
pnpm run db:migrate    # Run migrations
pnpm run db:studio     # Prisma Studio GUI

# Docker
pnpm run docker:up     # Start services
pnpm run docker:logs   # View logs
```

## Recent Updates

### Completed (BFS-83)
- WebSocket connection resilience improvements
- Test infrastructure enhancements
- Nonce pool optimizations with Redis ZPOPMIN
- Performance issue prevention on initial WebSocket connection

## Configuration Files

- `.env` files for each service (see `env.example`)
- `docker/docker-compose.yaml` - Docker services
- `nx.json` - Nx workspace configuration
- `prisma/schema.prisma` - Database schema

## Testing Strategy

- Unit tests for core services
- Integration tests for API endpoints
- Mock external dependencies (AWS, Redis)
- Test coverage for critical paths
- Multi-instance testing for concurrency