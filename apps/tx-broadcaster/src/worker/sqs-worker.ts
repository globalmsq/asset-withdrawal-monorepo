import { loadConfig, validateConfig } from '../config';
import {
  getRedisClient,
  BroadcastRedisService,
  closeRedisClient,
} from '../services/redis-client';
import {
  QueueService,
  SignedTransactionMessage,
  UnifiedSignedTransactionMessage,
  UnifiedBroadcastResultMessage,
  QueueMessage,
} from '../services/queue-client';
import { TransactionBroadcaster } from '../services/broadcaster';
import { TransactionService } from '../services/transaction.service';
import { RetryService } from '../services/retry.service';
import { ProcessingResult, WorkerStats } from '../types';
import { AppConfig } from '../config';
import {
  LoggerService,
  DLQ_ERROR_TYPE,
  PERMANENT_FAILURE_TYPES,
  DLQErrorType,
  DLQMessage,
  ErrorClassifier,
  isPermanentFailure,
} from '@asset-withdrawal/shared';

export class SQSWorker {
  private config: AppConfig;
  private queueService: QueueService;
  private broadcaster: TransactionBroadcaster;
  private retryService: RetryService;
  private redisService: BroadcastRedisService | null = null;
  private transactionService: TransactionService;
  private isRunning = false;
  private stats: WorkerStats;
  private logger: LoggerService;

