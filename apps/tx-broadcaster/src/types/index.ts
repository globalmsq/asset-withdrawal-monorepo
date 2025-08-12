// Transaction status types
export type TransactionStatus =
  | 'pending'
  | 'signed'
  | 'broadcasted'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

// Blockchain transaction types
export interface BlockchainTransaction {
  hash: string;
  to: string;
  from: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  nonce: number;
  data?: string;
  chainId: number;
}

// Broadcast result types
export interface BroadcastResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  receipt?: any;
}

// Worker processing result
export interface ProcessingResult {
  success: boolean;
  shouldRetry: boolean;
  error?: string;
  result?: any;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Error types for better error handling
export class BroadcastError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'BroadcastError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Worker statistics
export interface WorkerStats {
  messagesProcessed: number;
  messagesSucceeded: number;
  messagesFailed: number;
  averageProcessingTime: number;
  uptime: number;
  lastProcessedAt?: Date;
}
