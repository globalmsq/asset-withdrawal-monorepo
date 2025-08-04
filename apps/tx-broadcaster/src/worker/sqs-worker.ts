import { config, validateConfig } from '../config';
import {
  getRedisClient,
  BroadcastRedisService,
  closeRedisClient,
} from '../services/redis-client';
import {
  QueueService,
  SignedTransactionMessage,
  UnifiedSignedTransactionMessage,
  BroadcastResultMessage,
  UnifiedBroadcastResultMessage,
  QueueMessage,
} from '../services/queue-client';
import { TransactionBroadcaster } from '../services/broadcaster';
import { ProcessingResult, WorkerStats } from '../types';

export class SQSWorker {
  private queueService: QueueService;
  private broadcaster: TransactionBroadcaster;
  private redisService: BroadcastRedisService | null = null;
  private isRunning = false;
  private stats: WorkerStats;

  constructor() {
    this.queueService = new QueueService();
    this.broadcaster = new TransactionBroadcaster();
    this.stats = {
      messagesProcessed: 0,
      messagesSucceeded: 0,
      messagesFailed: 0,
      averageProcessingTime: 0,
      uptime: Date.now(),
    };
  }

  async start(): Promise<void> {
    try {
      console.log('[tx-broadcaster] Starting SQS Worker...');

      // Validate configuration
      validateConfig();

      // Initialize Redis
      const redis = await getRedisClient();
      this.redisService = new BroadcastRedisService(redis);

      // Test blockchain connection
      await this.testConnections();

      this.isRunning = true;
      console.log('[tx-broadcaster] SQS Worker started successfully');

      // Start processing loop
      await this.processLoop();
    } catch (error) {
      console.error('[tx-broadcaster] Failed to start SQS Worker:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('[tx-broadcaster] Stopping SQS Worker...');
    this.isRunning = false;
    await closeRedisClient();
    console.log('[tx-broadcaster] SQS Worker stopped');
  }

  private async testConnections(): Promise<void> {
    try {
      // Test blockchain connection (default environment provider)
      const networkStatus = await this.broadcaster.getNetworkStatus();
      console.log(
        `[tx-broadcaster] Connected to default blockchain - Chain ID: ${networkStatus.chainId}, Block: ${networkStatus.blockNumber}`
      );

      // Test Redis connection
      if (this.redisService) {
        await this.redisService.cleanup();
        console.log('[tx-broadcaster] Redis connection verified');
      }
    } catch (error) {
      throw new Error(
        `Connection test failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Receive messages from the queue
        const messages =
          await this.queueService.receiveMessages<SignedTransactionMessage>(
            config.TX_REQUEST_QUEUE_URL,
            5, // Process up to 5 messages at once
            20 // Long polling for 20 seconds
          );

        if (messages.length === 0) {
          continue; // No messages, continue polling
        }

        console.log(`[tx-broadcaster] Received ${messages.length} messages`);

        // Process messages concurrently
        const processingPromises = messages.map(message =>
          this.processMessage(message)
        );

        await Promise.allSettled(processingPromises);
      } catch (error) {
        console.error('[tx-broadcaster] Error in processing loop:', error);
        // Wait a bit before retrying to avoid tight error loops
        await this.sleep(5000);
      }
    }
  }

  private async processMessage(message: QueueMessage<any>): Promise<void> {
    const startTime = Date.now();
    let result: ProcessingResult;

    try {
      // Detect message type and convert to unified format
      const unifiedMessage = this.convertToUnifiedMessage(message.body);
      const identifierText =
        unifiedMessage.transactionType === 'SINGLE'
          ? `withdrawal ${unifiedMessage.withdrawalId}`
          : `batch ${unifiedMessage.batchId}`;

      console.log(
        `[tx-broadcaster] Processing ${unifiedMessage.transactionType} message ${message.id} for ${identifierText}`
      );

      result = await this.handleUnifiedTransaction(unifiedMessage);

      if (result.success) {
        // Delete message from queue on success
        await this.queueService.deleteMessage(
          config.TX_REQUEST_QUEUE_URL,
          message.receiptHandle
        );
        this.updateStats(true, Date.now() - startTime);
        console.log(
          `[tx-broadcaster] Successfully processed message ${message.id}`
        );
      } else {
        // Handle retry logic
        await this.handleFailure(message, result);
        this.updateStats(false, Date.now() - startTime);
      }
    } catch (error) {
      console.error(
        `[tx-broadcaster] Unexpected error processing message ${message.id}:`,
        error
      );
      result = {
        success: false,
        shouldRetry: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      await this.handleFailure(message, result);
      this.updateStats(false, Date.now() - startTime);
    }
  }

  // Convert old message format to unified format
  private convertToUnifiedMessage(
    message: any
  ): UnifiedSignedTransactionMessage {
    // Check if it's already in unified format
    if ('transactionType' in message) {
      return message as UnifiedSignedTransactionMessage;
    }

    // Convert old SignedTransactionMessage to unified format
    const oldMessage = message as SignedTransactionMessage;
    return {
      id: oldMessage.id,
      transactionType: 'SINGLE',
      withdrawalId: oldMessage.withdrawalId,
      userId: oldMessage.userId,
      transactionHash: oldMessage.transactionHash,
      signedTransaction: oldMessage.signedTransaction,
      chainId: oldMessage.chainId,
      metadata: {
        toAddress: oldMessage.toAddress,
        amount: oldMessage.amount,
        tokenAddress: oldMessage.tokenAddress,
      },
      createdAt: oldMessage.createdAt,
    };
  }

  private async handleUnifiedTransaction(
    txMessage: UnifiedSignedTransactionMessage
  ): Promise<ProcessingResult> {
    try {
      const { transactionHash, signedTransaction, chainId } = txMessage;

      // Check if already processed using Redis
      if (this.redisService) {
        // Check if already broadcasted
        if (await this.redisService.isBroadcasted(transactionHash)) {
          console.log(
            `[tx-broadcaster] Transaction ${transactionHash} already broadcasted, skipping`
          );
          return { success: true, shouldRetry: false };
        }

        // Set processing lock
        const lockAcquired =
          await this.redisService.setProcessing(transactionHash);
        if (!lockAcquired) {
          console.log(
            `[tx-broadcaster] Transaction ${transactionHash} is being processed by another worker, skipping`
          );
          return { success: true, shouldRetry: false }; // Another worker is handling it
        }
      }

      try {
        console.log(
          `[tx-broadcaster] Processing transaction for chain ID: ${chainId}`
        );

        // Validate transaction with expected chain ID
        const validation = await this.broadcaster.validateTransaction(
          signedTransaction,
          chainId
        );
        if (!validation.valid) {
          return {
            success: false,
            shouldRetry: false,
            error: `Transaction validation failed: ${validation.error}`,
          };
        }

        // Check if transaction already exists on blockchain
        const exists = await this.broadcaster.transactionExists(
          transactionHash,
          chainId
        );
        if (exists) {
          console.log(
            `[tx-broadcaster] Transaction ${transactionHash} already exists on chain ${chainId}`
          );

          // Mark as broadcasted in Redis
          if (this.redisService) {
            await this.redisService.markBroadcasted(transactionHash);
          }

          // Send success message to next queue
          await this.sendBroadcastResult(txMessage, {
            success: true,
            transactionHash,
          });

          return { success: true, shouldRetry: false };
        }

        // Broadcast transaction with state management
        let broadcastResult;
        if (txMessage.transactionType === 'SINGLE') {
          // Use single transaction state management
          broadcastResult = await this.broadcaster.broadcastTransactionWithStateManagement(
            txMessage.withdrawalId,
            signedTransaction,
            chainId
          );
        } else {
          // Use batch transaction state management
          broadcastResult = await this.broadcaster.broadcastBatchTransactionWithStateManagement(
            txMessage.batchId!,
            signedTransaction,
            chainId
          );
        }

        if (broadcastResult.success) {
          // Mark as broadcasted in Redis
          if (this.redisService) {
            await this.redisService.markBroadcasted(
              transactionHash,
              broadcastResult.transactionHash
            );
          }

          // Send success result to next queue
          await this.sendBroadcastResult(txMessage, broadcastResult);

          return { success: true, shouldRetry: false, result: broadcastResult };
        } else {
          // Send failure result to next queue
          await this.sendBroadcastResult(txMessage, broadcastResult);

          return {
            success: false,
            shouldRetry: this.isRetryableError(broadcastResult.error),
            error: broadcastResult.error,
          };
        }
      } finally {
        // Remove processing lock
        if (this.redisService) {
          await this.redisService.removeProcessing(transactionHash);
        }
      }
    } catch (error) {
      return {
        success: false,
        shouldRetry: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async sendBroadcastResult(
    originalMessage: UnifiedSignedTransactionMessage,
    broadcastResult: {
      success: boolean;
      transactionHash?: string;
      error?: string;
    }
  ): Promise<void> {
    // Create unified result message
    const resultMessage: UnifiedBroadcastResultMessage = {
      id: originalMessage.id,
      transactionType: originalMessage.transactionType,
      withdrawalId: originalMessage.withdrawalId,
      batchId: originalMessage.batchId,
      userId: originalMessage.userId,
      originalTransactionHash: originalMessage.transactionHash,
      broadcastTransactionHash: broadcastResult.transactionHash,
      status: broadcastResult.success ? 'broadcasted' : 'failed',
      error: broadcastResult.error,
      broadcastedAt: broadcastResult.success
        ? new Date().toISOString()
        : undefined,
      metadata:
        originalMessage.transactionType === 'BATCH' &&
        originalMessage.metadata?.requestIds
          ? { affectedRequests: originalMessage.metadata.requestIds }
          : undefined,
    };

    await this.queueService.sendToBroadcastQueue(resultMessage);
  }

  private async handleFailure(
    message: QueueMessage<any>,
    result: ProcessingResult
  ): Promise<void> {
    if (!result.shouldRetry || !this.redisService) {
      // Delete message if not retryable or Redis not available
      await this.queueService.deleteMessage(
        config.TX_REQUEST_QUEUE_URL,
        message.receiptHandle
      );
      console.log(
        `[tx-broadcaster] Message ${message.id} failed and will not be retried`
      );
      return;
    }

    // Check retry count
    const retryCount = await this.redisService.incrementRetryCount(message.id);
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      // Max retries reached, send failure result and delete message
      const unifiedMessage = this.convertToUnifiedMessage(message.body);
      await this.sendBroadcastResult(unifiedMessage, {
        success: false,
        error: `Max retries (${maxRetries}) exceeded: ${result.error}`,
      });

      await this.queueService.deleteMessage(
        config.TX_REQUEST_QUEUE_URL,
        message.receiptHandle
      );
      console.log(
        `[tx-broadcaster] Message ${message.id} exceeded max retries and was deleted`
      );
    } else {
      console.log(
        `[tx-broadcaster] Message ${message.id} will be retried (attempt ${retryCount}/${maxRetries})`
      );
      // Message will be retried automatically by SQS visibility timeout
    }
  }

  private isRetryableError(error?: string): boolean {
    if (!error) return false;

    const retryableErrors = [
      'NETWORK_ERROR',
      'SERVER_ERROR',
      'NONCE_OR_GAS_ERROR',
      'CONFIRMATION_TIMEOUT',
      'PROVIDER_ERROR',
    ];

    const nonRetryableErrors = [
      'Unsupported chain ID',
      'Transaction validation failed',
      'Transaction chain ID',
      'does not match expected',
      'INSUFFICIENT_FUNDS',
    ];

    // Check for non-retryable errors first
    if (
      nonRetryableErrors.some(nonRetryableError =>
        error.includes(nonRetryableError)
      )
    ) {
      return false;
    }

    return retryableErrors.some(retryableError =>
      error.includes(retryableError)
    );
  }

  private updateStats(success: boolean, processingTime: number): void {
    this.stats.messagesProcessed++;
    if (success) {
      this.stats.messagesSucceeded++;
    } else {
      this.stats.messagesFailed++;
    }

    // Update rolling average processing time
    this.stats.averageProcessingTime =
      (this.stats.averageProcessingTime * (this.stats.messagesProcessed - 1) +
        processingTime) /
      this.stats.messagesProcessed;

    this.stats.lastProcessedAt = new Date();

    // Log stats every 10 messages
    if (this.stats.messagesProcessed % 10 === 0) {
      console.log('[tx-broadcaster] Worker stats:', {
        processed: this.stats.messagesProcessed,
        succeeded: this.stats.messagesSucceeded,
        failed: this.stats.messagesFailed,
        successRate: `${((this.stats.messagesSucceeded / this.stats.messagesProcessed) * 100).toFixed(1)}%`,
        avgProcessingTime: `${this.stats.averageProcessingTime.toFixed(0)}ms`,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public method to get worker statistics
  getStats(): WorkerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.uptime,
    };
  }
}

// Global worker instance
let worker: SQSWorker | null = null;

export async function startWorker(): Promise<void> {
  if (worker) {
    console.warn('[tx-broadcaster] Worker already running');
    return;
  }

  worker = new SQSWorker();
  await worker.start();
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.stop();
    worker = null;
  }
}
