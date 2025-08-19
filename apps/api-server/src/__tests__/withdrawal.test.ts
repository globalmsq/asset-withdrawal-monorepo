// Mock all dependencies before any imports
jest.mock('database');

jest.mock('../services/auth.service');

jest.mock('../middleware/readiness.middleware', () => ({
  readinessCheck: jest.fn((req, res, next) => next()),
  readinessHandler: jest.fn((req, res) =>
    res.status(200).json({ status: 'ready' })
  ),
  setReadiness: jest.fn(),
}));

jest.mock('shared', () => ({
  ...jest.requireActual('shared'),
  TransactionStatus: {
    PENDING: 'PENDING',
    VALIDATING: 'VALIDATING',
    SIGNING: 'SIGNING',
    SIGNED: 'SIGNED',
    BROADCASTING: 'BROADCASTING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
  QueueFactory: {
    createFromEnv: jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValue(undefined),
      receiveMessages: jest.fn().mockResolvedValue([]),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      getQueueUrl: jest
        .fn()
        .mockResolvedValue(
          'https://sqs.ap-northeast-2.amazonaws.com/123456789012/test-queue'
        ),
    }),
  },
  tokenService: {
    getTokenByAddress: jest
      .fn()
      .mockImplementation((address, network, chain) => {
        if (
          address === '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' &&
          chain === 'polygon'
        ) {
          return {
            address,
            symbol: 'USDT',
            decimals: 6,
            name: 'Tether USD',
            network,
            chainId: 137,
          };
        }
        return null;
      }),
    isTokenSupported: jest
      .fn()
      .mockImplementation((address, network, chain) => {
        if (
          address === '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' &&
          chain === 'polygon'
        ) {
          return true;
        }
        return false;
      }),
    getSupportedBlockchains: jest.fn().mockReturnValue(['polygon', 'bsc']),
    getSupportedNetworks: jest.fn().mockReturnValue(['mainnet', 'amoy']),
  },
}));

import request from 'supertest';
import app from '../app';

// Mock the database service getter
const mockWithdrawalRequest = {
  id: 1,
  requestId: '41d4-e29b-550e8400-a716-446655440000',
  amount: '0.5',
  symbol: 'USDT',
  toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
  tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  network: 'mainnet',
  chain: 'polygon',
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDatabaseInstance = {
  getClient: jest.fn().mockReturnValue({
    withdrawalRequest: {
      create: jest.fn().mockResolvedValue(mockWithdrawalRequest),
      findUnique: jest.fn().mockResolvedValue(mockWithdrawalRequest),
      update: jest.fn().mockResolvedValue({
        ...mockWithdrawalRequest,
        status: 'FAILED',
        errorMessage: 'Failed to queue for processing',
      }),
      count: jest.fn().mockImplementation(args => {
        if (args?.where?.status?.in) {
          return Promise.resolve(2);
        } else if (args?.where?.status === 'BROADCASTING') {
          return Promise.resolve(1);
        }
        return Promise.resolve(2);
      }),
    },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }),
  connect: jest.fn(),
  disconnect: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(true),
};

jest.mock('../services/database', () => ({
  getDatabase: jest.fn(() => mockDatabaseInstance),
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
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT',
        network: 'mainnet',
        chain: 'polygon',
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
        network: 'mainnet',
        chain: 'polygon',
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
        network: 'mainnet',
        chain: 'ethereum',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('is not supported');
    });

    it('should return 400 for symbol mismatch', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742D35Cc6634C0532925a3b8D45a0E5e7F3d1234',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT address
        symbol: 'USDC', // Wrong symbol
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token symbol mismatch');
    });

    it('should accept withdrawal request without symbol', async () => {
      const withdrawalData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(withdrawalData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 400 for native token transfer', async () => {
      const nativeTokenData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/withdrawal/request')
        .send(nativeTokenData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Native token transfers are not supported. Only ERC-20 tokens from the approved list are allowed.'
      );
    });

    // Note: SQS send failure test requires complex mocking setup
    // This scenario is covered by integration tests in the tx-broadcaster service
    // See GitHub issue #[api-sqs-failure-test] for future unit test implementation
  });

  describe('GET /withdrawal/status/:id', () => {
    it('should return withdrawal request status', async () => {
      const requestId = '41d4-e29b-550e8400-a716-446655440000';

      const response = await request(app)
        .get(`/withdrawal/status/${requestId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(requestId);
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 404 for non-existent withdrawal request', async () => {
      // Update the mock to return null for this specific test
      mockDatabaseInstance
        .getClient()
        .withdrawalRequest.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/withdrawal/status/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Withdrawal request not found');
    });
  });

  describe('GET /withdrawal/request-queue/status', () => {
    it('should return request queue status', async () => {
      const response = await request(app)
        .get('/withdrawal/request-queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('size');
      expect(response.body.data).toHaveProperty('processing');
      expect(response.body.data.processing).toBe(2); // Mocked count value
    });
  });

  describe('GET /withdrawal/tx-queue/status', () => {
    it('should return transaction queue status', async () => {
      const response = await request(app)
        .get('/withdrawal/tx-queue/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('size');
      expect(response.body.data).toHaveProperty('broadcasting');
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
