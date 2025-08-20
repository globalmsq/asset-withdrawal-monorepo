# TX Monitor Service

## Overview

The TX Monitor service is responsible for monitoring blockchain transactions after they have been broadcast. It tracks confirmation status, detects failures, and handles edge cases like chain reorganizations and mempool drops.

## Architecture

### Core Monitoring Strategy

The service uses a hybrid approach combining real-time blockchain monitoring with backup polling mechanisms:

1. **Primary: WebSocket Block Events** - Real-time monitoring via blockchain node WebSocket connections
2. **Secondary: Redis Pub/Sub** - Inter-service communication for status updates
3. **Backup: Three-Tier Polling** - Fallback mechanism for reliability

### Transaction Status Flow

```
SENT → CONFIRMING → CONFIRMED
     ↘          ↘
       FAILED    CANCELED
```

- **SENT**: Transaction has been broadcast to the blockchain
- **CONFIRMING**: Transaction included in a block, awaiting required confirmations
- **FAILED**: Transaction execution failed or reverted
- **CANCELED**: Transaction replaced or dropped from mempool
- **CONFIRMED**: Transaction has reached required confirmation count

## Implementation Details

### 1. WebSocket-Based Real-Time Monitoring

```typescript
// Connect to blockchain WebSocket
const provider = new ethers.WebSocketProvider(wsUrl);

// Subscribe to new blocks
provider.on('block', async blockNumber => {
  await processBlock(blockNumber);
});

// Process each block
async function processBlock(blockNumber: number) {
  // 1. Get block with transactions
  const block = await provider.getBlock(blockNumber, true);

  // 2. Check if any of our monitored txs are in this block
  const ourTxs = block.transactions.filter(tx => monitoredTxs.has(tx.hash));

  // 3. Update status for found transactions
  for (const tx of ourTxs) {
    await updateTransactionStatus(tx, blockNumber);
  }

  // 4. Check confirmation counts for CONFIRMING transactions
  await checkConfirmations(blockNumber);
}
```

### 2. Memory-Based Transaction Cache

```typescript
// In-memory cache for active monitoring
const monitoredTxs = new Map<string, MonitoredTransaction>();

interface MonitoredTransaction {
  txHash: string;
  requestId?: string;
  batchId?: string;
  chain: string;
  network: string;
  status: 'SENT' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'CANCELED';
  blockNumber?: number;
  confirmations: number;
  lastChecked: Date;
  retryCount: number;
}

// Load active transactions on startup
async function loadActiveTransactions() {
  const activeTxs = await prisma.sentTransaction.findMany({
    where: {
      status: {
        in: ['SENT', 'CONFIRMING'],
      },
    },
  });

  activeTxs.forEach(tx => {
    monitoredTxs.set(tx.sentTxHash, {
      txHash: tx.sentTxHash,
      requestId: tx.requestId,
      batchId: tx.batchId,
      chain: tx.chain,
      network: tx.network,
      status: tx.status as any,
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined,
      confirmations: 0,
      lastChecked: new Date(),
      retryCount: 0,
    });
  });
}
```

### 3. Batch Transaction Receipt Fetching

```typescript
async function batchGetTransactionReceipts(txHashes: string[]) {
  // Use Promise.all for parallel fetching (30 tx limit per batch)
  const chunks = [];
  for (let i = 0; i < txHashes.length; i += 30) {
    chunks.push(txHashes.slice(i, i + 30));
  }

  const results = [];
  for (const chunk of chunks) {
    const receipts = await Promise.all(
      chunk.map(hash => provider.getTransactionReceipt(hash))
    );
    results.push(...receipts);
  }

  return results;
}
```

### 4. Three-Tier Backup Polling System

