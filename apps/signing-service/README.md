# Signing Service

A secure transaction signing worker service for the asset withdrawal system. This service processes withdrawal requests and signs transactions using a secure private key.

## Features

- **Security**
  - Encrypted private key storage in memory
  - Detailed audit logging for all signing operations
  - AWS Secrets Manager integration

- **Reliability**
  - Graceful shutdown handling
  - Automatic secrets refresh
  - Connection pooling for database
  - Queue-based processing

## Architecture

The signing service is a worker that:
1. Processes withdrawal requests from the `tx-request-queue`
2. Signs transactions securely
3. Outputs signed transactions to the `signed-tx-queue`

## Configuration

See `.env.sample` for all configuration options. Key settings:

- `SIGNING_SERVICE_ENCRYPTION_KEY`: Key for encrypting private keys in memory (32 characters)
- `SIGNING_SERVICE_PRIVATE_KEY_SECRET`: AWS Secrets Manager key for private key
- `POLYGON_NETWORK`: Network to use (amoy or mainnet)
- `POLYGON_RPC_URL`: RPC URL for Polygon network
- `TX_REQUEST_QUEUE_URL`: Queue URL for incoming withdrawal requests
- `SIGNED_TX_QUEUE_URL`: Queue URL for signed transactions

## Security

### Private Key Storage

The private key is:
1. Stored in AWS Secrets Manager
2. Encrypted in memory using AES-256-GCM
3. Only decrypted when needed for signing

### Audit Logs

All signing operations are logged to the audit log file with the following information:
- Timestamp
- Action performed
- Transaction details
- Success/failure status
- Error details (if failed)

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Docker

```bash
# Build image
docker build -f apps/signing-service/Dockerfile -t signing-service .

# Run with docker-compose
docker-compose -f docker/docker-compose.yaml up signing-service
```

## Monitoring

The service logs the following metrics:
- Total transactions processed
- Failed transaction count
- Queue processing status
- Worker health status

Check logs for monitoring worker performance and health.