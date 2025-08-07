/**
 * Error Message Constants
 *
 * Common error messages used throughout the application
 * for consistency and easier maintenance
 */

export const ERROR_MESSAGES = {
  // Transaction Errors
  TRANSACTION: {
    NOT_SIGNED: 'Transaction is not signed',
    INVALID_FORMAT: 'Invalid signed transaction: expected string',
    INVALID_PREFIX: 'Signed transaction must start with 0x',
    NO_RECIPIENT: 'Transaction must have a recipient address',
    INVALID_VALUE: 'Transaction value must be non-negative',
    CHAIN_MISMATCH: (txChainId: number, expectedChainId: number) =>
      `Transaction chain ID ${txChainId} does not match expected ${expectedChainId}`,
    UNSUPPORTED_CHAIN: (chainId: number, supportedChains: number[]) =>
      `Unsupported chain ID: ${chainId}. Supported chains: ${supportedChains.join(', ')}`,
    ALREADY_EXISTS: 'Transaction already exists on blockchain',
    CONFIRMATION_TIMEOUT: 'Transaction confirmation timeout',
    BROADCAST_FAILED: 'Failed to broadcast transaction',
    PARSE_FAILED: 'Failed to parse transaction',
  },

  // Network Errors
  NETWORK: {
    NO_PROVIDER: (chainId?: number) =>
      chainId
        ? `No provider available for chain ID: ${chainId}`
        : 'No provider available',
    CONNECTION_FAILED: 'Failed to connect to network',
    STATUS_FAILED: 'Failed to get network status',
    TIMEOUT: 'Network request timeout',
  },

  // Queue Errors
  QUEUE: {
    DLQ_NOT_CONFIGURED: 'DLQ not configured, dropping message',
    SEND_TO_DLQ_FAILED: 'Failed to send message to DLQ',
    MESSAGE_PROCESSING_FAILED: 'Error processing message',
    BATCH_PROCESSING_FAILED: 'Error in batch processing',
  },

  // Worker Errors
  WORKER: {
    ALREADY_RUNNING: 'Worker is already running',
    STOPPING_TIMEOUT: (timeout: number, count: number) =>
      `Force stopping after ${timeout}ms timeout. ${count} messages may be reprocessed.`,
    SKIPPING_MESSAGE: (messageId: string) =>
      `Skipping message ${messageId} - worker is stopping`,
  },

  // Redis Errors
  REDIS: {
    CONNECTION_FAILED:
      'Failed to connect to Redis, using in-memory retry counts',
    OPERATION_FAILED: 'Redis operation failed',
    GET_RETRY_COUNT_FAILED:
      'Failed to get retry count from Redis, using in-memory',
    INCREMENT_RETRY_COUNT_FAILED:
      'Failed to increment retry count in Redis, using in-memory',
    CLEAR_RETRY_COUNT_FAILED: 'Failed to clear retry count in Redis',
    CLOSE_CONNECTION_FAILED: 'Failed to close Redis connection',
  },

  // Validation Errors
  VALIDATION: {
    INVALID_INPUT: 'Invalid input data',
    MISSING_REQUIRED_FIELD: (field: string) =>
      `Missing required field: ${field}`,
    INVALID_ADDRESS: 'Invalid address format',
    INVALID_AMOUNT: 'Invalid amount',
    EXCEEDED_LIMIT: 'Transaction exceeds limit',
  },

  // Database Errors
  DATABASE: {
    CONNECTION_FAILED: 'Failed to connect to database',
    QUERY_FAILED: 'Database query failed',
    TRANSACTION_FAILED: 'Database transaction failed',
    RECORD_NOT_FOUND: 'Record not found',
  },

  // Authentication Errors
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_EXPIRED: 'Authentication token expired',
    UNAUTHORIZED: 'Unauthorized access',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  },

  // General Errors
  GENERAL: {
    UNKNOWN_ERROR: 'Unknown error occurred',
    INTERNAL_ERROR: 'Internal server error',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  },
} as const;

// Type for error message functions
export type ErrorMessageFunction = (...args: any[]) => string;

// Type for error messages
export type ErrorMessage = string | ErrorMessageFunction;
