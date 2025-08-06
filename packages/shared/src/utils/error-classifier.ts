/**
 * Error Classifier Utility
 *
 * Classifies blockchain and transaction errors into DLQ error types
 * for proper routing and handling
 */

import { DLQ_ERROR_TYPE, DLQErrorType } from '../constants/error-types';

export interface ClassifiedError {
  type: DLQErrorType;
  code?: string;
  details?: Record<string, any>;
}

export class ErrorClassifier {
  /**
   * Classify an error into a DLQ error type
   * Analyzes error codes and messages to determine the appropriate category
   */
  static classifyError(error: any): ClassifiedError {
    const message = error?.message?.toLowerCase() || '';
    const code = error?.code;

    // First, check Ethers.js error codes
    if (code) {
      const classified = this.classifyByCode(code);
      if (classified) {
        return { ...classified, code };
      }
    }

    // Then, check error message patterns
    const classified = this.classifyByMessage(message);
    if (classified) {
      return classified;
    }

    // Check for JSON-RPC error codes
    if (error?.error?.code) {
      const jsonRpcClassified = this.classifyByJsonRpcCode(
        error.error.code,
        error.error.message
      );
      if (jsonRpcClassified) {
        return jsonRpcClassified;
      }
    }

    // If we can't classify it, mark as UNKNOWN
    return {
      type: DLQ_ERROR_TYPE.UNKNOWN,
      details: {
        originalError: error?.toString() || 'Unknown error',
        message: error?.message,
        code: error?.code,
      },
    };
  }

  /**
   * Classify by Ethers.js error codes
   */
  private static classifyByCode(code: string): ClassifiedError | null {
    switch (code) {
      // Funds errors
      case 'INSUFFICIENT_FUNDS':
        return { type: DLQ_ERROR_TYPE.INSUFFICIENT_FUNDS };

      // Nonce errors
      case 'NONCE_EXPIRED':
        return { type: DLQ_ERROR_TYPE.NONCE_TOO_LOW };

      // Gas errors
      case 'REPLACEMENT_UNDERPRICED':
        return { type: DLQ_ERROR_TYPE.REPLACEMENT_UNDERPRICED };

      case 'UNPREDICTABLE_GAS_LIMIT':
        return { type: DLQ_ERROR_TYPE.GAS_LIMIT_EXCEEDED };

      // Network errors
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
      case 'PROVIDER_ERROR':
        return { type: DLQ_ERROR_TYPE.NETWORK };

      case 'TIMEOUT':
        return { type: DLQ_ERROR_TYPE.TIMEOUT };

      // Invalid transaction
      case 'INVALID_ARGUMENT':
      case 'MISSING_ARGUMENT':
      case 'UNEXPECTED_ARGUMENT':
      case 'VALUE_MISMATCH':
        return { type: DLQ_ERROR_TYPE.INVALID_TRANSACTION };

      default:
        return null;
    }
  }

  /**
   * Classify by error message patterns
   */
  private static classifyByMessage(message: string): ClassifiedError | null {
    // Insufficient funds patterns
    if (
      message.includes('insufficient funds') ||
      message.includes('insufficient balance')
    ) {
      return { type: DLQ_ERROR_TYPE.INSUFFICIENT_FUNDS };
    }

    // Nonce patterns
    if (
      message.includes('nonce too low') ||
      message.includes('nonce expired') ||
      message.includes('old nonce') ||
      message.includes('stale nonce')
    ) {
      return { type: DLQ_ERROR_TYPE.NONCE_TOO_LOW };
    }

    if (message.includes('nonce too high') || message.includes('nonce gap')) {
      return { type: DLQ_ERROR_TYPE.NONCE_TOO_HIGH };
    }

    // Gas price patterns
    if (
      message.includes('transaction underpriced') ||
      message.includes('gas price too low') ||
      message.includes('gas price below')
    ) {
      return { type: DLQ_ERROR_TYPE.GAS_PRICE_TOO_LOW };
    }

    if (
      message.includes('replacement underpriced') ||
      message.includes('replacement fee too low')
    ) {
      return { type: DLQ_ERROR_TYPE.REPLACEMENT_UNDERPRICED };
    }

    // Gas limit patterns
    if (
      message.includes('gas limit exceeded') ||
      message.includes('exceeds block gas limit') ||
      message.includes('gas required exceeds')
    ) {
      return { type: DLQ_ERROR_TYPE.GAS_LIMIT_EXCEEDED };
    }

    if (
      message.includes('out of gas') ||
      message.includes('intrinsic gas too low')
    ) {
      return { type: DLQ_ERROR_TYPE.OUT_OF_GAS };
    }

    // Execution patterns
    if (
      message.includes('execution reverted') ||
      message.includes('transaction reverted') ||
      message.includes('revert')
    ) {
      return { type: DLQ_ERROR_TYPE.EXECUTION_REVERTED };
    }

    // Network patterns
    if (
      message.includes('network error') ||
      message.includes('connection error') ||
      message.includes('server error') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable')
    ) {
      return { type: DLQ_ERROR_TYPE.NETWORK };
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return { type: DLQ_ERROR_TYPE.TIMEOUT };
    }

    // Invalid transaction patterns
    if (
      message.includes('invalid signature') ||
      message.includes('invalid transaction') ||
      message.includes('invalid argument') ||
      message.includes('invalid address')
    ) {
      return { type: DLQ_ERROR_TYPE.INVALID_TRANSACTION };
    }

    return null;
  }

  /**
   * Classify by JSON-RPC error codes
   */
  private static classifyByJsonRpcCode(
    code: number,
    message?: string
  ): ClassifiedError | null {
    // Standard JSON-RPC error codes
    switch (code) {
      case -32000: // Generic transaction error
        // Need to check message for specific error
        if (message) {
          const lowerMessage = message.toLowerCase();
          if (lowerMessage.includes('insufficient funds')) {
            return {
              type: DLQ_ERROR_TYPE.INSUFFICIENT_FUNDS,
              code: String(code),
            };
          }
          if (lowerMessage.includes('nonce too low')) {
            return { type: DLQ_ERROR_TYPE.NONCE_TOO_LOW, code: String(code) };
          }
          if (lowerMessage.includes('nonce too high')) {
            return { type: DLQ_ERROR_TYPE.NONCE_TOO_HIGH, code: String(code) };
          }
          if (lowerMessage.includes('underpriced')) {
            return {
              type: DLQ_ERROR_TYPE.GAS_PRICE_TOO_LOW,
              code: String(code),
            };
          }
        }
        return { type: DLQ_ERROR_TYPE.UNKNOWN, code: String(code) };

      case -32003: // Transaction rejected
        return { type: DLQ_ERROR_TYPE.INVALID_TRANSACTION, code: String(code) };

      case -32010: // Transaction cost exceeds gas limit
        return { type: DLQ_ERROR_TYPE.GAS_LIMIT_EXCEEDED, code: String(code) };

      case -32015: // VM execution error
      case 3: // Execution error
        return { type: DLQ_ERROR_TYPE.EXECUTION_REVERTED, code: String(code) };

      default:
        return null;
    }
  }
}
