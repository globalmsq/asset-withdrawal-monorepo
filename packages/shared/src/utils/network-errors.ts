/**
 * Network error detection utilities
 */

// Common network error codes
const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ECONNABORTED',
];

// Retryable error codes (temporary failures)
const RETRYABLE_ERROR_CODES = [
  ...NETWORK_ERROR_CODES,
  'EBUSY',
  'EAGAIN',
  'ETIMEOUT',
];

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;

  // Check error code
  if (error.code && NETWORK_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // Check error message for common network-related strings
  const errorMessage = error.message?.toLowerCase() || '';
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('etimedout')
  );
}

/**
 * Check if an error is retryable (temporary failure)
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;

  // Check error code
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // Network errors are generally retryable
  if (isNetworkError(error)) {
    return true;
  }

  // Check for gas-related errors
  const errorMessage = error.message?.toLowerCase() || '';
  const retryablePatterns = [
    'replacement transaction underpriced',
    'transaction underpriced',
    'gas price too low',
    'nonce too low',
    'nonce has already been used',
    'invalid nonce',
  ];

  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Get error type for logging/metrics
 */
export function getErrorType(error: any): string {
  if (!error) return 'UNKNOWN';

  const errorMessage = error.message?.toLowerCase() || '';

  // Check for network errors first
  if (isNetworkError(error)) {
    return 'NETWORK';
  }

  // Check for gas-related errors
  if (
    errorMessage.includes('gas') ||
    errorMessage.includes('underpriced') ||
    errorMessage.includes('replacement transaction')
  ) {
    return 'GAS_PRICE';
  }

  // Check for nonce-related errors
  if (errorMessage.includes('nonce')) {
    return 'NONCE';
  }

  // If it has an error code, return it
  if (error.code && typeof error.code === 'string') {
    return error.code;
  }

  return 'UNKNOWN';
}

/**
 * Extract error message for logging
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  if (error.toString && typeof error.toString === 'function') {
    return error.toString();
  }

  return JSON.stringify(error);
}
