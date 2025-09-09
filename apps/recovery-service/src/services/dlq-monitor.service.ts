import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { LoggerService } from 'shared';
import { Config } from '../config';

export interface DLQMessage {
  id: string;
  queueType: 'tx-request' | 'signed-tx' | 'broadcast-tx';
  originalMessage: any;
  error: any;
  receiptHandle: string;
  timestamp: Date;
}

export class DLQMonitorService {
  private sqsClient: SQSClient;
  private isRunning = false;
  private pollingIntervals: NodeJS.Timeout[] = [];

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

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('DLQ Monitor is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting DLQ Monitor Service');

    // Start monitoring all three DLQs
    this.startQueueMonitoring('tx-request', this.config.dlq.txRequestDlqUrl);
    this.startQueueMonitoring('signed-tx', this.config.dlq.signedTxDlqUrl);
    this.startQueueMonitoring(
      'broadcast-tx',
      this.config.dlq.broadcastTxDlqUrl
    );
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Stopping DLQ Monitor Service');

    // Clear all polling intervals
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals = [];
  }

  private startQueueMonitoring(
    queueType: DLQMessage['queueType'],
    queueUrl: string
  ): void {
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.pollQueue(queueType, queueUrl);
      } catch (error) {
        this.logger.error(`Error polling ${queueType} DLQ:`, error);
      }
    }, this.config.recovery.pollingInterval);

    this.pollingIntervals.push(interval);

    // Immediately poll once on start
    this.pollQueue(queueType, queueUrl).catch(error =>
      this.logger.error(`Initial poll failed for ${queueType}:`, error)
    );
  }

  private async pollQueue(
    queueType: DLQMessage['queueType'],
    queueUrl: string
  ): Promise<void> {
    this.logger.debug(`Polling ${queueType} DLQ...`);

    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: this.config.recovery.batchSize,
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: 300, // 5 minutes to process
    });

    const response = await this.sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return;
    }

    this.logger.info(
      `Received ${response.Messages.length} messages from ${queueType} DLQ`
    );

    for (const message of response.Messages) {
      await this.processMessage(queueType, queueUrl, message);
    }
  }

  private async processMessage(
    queueType: DLQMessage['queueType'],
    queueUrl: string,
    message: Message
  ): Promise<void> {
    try {
      const dlqMessage: DLQMessage = {
        id: message.MessageId!,
        queueType,
        originalMessage: JSON.parse(message.Body || '{}'),
        error: message.MessageAttributes?.error?.StringValue || 'Unknown error',
        receiptHandle: message.ReceiptHandle!,
        timestamp: new Date(),
      };

      // TODO: Send to ErrorAnalyzer and RecoveryOrchestrator
      this.logger.info('Processing DLQ message', {
        metadata: {
          id: dlqMessage.id,
          queueType: dlqMessage.queueType,
          error: dlqMessage.error,
        },
      });

      // For now, just delete the message after processing
      // In real implementation, this would be done after successful recovery
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
    } catch (error) {
      this.logger.error('Failed to process DLQ message:', error);
    }
  }

  private async deleteMessage(
    queueUrl: string,
    receiptHandle: string
  ): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await this.sqsClient.send(command);
  }
}
