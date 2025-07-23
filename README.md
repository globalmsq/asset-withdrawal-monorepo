# Asset Withdrawal System

A high-throughput Polygon blockchain withdrawal system built with TypeScript, Express, and Prisma. The system is designed to handle massive volumes of cryptocurrency withdrawal requests, processing tens of thousands of transactions efficiently through intelligent batch processing with Multicall3. It uses AWS SQS for reliable queue management (LocalStack for development), provides real-time transaction tracking, and achieves 10-100x faster processing speeds while also reducing gas costs by up to 70%.

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

### 1. Prerequisites

- Node.js 18+
- Docker and Docker Compose
- AWS CLI (for LocalStack)

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Infrastructure Services

```bash
# Start MySQL and LocalStack
docker-compose -f docker/docker-compose.yaml up -d

# Initialize LocalStack queues and secrets
./docker/scripts/init-localstack.sh
```

### 4. Database Setup

```bash
# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 5. Environment Configuration

Create `.env` file in the root directory:

```bash
cp .env.example .env
```

**Key Environment Variables:**

```env
# Database
DATABASE_URL="mysql://root:root@localhost:3306/withdrawal_db"

# Queue Configuration
QUEUE_TYPE=localstack          # 'localstack' or 'aws'
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Polygon Network
POLYGON_NETWORK=amoy           # 'amoy' or 'mainnet'
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CHAIN_ID=80002

# Application Ports
API_SERVER_PORT=3000
SIGNING_SERVICE_PORT=3002
TX_BROADCASTER_PORT=3004
TX_MONITOR_PORT=3003
ADMIN_UI_PORT=3005

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-byte-encryption-key

# Batch Processing (High-Throughput Configuration)
ENABLE_BATCH_PROCESSING=true     # Enable for high-volume processing
MIN_BATCH_SIZE=5                 # Start batching at 5 transactions
BATCH_THRESHOLD=3                # Min transactions per token for batching
MIN_GAS_SAVINGS_PERCENT=20       # Ensure cost efficiency
SINGLE_TX_GAS_ESTIMATE=65000     # Gas per single transaction
BATCH_BASE_GAS=100000            # Base gas for batch transaction
BATCH_PER_TX_GAS=25000           # Additional gas per tx in batch
```

### 6. Run Services

```bash
# Run all services in development mode
npm run dev

# Run specific service
npm run dev:api-server
npm run dev:signing-service
npm run dev:tx-broadcaster
npm run dev:tx-monitor
npm run dev:admin-ui

# Build all services
npm run build

# Run in production mode
npm run serve
```

### 7. Access Services

- **API Server**: http://localhost:3000
- **Swagger Documentation**: http://localhost:3000/api-docs
- **Admin UI**: http://localhost:3005 (React admin interface)
- **SQS Admin UI**: http://localhost:3999 (visual queue monitoring)
- **LocalStack**: http://localhost:4566

## 📋 Available Commands

```bash
# Build
yarn build                # Build all projects
yarn nx build my-package       # Build specific package

# Test
yarn test                 # Run all tests
yarn nx test my-package        # Test specific package
yarn coverage             # Run tests with coverage

# Linting
yarn lint                 # Lint all projects
yarn lint:fix            # Auto-fix linting issues

# Formatting
yarn format              # Format code with Prettier

# Dependency check
yarn depcheck            # Check for unused dependencies

# Clean
yarn clean               # Clean build artifacts and cache
```

## 🏗️ Architecture

### System Overview

The system follows a queue-based microservices architecture:

```
Client → api-server → tx-request-queue → signing-service → signed-tx-queue → tx-broadcaster → Blockchain
                                                   ↓                                          ↓
                                            (Multicall3 batch)                         tx-monitor
