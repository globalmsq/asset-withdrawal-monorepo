# Asset Withdrawal System

High-throughput Polygon blockchain withdrawal system with Multicall3 batch processing. Handles massive volumes of cryptocurrency withdrawals, processing tens of thousands of transactions efficiently. Features 10-100x faster speeds and up to 70% gas cost reduction.

## 📁 Project Structure

```
├── apps/                        # Applications
│   ├── api-server/              # HTTP API gateway (receives withdrawal requests)
│   ├── signing-service/         # High-throughput transaction signer (Multicall3 batch)
│   ├── tx-broadcaster/          # Blockchain broadcaster (sends signed transactions)
│   ├── tx-monitor/              # Transaction monitor (tracks blockchain status)
│   ├── account-manager/         # Automated balance management for sub-accounts
│   └── admin-ui/                # Admin web interface (React + Tailwind CSS)
├── packages/                    # Shared libraries
│   ├── database/                # Prisma ORM and database services
│   └── shared/                  # Common utilities, types, and validators
├── docker/                      # Docker configuration
│   ├── docker-compose.yaml      # Main services (MySQL, LocalStack)
│   └── scripts/                 # Initialization scripts
├── prisma/                      # Database schema and migrations
├── docs/                        # Documentation
│   ├── introduce.md             # Architecture overview
│   └── plan.md                  # Development plan
└── CLAUDE.md                    # Development guidelines
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- AWS CLI (for LocalStack)
- Hardhat (for local blockchain development)

### Quick Start

```bash
# Start all services including local blockchain
docker-compose -f docker/docker-compose.yaml up -d

# View logs
docker-compose -f docker/docker-compose.yaml logs -f

# Stop all services
docker-compose -f docker/docker-compose.yaml down
```

### Environment Configuration

```env
# Database
DATABASE_URL="mysql://root:root@localhost:3306/withdrawal_db"

# AWS Services (LocalStack for development)
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Blockchain Configuration
# Chain and network must be specified in API requests
# No default values - all requests must include explicit parameters

# Application Ports
API_SERVER_PORT=3000
SIGNING_SERVICE_PORT=3002
TX_BROADCASTER_PORT=3004
TX_MONITOR_PORT=3003
ACCOUNT_MANAGER_PORT=3005
ADMIN_UI_PORT=3006

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-byte-encryption-key

# Batch Processing
ENABLE_BATCH_PROCESSING=true                 # High-volume processing
MIN_BATCH_SIZE=5                            # Minimum transactions to batch
BATCH_THRESHOLD=3                           # Min per token for batching
MIN_GAS_SAVINGS_PERCENT=20                  # Cost efficiency threshold
SINGLE_TX_GAS_ESTIMATE=65000               # Gas per single transaction
BATCH_BASE_GAS=100000                      # Base gas for batch
BATCH_PER_TX_GAS=25000                     # Additional gas per tx in batch

# DLQ Configuration (LocalStack)
REQUEST_DLQ_URL=http://localhost:4566/000000000000/request-dlq
SIGNED_TX_DLQ_URL=http://localhost:4566/000000000000/signed-tx-dlq
BROADCAST_TX_DLQ_URL=http://localhost:4566/000000000000/broadcast-tx-dlq

# Account Manager Configuration
BALANCE_CHECK_INTERVAL=300000               # 5 minutes (milliseconds)
MIN_BALANCE_THRESHOLD=0.1                   # ETH minimum balance
TARGET_BALANCE=0.5                          # ETH target balance for refill
BATCH_TRANSFER_ENABLED=true                 # Enable batch transfers
MAX_BATCH_SIZE=10                           # Max accounts per batch transfer
```

## 📍 Service Endpoints

- **API Server**: http://localhost:3000
- **Swagger Docs**: http://localhost:8080/api-docs
- **Admin UI**: http://localhost:3006
- **SQS Admin UI**: http://localhost:3999
- **LocalStack**: http://localhost:4566

## 📋 Commands

```bash
# Development
npm run dev                     # Start all services
npm run dev:[service-name]      # Start specific service
npm run build                   # Build all services
npm run serve                   # Production mode

# Database
npm run db:migrate              # Run migrations
npm run db:seed                 # Seed data
npm run db:reset                # Reset database

# Code Quality
npm run lint                    # Check code style
npm run lint:fix                # Auto-fix issues
npm run typecheck               # TypeScript check
npm run test                    # Run tests
npm run test:coverage           # Coverage report

# Local Blockchain (Hardhat)
npx hardhat node                # Start local blockchain
npx hardhat compile             # Compile smart contracts
npx hardhat run scripts/deploy.js --network localhost  # Deploy contracts
```

## 🏗️ Architecture

### System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        Client[Client App]
        Admin[Admin Dashboard]
    end

    subgraph "API Layer"
        ALB[Load Balancer]
        API[API Server<br/>:3000]
    end

    subgraph "Queue System"
        SQS1[tx-request-queue]
        SQS2[signed-tx-queue]
        SQS3[tx-monitor-queue]
        SQS4[balance-check-queue]
        SQS5[balance-transfer-queue]
        DLQ1[request-dlq]
        DLQ2[signed-tx-dlq]
        DLQ3[broadcast-tx-dlq]
    end

    subgraph "Processing Services"
        Signer[Signing Service<br/>:3002]
        Broadcaster[TX Broadcaster<br/>:3004]
        Monitor[TX Monitor<br/>:3003]
        AcctMgr[Account Manager<br/>:3005]
    end

    subgraph "Data Layer"
        MySQL[(MySQL<br/>:3306)]
        Redis[(Redis<br/>:6379)]
    end

    subgraph "Blockchain"
        Polygon[Polygon Network]
    end

    Client --> ALB
    Admin --> ALB
    ALB --> API

    API --> SQS1
    API --> MySQL
    API --> Redis

    SQS1 --> Signer
    Signer --> SQS2
    Signer --> MySQL

    SQS2 --> Broadcaster
    Broadcaster --> Polygon
    Broadcaster --> SQS3
    Broadcaster --> MySQL

    SQS3 --> Monitor
    Monitor --> Polygon
    Monitor --> MySQL

    AcctMgr --> SQS4
    AcctMgr --> SQS5
    AcctMgr --> MySQL
    AcctMgr --> Polygon
    SQS5 --> Signer

    SQS1 -.->|5 retries| DLQ1
    SQS2 -.->|5 retries| DLQ2
    SQS3 -.->|5 retries| DLQ3
    SQS4 -.->|on failure| DLQ1
    SQS5 -.->|on failure| DLQ1
```

