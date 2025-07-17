import { IQueue, Message, QueueFactory } from '@asset-withdrawal/shared';
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
  protected intervalId?: NodeJS.Timeout;
  protected inputQueue: IQueue<TInput>;
  protected outputQueue?: IQueue<TOutput>;
  protected processingMessages: Set<string> = new Set();
  protected isProcessingBatch: boolean = false;

  constructor(
    name: string,
    inputQueueUrl: string,
    outputQueueUrl: string | undefined,
    sqsConfig: SQSClientConfig,
    logger?: Logger
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

    // Process immediately on start unless delayed
    if (!delayFirstBatch) {
      await this.processBatch();
    } else {
      this.logger.info('Delaying first batch processing by interval time');
    }

    // Set up interval for continuous processing
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.processBatch();
      }
    }, this.processingInterval);
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping worker gracefully');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Wait for current batch to complete
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.isProcessingBatch || this.processingMessages.size > 0) {
      if (Date.now() - startTime > maxWaitTime) {
        this.logger.warn(`Force stopping after ${maxWaitTime}ms timeout. ${this.processingMessages.size} messages may be reprocessed.`);
        break;
      }

      this.logger.info(`Waiting for ${this.processingMessages.size} messages to complete processing...`);
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
        visibilityTimeout: 300, // 5 minutes
      });

      if (messages.length === 0) {
        return;
      }

      this.logger.info(`Processing batch of ${messages.length} messages`);

      // Process messages in parallel with proper tracking
      const messagePromises = messages.map(async (message) => {
        const messageId = message.id || message.receiptHandle;
        this.processingMessages.add(messageId);

        try {
          if (!this.isRunning) {
            this.logger.warn(`Skipping message ${messageId} - worker is stopping`);
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
          // Message will be returned to queue after visibility timeout
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
}
