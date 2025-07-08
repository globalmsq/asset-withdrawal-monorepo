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

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: jest.fn((req, res, next) => {
    // Set a default user for authenticated requests
    req.user = {
      userId: 'test-user-123',
      email: 'test@example.com',
      role: 'USER',
    };
    next();
  }),
  authorize: jest.fn(() => (req: any, res: any, next: any) => next()),
  AuthRequest: {},
}));

jest.mock('shared', () => ({
  ...jest.requireActual('shared'),
  TransactionStatus: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  queueManager: {
    getQueue: jest.fn().mockReturnValue({
      enqueue: jest.fn().mockResolvedValue('mock-message-id'),
      dequeue: jest.fn().mockResolvedValue(null),
      ack: jest.fn().mockResolvedValue(true),
      nack: jest.fn().mockResolvedValue(false),
      getQueueSize: jest.fn().mockReturnValue(0),
      getProcessingSize: jest.fn().mockReturnValue(0),
    }),
    getAllQueues: jest.fn().mockReturnValue(new Map()),
  },
}));

import request from 'supertest';
import app from '../app';
import { TransactionService } from 'database';

describe('Withdrawal API', () => {
  describe('POST /withdrawal/request', () => {
    it('should create withdrawal request', async () => {
      const withdrawalData = {
        userId: 'test-user-123',
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
        userId: 'test-user-123',
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
        userId: 'user123',
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
      // Create a transaction first
      const withdrawalData = {
        userId: 'test-user-123',
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
      };

      const createResponse = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData);

      const transactionId = createResponse.body.data.id;

      TransactionService.mockImplementation(() => ({
        createTransaction: jest.fn().mockResolvedValue({}),
        getTransactionById: jest.fn().mockResolvedValue({
          id: transactionId,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      }));

      // Get transaction status
      const response = await request(app)
        .get(`/withdrawal/status/${transactionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(transactionId);
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
    it('should return queue status', async () => {
      const response = await request(app)
        .get('/withdrawal/queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tx-request');
      expect(response.body.data['tx-request']).toHaveProperty('size');
      expect(response.body.data['tx-request']).toHaveProperty('processing');
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
