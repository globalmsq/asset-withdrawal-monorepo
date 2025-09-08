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

// Mock chains.config.json
jest.mock(
  '../../../packages/shared/src/config/chains.config.json',
  () => ({
    polygon: {
      mainnet: { enabled: true, chainId: 137 },
      testnet: { enabled: true, chainId: 80002 },
    },
    ethereum: {
      mainnet: { enabled: false, chainId: 1 },
      testnet: { enabled: false, chainId: 11155111 },
    },
    bsc: {
      mainnet: { enabled: false, chainId: 56 },
      testnet: { enabled: false, chainId: 97 },
    },
    localhost: {
      testnet: { enabled: true, chainId: 31337 },
    },
  }),
  { virtual: true }
);

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
  toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
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
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT',
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
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
        .post('/api/withdrawal/request')
        .send(withdrawalData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid amount format', async () => {
      const invalidData = {
        amount: 'invalid',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Invalid amount format. Must be a positive number'
      );
    });

    it('should return 400 for disabled chain/network', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'ethereum', // ethereum/mainnet is disabled
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('is currently disabled');
    });

    // Symbol mismatch test is disabled since token whitelist is temporarily disabled
    it.skip('should return 400 for symbol mismatch', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT address
        symbol: 'USDC', // Wrong symbol
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token symbol mismatch');
    });

    it('should accept withdrawal request without symbol', async () => {
      const withdrawalData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(withdrawalData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 400 for native token transfer', async () => {
      const nativeTokenData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        symbol: 'MATIC', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(nativeTokenData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Native token transfers are not supported. Only ERC-20 tokens are allowed.'
      );
    });

    // New test cases for address validation
    it('should return 400 for invalid toAddress format', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: 'invalid_0x123', // Invalid Ethereum address
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid recipient address format');
    });

    it('should return 400 for invalid tokenAddress format', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xINVALID', // Invalid Ethereum address
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token address format');
    });

    // New test cases for chain/network validation
    it('should return 400 for non-existent chain', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'nonexistent',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Unsupported chain/network combination'
      );
    });

    it('should return 400 for invalid network for chain', async () => {
      const invalidData = {
        amount: '0.5',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'localhost', // localhost doesn't have mainnet
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Unsupported chain/network combination'
      );
    });

    // New test cases for amount format validation
    it('should return 400 for amount with too many decimal places', async () => {
      const invalidData = {
        amount: '0.1234567', // 7 decimal places, USDT has 6 decimals max
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Amount has too many decimal places. Maximum 6 decimals allowed for this token'
      );
    });

    it('should return 400 for zero amount', async () => {
      const invalidData = {
        amount: '0',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Amount must be greater than 0');
    });

    it('should return 400 for negative amount', async () => {
      const invalidData = {
        amount: '-10',
        toAddress: '0x742d35Cc6634c0532925a3b844bC9e7595F0FAED',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT', // Added symbol to avoid symbol validation
        network: 'mainnet',
        chain: 'polygon',
      };

      const response = await request(app)
        .post('/api/withdrawal/request')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Invalid amount format. Must be a positive number'
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
        .get(`/api/withdrawal/status/${requestId}`)
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
        .get('/api/withdrawal/status/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Withdrawal request not found');
    });
  });

  describe('GET /withdrawal/request-queue/status', () => {
    it('should return request queue status', async () => {
      const response = await request(app)
        .get('/api/withdrawal/request-queue/status')
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
        .get('/api/withdrawal/tx-queue/status')
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
