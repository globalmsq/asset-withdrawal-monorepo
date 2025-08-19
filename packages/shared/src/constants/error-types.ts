/**
 * DLQ Error Type Constants
 *
 * Categorizes blockchain transaction errors for proper handling
 * between immediate failure and DLQ routing for recovery
 */

export const DLQ_ERROR_TYPE = {
  // Network & Connection Errors
  NETWORK: 'NETWORK', // Network connectivity issues
  TIMEOUT: 'TIMEOUT', // Request timeout

  // Nonce Errors
  NONCE_TOO_LOW: 'NONCE_TOO_LOW', // Nonce already used
  NONCE_TOO_HIGH: 'NONCE_TOO_HIGH', // Nonce gap exists

  // Gas & Fee Errors
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS', // Not enough balance for gas + value
  GAS_PRICE_TOO_LOW: 'GAS_PRICE_TOO_LOW', // Gas price below minimum
  GAS_LIMIT_EXCEEDED: 'GAS_LIMIT_EXCEEDED', // Gas limit exceeds block limit
  REPLACEMENT_UNDERPRICED: 'REPLACEMENT_UNDERPRICED', // Replacement tx gas too low

  // Execution Errors
  EXECUTION_REVERTED: 'EXECUTION_REVERTED', // Smart contract reverted
  OUT_OF_GAS: 'OUT_OF_GAS', // Transaction ran out of gas

  // Other
  INVALID_TRANSACTION: 'INVALID_TRANSACTION', // Invalid tx format/signature
  UNKNOWN: 'UNKNOWN', // Unclassified errors
} as const;

export type DLQErrorType = (typeof DLQ_ERROR_TYPE)[keyof typeof DLQ_ERROR_TYPE];

/**
 * Permanent failure error types that should be immediately marked as FAILED
 * These errors won't be resolved by retrying
 */
export const PERMANENT_FAILURE_TYPES: readonly DLQErrorType[] = [
  DLQ_ERROR_TYPE.INSUFFICIENT_FUNDS,
  DLQ_ERROR_TYPE.INVALID_TRANSACTION,
  DLQ_ERROR_TYPE.EXECUTION_REVERTED,
  DLQ_ERROR_TYPE.UNKNOWN,
];

/**
 * Check if an error type is a permanent failure
 */
export function isPermanentFailure(errorType: DLQErrorType): boolean {
  return PERMANENT_FAILURE_TYPES.includes(errorType);
}
