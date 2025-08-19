# TX Broadcaster Service

A service that broadcasts signed transactions to the blockchain network.

## Overview

1. **Transaction Broadcasting**: Sends signed transactions from signing-service to the blockchain
2. **State Management**: Updates transaction status from SIGNED → BROADCASTING → BROADCASTED/FAILED
3. **Result Recording**: Stores broadcast information in sent_transactions table
4. **Retry Handling**: Manages retryable errors such as network failures

## Message Flow

```
signing-service → signed-tx-queue → tx-broadcaster → broadcast-tx-queue → tx-monitor
```

## Configuration

```bash
cp env.example .env
```

Key environment variables:

- `SIGNED_TX_QUEUE_URL`: Queue for receiving signed transactions from signing-service
- `BROADCAST_TX_QUEUE_URL`: Queue for sending broadcast results to tx-monitor
- `RPC_URL`: Blockchain RPC endpoint
- `CHAIN_ID`: Target chain ID

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run in production
pnpm start
```

## Architecture

### Core Components

1. **SQSWorker**: SQS message processing and worker logic
2. **TransactionBroadcaster**: Core transaction broadcasting logic
3. **TransactionService**: Database state management
4. **RetryService**: Retry logic and error analysis

### Broadcasting Approach

- **Direct Broadcasting**: Uses `rawTransaction` field directly from signing-service
- **Minimal Conversion**: Converts signing-service messages with minimal transformation
- **Preserved Metadata**: Additional fields (nonce, gasLimit, etc.) are preserved but not used for broadcasting
- **Chain Detection**: Uses `chainId` for network selection and validation

### Optimized Message Processing

The service now uses a streamlined approach:

1. **Direct rawTransaction Usage**: The `rawTransaction` field from signing-service is used directly for blockchain broadcasting
2. **Minimal Validation**: Only essential validations (format check, chain support) are performed
3. **Simple Conversion**: Message conversion logic focuses on business fields (requestId, transactionType) rather than re-extracting transaction details

### Message Formats

#### Input (SignedTransaction from signing-service)

```typescript
{
  transactionType: 'SINGLE' | 'BATCH',
  requestId: string,
  hash: string,
  rawTransaction: string,  // Ready-to-broadcast signed transaction
  chainId: number,
  // Additional fields (nonce, gasLimit, etc.) are preserved but not used for broadcasting
}
```

#### Output (UnifiedBroadcastResultMessage)

```typescript
{
  transactionType: 'SINGLE' | 'BATCH',
  withdrawalId?: string,
  batchId?: string,
  originalTransactionHash: string,
  broadcastTransactionHash?: string,
  status: 'broadcasted' | 'failed',
  // ... other fields
}
```

## Error Handling

### Retryable Errors

- Network connection errors
- Temporary RPC node failures
- Nonce conflicts

### Non-Retryable Errors

- Insufficient balance
- Invalid signature
- Unsupported chain ID

## Monitoring

- Broadcast success/failure rate
- Average processing time
- Retry count
- DLQ message count
