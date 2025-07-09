import { IQueue, QueueConfig, QueueType } from './interfaces';
import { LocalStackSQSQueue } from './localstack-sqs-queue';
import { AWSSQSQueue } from './aws-sqs-queue';
import { InMemoryQueueAdapter } from './in-memory-queue-adapter';

export class QueueFactory {
  static create<T>(type: QueueType, config: QueueConfig): IQueue<T> {
    switch (type) {
      case QueueType.LOCALSTACK:
        return new LocalStackSQSQueue<T>({
          ...config,
          endpoint: config.endpoint || 'http://localhost:4566',
          region: config.region || 'us-east-1',
          accessKeyId: config.accessKeyId || 'test',
          secretAccessKey: config.secretAccessKey || 'test',
        });
      
      case QueueType.AWS:
        return new AWSSQSQueue<T>(config);
      
      case QueueType.IN_MEMORY:
        return new InMemoryQueueAdapter<T>(config.queueName);
      
      default:
        throw new Error(`Unsupported queue type: ${type}`);
    }
  }

  static createFromEnv<T>(queueName: string): IQueue<T> {
    const queueType = (process.env.QUEUE_TYPE || 'in_memory') as QueueType;
    
    const config: QueueConfig = {
      queueName,
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };

    return this.create<T>(queueType, config);
  }
}