```typescript
interface PollingTier {
  name: string;
  interval: number; // milliseconds
  maxAge: number; // milliseconds
  batchSize: number;
}

const POLLING_TIERS: PollingTier[] = [
  {
    name: 'fast',
    interval: 60_000, // 1 minute
    maxAge: 300_000, // 5 minutes old
    batchSize: 30,
  },
  {
    name: 'medium',
    interval: 600_000, // 10 minutes
    maxAge: 3_600_000, // 1 hour old
    batchSize: 50,
  },
  {
    name: 'full',
    interval: 3_600_000, // 1 hour
    maxAge: Infinity, // All remaining
    batchSize: 100,
  },
];

// Run polling tiers
POLLING_TIERS.forEach(tier => {
  setInterval(() => runPollingTier(tier), tier.interval);
});

async function runPollingTier(tier: PollingTier) {
  const now = Date.now();
  const transactions = Array.from(monitoredTxs.values())
    .filter(tx => {
      const age = now - tx.lastChecked.getTime();
      return age <= tier.maxAge && tx.status !== 'CONFIRMED';
    })
    .slice(0, tier.batchSize);

  if (transactions.length > 0) {
    const receipts = await batchGetTransactionReceipts(
      transactions.map(tx => tx.txHash)
    );

    for (let i = 0; i < transactions.length; i++) {
      await processReceipt(transactions[i], receipts[i]);
    }
  }
}
```

### 5. Confirmation Tracking

```typescript
async function checkConfirmations(currentBlock: number) {
  for (const [txHash, tx] of monitoredTxs.entries()) {
    if (tx.status === 'CONFIRMING' && tx.blockNumber) {
      const confirmations = currentBlock - tx.blockNumber + 1;
      tx.confirmations = confirmations;

      // Get required confirmations from chain config
      const chainConfig = getChainConfig(tx.chain, tx.network);
      const requiredConfirmations = chainConfig.requiredConfirmations || 30;

      if (confirmations >= requiredConfirmations) {
        await markAsConfirmed(tx);
        monitoredTxs.delete(txHash);
      } else {
        // Update confirmation count in DB
        await prisma.sentTransaction.update({
          where: { sentTxHash: txHash },
          data: {
            confirmations,
            updatedAt: new Date(),
          },
        });
      }
    }
  }
}
```

### 6. Redis Pub/Sub Integration

```typescript
// Publish status updates
async function publishStatusUpdate(tx: MonitoredTransaction, status: string) {
  const message = {
    txHash: tx.txHash,
    requestId: tx.requestId,
    batchId: tx.batchId,
    status,
    blockNumber: tx.blockNumber,
    confirmations: tx.confirmations,
    timestamp: new Date().toISOString(),
  };

  await redis.publish('tx-status-updates', JSON.stringify(message));
}

// Subscribe to transaction events
redis.subscribe('new-transactions', message => {
  const tx = JSON.parse(message);
  monitoredTxs.set(tx.txHash, {
    ...tx,
    status: 'SENT',
    confirmations: 0,
    lastChecked: new Date(),
    retryCount: 0,
  });
});
```

## Chain Configuration

Chain-specific settings are stored in `packages/shared/src/config/chains.config.json`:

```json
{
  "polygon": {
    "mainnet": {
      "chainId": 137,
      "name": "Polygon Mainnet",
      "rpcUrl": "https://polygon.llamarpc.com",
      "requiredConfirmations": 30,
      "blockTime": 2,
      "nativeCurrency": {
        "name": "MATIC",
        "symbol": "MATIC",
        "decimals": 18
      }
    },
    "testnet": {
      "chainId": 80002,
      "name": "Polygon Amoy",
      "rpcUrl": "https://rpc-amoy.polygon.technology",
      "requiredConfirmations": 10,
      "blockTime": 2
    }
  },
  "ethereum": {
    "mainnet": {
      "chainId": 1,
      "name": "Ethereum Mainnet",
      "rpcUrl": "https://ethereum.publicnode.com",
      "requiredConfirmations": 12,
      "blockTime": 12
    }
  },
  "localhost": {
    "testnet": {
      "chainId": 31337,
      "name": "Localhost",
      "rpcUrl": "http://hardhat-node:8545",
      "requiredConfirmations": 1,
      "blockTime": 1
    }
  }
}
```

## Database Schema

The service primarily works with the `SentTransaction` model:

```prisma
model SentTransaction {
  id                    BigInt              @id @default(autoincrement())
  requestId             String?             @db.VarChar(36)
  batchId               String?             @db.VarChar(36)
  transactionType       String              @db.VarChar(10) // SINGLE, BATCH
  originalTxHash        String              @db.VarChar(66)
  sentTxHash            String              @unique @db.VarChar(66)
  chain                 String              @db.VarChar(20)
  network               String              @db.VarChar(50)
  nonce                 Int                 @db.UnsignedInt
  blockNumber           BigInt?             @db.UnsignedBigInt
  confirmations         Int                 @default(0)    // New field
  gasUsed               String?             @db.VarChar(50)
  status                String              @default("SENT") // SENT, CONFIRMING, CONFIRMED, FAILED, CANCELED
  error                 String?             @db.Text
  confirmedAt           DateTime?
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
}
```

