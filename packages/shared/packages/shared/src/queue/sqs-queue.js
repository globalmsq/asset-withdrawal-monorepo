"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQSQueue = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const logger_service_1 = require("../services/logger.service");
class SQSQueue {
    config;
    client;
    queueUrl;
    queueName;
    logger;
    constructor(config) {
        this.config = config;
        this.queueName = config.queueName;
        this.logger = config.logger || new logger_service_1.LoggerService({ service: 'sqs-queue' });
        const clientConfig = {
            region: config.region || 'ap-northeast-2',
        };
        // If endpoint is provided, we're using LocalStack
        if (config.endpoint) {
            clientConfig.endpoint = config.endpoint;
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId || 'test',
                secretAccessKey: config.secretAccessKey || 'test',
            };
        }
        else if (config.accessKeyId && config.secretAccessKey) {
            // For AWS, only set credentials if explicitly provided
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            };
        }
        // Otherwise, AWS SDK will use default credential chain (IAM roles, etc.)
        this.client = new client_sqs_1.SQSClient(clientConfig);
    }
    async sendMessage(data, options) {
        const queueUrl = await this.getOrCreateQueueUrl();
        const command = new client_sqs_1.SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(data),
            DelaySeconds: options?.delaySeconds,
            MessageAttributes: options?.messageAttributes,
        });
        const response = await this.client.send(command);
        return response.MessageId;
    }
    async receiveMessages(options) {
        const queueUrl = await this.getOrCreateQueueUrl();
        const command = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: options?.maxMessages || 1,
            WaitTimeSeconds: options?.waitTimeSeconds || 0,
            // Don't set VisibilityTimeout here - use queue's default configuration
            ...(options?.visibilityTimeout !== undefined && {
                VisibilityTimeout: options.visibilityTimeout,
            }),
            MessageAttributeNames: ['All'],
        });
        const response = await this.client.send(command);
        if (!response.Messages) {
            return [];
        }
        return response.Messages.map(msg => ({
            id: msg.MessageId,
            body: JSON.parse(msg.Body),
            receiptHandle: msg.ReceiptHandle,
            attributes: msg.MessageAttributes
                ? Object.entries(msg.MessageAttributes).reduce((acc, [key, value]) => {
                    acc[key] = value.StringValue || '';
                    return acc;
                }, {})
                : undefined,
        }));
    }
    async deleteMessage(receiptHandle) {
        const queueUrl = await this.getOrCreateQueueUrl();
        const command = new client_sqs_1.DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
        });
        await this.client.send(command);
    }
    async getQueueUrl() {
        return await this.getOrCreateQueueUrl();
    }
    getQueueName() {
        return this.queueName;
    }
    async getQueueAttributes() {
        const queueUrl = await this.getOrCreateQueueUrl();
        try {
            const command = new client_sqs_1.GetQueueAttributesCommand({
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
                approximateNumberOfMessages: parseInt(attributes.ApproximateNumberOfMessages || '0', 10),
                approximateNumberOfMessagesNotVisible: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0', 10),
                approximateNumberOfMessagesDelayed: parseInt(attributes.ApproximateNumberOfMessagesDelayed || '0', 10),
            };
        }
        catch (error) {
            this.logger.error('Error getting queue attributes:', error);
            // Return zeros if there's an error
            return {
                approximateNumberOfMessages: 0,
                approximateNumberOfMessagesNotVisible: 0,
                approximateNumberOfMessagesDelayed: 0,
            };
        }
    }
    async getOrCreateQueueUrl() {
        if (this.queueUrl) {
            return this.queueUrl;
        }
        try {
            const command = new client_sqs_1.GetQueueUrlCommand({
                QueueName: this.queueName,
            });
            const response = await this.client.send(command);
            this.queueUrl = response.QueueUrl;
            return this.queueUrl;
        }
        catch (error) {
            if (error.name === 'QueueDoesNotExist') {
                if (this.config.endpoint) {
                    throw new Error(`Queue ${this.queueName} does not exist. Please run init-localstack.sh`);
                }
                else {
                    throw new Error(`Queue ${this.queueName} does not exist in AWS SQS.`);
                }
            }
            throw error;
        }
    }
}
exports.SQSQueue = SQSQueue;
//# sourceMappingURL=sqs-queue.js.map