import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { config } from '../config';

let sqsClient: SQSClient | null = null;

export function getSQSClient(): SQSClient {
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

  constructor() {
    this.sqs = getSQSClient();
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
        attributes: message.MessageAttributes as Record<string, string> | undefined,
      }));
    } catch (error) {
      console.error(`[tx-broadcaster] Error receiving messages from ${queueUrl}:`, error);
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
      console.error(`[tx-broadcaster] Error sending message to ${queueUrl}:`, error);
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
      console.error(`[tx-broadcaster] Error deleting message from ${queueUrl}:`, error);
      throw error;
    }
  }

  // Send message to broadcast queue (next step in pipeline)
  async sendToBroadcastQueue(messageBody: any): Promise<string> {
    return this.sendMessage(config.BROADCAST_QUEUE_URL, messageBody);
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