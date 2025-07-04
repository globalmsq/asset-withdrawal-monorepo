# Local Development Guide

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Yarn package manager

## Quick Start

### 1. Setup Environment

```bash
# Clone the repository
git clone <repository-url>
cd mustb-asset-withdrawal

# Install dependencies
yarn install

# Copy environment variables
cp packages/api-server/env.example packages/api-server/.env
```

### 2. Start Database

```bash
# Start MySQL database only
cd docker
docker compose -f docker-compose.dev.yaml up -d

# Verify MySQL is running
docker compose -f docker-compose.dev.yaml ps
```

### 3. Initialize Database

```bash
# Run Prisma migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 4. Start API Server

```bash
# Run in development mode with hot reload
yarn nx serve api-server

# Or run directly
cd packages/api-server
yarn dev
```

### 5. Access Services

- API Server: http://localhost:8080
- Swagger Documentation: http://localhost:8080/api-docs
- Health Check: http://localhost:8080/health
- Prisma Studio: http://localhost:5555 (if running)

## Testing the API

### Using Swagger UI

1. Open http://localhost:8080/api-docs
2. Try the endpoints directly from the browser

### Using cURL

```bash
# Health check
curl http://localhost:8080/health

# Submit withdrawal request
curl -X POST http://localhost:8080/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "amount": "1.5",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0x0000000000000000000000000000000000000000",
    "network": "ethereum"
  }'
```

### Using Example Scripts

```bash
# Node.js example
cd docs/api/examples/nodejs
npm install
node withdrawal.js

# Python example
cd docs/api/examples/python
pip install -r requirements.txt
python withdrawal.py
```

## Common Issues

### Database Connection Error

If you see "Failed to connect to database":

1. Check if MySQL is running:
   ```bash
   docker compose -f docker-compose.dev.yaml ps
   ```

2. Verify environment variables in `.env`:
   ```
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=pass
   MYSQL_DATABASE=withdrawal_system
   ```

3. Check MySQL logs:
   ```bash
   docker compose -f docker-compose.dev.yaml logs mysql
   ```

### Port Already in Use

If port 8080 is already in use:

```bash
# Change the port in .env
PORT=8081

# Or find and kill the process using the port
lsof -i :8080
kill -9 <PID>
```

## Development Workflow

1. Make code changes
2. The server will automatically reload (if using `yarn nx serve`)
3. Test your changes using Swagger UI or cURL
4. Run tests: `yarn nx test api-server`
5. Check linting: `yarn nx lint api-server`

## Debugging

### Enable Debug Logs

```bash
# Set DEBUG environment variable
DEBUG=* yarn nx serve api-server
```

### View Database Queries

```bash
# Open Prisma Studio
npx prisma studio
```

### Monitor Queue Status

```bash
# Check queue status
curl http://localhost:8080/withdrawal/queue/status
```