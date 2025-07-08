import { QueueMessage } from './types';

export class InMemoryQueue<T = any> {
  private queue: QueueMessage<T>[] = [];
  private processingQueue: QueueMessage<T>[] = [];
  private maxRetries = 3;

  constructor(private name: string) {}

  async enqueue(data: T): Promise<string> {
    const message: QueueMessage<T> = {
      id: this.generateId(),
      data,
      timestamp: new Date(),
      retryCount: 0,
    };

    this.queue.push(message);
    return message.id;
  }

  async dequeue(): Promise<QueueMessage<T> | null> {
    const message = this.queue.shift();
    if (message) {
      this.processingQueue.push(message);
    }
    return message || null;
  }

  async ack(messageId: string): Promise<boolean> {
    const index = this.processingQueue.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      this.processingQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  async nack(messageId: string): Promise<boolean> {
    const index = this.processingQueue.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      const message = this.processingQueue[index];
      this.processingQueue.splice(index, 1);

      if (message.retryCount < this.maxRetries) {
        message.retryCount++;
        this.queue.push(message);
        return true;
      }
    }
    return false;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getProcessingSize(): number {
    return this.processingQueue.length;
  }

  private generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class QueueManager {
  private queues: Map<string, InMemoryQueue> = new Map();

  getQueue<T = any>(name: string): InMemoryQueue<T> {
    if (!this.queues.has(name)) {
      this.queues.set(name, new InMemoryQueue<T>(name));
    }
    return this.queues.get(name) as InMemoryQueue<T>;
  }

  getAllQueues(): Map<string, InMemoryQueue> {
    return this.queues;
  }
}

export const queueManager = new QueueManager();
