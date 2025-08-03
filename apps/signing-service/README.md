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

- **High-Throughput Batch Processing**
  - Processes thousands of transactions rapidly
  - Dynamic batch processing for optimal throughput
  - Multicall3 integration for massive scale operations
  - Token-based transaction grouping for efficiency
  - Configurable thresholds for performance tuning
  - Benefits: 10-100x faster processing + 20-70% gas savings

## Architecture

The signing service is a high-performance worker that:

1. Processes withdrawal requests from the `tx-request-queue`
2. Dynamically optimizes for maximum throughput:
   - Analyzes queue for batch processing opportunities
   - Groups transactions by token for parallel processing
   - Prioritizes speed for high-volume scenarios
   - Uses Multicall3 to process hundreds of transfers in one transaction
3. Signs transactions securely (single or batch)
4. Outputs signed transactions to the `signed-tx-queue`
5. Supports multiple chains: Polygon, Ethereum, BSC, and localhost (Hardhat)

**Performance**: Capable of processing tens of thousands of transactions efficiently by reducing blockchain congestion and maximizing throughput.

## Configuration

See `.env.sample` for all configuration options. Key settings:

### Core Settings

- `SIGNING_SERVICE_ENCRYPTION_KEY`: Key for encrypting private keys in memory (32 characters)
- `SIGNING_SERVICE_PRIVATE_KEY_SECRET`: AWS Secrets Manager key for private key
- `TX_REQUEST_QUEUE_URL`: Queue URL for incoming withdrawal requests
- `SIGNED_TX_QUEUE_URL`: Queue URL for signed transactions
- **Note**: Chain and network must be specified in API requests (no default values)

### Batch Processing Settings

- `ENABLE_BATCH_PROCESSING`: Enable/disable batch processing (default: true)
- `MIN_BATCH_SIZE`: Minimum messages required for batch consideration (default: 5)
- `BATCH_THRESHOLD`: Minimum transactions per token for batching (default: 3)
- `MIN_GAS_SAVINGS_PERCENT`: Minimum gas savings required (default: 20)
- `SINGLE_TX_GAS_ESTIMATE`: Estimated gas for single transaction (default: 65000)
- `BATCH_BASE_GAS`: Base gas for batch transaction (default: 100000)
- `BATCH_PER_TX_GAS`: Additional gas per transaction in batch (default: 25000)

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
