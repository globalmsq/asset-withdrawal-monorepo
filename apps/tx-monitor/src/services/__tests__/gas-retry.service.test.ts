import { GasRetryService } from '../gas-retry.service';
import { MonitoredTransaction } from '../../types';

// Mock dependencies with proper implementations
jest.mock('@asset-withdrawal/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      getClient: jest.fn().mockReturnValue({
        $disconnect: jest.fn().mockResolvedValue(undefined),
        sentTransaction: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
      healthCheck: jest.fn().mockResolvedValue(true),
    }),
  },
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    disconnect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  }));
});

jest.mock('@asset-withdrawal/shared', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loadChainConfig: jest.fn().mockReturnValue({
    polygon: { mainnet: { requiredConfirmations: 30 } },
    ethereum: { mainnet: { requiredConfirmations: 12 } },
  }),
}));

jest.mock('../chain.service', () => ({
  ChainService: jest.fn().mockImplementation(() => ({
    getProvider: jest.fn().mockReturnValue({
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getTransaction: jest.fn().mockResolvedValue(null),
      getGasPrice: jest.fn().mockResolvedValue('20000000000'),
    }),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('GasRetryService', () => {
  let gasRetryService: GasRetryService;

  beforeEach(() => {
    jest.clearAllMocks();
    gasRetryService = new GasRetryService();
  });

  afterEach(async () => {
    if (gasRetryService) {
      await gasRetryService.shutdown();
    }
  });

  describe('initialization', () => {
    it('should create GasRetryService instance', () => {
      expect(gasRetryService).toBeDefined();
      expect(gasRetryService).toBeInstanceOf(GasRetryService);
    });
  });

  describe('stuck transaction detection', () => {
    it('should return false for non-pending transactions', async () => {
      const transaction: MonitoredTransaction = {
        txHash: '0x1234567890abcdef',
        chain: 'polygon',
        network: 'mainnet',
        status: 'CONFIRMED',
        confirmations: 30,
        lastChecked: new Date(),
        retryCount: 0,
        nonce: 1,
        requestId: null,
        batchId: null,
      };

      const isStuck = await gasRetryService.isTransactionStuck(transaction);
      expect(isStuck).toBe(false);
    });

    it('should return false for recently sent transactions', async () => {
      const transaction: MonitoredTransaction = {
        txHash: '0x1234567890abcdef',
        chain: 'polygon',
        network: 'mainnet',
        status: 'SENT',
        confirmations: 0,
        lastChecked: new Date(), // Recent timestamp
        retryCount: 0,
        nonce: 1,
        requestId: null,
        batchId: null,
      };

      const isStuck = await gasRetryService.isTransactionStuck(transaction);
      expect(isStuck).toBe(false);
    });
  });

  describe('stuck transaction processing', () => {
    it('should process stuck transactions without errors', async () => {
      const processedCount = await gasRetryService.processStuckTransactions();
      expect(typeof processedCount).toBe('number');
      expect(processedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
