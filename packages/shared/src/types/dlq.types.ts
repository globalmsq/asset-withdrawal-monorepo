/**
 * Dead Letter Queue (DLQ) Message Types
 *
 * Defines the structure of messages sent to DLQ for failed processing
 */

import { DLQErrorType } from '../constants/error-types';

/**
 * DLQ Message structure
 * @template T The type of the original message
 */
export interface DLQMessage<T = any> {
  /**
   * The original message that failed processing
   */
  originalMessage: T;

  /**
   * Error information
   */
  error: {
    /**
     * Categorized error type
     */
    type: DLQErrorType;

    /**
     * Original error code if available (e.g., -32000 for Ethereum JSON-RPC)
     */
    code?: string;

    /**
     * Human-readable error message
     */
    message: string;

    /**
     * Additional error details (flexible key-value pairs)
     */
    details?: Record<string, any>;
  };

  /**
   * Metadata about the DLQ message
   */
  meta: {
    /**
     * When the error occurred
     */
    timestamp: string;

    /**
     * Number of processing attempts
     */
    attemptCount: number;
  };
}
