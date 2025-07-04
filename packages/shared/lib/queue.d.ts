import { QueueMessage } from './types';
export declare class InMemoryQueue<T = any> {
    private name;
    private queue;
    private processingQueue;
    private maxRetries;
    constructor(name: string);
    enqueue(data: T): Promise<string>;
    dequeue(): Promise<QueueMessage<T> | null>;
    ack(messageId: string): Promise<boolean>;
    nack(messageId: string): Promise<boolean>;
    getQueueSize(): number;
    getProcessingSize(): number;
    private generateId;
}
export declare class QueueManager {
    private queues;
    getQueue<T = any>(name: string): InMemoryQueue<T>;
    getAllQueues(): Map<string, InMemoryQueue>;
}
export declare const queueManager: QueueManager;
