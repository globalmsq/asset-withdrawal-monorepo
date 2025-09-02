import {
  IQueue,
  Message,
  QueueFactory,
  DLQMessage,
  DLQErrorType,
  ErrorClassifier,
} from '@asset-withdrawal/shared';
import { Logger } from '../utils/logger';
import { SQSClientConfig } from '@aws-sdk/client-sqs';

export abstract class BaseWorker<TInput, TOutput = void> {
  public readonly name: string;
  public isRunning: boolean = false;
  public processedCount: number = 0;
  public errorCount: number = 0;

  protected logger: Logger;
  protected lastProcessedAt?: Date;
  protected lastError?: string;
  protected processingInterval: number = 5000;
  protected batchSize: number = 10;
  protected inputQueue: IQueue<TInput>;
  protected outputQueue?: IQueue<TOutput>;
  protected inputDlqQueue?: IQueue<DLQMessage<TInput>>;
  protected outputDlqQueue?: IQueue<DLQMessage<TOutput>>;
  protected processingMessages: Set<string> = new Set();
  protected isProcessingBatch: boolean = false;
  private processLoopPromise?: Promise<void>;

  constructor(
    name: string,
    inputQueueUrl: string,
    outputQueueUrl: string | undefined,
    sqsConfig: SQSClientConfig,
    logger?: Logger,
    dlqUrls?: { inputDlqUrl?: string; outputDlqUrl?: string }
  ) {
    this.name = name;
    this.logger =
      logger ||
      new Logger({
        logging: {
          level: 'info',
          auditLogPath: './logs/audit.log',
        },
      } as any); // Logger will be provided by signing worker

    const region =
      typeof sqsConfig.region === 'string'
        ? sqsConfig.region
        : 'ap-northeast-2';
    const endpoint =
      typeof sqsConfig.endpoint === 'string' ? sqsConfig.endpoint : undefined;

    let accessKeyId: string | undefined;
    let secretAccessKey: string | undefined;

    if (
      sqsConfig.credentials &&
      typeof sqsConfig.credentials === 'object' &&
      'accessKeyId' in sqsConfig.credentials
    ) {
      accessKeyId = sqsConfig.credentials.accessKeyId;
      secretAccessKey = sqsConfig.credentials.secretAccessKey;
    }

    // Extract queue name from URL (last part after /)
    const inputQueueName = inputQueueUrl.split('/').pop() || inputQueueUrl;

    this.inputQueue = QueueFactory.create<TInput>({
      queueName: inputQueueName,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    });

    if (outputQueueUrl) {
      const outputQueueName = outputQueueUrl.split('/').pop() || outputQueueUrl;
      this.outputQueue = QueueFactory.create<TOutput>({
        queueName: outputQueueName,
        region,
        endpoint,
        accessKeyId,
        secretAccessKey,
      });
    }

    // Initialize DLQ queues if URLs are provided
    if (dlqUrls?.inputDlqUrl) {
      const inputDlqName =
        dlqUrls.inputDlqUrl.split('/').pop() || dlqUrls.inputDlqUrl;
      this.inputDlqQueue = QueueFactory.create<DLQMessage<TInput>>({
        queueName: inputDlqName,
        region,
        endpoint,
        accessKeyId,
        secretAccessKey,
      });
    }

    if (dlqUrls?.outputDlqUrl) {
      const outputDlqName =
        dlqUrls.outputDlqUrl.split('/').pop() || dlqUrls.outputDlqUrl;
      this.outputDlqQueue = QueueFactory.create<DLQMessage<TOutput>>({
        queueName: outputDlqName,
        region,
        endpoint,
        accessKeyId,
        secretAccessKey,
      });
    }
  }

  async initialize(): Promise<void> {
    // Override in subclass if needed
  }

