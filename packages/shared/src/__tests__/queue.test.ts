import { InMemoryQueue, QueueManager, queueManager } from '../queue';

describe('InMemoryQueue', () => {
  let queue: InMemoryQueue<string>;

  beforeEach(() => {
    queue = new InMemoryQueue<string>('test-queue');
  });

  describe('enqueue', () => {
    it('should add message to queue', async () => {
      const messageId = await queue.enqueue('test data');

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');
      expect(messageId).toContain('test-queue');
      expect(queue.getQueueSize()).toBe(1);
    });

    it('should generate unique message IDs', async () => {
      const id1 = await queue.enqueue('data1');
      const id2 = await queue.enqueue('data2');

      expect(id1).not.toBe(id2);
      expect(queue.getQueueSize()).toBe(2);
    });

    it('should handle multiple data types', async () => {
      const objectQueue = new InMemoryQueue<object>('object-queue');
      const testData = { test: 'value', number: 42 };

      const messageId = await objectQueue.enqueue(testData);
      expect(messageId).toBeDefined();
      expect(objectQueue.getQueueSize()).toBe(1);
    });
  });

  describe('dequeue', () => {
    it('should return null when queue is empty', async () => {
      const message = await queue.dequeue();
      expect(message).toBeNull();
    });

    it('should return and remove message from queue', async () => {
      const testData = 'test data';
      await queue.enqueue(testData);

      const message = await queue.dequeue();

      expect(message).toBeDefined();
      expect(message?.data).toBe(testData);
      expect(message?.id).toBeDefined();
      expect(message?.timestamp).toBeInstanceOf(Date);
      expect(message?.retryCount).toBe(0);
      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getProcessingSize()).toBe(1);
    });

    it('should maintain FIFO order', async () => {
      await queue.enqueue('first');
      await queue.enqueue('second');
      await queue.enqueue('third');

      const first = await queue.dequeue();
      const second = await queue.dequeue();
      const third = await queue.dequeue();

      expect(first?.data).toBe('first');
      expect(second?.data).toBe('second');
      expect(third?.data).toBe('third');
      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getProcessingSize()).toBe(3);
    });
  });

  describe('ack', () => {
    it('should acknowledge and remove message from processing queue', async () => {
      await queue.enqueue('test data');
      const message = await queue.dequeue();

      expect(queue.getProcessingSize()).toBe(1);

      const ackResult = await queue.ack(message!.id);

      expect(ackResult).toBe(true);
      expect(queue.getProcessingSize()).toBe(0);
    });

    it('should return false for non-existent message ID', async () => {
      const ackResult = await queue.ack('non-existent-id');
      expect(ackResult).toBe(false);
    });

    it('should handle multiple messages', async () => {
      await queue.enqueue('data1');
      await queue.enqueue('data2');

      const msg1 = await queue.dequeue();
      const msg2 = await queue.dequeue();

      expect(queue.getProcessingSize()).toBe(2);

      const ack1 = await queue.ack(msg1!.id);
      expect(ack1).toBe(true);
      expect(queue.getProcessingSize()).toBe(1);

      const ack2 = await queue.ack(msg2!.id);
      expect(ack2).toBe(true);
      expect(queue.getProcessingSize()).toBe(0);
    });
  });

  describe('nack', () => {
    it('should reject message and retry if under max retries', async () => {
      await queue.enqueue('test data');
      const message = await queue.dequeue();

      expect(queue.getProcessingSize()).toBe(1);
      expect(queue.getQueueSize()).toBe(0);

      const nackResult = await queue.nack(message!.id);

      expect(nackResult).toBe(true);
      expect(queue.getProcessingSize()).toBe(0);
      expect(queue.getQueueSize()).toBe(1);

      // Check that retry count is incremented
      const retryMessage = await queue.dequeue();
      expect(retryMessage?.retryCount).toBe(1);
    });

    it('should discard message when max retries exceeded', async () => {
      await queue.enqueue('test data');
      let message = await queue.dequeue();

      // Exceed max retries (3)
      for (let i = 0; i < 4; i++) {
        await queue.nack(message!.id);
        if (i < 3) {
          message = await queue.dequeue();
          expect(message?.retryCount).toBe(i + 1);
        }
      }

      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getProcessingSize()).toBe(0);
    });

    it('should return false for non-existent message ID', async () => {
      const nackResult = await queue.nack('non-existent-id');
      expect(nackResult).toBe(false);
    });
  });

  describe('size methods', () => {
    it('should track queue size correctly', async () => {
      expect(queue.getQueueSize()).toBe(0);

      await queue.enqueue('data1');
      expect(queue.getQueueSize()).toBe(1);

      await queue.enqueue('data2');
      expect(queue.getQueueSize()).toBe(2);

      await queue.dequeue();
      expect(queue.getQueueSize()).toBe(1);
    });

    it('should track processing size correctly', async () => {
      expect(queue.getProcessingSize()).toBe(0);

      await queue.enqueue('data1');
      await queue.enqueue('data2');

      const msg1 = await queue.dequeue();
      expect(queue.getProcessingSize()).toBe(1);

      const msg2 = await queue.dequeue();
      expect(queue.getProcessingSize()).toBe(2);

      await queue.ack(msg1!.id);
      expect(queue.getProcessingSize()).toBe(1);

      await queue.ack(msg2!.id);
      expect(queue.getProcessingSize()).toBe(0);
    });
  });
});