### Core Services

**API Server** - HTTP gateway handling withdrawal requests, authentication, and status queries

**Signing Service** - High-throughput transaction processor with:

- Multi-instance support with atomic message claiming
- Intelligent batch processing via Multicall3 (10-100x faster)
- Dynamic batch optimization based on gas savings
- Redis-based nonce management

**TX Broadcaster** - Broadcasts signed transactions to Polygon with retry logic

**TX Monitor** - Tracks blockchain confirmations and handles failed transactions

**Admin UI** - React dashboard for system management and monitoring

**Account Manager** - Automated balance management system that:

- Monitors sub-account balances periodically
- Automatically transfers funds from main account when below threshold
- Optimizes gas costs through batch transfers
- Provides REST API for manual balance management

### Key Features

- **High Throughput**: Process tens of thousands of transactions efficiently
- **Batch Processing**: Multicall3 integration for 10-100x speed improvement
- **Gas Optimization**: 20-70% gas cost reduction through batching
- **Multi-Instance**: Horizontal scaling with atomic message processing
- **Fault Tolerance**: DLQ handling and automatic retry mechanisms
- **Real-time Monitoring**: Admin UI and SQS dashboard
- **Multi-Chain Support**: Polygon, Ethereum, BSC, and localhost (Hardhat) chains
- **Local Development**: Hardhat node with 1-second mining for fast testing
- **Automated Balance Management**: Account Manager maintains optimal sub-account balances
- **DLQ Error Recovery**: Automatic error classification and recovery strategies
- **Smart Error Handling**: Distinguishes permanent failures from retryable errors

## 🔧 API Reference

### Authentication

- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info (requires authentication)

### Withdrawal Operations

- `POST /withdrawal/request` - Submit withdrawal request
- `GET /withdrawal/status/:id` - Check withdrawal status
- `GET /withdrawal/request-queue/status` - Request queue metrics
- `GET /withdrawal/tx-queue/status` - Transaction queue metrics

Full API documentation available at http://localhost:8080/api-docs

## 🏗️ Local Development with Hardhat

### Overview

The system includes a fully integrated Hardhat localhost blockchain for development and testing. This provides:

- Fast 1-second block times for rapid testing
- Pre-deployed mock tokens (mUSDC, mUSDT, mDAI)
- Automatic contract deployment on startup
- Full integration with all services

### Starting Local Development

```bash
# Everything starts automatically with docker-compose
docker-compose -f docker/docker-compose.yaml up -d

# The following happens automatically:
# 1. Hardhat node starts on port 8545
# 2. Mock tokens are deployed
# 3. Deployment info is saved to shared volume
# 4. All services connect to localhost blockchain
```

### Accessing Services

- **Hardhat RPC**: http://localhost:8545
- **API Server**: http://localhost:8080
- **SQS Admin UI**: http://localhost:3999
- **Redis Insight**: http://localhost:8001

### Making Localhost Withdrawals

```bash
# Example withdrawal request for localhost chain
curl -X POST http://localhost:8080/api/v1/withdrawal/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": "100",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "chain": "localhost",
    "network": "testnet"
  }'
```

### Pre-deployed Token Addresses

| Token | Address                                    | Decimals |
| ----- | ------------------------------------------ | -------- |
| mUSDC | 0x5FbDB2315678afecb367f032d93F642f64180aa3 | 6        |
| mUSDT | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 6        |
| mDAI  | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | 18       |

### Development Tips

1. **Fast Mining**: Blocks are mined every second for quick transaction confirmations
2. **Test Accounts**: Use the default Hardhat accounts for testing
3. **Contract Redeployment**: Contracts are automatically deployed on container restart
4. **Shared Volume**: Deployment info is shared between services via Docker volume

## 🛡️ Security

- JWT authentication with refresh tokens
- AES-256-GCM encryption for private keys
- AWS Secrets Manager for sensitive data
- Comprehensive audit logging
- Input validation and rate limiting

## 🧪 Testing

```bash
npm test                        # Run all tests
npm run test:[service-name]     # Test specific service
npm run test:coverage           # Coverage report
```

## 🛠️ Tech Stack

- **Framework**: Express.js with TypeScript
- **Database**: MySQL with Prisma ORM
- **Queue**: AWS SQS (LocalStack for dev)
- **Blockchain**: Ethers.js for Polygon
- **Testing**: Jest with Supertest
- **Build**: Nx monorepo tools
- **Container**: Docker

## 📚 Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Transaction Lifecycle](./docs/TRANSACTION_LIFECYCLE.md)
- [API Documentation](http://localhost:8080/api-docs)

## 📄 License

MIT