  async start(delayFirstBatch: boolean = false): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Worker is already running');
      return;
    }

    this.logger.info('Starting worker');
    this.isRunning = true;

    // Start the process loop
    this.processLoopPromise = this.processLoop(delayFirstBatch);
  }

  /**
   * Process loop that prevents overlap between batch processing
   */
  private async processLoop(delayFirstBatch: boolean = false): Promise<void> {
    // Initial delay if requested
    if (delayFirstBatch) {
      this.logger.info('Delaying first batch processing by interval time');
      await new Promise(resolve =>
        setTimeout(resolve, this.processingInterval)
      );
    }

    while (this.isRunning) {
      try {
        // Check if we can process (will be overridden in SigningWorker)
        if (await this.canProcess()) {
          await this.processBatch();
        } else {
          this.logger.debug(
            'Skipping batch processing - canProcess returned false'
          );
        }
      } catch (error) {
        this.logger.error('Error in process loop', error);
        this.errorCount++;
      }

      // Wait for the next interval
      if (this.isRunning) {
        await new Promise(resolve =>
          setTimeout(resolve, this.processingInterval)
        );
      }
    }
  }

  /**
   * Check if the worker can process messages
   * Override in subclass to add custom conditions (e.g., blockchain connection check)
   */
  protected async canProcess(): Promise<boolean> {
    return true;
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping worker gracefully');
    this.isRunning = false;

    // Wait for process loop to finish
    if (this.processLoopPromise) {
      await this.processLoopPromise;
      this.processLoopPromise = undefined;
    }

    // Wait for current batch to complete
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.isProcessingBatch || this.processingMessages.size > 0) {
      if (Date.now() - startTime > maxWaitTime) {
        this.logger.warn(
          `Force stopping after ${maxWaitTime}ms timeout. ${this.processingMessages.size} messages may be reprocessed.`
        );
        break;
      }

      this.logger.info(
        `Waiting for ${this.processingMessages.size} messages to complete processing...`
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.logger.info('Worker stopped gracefully');
  }

  protected async processBatch(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isProcessingBatch = true;

    try {
      const messages = await this.inputQueue.receiveMessages({
        maxMessages: this.batchSize,
        waitTimeSeconds: 20, // Long polling
        // visibilityTimeout is configured at queue level
      });

      if (messages.length === 0) {
        return;
      }

      this.logger.info(`Processing batch of ${messages.length} messages`);

      // Process messages in parallel with proper tracking
      const messagePromises = messages.map(async message => {
        const messageId = message.id || message.receiptHandle;
        this.processingMessages.add(messageId);

        try {
          if (!this.isRunning) {
            this.logger.warn(
              `Skipping message ${messageId} - worker is stopping`
            );
            return;
          }

          const result = await this.processMessage(message.body);

          // Send to output queue if configured and result is provided
          if (this.outputQueue && result !== undefined) {
            await this.outputQueue.sendMessage(result as TOutput);
          }

          // Delete message from input queue only if still running
          if (this.isRunning) {
            await this.inputQueue.deleteMessage(message.receiptHandle);
            this.processedCount++;
            this.lastProcessedAt = new Date();
          }
        } catch (error) {
          this.logger.error(`Error processing message ${messageId}`, error);
          this.lastError =
            error instanceof Error ? error.message : 'Unknown error';
          this.errorCount++;

          // Handle DLQ for failed messages
          await this.handleMessageFailure(message, error);
        } finally {
          this.processingMessages.delete(messageId);
        }
      });

      // Wait for all messages in the batch to complete
      await Promise.all(messagePromises);
    } catch (error) {
      this.logger.error('Error in batch processing', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;
    } finally {
      this.isProcessingBatch = false;
    }
  }

  protected abstract processMessage(data: TInput): Promise<TOutput | null>;

  protected async handleMessageFailure(
    message: Message<TInput>,
    error: any
  ): Promise<void> {
    const messageId = message.id || message.receiptHandle;

    // ALL errors go to DLQ immediately - simple and intuitive
    this.logger.warn(`Sending message to DLQ due to error`, {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      // Send to DLQ
      await this.sendToDLQ(message, error, 1);

      // Only delete message if DLQ send succeeded
      await this.inputQueue.deleteMessage(message.receiptHandle);

      this.logger.info(
        'Message successfully moved to DLQ and deleted from main queue',
        {
          messageId,
        }
      );
    } catch (dlqError) {
      // Failed to send to DLQ - DO NOT delete the message
      this.logger.error(
        'Failed to move message to DLQ, will retry via SQS visibility timeout',
        {
          messageId,
          error:
            dlqError instanceof Error ? dlqError.message : String(dlqError),
        }
      );
      // Message will be retried when visibility timeout expires
      // Do NOT delete from main queue to prevent message loss
    }
  }

  protected async sendToDLQ(
    message: Message<TInput>,
    error: any,
    attemptCount: number
  ): Promise<void> {
    if (!this.inputDlqQueue) {
      this.logger.error('DLQ not configured, dropping message', {
        messageId: message.id || message.receiptHandle,
      });
      return;
    }

    try {
      const errorInfo = ErrorClassifier.classifyError(error);

      const dlqMessage: DLQMessage<TInput> = {
        originalMessage: message.body,
        error: {
          type: errorInfo.type,
          code: errorInfo.code,
          message:
            typeof error === 'string'
              ? error
              : error?.message || error?.toString() || 'Unknown error',
          details: errorInfo.details,
        },
        meta: {
          timestamp: new Date().toISOString(),
          attemptCount,
        },
      };

      await this.inputDlqQueue.sendMessage(dlqMessage);

      this.logger.info('Message sent to DLQ', {
        messageId: message.id || message.receiptHandle,
        errorType: errorInfo.type,
      });
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ', dlqError, {
        messageId: message.id || message.receiptHandle,
      });
      // Re-throw error to prevent message loss
      // Caller must handle this error and avoid deleting the message
      throw dlqError;
    }
  }
}
