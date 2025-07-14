import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import {
  IQueue,
  Message,
  SendMessageOptions,
  ReceiveMessageOptions,
  QueueConfig,
  QueueAttributes,
} from './interfaces';

export class SQSQueue<T> implements IQueue<T> {
  private client: SQSClient;
  private queueUrl?: string;
  private queueName: string;

  constructor(private config: QueueConfig) {
    this.queueName = config.queueName;

    const clientConfig: any = {
      region: config.region || 'ap-northeast-2',
    };

    // If endpoint is provided, we're using LocalStack
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId || 'test',
        secretAccessKey: config.secretAccessKey || 'test',
      };
    } else if (config.accessKeyId && config.secretAccessKey) {
      // For AWS, only set credentials if explicitly provided
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    // Otherwise, AWS SDK will use default credential chain (IAM roles, etc.)

    this.client = new SQSClient(clientConfig);
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

  async receiveMessages(
    options?: ReceiveMessageOptions
  ): Promise<Message<T>[]> {
    const queueUrl = await this.getOrCreateQueueUrl();

    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: options?.maxMessages || 1,
      WaitTimeSeconds: options?.waitTimeSeconds || 0,
      VisibilityTimeout: options?.visibilityTimeout || 300,
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
      attributes: msg.MessageAttributes
        ? Object.entries(msg.MessageAttributes).reduce(
            (acc, [key, value]) => {
              acc[key] = value.StringValue || '';
              return acc;
            },
            {} as Record<string, string>
          )
        : undefined,
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

  async getQueueUrl(): Promise<string> {
    return await this.getOrCreateQueueUrl();
  }

  getQueueName(): string {
    return this.queueName;
  }

  async getQueueAttributes(): Promise<QueueAttributes> {
    const queueUrl = await this.getOrCreateQueueUrl();

    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
        ],
      });

      const response = await this.client.send(command);
      const attributes = response.Attributes || {};

      return {
        approximateNumberOfMessages: parseInt(
          attributes.ApproximateNumberOfMessages || '0',
          10
        ),
        approximateNumberOfMessagesNotVisible: parseInt(
          attributes.ApproximateNumberOfMessagesNotVisible || '0',
          10
        ),
        approximateNumberOfMessagesDelayed: parseInt(
          attributes.ApproximateNumberOfMessagesDelayed || '0',
          10
        ),
      };
    } catch (error) {
      console.error('Error getting queue attributes:', error);
      // Return zeros if there's an error
      return {
        approximateNumberOfMessages: 0,
        approximateNumberOfMessagesNotVisible: 0,
        approximateNumberOfMessagesDelayed: 0,
      };
    }
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
        if (this.config.endpoint) {
          throw new Error(
            `Queue ${this.queueName} does not exist. Please run init-localstack.sh`
          );
        } else {
          throw new Error(`Queue ${this.queueName} does not exist in AWS SQS.`);
        }
      }
      throw error;
    }
  }
}
