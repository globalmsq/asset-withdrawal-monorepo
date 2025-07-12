import { IQueue, QueueConfig } from './interfaces';
import { SQSQueue } from './sqs-queue';

export class QueueFactory {
  static create<T>(config: QueueConfig): IQueue<T> {
    // Always use SQS, endpoint determines if it's LocalStack or AWS
    return new SQSQueue<T>(config);
  }

  static createFromEnv<T>(queueName: string): IQueue<T> {
    const config: QueueConfig = {
      queueName,
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };

    return this.create<T>(config);
  }
}