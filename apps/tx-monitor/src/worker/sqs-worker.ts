import { SQS } from '@aws-sdk/client-sqs';
import { logger } from '@asset-withdrawal/shared';
import { config } from '../config';
import { MonitorService } from '../services/monitor.service';
import { WebSocketService } from '../services/websocket.service';

// Message type from tx-broadcaster
interface UnifiedBroadcastResultMessage {
  id: string;
  transactionType: 'SINGLE' | 'BATCH';
  withdrawalId?: string; // For single transactions
  batchId?: string; // For batch transactions
  userId: string;
  originalTransactionHash: string;
  broadcastTransactionHash?: string;
  status: 'broadcasted' | 'failed';
  error?: string;
  broadcastedAt?: string;
  blockNumber?: number;
  gasUsed?: string;
  chain: string; // Chain identifier (e.g., 'polygon', 'ethereum')
  network: string; // Network type (e.g., 'mainnet', 'testnet')
  metadata?: {
    affectedRequests?: string[]; // For batch transactions
  };
}

export class SQSWorker {
  private sqs: SQS;
  private monitorService: MonitorService;
  private webSocketService: WebSocketService;
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    monitorService: MonitorService,
    webSocketService: WebSocketService
  ) {
    this.monitorService = monitorService;
    this.webSocketService = webSocketService;

    // Initialize SQS client
    this.sqs = new SQS({
      region: config.aws.region,
      endpoint: config.aws.endpoint || undefined,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  async start(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('[SQSWorker] Already processing messages');
      return;
    }

    logger.info('[SQSWorker] Starting SQS worker for broadcast-tx-queue');
    this.isProcessing = true;

    // Start polling for messages
    await this.pollMessages();
  }

  private async pollMessages(): Promise<void> {
    while (this.isProcessing) {
      try {
        const queueUrl = config.sqs.broadcastTxQueueUrl;

        const params = {
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // Long polling
          VisibilityTimeout: 30,
        };

        const result = await this.sqs.receiveMessage(params);

        if (result.Messages && result.Messages.length > 0) {
          logger.info(
            `[SQSWorker] Received ${result.Messages.length} messages from broadcast-tx-queue`
          );

          for (const message of result.Messages) {
            await this.processMessage(message, queueUrl);
          }
        }
      } catch (error) {
        logger.error('[SQSWorker] Error polling messages:', error);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async processMessage(message: any, queueUrl: string): Promise<void> {
    try {
      if (!message.Body) {
        logger.warn('[SQSWorker] Received message without body');
        await this.deleteMessage(queueUrl, message.ReceiptHandle);
        return;
      }

      const broadcastResult: UnifiedBroadcastResultMessage = JSON.parse(
        message.Body
      );
      logger.info('[SQSWorker] Processing broadcast result:', {
        metadata: {
          id: broadcastResult.id,
          transactionType: broadcastResult.transactionType,
          status: broadcastResult.status,
          txHash: broadcastResult.broadcastTransactionHash,
          chain: broadcastResult.chain,
          network: broadcastResult.network,
        },
      });

      // Skip failed broadcasts
      if (broadcastResult.status === 'failed') {
        logger.warn('[SQSWorker] Skipping failed broadcast:', {
          metadata: {
            id: broadcastResult.id,
            error: broadcastResult.error,
          },
        });
        await this.deleteMessage(queueUrl, message.ReceiptHandle);
        return;
      }

      // Add transaction to monitoring
      if (broadcastResult.broadcastTransactionHash) {
        await this.monitorService.addTransaction({
          txHash: broadcastResult.broadcastTransactionHash,
          requestId:
            broadcastResult.transactionType === 'SINGLE'
              ? broadcastResult.withdrawalId
              : null,
          batchId:
            broadcastResult.transactionType === 'BATCH'
              ? broadcastResult.batchId
              : null,
          chain: broadcastResult.chain,
          network: broadcastResult.network,
          status: 'SENT', // Initial monitoring status
          blockNumber: broadcastResult.blockNumber,
          confirmations: 0,
          nonce: 0, // Will be updated from chain
        });

        // Add WebSocket watch for real-time monitoring
        try {
          await this.webSocketService.addTransactionWatch(
            broadcastResult.broadcastTransactionHash,
            broadcastResult.chain,
            broadcastResult.network
          );

          logger.info('[SQSWorker] WebSocket watch added for transaction:', {
            metadata: {
              txHash: broadcastResult.broadcastTransactionHash,
              chain: broadcastResult.chain,
              network: broadcastResult.network,
            },
          });
        } catch (error) {
          logger.warn(
            '[SQSWorker] Failed to add WebSocket watch, will rely on polling:',
            {
              metadata: {
                error: error instanceof Error ? error.message : String(error),
                txHash: broadcastResult.broadcastTransactionHash,
                chain: broadcastResult.chain,
                network: broadcastResult.network,
              },
            }
          );
        }

        logger.info('[SQSWorker] Added transaction to monitoring:', {
          metadata: {
            txHash: broadcastResult.broadcastTransactionHash,
            type: broadcastResult.transactionType,
            id:
              broadcastResult.transactionType === 'SINGLE'
                ? broadcastResult.withdrawalId
                : broadcastResult.batchId,
          },
        });
      }

      // Delete message from queue after successful processing
      await this.deleteMessage(queueUrl, message.ReceiptHandle);
    } catch (error) {
      logger.error('[SQSWorker] Error processing message:', error, {
        metadata: {
          messageId: message.MessageId,
        },
      });

      // Don't delete message on error - let it retry
      // The message will go to DLQ after max retries
    }
  }

  private async deleteMessage(
    queueUrl: string,
    receiptHandle: string
  ): Promise<void> {
    try {
      await this.sqs.deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });
    } catch (error) {
      logger.error('[SQSWorker] Error deleting message:', error);
    }
  }

  async stop(): Promise<void> {
    logger.info('[SQSWorker] Stopping SQS worker');
    this.isProcessing = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
