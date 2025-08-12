# Nonce Gap Recovery Strategy

## Overview

This document describes the nonce gap detection and recovery strategy implemented in the tx-broadcaster service.

## Nonce Gap Detection

### What is a Nonce Gap?

A nonce gap occurs when:
- A transaction with nonce N fails or is dropped
- A transaction with nonce N+1 (or higher) is waiting to be broadcast
- The blockchain expects nonce N next, but we're trying to send N+1

### Detection Mechanism

The system detects nonce gaps in two places:

1. **NonceManager** (`nonce-manager.ts`)
   - Tracks `lastBroadcastedNonce` per address
   - Compares with next transaction's nonce in queue
   - Prevents broadcasting if gap exists

2. **TransactionBroadcaster** (`broadcaster.ts`)
   - Receives `NONCE_TOO_HIGH` error from blockchain
   - Classifies as nonce gap error

## Recovery Process

### Phase 1: Detection and Routing (Current Implementation)

When a nonce gap is detected:

1. **Stop Processing**: The address queue is stopped to prevent further errors
2. **Gap Analysis**: System calculates:
   - Expected nonce (last successful + 1)
   - Actual nonce (transaction trying to broadcast)
   - Gap size and missing nonces
3. **DLQ Routing**: Transaction is sent to Dead Letter Queue with:
   - Original transaction details
   - Error type: `NONCE_TOO_HIGH`
   - Gap information (expected, actual, missing nonces)

### Phase 2: Recovery Service (Task 33 - Future Implementation)

The Recovery Service will:

1. **Monitor DLQ**: Listen for `NONCE_TOO_HIGH` errors
2. **Generate Dummy Transactions**: Create minimal transactions to fill gaps
3. **Broadcast Dummy Transactions**: Send with minimal gas to fill nonces
4. **Retry Original**: Once gap is filled, retry original transaction

## Data Flow

```
1. Transaction with high nonce arrives
   ↓
2. NonceManager detects gap OR blockchain returns NONCE_TOO_HIGH
   ↓
3. SQSWorker sends to DLQ with gap info
   ↓
4. Recovery Service (future) processes DLQ message
   ↓
5. Recovery Service fills gap with dummy transactions
   ↓
6. Original transaction is retried
```

## DLQ Message Structure

```typescript
{
  originalMessage: {
    id: string,
    transactionType: 'SINGLE' | 'BATCH',
    withdrawalId?: string,
    batchId?: string,
    signedTransaction: string,
    chainId: number
  },
  error: {
    type: 'NONCE_TOO_HIGH',
    message: string,
    details: {
      nonceGapInfo: {
        hasGap: true,
        expectedNonce: number,
        actualNonce: number,
        gapSize: number,
        missingNonces: number[]
      }
    }
  },
  meta: {
    timestamp: string,
    attemptCount: number
  }
}
```

## Configuration

### Environment Variables

```bash
# DLQ for nonce gap recovery
SIGNED_TX_DLQ_URL=http://localhost:4566/000000000000/signed-tx-dlq

# Timeout for processing (ms)
PROCESSING_TIMEOUT=60000
```

### Queue Configuration

The DLQ should be configured with:
- Message retention: 14 days (maximum)
- Visibility timeout: 5 minutes
- Maximum receives: 10

## Monitoring

### Metrics to Track

1. **Gap Detection Rate**: Number of gaps detected per hour
2. **Gap Size Distribution**: Average gap size
3. **Recovery Success Rate**: Percentage of successful recoveries
4. **Recovery Time**: Time from detection to recovery

### Logs to Monitor

```typescript
// Gap detected
"Nonce gap detected, stopping queue processing"

// Sent to DLQ
"Sent nonce gap message to DLQ"

// Recovery attempted (future)
"Attempting nonce gap recovery"

// Recovery successful (future)
"Nonce gap recovered successfully"
```

## Error Scenarios

### Scenario 1: Single Transaction Failure

- Transaction with nonce 100 fails
- Transaction with nonce 101 is waiting
- Gap of size 1 detected
- Recovery: Send dummy transaction with nonce 100

### Scenario 2: Multiple Transaction Failures

- Transactions with nonces 100-102 fail
- Transaction with nonce 103 is waiting
- Gap of size 3 detected
- Recovery: Send 3 dummy transactions (100, 101, 102)

### Scenario 3: Network Issues

- Multiple addresses affected simultaneously
- Recovery Service should:
  - Prioritize high-value transactions
  - Batch dummy transactions when possible
  - Implement rate limiting

## Best Practices

1. **Prevention is Better**: 
   - Use reliable RPC endpoints
   - Implement proper retry logic
   - Monitor gas prices

2. **Quick Detection**:
   - Check nonce before broadcasting
   - Monitor blockchain errors immediately

3. **Efficient Recovery**:
   - Use minimal gas for dummy transactions
   - Batch multiple recoveries when possible
   - Implement circuit breakers

## Future Enhancements

1. **Automatic Gap Prevention**:
   - Predictive nonce management
   - Pre-emptive dummy transaction generation

2. **Smart Recovery**:
   - Machine learning for gap prediction
   - Dynamic recovery strategies based on patterns

3. **Cross-Chain Support**:
   - Different recovery strategies per chain
   - Chain-specific dummy transaction formats

## Related Documentation

- [Transaction Lifecycle](./TRANSACTION_LIFECYCLE.md)
- [Architecture](./ARCHITECTURE.md)
- [Technical Design](./TECHNICAL_DESIGN.md)