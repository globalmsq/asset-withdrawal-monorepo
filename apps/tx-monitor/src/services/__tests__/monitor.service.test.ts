import { MonitorService } from '../monitor.service';
import { ChainService } from '../chain.service';
import { GasRetryService } from '../gas-retry.service';

// Mock dependencies with proper implementations
jest.mock('@asset-withdrawal/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
    sentTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    disconnect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    subscribe: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    off: jest.fn(),
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
    polygon: {
      mainnet: {
        requiredConfirmations: 30,
        rpcUrl: 'https://polygon-rpc.com',
      },
    },
    ethereum: {
      mainnet: {
        requiredConfirmations: 12,
        rpcUrl: 'https://ethereum.publicnode.com',
      },
    },
  }),
}));

jest.mock('../chain.service', () => ({
  ChainService: jest.fn().mockImplementation(() => ({
    getProvider: jest.fn().mockReturnValue({
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getTransaction: jest.fn().mockResolvedValue(null),
      on: jest.fn(),
      off: jest.fn(),
    }),
    shutdown: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../gas-retry.service', () => ({
  GasRetryService: jest.fn().mockImplementation(() => ({
    shutdown: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    processStuckTransactions: jest.fn().mockResolvedValue(0),
  })),
}));

describe('MonitorService', () => {
  let monitorService: MonitorService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create new instance for each test
    monitorService = new MonitorService();
  });

  afterEach(async () => {
    // Cleanup
    if (monitorService) {
      await monitorService.shutdown();
    }
  });

  describe('initialization', () => {
    it('should create MonitorService instance', () => {
      expect(monitorService).toBeDefined();
      expect(monitorService).toBeInstanceOf(MonitorService);
    });

    it('should initialize successfully', async () => {
      // This test passes if no errors are thrown during initialization
      await expect(monitorService.initialize()).resolves.not.toThrow();
    });
  });

  describe('transaction management', () => {
    it('should add transaction to monitoring', async () => {
      const transaction = {
        txHash: '0x1234567890abcdef',
        chain: 'polygon',
        network: 'mainnet',
        status: 'SENT' as const,
      };

      await expect(
        monitorService.addTransaction(transaction)
      ).resolves.not.toThrow();
    });

    it('should throw error when adding transaction without hash', async () => {
      const transaction = {
        chain: 'polygon',
        network: 'mainnet',
      };

      await expect(monitorService.addTransaction(transaction)).rejects.toThrow(
        'Transaction hash is required'
      );
    });
  });

  describe('active transactions', () => {
    it('should return active transactions map', () => {
      const activeTransactions = monitorService.getActiveTransactions();
      expect(activeTransactions).toBeInstanceOf(Map);
    });

    it('should return transactions by tier', () => {
      const fastTransactions = monitorService.getTransactionsByTier('fast');
      expect(Array.isArray(fastTransactions)).toBe(true);

      const mediumTransactions = monitorService.getTransactionsByTier('medium');
      expect(Array.isArray(mediumTransactions)).toBe(true);

      const fullTransactions = monitorService.getTransactionsByTier('full');
      expect(Array.isArray(fullTransactions)).toBe(true);
    });
  });
});
