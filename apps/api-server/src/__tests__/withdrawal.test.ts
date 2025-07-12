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
    getClient: jest.fn(),
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
import { TransactionService } from 'database';

describe('Withdrawal API', () => {
  describe('POST /withdrawal/request', () => {
    it('should create withdrawal request', async () => {
      const { TransactionService } = require('database');
      TransactionService.mockImplementation(() => ({
        createTransaction: jest.fn().mockResolvedValue({ id: 'test-tx-id' }),
        getTransactionById: jest.fn().mockResolvedValue(null),
      }));

      const withdrawalData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('pending');
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
        network: 'ethereum',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid amount');
    });
  });

  describe('GET /withdrawal/status/:id', () => {
    it('should return transaction status', async () => {
      const { TransactionService } = require('database');
      const transactionId = 'test-tx-id';
      
      // Mock for the POST request first
      TransactionService.mockImplementation(() => ({
        createTransaction: jest.fn().mockResolvedValue({ id: transactionId }),
        getTransactionById: jest.fn().mockResolvedValue(null),
      }));
      
      // Create a transaction first
      const withdrawalData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
      };

      const createResponse = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData);

      const createdId = createResponse.body.data.id;

      // Now mock for the GET request
      TransactionService.mockImplementation(() => ({
        createTransaction: jest.fn().mockResolvedValue({}),
        getTransactionById: jest.fn().mockResolvedValue({
          id: createdId,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      }));

      // Get transaction status
      const response = await request(app)
        .get(`/withdrawal/status/${createdId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(createdId);
    });

    it('should return 404 for non-existent transaction', async () => {
      const { TransactionService } = require('database');
      TransactionService.mockImplementation(() => ({
        createTransaction: jest.fn().mockResolvedValue({}),
        getTransactionById: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/withdrawal/status/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });
  });

  describe('GET /withdrawal/queue/status', () => {
    it('should return queue status info', async () => {
      const response = await request(app)
        .get('/withdrawal/queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('CloudWatch');
      expect(response.body.data).toHaveProperty('queueUrl');
      expect(response.body.data).toHaveProperty('endpoint');
    });
  });

  describe('GET /withdrawal/queue/items', () => {
    it('should return queue items info', async () => {
      const response = await request(app)
        .get('/withdrawal/queue/items')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('AWS Console or CLI');
      expect(response.body.data).toHaveProperty('note');
      expect(response.body.data.note).toContain('aws sqs receive-message');
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
