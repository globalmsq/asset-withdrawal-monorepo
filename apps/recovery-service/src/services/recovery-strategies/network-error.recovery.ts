import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { LoggerService } from 'shared';
import { Config } from '../../config';
import { DLQMessage } from '../dlq-monitor.service';
import { AnalyzedError, ErrorType } from '../error-analyzer.service';
import {
  RecoveryStrategy,
  RecoveryResult,
} from './recovery-strategy.interface';

export class NetworkErrorRecovery implements RecoveryStrategy {
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
    return error.type === ErrorType.NETWORK_ERROR && error.isRetryable;
  }

  async recover(
    message: DLQMessage,
    error: AnalyzedError
  ): Promise<RecoveryResult> {
    this.logger.info('Attempting network error recovery', {
      metadata: {
        messageId: message.id,
        queueType: message.queueType,
      },
    });

    try {
      // Determine the original queue URL based on the DLQ type
      const targetQueueUrl = this.getTargetQueueUrl(message.queueType);

      // Add delay for network recovery
      await this.delay(this.config.retry.initialDelayMs);

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
        },
      });

      await this.sqsClient.send(command);

      return {
        success: true,
        action: 'REQUEUED',
        metadata: {
          targetQueue: targetQueueUrl,
          delayMs: this.config.retry.initialDelayMs,
        },
      };
    } catch (err) {
      this.logger.error('Failed to recover from network error:', err);
      return {
        success: false,
        action: 'RECOVERY_FAILED',
        shouldRetry: true,
        reason: `Failed to requeue message: ${err}`,
      };
    }
  }

  getMaxRetryCount(): number {
    return this.config.retry.maxAttempts;
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
