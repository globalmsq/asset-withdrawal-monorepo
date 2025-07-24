# Asset Withdrawal System

High-throughput Polygon blockchain withdrawal system with Multicall3 batch processing. Handles massive volumes of cryptocurrency withdrawals, processing tens of thousands of transactions efficiently. Features 10-100x faster speeds and up to 70% gas cost reduction.

## 📁 Project Structure

```
├── apps/                        # Applications
│   ├── api-server/              # HTTP API gateway (receives withdrawal requests)
│   ├── signing-service/         # High-throughput transaction signer (Multicall3 batch)
│   ├── tx-broadcaster/          # Blockchain broadcaster (sends signed transactions)
│   ├── tx-monitor/              # Transaction monitor (tracks blockchain status)
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
docker-compose -f docker/docker-compose.yaml up -d

docker-compose logs -f
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
ADMIN_UI_PORT=3005

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
```

## 📍 Service Endpoints

- **API Server**: http://localhost:3000
- **Swagger Docs**: http://localhost:8080/api-docs
- **Admin UI**: http://localhost:3005
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
        DLQ[Dead Letter Queue]
    end

    subgraph "Processing Services"
        Signer[Signing Service<br/>:3002]
        Broadcaster[TX Broadcaster<br/>:3004]
        Monitor[TX Monitor<br/>:3003]
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
    Broadcaster --> MySQL

    Monitor --> Polygon
    Monitor --> MySQL

    SQS1 -.->|on failure| DLQ
    SQS2 -.->|on failure| DLQ
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

### Key Features

- **High Throughput**: Process tens of thousands of transactions efficiently
- **Batch Processing**: Multicall3 integration for 10-100x speed improvement
- **Gas Optimization**: 20-70% gas cost reduction through batching
- **Multi-Instance**: Horizontal scaling with atomic message processing
- **Fault Tolerance**: DLQ handling and automatic retry mechanisms
- **Real-time Monitoring**: Admin UI and SQS dashboard
- **Multi-Chain Support**: Polygon, Ethereum, BSC, and localhost (Hardhat) chains
- **Local Development**: Hardhat node with 1-second mining for fast testing

## 🔧 API Reference

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login

### Withdrawal Operations
- `POST /withdrawal/request` - Submit withdrawal
- `GET /withdrawal/status/:id` - Check status
- `GET /withdrawal/history` - User history
- `GET /withdrawal/queue/status` - Queue metrics

Full API documentation available at http://localhost:3000/api-docs

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
- [API Documentation](http://localhost:8080/api-docs)

## 📄 License

MIT
