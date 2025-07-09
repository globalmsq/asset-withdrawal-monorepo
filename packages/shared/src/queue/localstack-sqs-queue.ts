import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';
import { IQueue, Message, SendMessageOptions, ReceiveMessageOptions, QueueConfig } from './interfaces';

export class LocalStackSQSQueue<T> implements IQueue<T> {
  private client: SQSClient;
  private queueUrl?: string;
  private queueName: string;

  constructor(private config: QueueConfig) {
    this.queueName = config.queueName;
    this.client = new SQSClient({
      region: config.region || 'us-east-1',
      endpoint: config.endpoint || 'http://localhost:4566',
      credentials: {
        accessKeyId: config.accessKeyId || 'test',
        secretAccessKey: config.secretAccessKey || 'test',
      },
    });
  }

  async sendMessage(data: T, options?: SendMessageOptions): Promise<string> {
    const queueUrl = await this.getOrCreateQueueUrl();
    
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(data),
      DelaySeconds: options?.delaySeconds,
      MessageAttributes: options?.messageAttributes,
    });

    const response = await this.client.send(command);
    return response.MessageId!;
  }

  async receiveMessages(options?: ReceiveMessageOptions): Promise<Message<T>[]> {
    const queueUrl = await this.getOrCreateQueueUrl();
    
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: options?.maxMessages || 1,
      WaitTimeSeconds: options?.waitTimeSeconds || 0,
      VisibilityTimeout: options?.visibilityTimeout || 30,
      MessageAttributeNames: ['All'],
    });

    const response = await this.client.send(command);
    
    if (!response.Messages) {
      return [];
    }

    return response.Messages.map(msg => ({
      id: msg.MessageId!,
      body: JSON.parse(msg.Body!) as T,
      receiptHandle: msg.ReceiptHandle!,
      attributes: msg.MessageAttributes ? 
        Object.entries(msg.MessageAttributes).reduce((acc, [key, value]) => {
          acc[key] = value.StringValue || '';
          return acc;
        }, {} as Record<string, string>) : undefined,
    }));
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const queueUrl = await this.getOrCreateQueueUrl();
    
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await this.client.send(command);
  }

  getQueueUrl(): string {
    if (!this.queueUrl) {
      throw new Error('Queue URL not initialized. Call getOrCreateQueueUrl first.');
    }
    return this.queueUrl;
  }

  getQueueName(): string {
    return this.queueName;
  }

  private async getOrCreateQueueUrl(): Promise<string> {
    if (this.queueUrl) {
      return this.queueUrl;
    }

    try {
      const command = new GetQueueUrlCommand({
        QueueName: this.queueName,
      });
      const response = await this.client.send(command);
      this.queueUrl = response.QueueUrl!;
      return this.queueUrl;
    } catch (error: any) {
      if (error.name === 'QueueDoesNotExist') {
        throw new Error(`Queue ${this.queueName} does not exist. Please run init-localstack.sh`);
      }
      throw error;
    }
  }
}