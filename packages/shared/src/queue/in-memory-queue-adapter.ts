import { IQueue, Message, SendMessageOptions, ReceiveMessageOptions } from './interfaces';
import { InMemoryQueue, queueManager } from '../queue';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryQueueAdapter<T> implements IQueue<T> {
  private queue: InMemoryQueue<T>;
  private processingMessages: Map<string, { message: Message<T>; timeout: NodeJS.Timeout }> = new Map();

  constructor(private queueName: string) {
    this.queue = queueManager.getQueue<T>(queueName);
  }

  async sendMessage(data: T, options?: SendMessageOptions): Promise<string> {
    const messageId = uuidv4();
    
    if (options?.delaySeconds) {
      setTimeout(() => {
        this.queue.enqueue(data);
      }, options.delaySeconds * 1000);
    } else {
      this.queue.enqueue(data);
    }
    
    return messageId;
  }

  async receiveMessages(options?: ReceiveMessageOptions): Promise<Message<T>[]> {
    const messages: Message<T>[] = [];
    const maxMessages = options?.maxMessages || 1;
    const visibilityTimeout = (options?.visibilityTimeout || 30) * 1000;

    for (let i = 0; i < maxMessages; i++) {
      const item = await this.queue.dequeue();
      if (!item) break;

      const message: Message<T> = {
        id: item.id,
        body: item.data,
        receiptHandle: `${item.id}-${Date.now()}`,
        attributes: {},
      };

      // Set visibility timeout
      const timeout = setTimeout(async () => {
        // Return message to queue if not deleted
        if (this.processingMessages.has(message.receiptHandle)) {
          await this.queue.nack(item.id);
          this.processingMessages.delete(message.receiptHandle);
        }
      }, visibilityTimeout);

      this.processingMessages.set(message.receiptHandle, { message, timeout });
      messages.push(message);
    }

    return messages;
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const processing = this.processingMessages.get(receiptHandle);
    if (!processing) {
      throw new Error('Receipt handle not found or expired');
    }

    clearTimeout(processing.timeout);
    await this.queue.ack(processing.message.id);
    this.processingMessages.delete(receiptHandle);
  }

  getQueueUrl(): string {
    return `memory://${this.queueName}`;
  }

  getQueueName(): string {
    return this.queueName;
  }
}