import { IQueue, Message } from '@asset-withdrawal/shared';
import { Logger } from '../utils/logger';

export interface WorkerConfig {
  name: string;
  batchSize?: number;
  processingInterval?: number;
  enabled?: boolean;
}

export interface WorkerStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  processedCount: number;
  errorCount: number;
  lastProcessedAt?: Date;
  lastError?: string;
}

export abstract class BaseWorker<TInput, TOutput = void> {
  protected logger: Logger;
  protected isRunning: boolean = false;
  protected processedCount: number = 0;
  protected errorCount: number = 0;
  protected lastProcessedAt?: Date;
  protected lastError?: string;
  protected processingInterval: number;
  protected batchSize: number;
  protected intervalId?: NodeJS.Timeout;
  protected inputQueue: IQueue<TInput>;
  protected outputQueue?: IQueue<TOutput>;

  constructor(
    protected config: WorkerConfig,
    inputQueue: IQueue<TInput>,
    outputQueue?: IQueue<TOutput>
  ) {
    this.logger = new Logger(config.name);
    this.processingInterval = config.processingInterval || 5000;
    this.batchSize = config.batchSize || 10;
    this.inputQueue = inputQueue;
    this.outputQueue = outputQueue;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Worker is already running');
      return;
    }

    this.logger.info('Starting worker');
    this.isRunning = true;

    // Process immediately on start
    await this.processBatch();

    // Set up interval for continuous processing
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.processBatch();
      }
    }, this.processingInterval);
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping worker');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Wait for any ongoing processing to complete
    await this.waitForProcessingToComplete();
  }

  protected async processBatch(): Promise<void> {
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

      const promises = messages.map((message: Message<TInput>) =>
        this.processMessage(message)
      );
      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error('Error in batch processing', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;
    }
  }

  protected async processMessage(message: Message<TInput>): Promise<void> {
    try {
      this.logger.debug(`Processing message ${message.id}`);

      const result = await this.process(message.body, message.id);

      // Send to output queue if configured and result is provided
      if (this.outputQueue && result !== undefined) {
        await this.outputQueue.sendMessage(result as TOutput);
      }

      // Delete message from input queue
      await this.inputQueue.deleteMessage(message.receiptHandle);

      this.processedCount++;
      this.lastProcessedAt = new Date();
      this.logger.debug(`Message ${message.id} processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing message ${message.id}`, error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;

      // Message will be returned to queue after visibility timeout
      // or moved to DLQ after max receive count
    }
  }

  protected abstract process(
    data: TInput,
    messageId: string
  ): Promise<TOutput | void>;

  protected async waitForProcessingToComplete(): Promise<void> {
    // Simple wait - in production, track active processing
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  getStatus(): WorkerStatus {
    return {
      name: this.config.name,
      status: this.isRunning ? 'running' : 'stopped',
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      lastProcessedAt: this.lastProcessedAt,
      lastError: this.lastError,
    };
  }
}
