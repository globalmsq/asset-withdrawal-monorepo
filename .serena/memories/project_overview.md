# Asset Withdrawal System - Project Overview

## Purpose
High-throughput Polygon blockchain withdrawal system with Multicall3 batch processing. Handles massive volumes of cryptocurrency withdrawals, processing tens of thousands of transactions efficiently. Features 10-100x faster speeds and up to 70% gas cost reduction.

## Architecture
Microservices architecture with the following services:
- **API Server** (Port 3000): HTTP gateway for withdrawal requests, authentication, and status queries
- **Signing Service** (Port 3002): High-throughput transaction processor with Multicall3 batching
- **TX Broadcaster** (Port 3004): Broadcasts signed transactions to Polygon with retry logic
- **TX Monitor** (Port 3003): Tracks blockchain confirmations and handles failed transactions
- **Account Manager** (Port 3005): Automated balance management for sub-accounts (planned)
- **Admin UI** (Port 3006): React dashboard for system management (planned)

## Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL with Prisma ORM
- **Queue System**: AWS SQS (LocalStack for development)
- **Blockchain**: Ethers.js for Polygon network interaction
- **Authentication**: JWT tokens with bcrypt password hashing
- **Caching**: Redis for nonce management and caching
- **Monorepo**: Nx workspace with pnpm
- **Testing**: Jest with Supertest
- **Containerization**: Docker and Docker Compose
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

## Project Structure
```
├── apps/                    # Microservice applications
│   ├── api-server/         # Main API gateway
│   ├── signing-service/    # Transaction signing service
│   ├── tx-broadcaster/     # Transaction broadcasting
│   └── tx-monitor/         # Transaction monitoring
├── packages/               # Shared libraries
│   ├── database/          # Prisma ORM and database services
│   └── shared/            # Common utilities, types, validators
├── docker/                # Docker configuration files
├── prisma/                # Database schema and migrations
├── docs/                  # Project documentation
└── .taskmaster/           # Task management system
```

## Key Features
- High throughput processing with Multicall3 batching
- 20-70% gas cost reduction through batch optimization
- Multi-instance support with atomic message processing
- Fault tolerance with DLQ handling and retry mechanisms
- Real-time monitoring and admin dashboard
- Multi-chain support (Polygon, Ethereum, BSC, localhost)
- Automated balance management for sub-accounts
- Smart error handling with permanent vs retryable error distinction