describe('QueueManager', () => {
  let manager: QueueManager;

  beforeEach(() => {
    manager = new QueueManager();
  });

  describe('getQueue', () => {
    it('should create new queue if not exists', () => {
      const queue = manager.getQueue('test-queue');

      expect(queue).toBeInstanceOf(InMemoryQueue);
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should return existing queue', () => {
      const queue1 = manager.getQueue('test-queue');
      const queue2 = manager.getQueue('test-queue');

      expect(queue1).toBe(queue2);
    });

    it('should handle different queue names', () => {
      const queue1 = manager.getQueue('queue1');
      const queue2 = manager.getQueue('queue2');

      expect(queue1).not.toBe(queue2);
      expect(manager.getAllQueues().size).toBe(2);
    });

    it('should support generic types', async () => {
      const stringQueue = manager.getQueue<string>('string-queue');
      const numberQueue = manager.getQueue<number>('number-queue');

      await stringQueue.enqueue('test string');
      await numberQueue.enqueue(42);

      const stringMessage = await stringQueue.dequeue();
      const numberMessage = await numberQueue.dequeue();

      expect(typeof stringMessage?.data).toBe('string');
      expect(typeof numberMessage?.data).toBe('number');
      expect(stringMessage?.data).toBe('test string');
      expect(numberMessage?.data).toBe(42);
    });
  });

  describe('getAllQueues', () => {
    it('should return empty map initially', () => {
      const queues = manager.getAllQueues();
      expect(queues.size).toBe(0);
      expect(queues).toBeInstanceOf(Map);
    });

    it('should return all created queues', () => {
      manager.getQueue('queue1');
      manager.getQueue('queue2');
      manager.getQueue('queue3');

      const queues = manager.getAllQueues();
      expect(queues.size).toBe(3);
      expect(queues.has('queue1')).toBe(true);
      expect(queues.has('queue2')).toBe(true);
      expect(queues.has('queue3')).toBe(true);
    });
  });
});

describe('queueManager singleton', () => {
  it('should be instance of QueueManager', () => {
    expect(queueManager).toBeInstanceOf(QueueManager);
  });

  it('should maintain state across calls', async () => {
    const queue = queueManager.getQueue('singleton-test');
    await queue.enqueue('test data');

    const sameQueue = queueManager.getQueue('singleton-test');
    expect(sameQueue.getQueueSize()).toBe(1);

    const message = await sameQueue.dequeue();
    expect(message?.data).toBe('test data');
  });
});
