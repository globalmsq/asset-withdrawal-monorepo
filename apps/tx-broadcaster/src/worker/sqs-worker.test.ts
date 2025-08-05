import { SQSWorker } from './sqs-worker';
import {
  SignedTransactionMessage,
  UnifiedSignedTransactionMessage,
} from '../services/queue-client';

// Mock the dependencies
jest.mock('../services/broadcaster');
jest.mock('../services/redis-client', () => ({
  getRedisClient: jest.fn(),
  BroadcastRedisService: jest.fn(),
  closeRedisClient: jest.fn(),
}));
jest.mock('../services/queue-client', () => ({
  ...jest.requireActual('../services/queue-client'),
  QueueService: jest.fn().mockImplementation(() => ({
    receiveMessages: jest.fn(),
    sendMessage: jest.fn(),
    deleteMessage: jest.fn(),
    sendToBroadcastQueue: jest.fn(),
  })),
}));
jest.mock('../services/chain-config.service', () => ({
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

describe('SQSWorker', () => {
  let worker: SQSWorker;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    worker = new SQSWorker();
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
