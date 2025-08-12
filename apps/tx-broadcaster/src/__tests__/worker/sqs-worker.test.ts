import { SQSWorker } from '../../worker/sqs-worker';
import {
  SignedTransactionMessage,
  UnifiedSignedTransactionMessage,
} from '../../services/queue-client';

// Mock the dependencies
jest.mock('../../services/broadcaster');
jest.mock('@asset-withdrawal/shared', () => ({
  LoggerService: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));
jest.mock('../../services/redis-client', () => ({
  getRedisClient: jest.fn(),
  BroadcastRedisService: jest.fn(),
  closeRedisClient: jest.fn(),
}));
jest.mock('../../services/queue-client', () => ({
  ...jest.requireActual('../../services/queue-client'),
  QueueService: jest.fn().mockImplementation(() => ({
    receiveMessages: jest.fn(),
    sendMessage: jest.fn(),
    deleteMessage: jest.fn(),
    sendToBroadcastQueue: jest.fn(),
  })),
}));
jest.mock('../../services/chain-config.service', () => ({
  ChainConfigService: jest.fn().mockImplementation(() => ({
    loadChainsConfig: jest.fn(),
    getChainConfig: jest.fn(),
    getProvider: jest.fn(),
    getSupportedChainIds: jest.fn().mockReturnValue([137, 80002]),
    isChainSupported: jest.fn().mockReturnValue(true),
    logSupportedChains: jest.fn(),
  })),
  getChainConfigService: jest.fn().mockReturnValue({
    loadChainsConfig: jest.fn(),
    getChainConfig: jest.fn(),
    getProvider: jest.fn(),
    getSupportedChainIds: jest.fn().mockReturnValue([137, 80002]),
    isChainSupported: jest.fn().mockReturnValue(true),
    logSupportedChains: jest.fn(),
  }),
}));
jest.mock('../../services/nonce-manager', () => ({
  NonceManager: jest.fn().mockImplementation(() => ({
    addTransaction: jest.fn(),
    getNextTransaction: jest.fn(),
    startProcessing: jest.fn(),
    completeTransaction: jest.fn(),
    removeTransaction: jest.fn(),
    isAddressProcessing: jest.fn(),
    getQueueStatus: jest.fn(),
    getPendingTransactions: jest.fn(),
    clearAll: jest.fn(),
    getNonceGapInfo: jest.fn(),
    getStatistics: jest.fn(),
  })),
}));

describe('SQSWorker', () => {
  let worker: SQSWorker;
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Set up required environment variables for tests
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SIGNED_TX_QUEUE_URL: 'https://sqs.test.com/signed-tx-queue',
      BROADCAST_TX_QUEUE_URL: 'https://sqs.test.com/broadcast-tx-queue',
      MYSQL_HOST: 'localhost',
      MYSQL_PORT: '3306',
      MYSQL_DATABASE: 'test_db',
      MYSQL_USER: 'test',
      MYSQL_PASSWORD: 'test',
    };

    worker = new SQSWorker();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('convertToUnifiedMessage', () => {
    it('should convert signing-service message with rawTransaction to unified format', () => {
      const signingServiceMessage = {
        requestId: 'req-123',
        transactionType: 'SINGLE',
        hash: '0xabc123',
        rawTransaction: '0xsigned',
        chainId: 137,
      };

      // @ts-ignore - accessing private method for testing
      const unified = worker.convertToUnifiedMessage(signingServiceMessage);

      expect(unified).toEqual({
        id: 'req-123',
        transactionType: 'SINGLE',
        withdrawalId: 'req-123',
        batchId: undefined,
        userId: 'signing-service',
        transactionHash: '0xabc123',
        signedTransaction: '0xsigned',
        chainId: 137,
        metadata: {},
        createdAt: expect.any(String),
      });
    });

    it('should convert batch signing-service message to unified format', () => {
      const batchMessage = {
        requestId: 'req-batch-123',
        transactionType: 'BATCH',
        batchId: 'batch-456',
        hash: '0xbatch123',
        rawTransaction: '0xsignedbatch',
        chainId: 137,
      };

      // @ts-ignore - accessing private method for testing
      const unified = worker.convertToUnifiedMessage(batchMessage);

      expect(unified).toEqual({
        id: 'req-batch-123',
        transactionType: 'BATCH',
        withdrawalId: undefined,
        batchId: 'batch-456',
        userId: 'signing-service',
        transactionHash: '0xbatch123',
        signedTransaction: '0xsignedbatch',
        chainId: 137,
        metadata: {},
        createdAt: expect.any(String),
      });
    });

    it('should handle legacy message format as fallback', () => {
      const legacyMessage = {
        id: 'legacy-123',
        userId: 'user-456',
        withdrawalId: 'withdrawal-789',
        transactionHash: '0xlegacy123',
        signedTransaction: '0xlegacysigned',
        chainId: 137,
      };

      // @ts-ignore - accessing private method for testing
      const unified = worker.convertToUnifiedMessage(legacyMessage);

      expect(unified).toEqual({
        id: 'legacy-123',
        transactionType: 'SINGLE',
        withdrawalId: 'withdrawal-789',
        userId: 'user-456',
        transactionHash: '0xlegacy123',
        signedTransaction: '0xlegacysigned',
        chainId: 137,
        metadata: {},
        createdAt: expect.any(String),
      });
    });
  });
});
