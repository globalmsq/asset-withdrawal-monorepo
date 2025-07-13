// Mock all dependencies before any imports
jest.mock('database', () => ({
  UserService: jest.fn(() => ({
    createUser: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    findMany: jest.fn(),
  })),
  DatabaseService: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockReturnValue({
      withdrawalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          requestId: 'tx-1234567890-abc123def',
          amount: '0.5',
          currency: 'ETH',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          network: 'polygon',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          requestId: 'tx-1234567890-abc123def',
          amount: '0.5',
          currency: 'ETH',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          network: 'polygon',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        count: jest.fn().mockResolvedValue(2),
      },
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
  TransactionService: jest.fn().mockImplementation(() => ({
    createTransaction: jest.fn().mockResolvedValue({}),
    getTransactionById: jest.fn().mockResolvedValue({
      id: 'test-tx-id',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  })),
}));

jest.mock('../services/auth.service');

jest.mock('shared', () => ({
  ...jest.requireActual('shared'),
  TransactionStatus: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  QueueFactory: {
    createFromEnv: jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValue(undefined),
      receiveMessages: jest.fn().mockResolvedValue([]),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      getQueueUrl: jest.fn().mockResolvedValue('https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'),
    }),
  },
}));

import request from 'supertest';
import app from '../app';
import { DatabaseService } from 'database';

// Mock the database service getter
jest.mock('../services/database', () => ({
  getDatabase: jest.fn(() => require('database').DatabaseService.mock.instances[0]),
  initializeDatabase: jest.fn(),
}));

describe('Withdrawal API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /withdrawal/request', () => {
    it('should create withdrawal request', async () => {
      const withdrawalData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'polygon',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 400 for missing fields', async () => {
      const withdrawalData = {
        amount: '0.5',
        // Missing required fields
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid amount', async () => {
      const invalidData = {
        amount: 'invalid',
        toAddress: '0x742D35Cc6634C0532925a3b8D45a0E5e7F3d1234',
        tokenAddress: '0xA0b86991c431e60e50074006c5a5B4234e5f50D',
        network: 'polygon',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid amount');
    });

    it('should return 400 for unsupported network', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742D35Cc6634C0532925a3b8D45a0E5e7F3d1234',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Only polygon network is supported');
    });
  });

  describe('GET /withdrawal/status/:id', () => {
    it('should return withdrawal request status', async () => {
      const requestId = 'tx-1234567890-abc123def';

      const response = await request(app)
        .get(`/withdrawal/status/${requestId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(requestId);
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 404 for non-existent withdrawal request', async () => {
      const { DatabaseService } = require('database');
      const mockClient = DatabaseService.mock.instances[0].getClient();
      mockClient.withdrawalRequest.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/withdrawal/status/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Withdrawal request not found');
    });
  });

  describe('GET /withdrawal/queue/status', () => {
    it('should return queue status with tx-request counts', async () => {
      const response = await request(app)
        .get('/withdrawal/queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tx-request');
      expect(response.body.data['tx-request']).toHaveProperty('size');
      expect(response.body.data['tx-request']).toHaveProperty('processing');
      expect(response.body.data['tx-request'].processing).toBe(2); // Mocked count value
    });
  });

  describe('GET /withdrawal/queue/items', () => {
    it('should return queue items', async () => {
      const { QueueFactory } = require('shared');
      const mockQueue = QueueFactory.createFromEnv();
      mockQueue.receiveMessages.mockResolvedValueOnce([
        {
          id: 'msg-1',
          body: {
            id: 'tx-1234567890-abc123def',
            amount: '0.5',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            tokenAddress: '0x0000000000000000000000000000000000000000',
            network: 'polygon',
          },
          receiptHandle: 'receipt-handle-123456789012345678901234567890',
          attributes: {},
        },
      ]);

      const response = await request(app)
        .get('/withdrawal/queue/items')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('queueUrl');
      expect(response.body.data).toHaveProperty('messageCount');
      expect(response.body.data).toHaveProperty('messages');
      expect(response.body.data.messageCount).toBe(1);
      expect(response.body.data.messages[0].id).toBe('msg-1');
    });
  });
});

describe('Health Check', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });
});
