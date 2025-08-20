// Database service exports
export { DatabaseService } from './database';
export type { DatabaseConfig } from './database';
export { UserService } from './user-service';
export { WithdrawalRequestService } from './withdrawal-request-service';
export type { WithdrawalRequest } from './withdrawal-request-service';
export { SignedSingleTransactionService } from './services/signed-single-transaction.service';
export type {
  CreateSignedTransactionDto,
  UpdateSignedTransactionDto,
} from './services/signed-single-transaction.service';
export { SignedBatchTransactionService } from './signed-batch-transaction-service';
export type { SignedBatchTransaction } from './signed-batch-transaction-service';
export { SentTransactionService } from './services/SentTransactionService';
export type {
  CreateSentTransactionInput,
  UpdateSentTransactionInput,
} from './services/SentTransactionService';

// Prisma client export for direct use if needed
export { PrismaClient } from '@prisma/client';

// Backward compatibility aliases (to be removed in future)
export { SignedSingleTransactionService as SignedTransactionService } from './services/signed-single-transaction.service';
export { SignedBatchTransactionService as BatchTransactionService } from './signed-batch-transaction-service';
export type { SignedBatchTransaction as BatchTransaction } from './signed-batch-transaction-service';
