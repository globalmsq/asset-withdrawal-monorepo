"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueFactory = void 0;
const sqs_queue_1 = require("./sqs-queue");
class QueueFactory {
    static create(config) {
        // Always use SQS, endpoint determines if it's LocalStack or AWS
        return new sqs_queue_1.SQSQueue(config);
    }
    static createFromEnv(queueName) {
        const config = {
            queueName,
            region: process.env.AWS_REGION || 'ap-northeast-2',
            endpoint: process.env.AWS_ENDPOINT,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
        return this.create(config);
    }
}
exports.QueueFactory = QueueFactory;
//# sourceMappingURL=queue-factory.js.map