export interface Message<T> {
  id: string;
  body: T;
  receiptHandle: string;
  attributes?: Record<string, string>;
}

export interface MessageAttribute {
  DataType: string;
  StringValue?: string;
  BinaryValue?: Uint8Array;
}

export interface SendMessageOptions {
  delaySeconds?: number;
  messageAttributes?: Record<string, MessageAttribute>;
}

export interface ReceiveMessageOptions {
  maxMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
}

export interface IQueue<T> {
  sendMessage(data: T, options?: SendMessageOptions): Promise<string>;
  receiveMessages(options?: ReceiveMessageOptions): Promise<Message<T>[]>;
  deleteMessage(receiptHandle: string): Promise<void>;
  getQueueUrl(): Promise<string>;
  getQueueName(): string;
}

export interface QueueConfig {
  queueName: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}