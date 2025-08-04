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
    it('should convert old SignedTransactionMessage to unified format', () => {
      const oldMessage: SignedTransactionMessage = {
        id: 'msg-123',
        userId: 'user-456',
        withdrawalId: 'withdrawal-789',
        transactionHash: '0xabc123',
        signedTransaction: '0xsigned',
        toAddress: '0xrecipient',
        amount: '1000000',
        tokenAddress: '0xtoken',
        nonce: 5,
        gasLimit: '21000',
        gasPrice: '20000000000',
        chainId: 137,
        createdAt: '2025-08-04T00:00:00Z',
      };

      // @ts-ignore - accessing private method for testing
      const unified = worker.convertToUnifiedMessage(oldMessage);

      expect(unified).toEqual({
        id: 'msg-123',
        transactionType: 'SINGLE',
        withdrawalId: 'withdrawal-789',
        userId: 'user-456',
        transactionHash: '0xabc123',
        signedTransaction: '0xsigned',
        chainId: 137,
        metadata: {
          toAddress: '0xrecipient',
          amount: '1000000',
          tokenAddress: '0xtoken',
        },
        createdAt: '2025-08-04T00:00:00Z',
      });
    });

    it('should return unified message as-is if already in unified format', () => {
      const unifiedMessage: UnifiedSignedTransactionMessage = {
        id: 'msg-batch-123',
        transactionType: 'BATCH',
        batchId: 'batch-456',
        userId: 'user-789',
        transactionHash: '0xbatch123',
        signedTransaction: '0xsignedbatch',
        chainId: 137,
        metadata: {
          totalRequests: 5,
          requestIds: ['req1', 'req2', 'req3', 'req4', 'req5'],
        },
        createdAt: '2025-08-04T00:00:00Z',
      };

      // @ts-ignore - accessing private method for testing
      const result = worker.convertToUnifiedMessage(unifiedMessage);

      expect(result).toBe(unifiedMessage);
    });
  });
});
