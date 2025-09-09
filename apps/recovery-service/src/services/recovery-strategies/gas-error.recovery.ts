import { LoggerService } from 'shared';
import { Config } from '../../config';
import { DLQMessage } from '../dlq-monitor.service';
import { AnalyzedError, ErrorType } from '../error-analyzer.service';
import {
  RecoveryStrategy,
  RecoveryResult,
} from './recovery-strategy.interface';

export class GasErrorRecovery implements RecoveryStrategy {
  constructor(
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {}

  canRecover(error: AnalyzedError): boolean {
    return error.type === ErrorType.GAS_ERROR && error.isRetryable;
  }

  async recover(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    this.logger.info('Attempting gas error recovery', {
      metadata: {
        messageId: message.id,
        queueType: message.queueType,
      },
    });

    try {
      // TODO: Implement gas price adjustment logic
      // This would involve:
      // 1. Fetching current network gas prices
      // 2. Calculating appropriate gas price with buffer
      // 3. Updating the transaction with new gas parameters
      // 4. Requeuing the transaction

      this.logger.info('Gas adjustment would occur here');

      // For now, return a placeholder result
      return {
        success: false,
        action: 'GAS_ADJUSTMENT_NOT_IMPLEMENTED',
        shouldRetry: false,
        reason: 'Gas adjustment logic not yet implemented',
        metadata: {
          originalError: error.details.originalError,
        },
      };
    } catch (err) {
      this.logger.error('Failed to recover from gas error:', err);
      return {
        success: false,
        action: 'RECOVERY_FAILED',
        shouldRetry: true,
        reason: `Gas recovery failed: ${err}`,
      };
    }
  }

  getMaxRetryCount(): number {
    return this.config.retry.maxAttempts;
  }
}