## Performance Optimization

### 1. Connection Pooling

- Maintain persistent WebSocket connections per chain
- Reuse connections across monitoring sessions
- Automatic reconnection on disconnection

### 2. Batch Processing

- Process up to 30 transactions per RPC batch call
- Group transactions by chain for efficient processing
- Use Promise.all for parallel receipt fetching

### 3. Memory Management

- Cache only active transactions (SENT, CONFIRMING)
- Remove confirmed transactions from memory
- Periodic cleanup of stale entries

### 4. Database Optimization

- Bulk updates using Prisma transactions
- Indexed queries on status and chain fields
- Minimal writes (only on status changes)

## Error Handling

### Network Errors

- Automatic WebSocket reconnection with exponential backoff
- Fallback to HTTP polling if WebSocket fails
- Circuit breaker for repeated RPC failures

### Chain Reorganizations

- Detect reorgs by monitoring block parent hashes
- Re-verify transactions in affected blocks
- Adjust confirmation counts accordingly

### Mempool Drops

- Detect transactions missing from mempool after timeout
- Mark as CANCELED if not found after 24 hours
- Trigger alerts for manual investigation

## Monitoring & Metrics

### Key Metrics

- `tx_monitor_active_count`: Number of actively monitored transactions
- `tx_monitor_confirmation_time`: Time from SENT to CONFIRMED
- `tx_monitor_websocket_status`: WebSocket connection health
- `tx_monitor_polling_lag`: Delay in backup polling execution
- `tx_monitor_rpc_calls`: RPC call count and latency

### Alerts

- WebSocket disconnection lasting > 1 minute
- Polling tier backup > 5 minutes
- Transaction stuck in SENT > 1 hour
- Confirmation time > expected for chain

## Environment Variables

```env
# Service Configuration
PORT=3003
NODE_ENV=development

# Database
DATABASE_URL=mysql://user:password@localhost:3306/withdrawal_db

# Redis
REDIS_URL=redis://localhost:6379

# Monitoring
MONITORING_ENABLED=true
WEBSOCKET_ENABLED=true
POLLING_ENABLED=true

# Performance
MAX_CONCURRENT_RPC_CALLS=10
BATCH_SIZE=30
CACHE_SIZE=10000

# Logging
LOG_LEVEL=info
```

## API Endpoints

### Health Check

```
GET /health
Response: { status: 'healthy', activeTransactions: 42, connections: {...} }
```

### Manual Transaction Check

```
POST /check-transaction
Body: { txHash: '0x...' }
Response: { status: 'CONFIRMED', confirmations: 35, blockNumber: 12345678 }
```

### Monitoring Stats

```
GET /stats
Response: {
  activeTransactions: 42,
  byStatus: { SENT: 10, CONFIRMING: 32 },
  byChain: { polygon: 30, ethereum: 12 },
  averageConfirmationTime: 65000
}
```

## Development

### Running Locally

```bash
# Start dependencies
docker-compose up -d mysql redis

# Install dependencies
pnpm install

# Run the service
pnpm nx serve tx-monitor
```

### Testing

```bash
# Unit tests
pnpm nx test tx-monitor

# Integration tests
pnpm nx test:integration tx-monitor
```

## Production Considerations

### High Availability

- Run multiple instances with shared Redis cache
- Use leader election for WebSocket connections
- Distribute polling work across instances

### Scaling

- Horizontal scaling with Kubernetes
- Increase batch sizes for high volume
- Implement sharding by chain/network

### Security

- Use secure WebSocket connections (wss://)
- Implement rate limiting on API endpoints
- Audit log all status changes

## Future Enhancements

1. **Advanced Monitoring**
   - Gas price tracking and optimization
   - MEV detection and protection
   - Cross-chain transaction tracking

2. **Machine Learning**
   - Predict optimal confirmation times
   - Detect anomalous transaction patterns
   - Auto-adjust polling strategies

3. **Integration**
   - Webhook notifications for status changes
   - GraphQL subscription API
   - Integration with monitoring platforms (Datadog, New Relic)
