import { LoggerService } from 'shared';
import { DLQMessage } from './dlq-monitor.service';

export interface PriorityMessage extends DLQMessage {
  priority: number;
  insertTime: Date;
  retryAfter?: Date;
}

export enum MessagePriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 8,
  CRITICAL = 10,
}

export class PriorityQueueService {
  private queue: PriorityMessage[] = [];
  private processing = false;
  private maxQueueSize = 1000;

  constructor(
    private readonly logger: LoggerService,
    maxSize?: number
  ) {
    if (maxSize) {
      this.maxQueueSize = maxSize;
    }
  }

  enqueue(
    message: DLQMessage,
    priority: MessagePriority = MessagePriority.NORMAL
  ): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      this.logger.warn('Priority queue is at capacity, dropping message', {
        metadata: {
          messageId: message.id,
          queueSize: this.queue.length,
          maxSize: this.maxQueueSize,
        },
      });
      return false;
    }

    const priorityMessage: PriorityMessage = {
      ...message,
      priority,
      insertTime: new Date(),
    };

    // Calculate priority based on various factors
    const calculatedPriority = this.calculateDynamicPriority(priorityMessage);
    priorityMessage.priority = calculatedPriority;

    // Insert in priority order (higher priority = higher number)
    const insertIndex = this.findInsertionIndex(calculatedPriority);
    this.queue.splice(insertIndex, 0, priorityMessage);

    this.logger.debug('Message enqueued with priority', {
      metadata: {
        messageId: message.id,
        priority: calculatedPriority,
        queuePosition: insertIndex,
        queueSize: this.queue.length,
      },
    });

    return true;
  }

  dequeue(): PriorityMessage | null {
    // Find the first message that is ready to process
    const readyIndex = this.queue.findIndex(
      msg => !msg.retryAfter || msg.retryAfter <= new Date()
    );

    if (readyIndex === -1) {
      return null; // No messages ready for processing
    }

    const message = this.queue.splice(readyIndex, 1)[0];

    this.logger.debug('Message dequeued for processing', {
      metadata: {
        messageId: message.id,
        priority: message.priority,
        waitTime: Date.now() - message.insertTime.getTime(),
        queueSize: this.queue.length,
      },
    });

    return message;
  }

  peek(): PriorityMessage | null {
    const readyMessage = this.queue.find(
      msg => !msg.retryAfter || msg.retryAfter <= new Date()
    );
    return readyMessage || null;
  }

  scheduleRetry(messageId: string, retryDelayMs: number): boolean {
    const messageIndex = this.queue.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      return false;
    }

    const message = this.queue[messageIndex];
    message.retryAfter = new Date(Date.now() + retryDelayMs);

    this.logger.debug('Message scheduled for retry', {
      metadata: {
        messageId,
        retryAfter: message.retryAfter.toISOString(),
        delayMs: retryDelayMs,
      },
    });

    return true;
  }

  removeMessage(messageId: string): boolean {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(msg => msg.id !== messageId);

    const removed = this.queue.length < initialLength;
    if (removed) {
      this.logger.debug('Message removed from priority queue', {
        metadata: { messageId, remainingInQueue: this.queue.length },
      });
    }

    return removed;
  }

  size(): number {
    return this.queue.length;
  }

  getReadyCount(): number {
    const now = new Date();
    return this.queue.filter(msg => !msg.retryAfter || msg.retryAfter <= now)
      .length;
  }

  getQueueStatus(): {
    totalMessages: number;
    readyMessages: number;
    messagesByQueue: Record<string, number>;
    messagesByPriority: Record<number, number>;
    oldestMessage?: Date;
  } {
    const now = new Date();
    const readyMessages = this.queue.filter(
      msg => !msg.retryAfter || msg.retryAfter <= now
    ).length;

    const messagesByQueue = this.queue.reduce(
      (acc, msg) => {
        acc[msg.queueType] = (acc[msg.queueType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const messagesByPriority = this.queue.reduce(
      (acc, msg) => {
        acc[msg.priority] = (acc[msg.priority] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>
    );

    const oldestMessage =
      this.queue.length > 0
        ? Math.min(...this.queue.map(msg => msg.insertTime.getTime()))
        : undefined;

    return {
      totalMessages: this.queue.length,
      readyMessages,
      messagesByQueue,
      messagesByPriority,
      oldestMessage: oldestMessage ? new Date(oldestMessage) : undefined,
    };
  }

  clear(): void {
    const clearedCount = this.queue.length;
    this.queue = [];

    this.logger.info('Priority queue cleared', {
      metadata: { clearedMessages: clearedCount },
    });
  }

  private calculateDynamicPriority(message: PriorityMessage): number {
    let priority = message.priority;

    // Increase priority based on queue type
    switch (message.queueType) {
      case 'broadcast-tx':
        priority += 2; // Broadcast failures are more critical
        break;
      case 'signed-tx':
        priority += 1; // Signed tx failures are moderately critical
        break;
      case 'tx-request':
        // Keep base priority
        break;
    }

    // Increase priority for messages waiting longer
    const waitTimeMinutes =
      (Date.now() - message.timestamp.getTime()) / (60 * 1000);
    if (waitTimeMinutes > 60) {
      // More than 1 hour
      priority += 3;
    } else if (waitTimeMinutes > 30) {
      // More than 30 minutes
      priority += 2;
    } else if (waitTimeMinutes > 10) {
      // More than 10 minutes
      priority += 1;
    }

    // Cap the priority at maximum
    return Math.min(priority, MessagePriority.CRITICAL);
  }

  private findInsertionIndex(priority: number): number {
    // Binary search for the correct insertion point
    let left = 0;
    let right = this.queue.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.queue[mid].priority >= priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }
}
