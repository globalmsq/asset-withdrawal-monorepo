/**
 * Retry utility for handling temporary failures with exponential backoff
 */

import { isRetryableError } from './network-errors';
import { LoggerService } from '../services/logger.service';

const logger = new LoggerService({ service: 'RetryUtility' });

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param fn - The function to execute
 * @param options - Retry configuration options
 * @returns The result of the function if successful
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000, // 1 second
    maxDelay = 4000, // 4 seconds
    factor = 2,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to execute the function
      const result = await fn();

      // Success - return the result
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          metadata: {
            attempt,
            totalAttempts: maxRetries,
          },
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        logger.warn('Non-retryable error encountered', {
          metadata: {
            attempt,
            errorCode: (error as any)?.code,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        logger.error('All retry attempts exhausted', error, {
          metadata: {
            maxRetries,
            lastAttempt: attempt,
          },
        });
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1),
        maxDelay
      );

      logger.info('Retrying after delay', {
        metadata: {
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          errorCode: (error as any)?.code,
          errorMessage: (error as any)?.message,
        },
      });

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Simple retry without exponential backoff
 * Useful for operations that need consistent retry intervals
 */
export async function simpleRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Retry with custom condition
 * Allows more control over when to retry
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: any, attempt: number) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 4000,
    factor = 2,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check custom retry condition
      if (!shouldRetry(error, attempt) || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay
      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1),
        maxDelay
      );

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
