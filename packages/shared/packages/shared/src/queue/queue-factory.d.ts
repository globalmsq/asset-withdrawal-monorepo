import { IQueue, QueueConfig } from './interfaces';
export declare class QueueFactory {
    static create<T>(config: QueueConfig): IQueue<T>;
    static createFromEnv<T>(queueName: string): IQueue<T>;
}
