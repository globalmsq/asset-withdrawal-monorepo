# End-to-End System Test Guide

## Overview

The system consists of:
- **MySQL Database** - Data storage
- **LocalStack** - AWS SQS emulation for message queues
- **API Server** - HTTP endpoints for withdrawal requests (included in docker-compose)
- **TX Processor** - Processes and signs transactions
- **TX Monitor** - Monitors blockchain transaction status

## Prerequisites

1. **Docker Desktop** must be running
2. **Node.js** and **npm** installed
3. All dependencies installed (`npm install`)

## Quick Start

```bash
# 1. Start infrastructure (MySQL + LocalStack + API Server)
docker-compose -f docker/docker-compose.yaml up -d

# 2. Generate Prisma client
npm run db:generate

# 3. Start TX Processor and TX Monitor in separate terminals
npm run dev:tx-processor  # Terminal 1
npm run dev:tx-monitor    # Terminal 2

# 4. Test the system
curl http://localhost:8080/health  # API Server (Docker)
```

## Development Setup Options

### Option 1: Full Docker Setup (Default)
- MySQL, LocalStack, and API Server run in Docker
- TX Processor and TX Monitor run locally
- API Server accessible at http://localhost:8080

### Option 2: Hybrid Setup (Recommended for API development)
```bash
# 1. Stop the API Server container (keep MySQL and LocalStack running)
docker-compose -f docker/docker-compose.yaml stop api-server

# 2. Run API Server locally
npm run dev:api-server  # Will run on port 3000

# 3. Run other services
npm run dev:tx-processor
npm run dev:tx-monitor
```

### Option 3: Full Local Setup
```bash
# 1. Remove api-server from docker-compose up
docker-compose -f docker/docker-compose.yaml up -d mysql localstack

# 2. Run all services locally
npm run dev:api-server    # Terminal 1 (port 3000)
npm run dev:tx-processor  # Terminal 2 (port 3001)
npm run dev:tx-monitor    # Terminal 3 (port 3002)
```

## Detailed Test Steps

### Step 1: Start Infrastructure

```bash
# Start all Docker services
docker-compose -f docker/docker-compose.yaml up -d

# Verify all services are running
docker-compose -f docker/docker-compose.yaml ps

# Check logs if needed
docker-compose -f docker/docker-compose.yaml logs -f
```

### Step 2: Database Setup

```bash
# Generate Prisma client (required for TypeScript/Node.js to interact with DB)
npm run db:generate

# Note: 
# - Database tables are created automatically by init.sql when Docker starts
# - init.sql creates tables in MySQL, db:generate creates Prisma Client for your code
# - Sample user is created: test@test.com / Test123!@# (see init.sql)
```

### Step 3: Start Additional Services

Based on your chosen setup, start the necessary services:

```bash
# For Option 1 (Full Docker):
npm run dev:tx-processor  # Terminal 1
npm run dev:tx-monitor    # Terminal 2

# For Option 2 & 3 (Local API):
npm run dev:api-server    # Terminal 1 (if running locally)
npm run dev:tx-processor  # Terminal 2
npm run dev:tx-monitor    # Terminal 3
```

### Step 4: Health Check All Services

```bash
# Set API URL based on your setup
export API_URL="http://localhost:8080"  # Docker API
# OR
export API_URL="http://localhost:3000"  # Local API

# Check services
curl $API_URL/health                    # API Server
curl http://localhost:3001/health       # TX Processor
curl http://localhost:3002/health       # TX Monitor
```

### Step 5: Create Test User

```bash
# Register a new user
curl -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }'

# Login to get JWT token
curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'

# Save the token from response
export JWT_TOKEN="<token-from-response>"
```

### Step 6: Submit Withdrawal Request

```bash
# Create withdrawal request
curl -X POST $API_URL/withdrawal/request \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7095Ed4e74",
    "amount": 100,
    "currency": "USDT",
    "network": "polygon"
  }'

# Save the transaction ID from response
export TX_ID="<transaction-id-from-response>"
```

### Step 7: Monitor Transaction Processing

```bash
# Check withdrawal status
curl -X GET "$API_URL/withdrawal/status/$TX_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Check queue status
curl $API_URL/withdrawal/queue/status
```

### Step 8: Check Worker Status

```bash
# TX Processor workers status
curl http://localhost:3001/status

# TX Monitor status
curl http://localhost:3002/status
```

### Step 9: View Queue Messages

```bash
# List all queues
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Check messages in tx-request queue
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/tx-request-queue

# Check messages in signed-tx queue
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/signed-tx-queue
```

### Step 10: Check Database

```bash
# Connect to MySQL
docker exec -it withdrawal-mysql mysql -uroot -ppass withdrawal_system

# In MySQL prompt:
USE withdrawal_system;

# Check users
SELECT id, email, name, role FROM User;

# Check transactions
SELECT id, status, txHash, amount, currency FROM Transaction ORDER BY createdAt DESC LIMIT 10;

# Exit MySQL
exit
```

## Expected Transaction Flow

1. **Withdrawal Request** → Status: `PENDING`
2. **TX Processor picks up** → Status: `PROCESSING`
3. **Transaction signed** → Status: `SIGNED`
4. **Transaction broadcast** → Status: `BROADCAST`
5. **TX Monitor confirms** → Status: `CONFIRMED`

## Monitoring Logs

Watch logs in each terminal to see the flow:

- **API Server**: Request received, transaction created
- **TX Processor**: 
  - ValidationSigningWorker: Validates and signs transaction
  - TransactionSenderWorker: Broadcasts to blockchain
- **TX Monitor**: Polls for transaction confirmation

## Troubleshooting

### If transactions are stuck:

1. Check LocalStack is running:
   ```bash
   docker ps | grep localstack
   ```

2. Check DLQ for failed messages:
   ```bash
   aws --endpoint-url=http://localhost:4566 sqs receive-message \
     --queue-url http://localhost:4566/000000000000/invalid-dlq
   ```

3. Manually control workers:
   ```bash
   # Start specific worker
   curl -X POST http://localhost:3001/workers/validation-signing/start
   
   # Stop specific worker
   curl -X POST http://localhost:3001/workers/validation-signing/stop
   ```

### Common Issues:

1. **Port conflicts**: 
   - API Server: 8080 (Docker) or 3000 (local)
   - MySQL: 3306
   - LocalStack: 4566

2. **Database connection**: 
   - Docker services use `mysql` as hostname
   - Local services use `localhost`

3. **Transaction failures**:
   - System uses Polygon Amoy testnet
   - Dummy private key won't have test MATIC
   - Transactions will fail at broadcast stage

## Cleanup

```bash
# Stop local services (Ctrl+C in each terminal)

# Stop Docker containers
docker-compose -f docker/docker-compose.yaml down

# Remove volumes (optional - will delete all data)
docker-compose -f docker/docker-compose.yaml down -v
```

## Notes

- The API Server in Docker uses port 8080
- When running API Server locally, it uses port 3000
- Database name is `withdrawal_system` (not `withdrawal_db`)
- The system uses Polygon Amoy testnet by default
- LocalStack queues are automatically initialized on startup