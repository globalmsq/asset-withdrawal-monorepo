import { LoggerService } from 'shared';
import { Config } from '../../config';
import { DLQMessage } from '../dlq-monitor.service';
import { AnalyzedError, ErrorType } from '../error-analyzer.service';
import {
  RecoveryStrategy,
  RecoveryResult,
} from './recovery-strategy.interface';

export class NonceErrorRecovery implements RecoveryStrategy {
  constructor(
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {}

  canRecover(error: AnalyzedError): boolean {
    return error.type === ErrorType.NONCE_ERROR;
  }

  async recover(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    this.logger.info('Attempting nonce error recovery', {
      metadata: {
        messageId: message.id,
        nonceInfo: error.details.additionalInfo,
      },
    });

    try {
      // Check if this is a "nonce too high" error that requires dummy transactions
      if (error.details.additionalInfo?.errorType === 'NONCE_TOO_HIGH') {
        return await this.handleNonceTooHigh(message, error);
      }

      // For "nonce too low" errors, we can simply retry with updated nonce
      if (error.details.additionalInfo?.errorType === 'NONCE_TOO_LOW') {
        return await this.handleNonceTooLow(message, error);
      }

      // Default handling for other nonce errors
      return {
        success: false,
        action: 'NONCE_ERROR_UNHANDLED',
        shouldRetry: true,
        reason: 'Unrecognized nonce error pattern',
      };
    } catch (err) {
      this.logger.error('Failed to recover from nonce error:', err);
      return {
        success: false,
        action: 'RECOVERY_FAILED',
        shouldRetry: false,
        reason: `Nonce recovery failed: ${err}`,
      };
    }
  }

  private async handleNonceTooHigh(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    const { expectedNonce, actualNonce } = error.details.additionalInfo || {};

    if (!this.config.recovery.enableDummyTx) {
      this.logger.warn('Dummy transaction generation is disabled');
      return {
        success: false,
        action: 'DUMMY_TX_DISABLED',
        shouldRetry: false,
        reason: 'Nonce gap detected but dummy tx generation is disabled',
        metadata: {
          expectedNonce,
          actualNonce,
          gap: actualNonce - expectedNonce,
        },
      };
    }

    // Calculate the gap
    const gap = actualNonce - expectedNonce;

    if (gap > 10) {
      this.logger.error('Nonce gap too large for automatic recovery', {
        metadata: { gap, expectedNonce, actualNonce },
      });
      return {
        success: false,
        action: 'NONCE_GAP_TOO_LARGE',
        shouldRetry: false,
        reason: `Nonce gap of ${gap} is too large for automatic recovery`,
      };
    }

    // TODO: Implement dummy transaction generation
    // This would involve:
    // 1. Loading private key from AWS Secrets Manager
    // 2. Creating dummy transactions to fill the gap
    // 3. Broadcasting them to the network
    // 4. Cleaning up sensitive data from memory

    this.logger.info('Dummy transaction generation would occur here', {
      metadata: {
        gap,
        expectedNonce,
        actualNonce,
      },
    });

    return {
      success: false,
      action: 'DUMMY_TX_NOT_IMPLEMENTED',
      shouldRetry: false,
      reason: 'Dummy transaction generation not yet implemented',
      metadata: {
        gap,
        expectedNonce,
        actualNonce,
      },
    };
  }

  private async handleNonceTooLow(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    // For nonce too low, we typically just need to retry with the current nonce
    // The transaction might have already been processed

    this.logger.info(
      'Nonce too low detected, transaction may already be processed'
    );

    // TODO: Check if the transaction was already successful
    // This would involve querying the blockchain or database

    return {
      success: true,
      action: 'NONCE_ALREADY_PROCESSED',
      metadata: {
        reason: 'Transaction with this nonce may have already been processed',
      },
    };
  }

  getMaxRetryCount(): number {
    return this.config.recovery.maxRetryAttempts;
  }
}
