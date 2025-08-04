# TX Broadcaster Service

Transaction broadcaster service for the asset withdrawal system. This service handles broadcasting signed transactions to the blockchain.

## Purpose

The TX Broadcaster service is responsible for:

- Receiving signed transactions from the signing service
- Broadcasting transactions to multiple blockchain networks
- Handling both single and batch transactions uniformly
- Managing transaction retries with Redis deduplication
- Sending broadcast results to the next service

## Architecture

This service operates as part of the withdrawal system pipeline:

1. **Signing Service** → Signs transactions
2. **TX Broadcaster** → Broadcasts signed transactions to blockchain
3. **TX Monitor** → Monitors transaction confirmations

## Unified Message Handling

The service supports both legacy and unified message formats:

### Legacy Format (Single Transactions Only)

```typescript
interface SignedTransactionMessage {
  id: string;
  withdrawalId: string;
  signedTransaction: string;
  // ... other fields
}
```

### Unified Format (Single & Batch Transactions)

```typescript
interface UnifiedSignedTransactionMessage {
  id: string;
  transactionType: 'SINGLE' | 'BATCH';
  withdrawalId?: string; // For single transactions
  batchId?: string; // For batch transactions
  signedTransaction: string; // Raw signed tx
  chainId: number;
  metadata?: {
    totalRequests?: number; // Batch only
    requestIds?: string[]; // Batch only
    toAddress?: string; // Single only
    amount?: string; // Single only
  };
}
```

The service automatically detects and converts message formats, ensuring backward compatibility while supporting new batch transaction capabilities.

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
