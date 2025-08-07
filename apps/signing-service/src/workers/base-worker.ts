import {
  IQueue,
  Message,
  QueueFactory,
  DLQMessage,
  DLQErrorType,
  ErrorClassifier,
  isPermanentFailure,
} from '@asset-withdrawal/shared';
import { Logger } from '../utils/logger';
import { SQSClientConfig } from '@aws-sdk/client-sqs';
import Redis from 'ioredis';

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
  protected inputDlqQueue?: IQueue<DLQMessage<TInput>>;
  protected outputDlqQueue?: IQueue<DLQMessage<TOutput>>;
  protected processingMessages: Set<string> = new Set();
  protected isProcessingBatch: boolean = false;
  protected maxRetries: number = 5;
  protected messageRetryCount: Map<string, number> = new Map(); // Fallback for when Redis is unavailable
  protected redisClient?: Redis;

  constructor(
    name: string,
    inputQueueUrl: string,
    outputQueueUrl: string | undefined,
    sqsConfig: SQSClientConfig,
    logger?: Logger,
    dlqUrls?: { inputDlqUrl?: string; outputDlqUrl?: string },
    redisConfig?: { host: string; port: number; password?: string }
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

    // Initialize Redis client if config provided
    if (redisConfig) {
      this.initializeRedis(redisConfig);
    }
  }

  /**
   * Initialize Redis client for retry count persistence
   */
  private async initializeRedis(config: {
    host: string;
    port: number;
    password?: string;
  }): Promise<void> {
    try {
      this.redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redisClient.on('error', (error: Error) => {
        this.logger.error('Redis error in BaseWorker', {
          error: error.message,
        });
        // Continue operating with in-memory fallback
      });

      await this.redisClient.connect();
      this.logger.info('Redis connected for retry count management');
    } catch (error) {
      this.logger.warn(
        'Failed to connect to Redis, using in-memory retry counts',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // Continue without Redis - use in-memory Map as fallback
    }
  }

  /**
   * Get retry count for a message - uses Redis if available, falls back to in-memory Map
   */
  protected async getRetryCount(messageId: string): Promise<number> {
    if (this.redisClient) {
      try {
        const count = await this.redisClient.get(`retry:${messageId}`);
        return count ? parseInt(count, 10) : 0;
      } catch (error) {
        this.logger.warn(
          'Failed to get retry count from Redis, using in-memory',
          {
            messageId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
    // Fallback to in-memory Map
    return this.messageRetryCount.get(messageId) || 0;
  }

  /**
   * Increment retry count for a message - uses Redis if available, falls back to in-memory Map
   */
  protected async incrementRetryCount(messageId: string): Promise<number> {
    if (this.redisClient) {
      try {
        // Set expiry to 1 hour to auto-cleanup old retry counts
        const newCount = await this.redisClient.incr(`retry:${messageId}`);
        await this.redisClient.expire(`retry:${messageId}`, 3600);
        return newCount;
      } catch (error) {
        this.logger.warn(
          'Failed to increment retry count in Redis, using in-memory',
          {
            messageId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
    // Fallback to in-memory Map
    const currentCount = this.messageRetryCount.get(messageId) || 0;
    const newCount = currentCount + 1;
    this.messageRetryCount.set(messageId, newCount);
    return newCount;
  }

  /**
   * Clear retry count for a message - uses Redis if available, falls back to in-memory Map
   */
  protected async clearRetryCount(messageId: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(`retry:${messageId}`);
      } catch (error) {
        this.logger.warn('Failed to clear retry count in Redis', {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // Also clear from in-memory Map
    this.messageRetryCount.delete(messageId);
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

    // Close Redis connection if exists
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.logger.info('Redis connection closed');
      } catch (error) {
        this.logger.warn('Failed to close Redis connection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
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

    // Track retry count using Redis or in-memory fallback
    const retryCount = await this.incrementRetryCount(messageId);

    // Classify the error
    const errorInfo = ErrorClassifier.classifyError(error);

    // Check if it's a permanent failure or max retries exceeded
    if (isPermanentFailure(errorInfo.type) || retryCount >= this.maxRetries) {
      this.logger.warn(`Sending message to DLQ`, {
        messageId,
        errorType: errorInfo.type,
        retryCount,
        isPermanent: isPermanentFailure(errorInfo.type),
      });

      // Send to DLQ
      await this.sendToDLQ(message, error, retryCount);

      // Delete message from input queue
      await this.inputQueue.deleteMessage(message.receiptHandle);

      // Clear retry count
      await this.clearRetryCount(messageId);
    }
    // Otherwise, message will be returned to queue after visibility timeout
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
    }
  }
}