```

### Core Services

1. **api-server**:
   - Handles HTTP requests for withdrawals
   - Validates requests and stores in database
   - Sends messages to tx-request-queue
   - Provides status query endpoints

2. **signing-service**:
   - Processes messages from tx-request-queue with multi-instance support
   - Atomic message claiming prevents duplicate processing
   - Validates transaction parameters and token balances
   - Retrieves private keys from AWS Secrets Manager
   - Signs transactions for Polygon network (single or batch)
   - Intelligent batch processing with Multicall3 for ERC20 transfers
   - Manages nonce through Redis for collision prevention
   - Transaction-based concurrency control for batch creation
   - Sends signed transactions to signed-tx-queue

3. **tx-broadcaster**:
   - Reads from signed-tx-queue
   - Broadcasts transactions to Polygon network
   - Handles nonce collision detection
   - Implements retry logic for temporary failures
   - Updates transaction status in database

4. **tx-monitor**:
   - Monitors transaction status on blockchain
   - Tracks confirmation counts (12 confirmations)
   - Detects failed transactions
   - Triggers retry for failed transactions
   - Updates final transaction status

5. **admin-ui**:
   - React-based web interface for system management
   - Real-time dashboard with transaction statistics
   - Queue monitoring and DLQ management
   - User and permission management
   - Built with React 18, TypeScript, Ant Design, and Tailwind CSS

### Queue System

- **Development**: LocalStack SQS emulation
- **Production**: AWS SQS
- **Queues**:
  - `tx-request-queue`: New withdrawal requests
  - `signed-tx-queue`: Signed transactions ready for broadcast
  - `invalid-dlq`: Failed validation requests
  - `tx-dlq`: Failed transaction broadcasts

## 🔧 Development Guide

### API Endpoints

**Authentication:**
- `POST /auth/register` - User registration
- `POST /auth/login` - User login with JWT

**Withdrawal:**
- `POST /withdrawal/request` - Submit withdrawal request
- `GET /withdrawal/status/:id` - Check withdrawal status
- `GET /withdrawal/history` - Get user's withdrawal history
- `GET /withdrawal/queue/status` - Monitor queue status

### Security Features

- JWT-based authentication
- Private key encryption (AES-256-GCM)
- AWS Secrets Manager integration
- Audit logging for critical operations
- Input validation and sanitization

### Testing

```bash
# Run all tests
npm test

# Run specific service tests
npm run test:api-server
npm run test:signing-service

# Run with coverage
npm run test:coverage
```

### Development Workflow

1. Make changes to code
2. Run linting: `npm run lint`
3. Run type checking: `npm run typecheck`
4. Run tests: `npm test`
5. Build: `npm run build`

## 🛠️ Tools and Technologies

- **Nx**: Monorepo management and build system
- **TypeScript**: Type safety with strict mode
- **Express.js**: Web framework
- **Prisma**: ORM for MySQL database
- **AWS SDK**: SQS queue management
- **LocalStack**: Local AWS service emulation
- **Ethers.js**: Polygon blockchain interaction
- **Jest**: Testing framework with coverage
- **Docker**: Containerization
- **JWT**: Authentication
- **Bcrypt**: Password hashing

## 📝 Conventions

### Service Naming

- Purpose-specific names (e.g., `signing-service`, not `worker-1`)
- Use kebab-case
- Clear separation of concerns

### Environment Variables

- All services share root `.env` file
- Use `QUEUE_TYPE` to switch between LocalStack and AWS
- Sensitive data in AWS Secrets Manager

### Error Handling

- Use custom error classes from `@packages/shared`
- Proper HTTP status codes
- Detailed error logging
- DLQ for failed messages

## 🚨 Important Notes

1. **No Database Migrations**: Do not generate Prisma migrations unless explicitly requested
2. **Security First**: Never expose private keys or sensitive data
3. **Queue-based Architecture**: All heavy processing through queues
4. **Polygon Only**: Currently supports only Polygon network
5. **Development First**: Use LocalStack for local development

## 📚 Documentation

- **Architecture Overview**: See `docs/introduce.md`
- **Development Plan**: See `docs/plan.md`
- **Development Guidelines**: See `CLAUDE.md`
- **API Documentation**: Run the server and visit `/api-docs`

