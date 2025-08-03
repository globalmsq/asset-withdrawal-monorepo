"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueManager = exports.QueueManager = exports.InMemoryQueue = void 0;
class InMemoryQueue {
    name;
    queue = [];
    processingQueue = [];
    maxRetries = 3;
    constructor(name) {
        this.name = name;
    }
    async enqueue(data) {
        const message = {
            id: this.generateId(),
            data,
            timestamp: new Date(),
            retryCount: 0,
        };
        this.queue.push(message);
        return message.id;
    }
    async dequeue() {
        const message = this.queue.shift();
        if (message) {
            this.processingQueue.push(message);
        }
        return message || null;
    }
    async ack(messageId) {
        const index = this.processingQueue.findIndex(msg => msg.id === messageId);
        if (index !== -1) {
            this.processingQueue.splice(index, 1);
            return true;
        }
        return false;
    }
    async nack(messageId) {
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
    getQueueSize() {
        return this.queue.length;
    }
    getProcessingSize() {
        return this.processingQueue.length;
    }
    getQueueItems() {
        return [...this.queue];
    }
    getProcessingItems() {
        return [...this.processingQueue];
    }
    generateId() {
        return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.InMemoryQueue = InMemoryQueue;
class QueueManager {
    queues = new Map();
    getQueue(name) {
        if (!this.queues.has(name)) {
            this.queues.set(name, new InMemoryQueue(name));
        }
        return this.queues.get(name);
    }
    getAllQueues() {
        return this.queues;
    }
}
exports.QueueManager = QueueManager;
exports.queueManager = new QueueManager();
//# sourceMappingURL=queue.js.map