  constructor() {
    this.config = loadConfig();
    this.logger = new LoggerService({ service: 'tx-broadcaster:SQSWorker' });
    this.queueService = new QueueService(this.config);
    this.broadcaster = new TransactionBroadcaster();
    this.transactionService = new TransactionService();
    this.retryService = new RetryService({
      maxRetries: 5,
      baseDelay: 2000, // 2초
      maxDelay: 60000, // 60초
      backoffMultiplier: 2,
    });
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
      this.logger.info('Starting SQS Worker...', {
        chainId: this.config.CHAIN_ID,
        metadata: {
          signedTxQueueUrl: this.config.SIGNED_TX_QUEUE_URL,
          broadcastQueueUrl: this.config.BROADCAST_TX_QUEUE_URL,
        },
      });

      // Validate configuration
      validateConfig(this.config);

      // Initialize Redis
      const redis = await getRedisClient();
      this.redisService = new BroadcastRedisService(redis);
      this.logger.info('Redis connection established');

      // Test blockchain connection
      await this.testConnections();

      this.isRunning = true;
      this.logger.info('SQS Worker started successfully');

      // Start processing loop
      await this.processLoop();
    } catch (error) {
      this.logger.error('Failed to start SQS Worker', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping SQS Worker...');
    this.isRunning = false;
    await closeRedisClient();
    this.logger.info('SQS Worker stopped');
  }

  private async testConnections(): Promise<void> {
    try {
      // Test blockchain connection (default environment provider)
      const networkStatus = await this.broadcaster.getNetworkStatus();
      this.logger.info('Blockchain connection established', {
        chainId: networkStatus.chainId,
        metadata: {
          blockNumber: networkStatus.blockNumber,
          gasPrice: networkStatus.gasPrice,
        },
      });

      // Test Redis connection
      if (this.redisService) {
        await this.redisService.cleanup();
        this.logger.info('Redis connection verified');
      }
    } catch (error) {
      const errorMessage = `Connection test failed: ${error instanceof Error ? error.message : error}`;
      this.logger.error('Connection test failed', error);
      throw new Error(errorMessage);
    }
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Receive messages from the queue
        const messages =
          await this.queueService.receiveMessages<SignedTransactionMessage>(
            this.config.SIGNED_TX_QUEUE_URL,
            5, // Process up to 5 messages at once
            20 // Long polling for 20 seconds
          );

        if (messages.length === 0) {
          continue; // No messages, continue polling
        }

        // Process received messages

        // Process messages concurrently
        const processingPromises = messages.map(message =>
          this.processMessage(message)
        );

        await Promise.allSettled(processingPromises);
      } catch (error) {
        this.logger.error('Error in processing loop', error);
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

      // Process message based on transaction type

      result = await this.handleUnifiedTransaction(unifiedMessage);

      if (result.success) {
        // Delete message from queue on success
        await this.queueService.deleteMessage(
          this.config.SIGNED_TX_QUEUE_URL,
          message.receiptHandle
        );
        this.updateStats(true, Date.now() - startTime);
        // Message processed successfully
      } else {
        // Handle retry logic
        await this.handleFailure(message, result);
        this.updateStats(false, Date.now() - startTime);
      }
    } catch (error) {
      this.logger.error('Unexpected error processing message', error, {
        metadata: {
          messageId: message.id,
          processingTime: Date.now() - startTime,
        },
      });
      result = {
        success: false,
        shouldRetry: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      await this.handleFailure(message, result);
      this.updateStats(false, Date.now() - startTime);
    }
  }

  // Convert signing-service message to minimal broadcast format
  private convertToUnifiedMessage(
    message: any
  ): UnifiedSignedTransactionMessage {
    // Check if it's a SignedTransaction from signing-service (primary format)
    if ('rawTransaction' in message) {
      return {
        id: message.requestId || message.id || 'unknown',
        transactionType: message.transactionType || 'SINGLE',
        withdrawalId:
          message.transactionType === 'SINGLE' ? message.requestId : undefined,
        batchId:
          message.transactionType === 'BATCH' ? message.batchId : undefined,
        userId: 'signing-service',
        transactionHash: message.hash || '',
        signedTransaction: message.rawTransaction,
        chainId: message.chainId,
        metadata: {}, // Minimal metadata since rawTransaction contains all info
        createdAt: new Date().toISOString(),
      };
    }

    // Handle legacy format (fallback)
    return {
      id: message.id || 'unknown',
      transactionType: 'SINGLE',
      withdrawalId: message.withdrawalId || message.id,
      userId: message.userId || 'unknown',
      transactionHash: message.transactionHash || '',
      signedTransaction: message.signedTransaction || '',
      chainId: message.chainId || 31337,
      metadata: {},
      createdAt: new Date().toISOString(),
    };
  }

  private async handleUnifiedTransaction(
    txMessage: UnifiedSignedTransactionMessage
  ): Promise<ProcessingResult> {
    try {
      const { signedTransaction, chainId } = txMessage;

      // Validate required fields for broadcasting
      if (!signedTransaction) {
        return {
          success: false,
          shouldRetry: false,
          error: 'No rawTransaction provided - cannot broadcast',
        };
      }

      // Use a composite key for Redis if transactionHash is missing
      const redisKey =
        txMessage.transactionHash ||
        `${txMessage.id}_${txMessage.withdrawalId || txMessage.batchId}`;

      // Check if already processed using Redis
      if (this.redisService) {
        // Check if already broadcasted
        if (await this.redisService.isBroadcasted(redisKey)) {
          return { success: true, shouldRetry: false };
        }

        // Set processing lock
        const lockAcquired = await this.redisService.setProcessing(redisKey);
        if (!lockAcquired) {
          return { success: true, shouldRetry: false }; // Another worker is handling it
        }
      }

      try {
        // Process transaction for specified chain
        // Note: rawTransaction contains all necessary info, minimal validation needed

        // Basic validation - ethers.js will do detailed parsing
        if (!signedTransaction.startsWith('0x')) {
          return {
            success: false,
            shouldRetry: false,
            error: 'Invalid rawTransaction format - must start with 0x',
          };
        }

        // Skip duplicate check for now - rawTransaction-based approach
        // The transaction hash will be determined after parsing rawTransaction

        // Direct broadcast using rawTransaction
        const broadcastResult = await this.broadcastWithRetry(
          txMessage,
          signedTransaction, // This is the rawTransaction from signing-service
          chainId
        );

        if (broadcastResult.success) {
          // Mark as broadcasted in Redis
          if (this.redisService) {
            await this.redisService.markBroadcasted(
              redisKey,
              broadcastResult.transactionHash
            );
          }

          // Send success result to next queue
          await this.sendBroadcastResult(txMessage, broadcastResult);

          return { success: true, shouldRetry: false, result: broadcastResult };
        } else {
          // Send failure result to next queue
          await this.sendBroadcastResult(txMessage, broadcastResult);

          // Classify error to determine if it's retryable
          const errorInfo = ErrorClassifier.classifyError({
            message: broadcastResult.error,
          });

          return {
            success: false,
            shouldRetry: !isPermanentFailure(errorInfo.type),
            error: broadcastResult.error,
          };
        }
      } finally {
        // Remove processing lock
        if (this.redisService) {
          await this.redisService.removeProcessing(redisKey);
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
      blockNumber?: number;
      metadata?: {
        retryCount?: number;
        sentToDLQ?: boolean;
        affectedRequests?: string[];
      };
    }
  ): Promise<void> {
    // Create unified result message for broadcast-tx-queue (compatibility)
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
      blockNumber: broadcastResult.blockNumber,
      metadata: {
        // 원본 메시지의 메타데이터
        ...(originalMessage.transactionType === 'BATCH' &&
        originalMessage.metadata?.requestIds
          ? { affectedRequests: originalMessage.metadata.requestIds }
          : {}),
        // 브로드캐스트 결과의 메타데이터
        ...broadcastResult.metadata,
      },
    };

    // Save to sent_transactions table if broadcast was successful
    if (broadcastResult.success && broadcastResult.transactionHash) {
      try {
        await this.transactionService.saveSentTransaction({
          requestId:
            originalMessage.transactionType === 'SINGLE'
              ? originalMessage.withdrawalId
              : undefined,
          batchId:
            originalMessage.transactionType === 'BATCH'
              ? originalMessage.batchId
              : undefined,
          transactionType: originalMessage.transactionType,
          originalTxHash: originalMessage.transactionHash,
          sentTxHash: broadcastResult.transactionHash,
          chainId: originalMessage.chainId || 31337, // Default to localhost chain
          blockNumber: broadcastResult.blockNumber,
        });
      } catch (error) {
        this.logger.error('Failed to save sent transaction to database', error);
        // Continue even if DB save fails - queue message is more important
      }
    }

    // Send to broadcast-tx-queue (for tx-monitor to consume)
    await this.queueService.sendToBroadcastQueue(resultMessage);
  }

  /**
   * 재시도 로직과 함께 트랜잭션을 브로드캐스트합니다
   * rawTransaction을 직접 사용하여 브로드캐스트
   */
  private async broadcastWithRetry(
    txMessage: UnifiedSignedTransactionMessage,
    rawTransaction: string, // Direct use of rawTransaction from signing-service
    chainId?: number
  ): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
    blockNumber?: number;
    attemptCount?: number;
    isNonceConflict?: boolean;
    affectedRequests?: string[];
  }> {
    let lastError: any;
    let attemptCount = 0;
    const maxRetries = this.retryService.getMaxRetries();

    while (attemptCount <= maxRetries) {
      try {
        // Attempt to broadcast transaction

        let broadcastResult;

        if (txMessage.transactionType === 'SINGLE') {
          // Use single transaction state management with rawTransaction
          broadcastResult =
            await this.broadcaster.broadcastTransactionWithStateManagement(
              txMessage.withdrawalId!,
              rawTransaction, // Direct use of rawTransaction
              chainId
            );
        } else {
          // Use batch transaction state management with rawTransaction
          broadcastResult =
            await this.broadcaster.broadcastBatchTransactionWithStateManagement(
              txMessage.batchId!,
              rawTransaction, // Direct use of rawTransaction
              chainId
            );
        }

        // 성공한 경우
        if (broadcastResult.success) {
          return {
            ...broadcastResult,
            attemptCount: attemptCount + 1,
          };
        } else {
          // 브로드캐스트 실패 - 에러 분석 및 재시도 판단
          lastError = new Error(broadcastResult.error || 'Broadcast failed');
          throw lastError;
        }
      } catch (error) {
        lastError = error;
        attemptCount++;

        // Check for nonce conflict
        const nonceConflict = this.retryService.detectNonceConflict(error);
        if (nonceConflict.isNonceConflict) {
          this.logger.warn('Nonce conflict detected, will send to DLQ', {
            metadata: {
              messageId: txMessage.id,
              transactionType: txMessage.transactionType,
              conflictType: nonceConflict.conflictType,
              details: nonceConflict.details,
              error: error instanceof Error ? error.message : String(error),
            },
          });

          // Nonce conflicts go to DLQ for recovery service to handle
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Nonce conflict: ${nonceConflict.details || errorMessage}`,
            attemptCount,
            isNonceConflict: true,
          };
        }

        // 에러 분석 및 메트릭 수집
        const errorMetrics = this.retryService.generateErrorMetrics(
          error,
          attemptCount,
          maxRetries
        );

        // 에러 메트릭 수집
        this.collectErrorMetric(error, {
          messageId: txMessage.id,
          transactionType: txMessage.transactionType,
          attempt: attemptCount,
          maxRetries: maxRetries,
        });

        this.logger.warn('Broadcast attempt failed', {
          metadata: {
            messageId: txMessage.id,
            transactionType: txMessage.transactionType,
            attemptCount,
            maxRetries,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || 'UNKNOWN',
            type: errorMetrics.errorType,
            severity: errorMetrics.severity,
            retryable: errorMetrics.retryable,
          },
        });

        // 재시도 가능 여부 확인
        const retryDecision = this.retryService.shouldRetry(
          error,
          attemptCount
        );

        if (!retryDecision.shouldRetry) {
          this.logger.error('No more retries for transaction', null, {
            metadata: {
              messageId: txMessage.id,
              reason: retryDecision.reason,
              attemptCount,
            },
          });
          break;
        }

        // 재시도 전 지연
        await this.sleep(retryDecision.delay);
      }
    }

    // 모든 재시도 실패
    const errorAnalysis = this.retryService.analyzeError(lastError);
    this.logger.error(
      'Transaction broadcast failed after all attempts',
      lastError,
      {
        metadata: {
          messageId: txMessage.id,
          transactionType: txMessage.transactionType,
          attemptCount,
          analysis: errorAnalysis,
        },
      }
    );

    return {
      success: false,
      error: lastError?.message || 'Unknown broadcast error',
      attemptCount,
    };
  }

  private async handleFailure(
    message: QueueMessage<any>,
    result: ProcessingResult
  ): Promise<void> {
    const unifiedMessage = this.convertToUnifiedMessage(message.body);

    // Classify the error
    const errorInfo = ErrorClassifier.classifyError({
      message: result.error,
      code: (result as any).errorCode,
    });

    // Check if it's a permanent failure
    if (isPermanentFailure(errorInfo.type)) {
      // Permanent failures are marked as FAILED immediately
      this.logger.error('Permanent failure detected, marking as FAILED', null, {
        metadata: {
          messageId: message.id,
          errorType: errorInfo.type,
          error: result.error,
        },
      });

      // Mark as FAILED in database
      try {
        if (
          unifiedMessage.transactionType === 'SINGLE' &&
          unifiedMessage.withdrawalId
        ) {
          await this.transactionService.updateToFailed(
            unifiedMessage.withdrawalId,
            result.error || 'Permanent failure'
          );
        } else if (
          unifiedMessage.transactionType === 'BATCH' &&
          unifiedMessage.batchId
        ) {
          await this.transactionService.updateBatchToFailed(
            unifiedMessage.batchId,
            result.error || 'Permanent failure'
          );
        }
      } catch (dbError) {
        this.logger.error('Failed to update status to FAILED', dbError);
      }

      // Send failure result
      await this.sendBroadcastResult(unifiedMessage, {
        success: false,
        error: result.error || 'Permanent failure',
      });

      // Delete message from queue
      await this.queueService.deleteMessage(
        this.config.SIGNED_TX_QUEUE_URL,
        message.receiptHandle
      );

      return;
    }

    // For retryable errors, check retry count
    if (!this.redisService) {
      // If Redis not available, send to DLQ
      await this.sendToDLQ(
        unifiedMessage,
        result.error || 'Redis not available'
      );
      await this.queueService.deleteMessage(
        this.config.SIGNED_TX_QUEUE_URL,
        message.receiptHandle
      );
      return;
    }

    // Check retry count
    const retryCount = await this.redisService.incrementRetryCount(message.id);
    const maxRetries = this.retryService.getMaxRetries();

    if (retryCount >= maxRetries) {
      // Max retries reached, send to DLQ
      try {
        await this.sendToDLQ(
          unifiedMessage,
          result.error || 'Max retries exceeded'
        );

        this.logger.info('Message sent to DLQ after max retries', {
          metadata: {
            messageId: message.id,
            retryCount: maxRetries,
          },
        });

        // Only send failure result and delete if DLQ send succeeded
        await this.sendBroadcastResult(unifiedMessage, {
          success: false,
          error: `Max retries (${maxRetries}) exceeded: ${result.error}`,
          metadata: {
            retryCount: maxRetries,
            sentToDLQ: true,
          },
        });

        await this.queueService.deleteMessage(
          this.config.SIGNED_TX_QUEUE_URL,
          message.receiptHandle
        );

        this.logger.info(
          'Message deleted from main queue after successful DLQ transfer',
          {
            metadata: {
              messageId: message.id,
            },
          }
        );
      } catch (dlqError) {
        // Failed to send to DLQ - DO NOT delete the message
        this.logger.error(
          'Failed to send message to DLQ, will retry via SQS visibility timeout',
          {
            metadata: {
              messageId: message.id,
              error:
                dlqError instanceof Error ? dlqError.message : String(dlqError),
            },
          }
        );
        // Do NOT delete from main queue - let SQS visibility timeout handle retry
        // This prevents message loss if DLQ operation fails
      }
    } else {
      // Message will be retried
      // Message will be retried automatically by SQS visibility timeout
    }
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
      this.logger.info('Worker statistics', {
        metadata: {
          processed: this.stats.messagesProcessed,
          succeeded: this.stats.messagesSucceeded,
          failed: this.stats.messagesFailed,
          successRate: `${((this.stats.messagesSucceeded / this.stats.messagesProcessed) * 100).toFixed(1)}%`,
          avgProcessingTime: `${this.stats.averageProcessingTime.toFixed(0)}ms`,
          uptimeMs: Date.now() - this.stats.uptime,
        },
      });
    }
  }

  /**
   * Send message to DLQ (Dead Letter Queue) for recovery processing
   */
  private async sendToDLQ(
    message: UnifiedSignedTransactionMessage,
    error: any
  ): Promise<void> {
    if (!this.config.SIGNED_TX_DLQ_URL) {
      this.logger.error('DLQ URL not configured, dropping message', null, {
        metadata: {
          messageId: message.id,
        },
      });
      return;
    }

    try {
      const errorInfo = ErrorClassifier.classifyError(error);

      const dlqMessage: DLQMessage<UnifiedSignedTransactionMessage> = {
        originalMessage: message,
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
          attemptCount: (message as any).attemptCount || 1,
        },
      };

      await this.queueService.sendMessage(
        this.config.SIGNED_TX_DLQ_URL,
        dlqMessage
      );

      // Collect DLQ metrics
      this.collectDLQMetric(
        message,
        typeof error === 'string' ? error : error?.message
      );
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ', dlqError, {
        metadata: {
          messageId: message.id,
          transactionType: message.transactionType,
        },
      });
      throw dlqError;
    }
  }

  /**
   * DLQ 전송 메트릭을 수집합니다
   */
  private collectDLQMetric(
    message: UnifiedSignedTransactionMessage,
    error: string
  ): void {
    const metric = {
      timestamp: new Date().toISOString(),
      messageId: message.id,
      transactionType: message.transactionType,
      userId: message.userId,
      chainId: message.chainId,
      failureReason: error,
      originalHash: message.transactionHash,
    };

    // TODO: Send to monitoring system in production
  }

  /**
   * 에러별 모니터링 메트릭을 수집합니다
   */
  private collectErrorMetric(
    error: any,
    context: {
      messageId: string;
      transactionType: string;
      attempt: number;
      maxRetries: number;
    }
  ): void {
    const errorMetrics = this.retryService.generateErrorMetrics(
      error,
      context.attempt,
      context.maxRetries
    );

    const metric = {
      ...errorMetrics,
      messageId: context.messageId,
      transactionType: context.transactionType,
      context: 'transaction_broadcast',
    };

    // TODO: Send to monitoring system (e.g., CloudWatch, DataDog) in production
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
