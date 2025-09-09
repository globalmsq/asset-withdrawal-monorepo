import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { LoggerService } from 'shared';
import { Config } from '../../config';
import { DLQMessage } from '../dlq-monitor.service';
import { AnalyzedError, ErrorType } from '../error-analyzer.service';
import {
  RecoveryStrategy,
  RecoveryResult,
} from './recovery-strategy.interface';

export class UnknownErrorRecovery implements RecoveryStrategy {
  private sqsClient: SQSClient;

  constructor(
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {
    this.sqsClient = new SQSClient({
      region: config.aws.region,
      endpoint: config.aws.endpoint,
      credentials: config.aws.accessKeyId
        ? {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey!,
          }
        : undefined,
    });
  }

  canRecover(error: AnalyzedError): boolean {
    // Unknown errors are typically retryable with a longer delay
    return error.type === ErrorType.UNKNOWN && error.isRetryable;
  }

  async recover(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    this.logger.warn('Attempting recovery for unknown error', {
      metadata: {
        messageId: message.id,
        queueType: message.queueType,
        error: error.details.originalError,
      },
    });

    try {
      // For unknown errors, we'll try a simple retry with exponential backoff
      const targetQueueUrl = this.getTargetQueueUrl(message.queueType);

      // Use a longer delay for unknown errors
      const delayMs = this.config.retry.initialDelayMs * 2;
      await this.delay(delayMs);

      // Send the message back to the original queue
      const command = new SendMessageCommand({
        QueueUrl: targetQueueUrl,
        MessageBody: JSON.stringify(message.originalMessage),
        MessageAttributes: {
          retryCount: {
            DataType: 'Number',
            StringValue: '1', // TODO: Track actual retry count
          },
          recoveryAttempt: {
            DataType: 'String',
            StringValue: new Date().toISOString(),
          },
          unknownError: {
            DataType: 'String',
            StringValue: error.details.originalError.substring(0, 256), // Limit size
          },
        },
      });

      await this.sqsClient.send(command);

      return {
        success: true,
        action: 'REQUEUED_WITH_DELAY',
        metadata: {
          targetQueue: targetQueueUrl,
          delayMs,
          errorType: 'UNKNOWN',
        },
      };
    } catch (err) {
      this.logger.error('Failed to recover from unknown error:', err);
      return {
        success: false,
        action: 'RECOVERY_FAILED',
        shouldRetry: true,
        reason: `Failed to requeue unknown error message: ${err}`,
      };
    }
  }

  getMaxRetryCount(): number {
    // Use fewer retries for unknown errors
    return Math.max(2, Math.floor(this.config.retry.maxAttempts / 2));
  }

  private getTargetQueueUrl(queueType: DLQMessage['queueType']): string {
    switch (queueType) {
      case 'tx-request':
        return this.config.queues.txRequestQueueUrl;
      case 'signed-tx':
        return this.config.queues.signedTxQueueUrl;
      case 'broadcast-tx':
        return this.config.queues.broadcastTxQueueUrl;
      default:
        throw new Error(`Unknown queue type: ${queueType}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
