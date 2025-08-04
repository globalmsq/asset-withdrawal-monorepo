# TX Broadcaster Service

Transaction broadcaster service for the asset withdrawal system. This service handles broadcasting signed transactions to the blockchain and monitoring their status.

## Purpose

The TX Broadcaster service is responsible for:
- Receiving signed transactions from the signing service
- Broadcasting transactions to the blockchain
- Monitoring transaction status and confirmations
- Handling transaction failures and retries
- Updating transaction status in the database

## Architecture

This service operates as part of the withdrawal system pipeline:
1. **Signing Service** → Signs transactions
2. **TX Broadcaster** → Broadcasts signed transactions to blockchain  
3. **TX Monitor** → Monitors transaction confirmations

## Configuration

### Environment Variables

See `env.example` for all available configuration options.

Key configurations:
- `PORT`: Service port (default: 3003)
- `RPC_URL`: Blockchain RPC endpoint
- `CHAIN_ID`: Blockchain chain ID
- Database connection settings
- Queue connection settings
- Redis connection settings

### Development Setup

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development server
pnpm nx serve tx-broadcaster

# Run tests
pnpm nx test tx-broadcaster

# Build for production
pnpm nx build tx-broadcaster
```

## API Endpoints

### Health Check
- `GET /health` - Service health status
- `GET /` - Service information

## Docker

The service includes a Dockerfile for containerized deployment:

```bash
# Build Docker image
pnpm nx docker-build tx-broadcaster

# Run container
docker run -p 3003:3003 tx-broadcaster
```

## Dependencies

- **Express**: Web framework
- **Helmet**: Security middleware
- **CORS**: Cross-origin resource sharing
- **tsx**: TypeScript execution runtime