# TX Broadcaster Nonce Handling Implementation

## Overview

This document describes the nonce gap handling implementation in the `tx-broadcaster` service, which ensures transactions are processed in the correct order even when they arrive out of sequence.

## Key Features Implemented

### 1. Nonce Gap Detection and Handling

- **NONCE_TOO_LOW**: Immediately sent to DLQ (indicates external transaction interference)
- **NONCE_TOO_HIGH**: Buffered and handled with intelligent retry logic

### 2. SQS Message Processing

- Processes **10 messages** per batch (increased from 5)
- Messages are sorted by nonce per address
- Processes transactions sequentially to maintain nonce order

### 3. Missing Nonce Search

When a nonce gap is detected (NONCE_TOO_HIGH):

1. **Search SQS Queue**: Automatically searches for missing nonces in the queue
2. **Buffer Management**: Found transactions are added to the buffer
3. **Sequential Processing**: Once gaps are filled, processes buffered transactions in order

### 4. Individual Address Timers

- **Per-Address Monitoring**: Each address has its own timer (no global periodic checking)
- **Blockchain Nonce Check**: Only checks blockchain nonce when NONCE_TOO_HIGH occurs
- **1-Minute Timeout**: After 1 minute of waiting, sends dummy transactions to fill gaps

### 5. Chain Configuration Integration

- Uses `chains.config.json` for blockchain node information
- Only accesses blockchain when necessary:
  - During NONCE_TOO_HIGH error handling
  - When initializing nonce from Redis (if no cached value exists)

## Implementation Details

### NonceManager Service (`nonce-manager.ts`)

#### Key Methods

1. **`processTransactionWithSQSSearch()`**
   - Main entry point for processing transactions
   - Integrates SQS search when gaps are detected
   - Returns `true` if ready to broadcast, `false` if buffered

2. **`searchSQSForMissingNonces()`**
   - Searches SQS queue for transactions with missing nonces
   - Uses ethers v6 syntax: `ethers.Transaction.from()`
   - Removes found transactions from SQS queue

3. **`handleNonceTooHigh()`**
   - Buffers transaction
   - Starts address-specific timer
   - Monitors blockchain nonce periodically

4. **`startAddressTimer()`**
   - Creates individual timer for specific address
   - Checks blockchain nonce every 10 seconds
   - Triggers dummy transaction after 1 minute timeout

### SQS Worker Integration (`sqs-worker.ts`)

```typescript
// Process with SQS search for missing nonces
const readyToBroadcast =
  await this.nonceManager.processTransactionWithSQSSearch(queuedTx, chainId);

if (readyToBroadcast) {
  // Broadcast transaction
  await this.broadcastTransaction(queuedTx);
}
```

## Error Handling Strategy

| Error Type      | Action              | Description                                |
| --------------- | ------------------- | ------------------------------------------ |
| NONCE_TOO_LOW   | Send to DLQ         | External transaction interference detected |
| NONCE_TOO_HIGH  | Buffer + Search SQS | Wait for missing nonces, search queue      |
| Timeout (1 min) | Send dummy TX       | Fill gap with minimal transactions         |

## Configuration

### Environment Variables

- `SIGNED_TX_QUEUE_URL`: SQS queue URL for signed transactions
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS credentials

### Constants

- `MAX_BUFFER_SIZE_PER_ADDRESS`: 100 transactions
- `MAX_BUFFER_AGE_MS`: 5 minutes
- `DUMMY_TX_WAIT_TIME`: 1 minute
- `NONCE_CHECK_INTERVAL`: 10 seconds
- `SQS_BATCH_SIZE`: 10 messages

## Testing

### Unit Tests

- Nonce sorting and gap detection
- Buffer management
- SQS search functionality
- Timer management

### Integration Points

- SQS message processing
- Redis state management
- Blockchain nonce retrieval
- Chain configuration service

## Migration Notes

### Ethers v6 Compatibility

- Changed from `ethers.utils.parseTransaction()` to `ethers.Transaction.from()`
- Handle BigInt chainId comparison
- Convert nonce to Number when needed

### TypeScript Fixes

- Cast message body to `any` for dynamic typing
- Use metadata object for logger instead of direct error parameter
- Proper error message handling with `String(error)`

## Future Improvements

1. **Dummy Transaction Implementation**
   - Currently logs what would be done
   - Needs wallet/signer integration for actual transactions

2. **Metrics and Monitoring**
   - Add CloudWatch metrics for gap detection
   - Monitor buffer sizes and wait times
   - Track dummy transaction frequency

3. **Enhanced Recovery**
   - Implement exponential backoff for retries
   - Add circuit breaker for failing addresses
   - Better handling of persistent gaps

## Conclusion

The implementation successfully handles nonce gaps through:

- Intelligent buffering and gap detection
- SQS queue searching for missing transactions
- Individual address-based timers (not global)
- Proper integration with blockchain nodes via chain configuration

This ensures reliable transaction processing even when transactions arrive out of order or when external systems interfere with nonce sequences.
