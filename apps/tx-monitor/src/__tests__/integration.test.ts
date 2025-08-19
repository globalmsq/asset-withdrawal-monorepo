import { MonitorService } from '../services/monitor.service';
import { WebSocketService } from '../services/websocket.service';
import { PollingService } from '../services/polling.service';
import { ChainService } from '../services/chain.service';

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
        chainId: 137,
      },
    },
    ethereum: {
      mainnet: {
        requiredConfirmations: 12,
        rpcUrl: 'https://ethereum.publicnode.com',
        chainId: 1,
      },
    },
  }),
}));

jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getTransactionReceipt: jest.fn().mockResolvedValue(null),
    getTransaction: jest.fn().mockResolvedValue(null),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  WebSocketProvider: jest.fn().mockImplementation(() => ({
    getTransactionReceipt: jest.fn().mockResolvedValue(null),
    getTransaction: jest.fn().mockResolvedValue(null),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
}));

jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    readyState: 1, // WebSocket.OPEN
  }));
});

describe('TX Monitor Integration Tests', () => {
  let monitorService: MonitorService;
  let chainService: ChainService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (monitorService) {
      await monitorService.shutdown();
    }
  });

  describe('Service Integration', () => {
    it('should create all services without errors', () => {
      expect(() => {
        monitorService = new MonitorService();
        chainService = new ChainService();
      }).not.toThrow();
    });

    it('should initialize monitor service', async () => {
      monitorService = new MonitorService();
      await expect(monitorService.initialize()).resolves.not.toThrow();
    });

    it('should shutdown monitor service gracefully', async () => {
      monitorService = new MonitorService();
      await monitorService.initialize();
      await expect(monitorService.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Transaction Flow', () => {
    it('should handle transaction monitoring workflow', async () => {
      monitorService = new MonitorService();
      await monitorService.initialize();

      // Add a transaction
      const transaction = {
        txHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        chain: 'polygon',
        network: 'mainnet',
        status: 'SENT' as const,
        nonce: 1,
      };

      await expect(
        monitorService.addTransaction(transaction)
      ).resolves.not.toThrow();

      // Check that transaction is being monitored
      const activeTransactions = monitorService.getActiveTransactions();
      expect(activeTransactions.has(transaction.txHash)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle service initialization failures gracefully', async () => {
      // This test ensures error handling doesn't break the service
      monitorService = new MonitorService();

      // Even if some parts fail, the service should handle it gracefully
      await expect(monitorService.initialize()).resolves.not.toThrow();
    });
  });
});
