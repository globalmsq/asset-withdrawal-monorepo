import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { AppConfig } from '../config';
import { LoggerService } from '@asset-withdrawal/shared';

let sqsClient: SQSClient | null = null;

export function getSQSClient(config: AppConfig): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
      endpoint: config.AWS_ENDPOINT,
    });
  }
  return sqsClient;
}

export interface QueueMessage<T = any> {
  id: string;
  receiptHandle: string;
  body: T;
  attributes?: Record<string, string>;
}

export class QueueService {
  private sqs: SQSClient;
  private config: AppConfig;
  private logger: LoggerService;

  constructor(config: AppConfig) {
    this.config = config;
    this.sqs = getSQSClient(config);
    this.logger = new LoggerService({ service: 'tx-broadcaster:QueueService' });
  }

  // Receive messages from a queue
  async receiveMessages<T>(
    queueUrl: string,
    maxMessages: number = 10,
    waitTimeSeconds: number = 20
  ): Promise<QueueMessage<T>[]> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      });

      const response = await this.sqs.send(command);

      if (!response.Messages) {
        return [];
      }

      return response.Messages.map((message: Message) => ({
        id: message.MessageId!,
        receiptHandle: message.ReceiptHandle!,
        body: JSON.parse(message.Body!),
        attributes: message.MessageAttributes as
          | Record<string, string>
          | undefined,
      }));
    } catch (error) {
      this.logger.error(`Error receiving messages from ${queueUrl}`, error);
      throw error;
    }
  }

  // Send a message to a queue
  async sendMessage<T>(queueUrl: string, messageBody: T): Promise<string> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),
      });

      const response = await this.sqs.send(command);
      return response.MessageId!;
    } catch (error) {
      this.logger.error(`Error sending message to ${queueUrl}`, error);
      throw error;
    }
  }

  // Delete a message from the queue (acknowledge processing)
  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqs.send(command);
    } catch (error) {
      this.logger.error(`Error deleting message from ${queueUrl}`, error);
      throw error;
    }
  }

  // Send message to broadcast queue (next step in pipeline)
  async sendToBroadcastQueue(messageBody: any): Promise<string> {
    return this.sendMessage(this.config.BROADCAST_TX_QUEUE_URL, messageBody);
  }
}

// Message types for type safety
export interface SignedTransactionMessage {
  id: string;
  userId: string;
  withdrawalId: string;
  transactionHash: string;
  signedTransaction: string;
  toAddress: string;
  amount: string;
  tokenAddress?: string;
  nonce: number;
  gasLimit: string;
  gasPrice: string;
  chainId: number;
  createdAt: string;
}

// Unified message type for both single and batch transactions
export interface UnifiedSignedTransactionMessage {
  id: string;
  transactionType: 'SINGLE' | 'BATCH';
  withdrawalId?: string; // For single transactions
  batchId?: string; // For batch transactions
  userId: string;
  transactionHash: string;
  signedTransaction: string; // Raw signed tx (contains all info)
  nonce: number; // Transaction nonce
  chainId: number;
  chain?: string; // Chain name (e.g., 'polygon', 'ethereum')
  network?: string; // Network environment (e.g., 'mainnet', 'testnet')
  metadata?: {
    // Additional info only when needed
    totalRequests?: number; // Batch only
    requestIds?: string[]; // Batch only
    toAddress?: string; // Single only
    amount?: string; // Single only
    tokenAddress?: string; // Token address
  };
  createdAt: string;
}

export interface BroadcastResultMessage {
  id: string;
  userId: string;
  withdrawalId: string;
  originalTransactionHash: string;
  broadcastTransactionHash?: string;
  status: 'broadcasted' | 'failed';
  error?: string;
  broadcastedAt?: string;
  blockNumber?: number;
  gasUsed?: string;
}

// Unified broadcast result message
export interface UnifiedBroadcastResultMessage {
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
    // Additional result info
    affectedRequests?: string[]; // For batch transactions
  };
}

// Message for tx-monitor-queue
export interface TxMonitorMessage {
  id: string;
  transactionType: 'SINGLE' | 'BATCH';
  withdrawalId?: string; // For single transactions
  batchId?: string; // For batch transactions
  userId: string;
  txHash: string; // The actual blockchain transaction hash
  chainId: number;
  broadcastedAt: string; // ISO timestamp
  blockNumber?: number; // If available from broadcast result
  metadata?: {
    // Additional monitoring info
    affectedRequests?: string[]; // For batch transactions
    retryCount?: number;
  };
}
