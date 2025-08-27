# Symbol Index - Asset Withdrawal System

## Core Classes and Services

### API Server
- `AuthService` - apps/api-server/src/services/auth.service.ts
- `AuthMiddleware` - apps/api-server/src/middleware/auth.middleware.ts
- `WithdrawalRoute` - apps/api-server/src/routes/withdrawal.ts
- `UserService` - apps/api-server/src/services/user.service.ts

### Signing Service
- `TransactionSigner` - apps/signing-service/src/services/transaction-signer.ts
- `SigningWorker` - apps/signing-service/src/workers/signing-worker.ts
- `NonceCache` - apps/signing-service/src/services/nonce-cache.service.ts
- `GasPriceCache` - apps/signing-service/src/services/gas-price-cache.ts
- `SecretsManager` - apps/signing-service/src/services/secrets-manager.ts
- `MulticallService` - apps/signing-service/src/services/multicall.service.ts

### Transaction Broadcaster
- `Broadcaster` - apps/tx-broadcaster/src/services/broadcaster.ts
- `NonceManager` - apps/tx-broadcaster/src/services/nonce-manager.ts
- `SqsWorker` - apps/tx-broadcaster/src/worker/sqs-worker.ts
- `RetryService` - apps/tx-broadcaster/src/services/retry.service.ts
- `ChainConfigService` - apps/tx-broadcaster/src/services/chain-config.service.ts

### Transaction Monitor
- `MonitorService` - apps/tx-monitor/src/services/monitor.service.ts
- `WebSocketService` - apps/tx-monitor/src/services/websocket.service.ts
- `GasRetryService` - apps/tx-monitor/src/services/gas-retry.service.ts
- `PollingService` - apps/tx-monitor/src/services/polling.service.ts
- `ChainService` - apps/tx-monitor/src/services/chain.service.ts

### Database Services
- `WithdrawalRequestService` - packages/database/src/withdrawal-request-service.ts
- `UserService` - packages/database/src/user-service.ts
- `SignedSingleTransactionService` - packages/database/src/services/signed-single-transaction.service.ts
- `SignedBatchTransactionService` - packages/database/src/signed-batch-transaction-service.ts
- `SentTransactionService` - packages/database/src/services/SentTransactionService.ts

### Shared Services
- `ChainProvider` - packages/shared/src/providers/chain.provider.ts
- `ChainProviderFactory` - packages/shared/src/providers/chain-provider.factory.ts
- `NoncePoolService` - packages/shared/src/redis/nonce-pool.service.ts
- `LoggerService` - packages/shared/src/services/logger.service.ts
- `TokenService` - packages/shared/src/services/token.service.ts
- `SqsQueue` - packages/shared/src/queue/sqs-queue.ts
- `QueueFactory` - packages/shared/src/queue/queue-factory.ts

## Key Interfaces and Types

### Request Types
- `WithdrawalRequest` - Database model
- `WithdrawalRequestDto` - API DTO
- `SignedTransaction` - Signed transaction data
- `SentTransaction` - Broadcast transaction

### Queue Messages
- `SigningQueueMessage` - Signing service input
- `BroadcastQueueMessage` - Broadcaster input
- `MonitorQueueMessage` - Monitor service input

### Chain Types
- `ChainContext` - Chain configuration context
- `ChainConfig` - Chain configuration
- `SupportedChain` - Supported chains enum
- `ChainProviderOptions` - Provider options

### Error Types
- `ValidationError` - Input validation errors
- `AuthenticationError` - Auth failures
- `TransactionError` - Transaction failures
- `NetworkError` - Network issues

## Configuration Files

### Environment Variables
- `API_PORT` - API server port
- `DATABASE_URL` - MySQL connection
- `JWT_SECRET` - JWT signing key
- `AWS_REGION` - AWS configuration
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `REDIS_URL` - Redis connection
- `SQS_QUEUE_URL_*` - Queue URLs
- `CHAIN_RPC_URL_*` - Blockchain RPCs
- `WEBSOCKET_PORT` - WebSocket server port

### Configuration Objects
- `chains.config.json` - Chain configurations
- `tokens.config.json` - Token definitions
- `logger.config.ts` - Logger settings

## Test Files

### Unit Tests
- Auth tests - `apps/api-server/src/__tests__/`
- Signing tests - `apps/signing-service/src/__tests__/`
- Broadcaster tests - `apps/tx-broadcaster/src/__tests__/`
- Monitor tests - `apps/tx-monitor/src/__tests__/`
- Database tests - `packages/database/src/__tests__/`
- Shared tests - `packages/shared/src/__tests__/`

### Integration Tests
- Multi-instance tests - `signing-worker-multi-instance.test.ts`
- WebSocket tests - `websocket.service.test.ts`
- End-to-end flow - `integration.test.ts`

## Entry Points

- API Server: `apps/api-server/src/main.ts`
- Signing Service: `apps/signing-service/src/main.ts`
- TX Broadcaster: `apps/tx-broadcaster/src/main.ts`
- TX Monitor: `apps/tx-monitor/src/main.ts`
- Test Console: `apps/test-console/src/main.ts`

## Prisma Schema
- Location: `prisma/schema.prisma`
- Models: User, WithdrawalRequest, SignedSingleTransaction, SignedBatchTransaction, SentTransaction

## Docker Services
- MySQL database
- LocalStack (AWS emulation)
- SQS Admin UI
- Redis