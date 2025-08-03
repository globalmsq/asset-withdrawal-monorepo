import { IQueue, Message, SendMessageOptions, ReceiveMessageOptions, QueueConfig, QueueAttributes } from './interfaces';
export declare class SQSQueue<T> implements IQueue<T> {
    private config;
    private client;
    private queueUrl?;
    private queueName;
    private logger;
    constructor(config: QueueConfig);
    sendMessage(data: T, options?: SendMessageOptions): Promise<string>;
    receiveMessages(options?: ReceiveMessageOptions): Promise<Message<T>[]>;
    deleteMessage(receiptHandle: string): Promise<void>;
    getQueueUrl(): Promise<string>;
    getQueueName(): string;
    getQueueAttributes(): Promise<QueueAttributes>;
    private getOrCreateQueueUrl;
}
