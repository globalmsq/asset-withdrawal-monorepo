import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { LoggerService } from 'shared';
import { Config } from '../config';
import { MetricsCollectorService } from './metrics-collector.service';

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
  private metricsInterval?: NodeJS.Timeout;
  private metricsCollector: MetricsCollectorService;

  constructor(
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {
    this.metricsCollector = new MetricsCollectorService(logger);
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

    // Start metrics logging every 5 minutes
    this.metricsInterval = setInterval(
      () => {
        this.metricsCollector.logMetricsSummary();
      },
      5 * 60 * 1000
    );
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Stopping DLQ Monitor Service');

    // Clear all polling intervals
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals = [];

    // Clear metrics interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    // Log final metrics summary
    this.metricsCollector.logMetricsSummary();
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
    const messageId = message.MessageId!;

    try {
      // Start metrics tracking
      this.metricsCollector.startMessageProcessing(messageId, queueType);

      const dlqMessage: DLQMessage = {
        id: messageId,
        queueType,
        originalMessage: JSON.parse(message.Body || '{}'),
        error: message.MessageAttributes?.error?.StringValue || 'Unknown error',
        receiptHandle: message.ReceiptHandle!,
        timestamp: new Date(),
      };

      // Extract retry count from message attributes
      const retryCount = parseInt(
        message.MessageAttributes?.retryCount?.StringValue || '0',
        10
      );

      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i++) {
          this.metricsCollector.incrementRetryCount(messageId);
        }
      }

      // TODO: Send to ErrorAnalyzer and RecoveryOrchestrator
      this.logger.info('Processing DLQ message', {
        metadata: {
          id: dlqMessage.id,
          queueType: dlqMessage.queueType,
          error: dlqMessage.error,
          retryCount,
        },
      });

      // Simulate message processing (will be replaced with actual recovery logic)
      const processSuccess = Math.random() > 0.2; // 80% success rate for testing

      if (processSuccess) {
        // For now, just delete the message after processing
        // In real implementation, this would be done after successful recovery
        await this.deleteMessage(queueUrl, message.ReceiptHandle!);

        // Mark as completed successfully
        this.metricsCollector.completeMessageProcessing(messageId, true);
      } else {
        // Simulate processing failure
        throw new Error('Simulated processing failure');
      }
    } catch (error) {
      this.logger.error('Failed to process DLQ message:', error);

      // Mark as failed with error information
      this.metricsCollector.completeMessageProcessing(
        messageId,
        false,
        'PROCESSING_ERROR',
        error instanceof Error ? error.message : String(error)
      );
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

  // Public methods for metrics access
  getMetricsCollector(): MetricsCollectorService {
    return this.metricsCollector;
  }

  getSystemMetrics() {
    return this.metricsCollector.getSystemMetrics();
  }

  getActiveMessageCount(): number {
    return this.metricsCollector.getActiveMessageCount();
  }

  getProcessingTimePercentiles() {
    return this.metricsCollector.getProcessingTimePercentiles();
  }

  logCurrentMetrics(): void {
    this.metricsCollector.logMetricsSummary();
  }
}
