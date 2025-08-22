import { SigningWorker } from '../../workers/signing-worker';
import { Config } from '../../config';
import { Logger } from '../../utils/logger';
import { SecureSecretsManager } from '../../services/secrets-manager';
import {
  WithdrawalRequestService,
  DatabaseService,
  SignedTransactionService,
} from '@asset-withdrawal/database';
import {
  WithdrawalRequest,
  ChainProviderFactory,
  TransactionStatus,
  Message,
} from '@asset-withdrawal/shared';

// Mock dependencies
jest.mock('@asset-withdrawal/database');
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    zadd: jest.fn().mockResolvedValue(1),
    zpopmin: jest.fn().mockResolvedValue([]),
    zcard: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  }));
});
jest.mock('@asset-withdrawal/shared', () => ({
  ...jest.requireActual('@asset-withdrawal/shared'),
  ChainProviderFactory: {
    createPolygonProvider: jest.fn(),
    getProvider: jest.fn().mockReturnValue({
      getProvider: jest.fn(),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0x1234567890123456789012345678901234567890'),
      getChainId: jest.fn().mockReturnValue(137),
    }),
  },
  TransactionStatus: {
    PENDING: 'PENDING',
    VALIDATING: 'VALIDATING',
    SIGNING: 'SIGNING',
    SIGNED: 'SIGNED',
    BROADCASTING: 'BROADCASTING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
}));
jest.mock('../../services/transaction-signer');
jest.mock('@aws-sdk/client-sqs');
jest.mock('../../services/nonce-cache.service', () => ({
  NonceCacheService: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(0),
    incrementAndGet: jest.fn().mockResolvedValue(1),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('SigningWorker Multi-Instance Support', () => {
  let signingWorker1: SigningWorker;
  let signingWorker2: SigningWorker;
  let mockConfig: Config;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWithdrawalRequestService: jest.Mocked<WithdrawalRequestService>;
  let mockSignedTransactionService: jest.Mocked<SignedTransactionService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockDbClient: any;
  let mockInputQueue: any;
  let mockOutputQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      nodeEnv: 'test',
      encryptionKey: 'test-encryption-key-exactly-32-characters-long',
      aws: {
        region: 'ap-northeast-2',
        endpoint: 'http://localhost:4566',
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      secretsManager: {
        privateKeySecret: 'test-private-key',
      },
      queue: {
        requestQueueUrl: 'http://localhost:4566/queue/tx-request',
        signedTxQueueUrl: 'http://localhost:4566/queue/signed-tx',
        requestDlqUrl: 'http://localhost:4566/queue/tx-request-dlq',
        signedTxDlqUrl: 'http://localhost:4566/queue/signed-tx-dlq',
      },
      polygon: {
        network: 'amoy',
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        chainId: 80002,
      },
      logging: {
        level: 'info',
        auditLogPath: './logs/audit.log',
      },
      database: {
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: 'pass',
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
      },
      batchProcessing: {
        enabled: true,
        minBatchSize: 5,
        batchThreshold: 3,
        minGasSavingsPercent: 20,
        singleTxGasEstimate: 65000,
        batchBaseGas: 100000,
        batchPerTxGas: 25000,
      },
    };

    mockSecretsManager = {
      getPrivateKey: jest
        .fn()
        .mockReturnValue(
          '0x0000000000000000000000000000000000000000000000000000000000000001'
        ),
      initialize: jest.fn(),
      refreshSecrets: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      auditSuccess: jest.fn(),
      auditFailure: jest.fn(),
    } as any;

    mockWithdrawalRequestService = {
      updateStatus: jest.fn(),
      updateStatusWithError: jest.fn(),
    } as any;

    mockSignedTransactionService = {
      create: jest.fn(),
      findByRequestId: jest.fn(),
    } as any;

    mockDbClient = {
      withdrawalRequest: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      batchTransaction: {
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockDatabaseService = {
      getInstance: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(mockDbClient),
        healthCheck: jest.fn().mockResolvedValue(true),
      }),
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(
      mockDatabaseService.getInstance()
    );
    (WithdrawalRequestService as jest.Mock).mockImplementation(
      () => mockWithdrawalRequestService
    );
    (SignedTransactionService as jest.Mock).mockImplementation(
      () => mockSignedTransactionService
    );

    // Mock chain provider
    const mockProvider = {
      getProvider: jest.fn().mockReturnValue({
        getFeeData: jest.fn().mockResolvedValue({
          maxFeePerGas: BigInt('20000000000'),
          maxPriorityFeePerGas: BigInt('1000000000'),
        }),
      }),
      getMulticall3Address: jest.fn().mockReturnValue('0x1234567890abcdef'),
      getChainId: jest.fn().mockReturnValue(80002),
    };

    (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
      mockProvider
    );

    // Create two worker instances
    signingWorker1 = new SigningWorker(
      mockConfig,
      mockSecretsManager,
      mockLogger
    );
    signingWorker2 = new SigningWorker(
      mockConfig,
      mockSecretsManager,
      mockLogger
    );

    // Mock queue methods
    mockInputQueue = {
      receiveMessages: jest.fn(),
      deleteMessage: jest.fn(),
    };
    mockOutputQueue = {
      sendMessage: jest.fn(),
    };

    // Setup queues for both workers
    (signingWorker1 as any).inputQueue = mockInputQueue;
    (signingWorker1 as any).outputQueue = mockOutputQueue;
    (signingWorker2 as any).inputQueue = mockInputQueue;
    (signingWorker2 as any).outputQueue = mockOutputQueue;
  });

  describe('claimMessages', () => {
    it('should atomically claim messages to prevent duplicate processing', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
        {
          id: 'msg-2',
          receiptHandle: 'receipt-2',
          body: {
            id: 'test-2',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '2000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();
      const instanceId1 = (signingWorker1 as any).instanceId;

      // Mock transaction to simulate atomic update
      let callCount = 0;
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        callCount++;
        if (callCount === 1) {
          // First message - successful claim
          const mockDb = {
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.PENDING,
                processingInstanceId: null,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: 'test-1',
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              }),
            },
          };
          return await fn(mockDb);
        } else {
          // Second message - already being processed
          const mockDb = {
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.VALIDATING,
                processingInstanceId: 'another-instance',
              }),
              update: jest.fn(),
            },
          };
          return await fn(mockDb);
        }
      });

      const claimedMessages = await (signingWorker1 as any).claimMessages(
        messages
      );

      expect(claimedMessages).toHaveLength(1);
      expect(claimedMessages[0].body.id).toBe('test-1');
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-2');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message already claimed by another instance, removed from queue',
        { requestId: 'test-2' }
      );
    });

    it('should handle missing withdrawal requests gracefully', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'non-existent',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();

      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce(null),
            update: jest.fn(),
          },
        });
      });

      const claimedMessages = await (signingWorker1 as any).claimMessages(
        messages
      );

      expect(claimedMessages).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Withdrawal request not found in database',
        { requestId: 'non-existent' }
      );
    });

    it('should skip messages already in non-PENDING status', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();

      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.SIGNING,
              processingInstanceId: 'some-instance',
            }),
            update: jest.fn(),
          },
        });
      });

      const claimedMessages = await (signingWorker1 as any).claimMessages(
        messages
      );

      expect(claimedMessages).toHaveLength(0);
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Withdrawal request already being processed or completed',
        expect.objectContaining({
          requestId: 'test-1',
          status: TransactionStatus.SIGNING,
        })
      );
    });
  });

  describe('processMessage with instance ownership', () => {
    it('should only process messages owned by the current instance', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-1',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      await signingWorker1.initialize();
      const instanceId1 = (signingWorker1 as any).instanceId;

      // Mock transaction signer
      const mockTransactionSigner = {
        signTransaction: jest.fn().mockResolvedValue({
          hash: '0xabc123',
          nonce: 1,
          gasLimit: '21000',
          maxFeePerGas: '20000000000',
          maxPriorityFeePerGas: '1000000000',
          from: '0xfrom',
          to: '0xto',
          value: '0',
          data: '0x',
          chainId: 80002,
        }),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };
      (signingWorker1 as any).transactionSigner = mockTransactionSigner;
      (signingWorker1 as any).getOrCreateSigner = jest
        .fn()
        .mockResolvedValue(mockTransactionSigner);

      // Mock ownership check - message is owned by different instance
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.VALIDATING,
              processingInstanceId: 'different-instance',
            }),
            update: jest.fn(),
          },
        });
      });

      const result = await signingWorker1.processMessage(withdrawalRequest);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Request no longer owned by this instance',
        expect.objectContaining({
          requestId: 'test-1',
          currentInstanceId: instanceId1,
          ownerInstanceId: 'different-instance',
        })
      );
      expect(mockTransactionSigner.signTransaction).not.toHaveBeenCalled();
    });

    it('should successfully process messages owned by the current instance', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-1',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      await signingWorker1.initialize();
      const instanceId1 = (signingWorker1 as any).instanceId;

      // Mock transaction signer
      const mockTransactionSigner = {
        signTransaction: jest.fn().mockResolvedValue({
          hash: '0xabc123',
          nonce: 1,
          gasLimit: '21000',
          maxFeePerGas: '20000000000',
          maxPriorityFeePerGas: '1000000000',
          from: '0xfrom',
          to: '0xto',
          value: '0',
          data: '0x',
          chainId: 80002,
        }),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };
      (signingWorker1 as any).transactionSigner = mockTransactionSigner;
      (signingWorker1 as any).getOrCreateSigner = jest
        .fn()
        .mockResolvedValue(mockTransactionSigner);

      // Mock ownership check - message is owned by current instance
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.VALIDATING,
              processingInstanceId: instanceId1,
            }),
            update: jest.fn().mockResolvedValueOnce({
              requestId: 'test-1',
              status: TransactionStatus.SIGNING,
              tryCount: 1,
            }),
          },
        });
      });

      mockSignedTransactionService.findByRequestId.mockResolvedValue([]);

      const result = await signingWorker1.processMessage(withdrawalRequest);

      expect(result).toBeDefined();
      expect(result?.hash).toBe('0xabc123');
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalled();
      expect(mockWithdrawalRequestService.updateStatus).toHaveBeenCalledWith(
        'test-1',
        TransactionStatus.SIGNED
      );
    });
  });

  describe('createBatchWithLocking', () => {
    it('should create batch only when all messages are owned by current instance', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
        {
          id: 'msg-2',
          receiptHandle: 'receipt-2',
          body: {
            id: 'test-2',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '2000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();
      const instanceId1 = (signingWorker1 as any).instanceId;

      // Mock all messages owned by current instance
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findMany: jest.fn().mockResolvedValueOnce([
              {
                requestId: 'test-1',
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              },
              {
                requestId: 'test-2',
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              },
            ]),
            updateMany: jest.fn().mockResolvedValueOnce({ count: 2 }),
          },
          signedBatchTransaction: {
            create: jest.fn().mockResolvedValueOnce({
              id: 123n,
              totalAmount: '3000000000000000000',
            }),
          },
        });
      });

      const tokenAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66';
      const batch = await (signingWorker1 as any).createBatchWithLocking(
        tokenAddress,
        messages
      );

      expect(batch).toBeDefined();
      expect(batch.id.toString()).toBe('123');
      expect(batch.totalAmount).toBe('3000000000000000000');
    });

    it('should return null when some messages are not owned by current instance', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
        {
          id: 'msg-2',
          receiptHandle: 'receipt-2',
          body: {
            id: 'test-2',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '2000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();
      const instanceId1 = (signingWorker1 as any).instanceId;

      // Mock only one message owned by current instance
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findMany: jest.fn().mockResolvedValueOnce([
              {
                requestId: 'test-1',
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              },
              // test-2 is missing - claimed by another instance
            ]),
            updateMany: jest.fn(),
          },
          batchTransaction: {
            create: jest.fn(),
          },
        });
      });

      const tokenAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66';
      const batch = await (signingWorker1 as any).createBatchWithLocking(
        tokenAddress,
        messages
      );

      expect(batch).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Some messages were already processed by another instance',
        expect.objectContaining({
          expected: 2,
          found: 1,
        })
      );
    });
  });

  describe('Concurrent processing scenarios', () => {
    it('should handle concurrent message claiming by multiple instances', async () => {
      const messages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'polygon',
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000000000000000000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      await signingWorker1.initialize();
      await signingWorker2.initialize();

      const instanceId1 = (signingWorker1 as any).instanceId;
      const instanceId2 = (signingWorker2 as any).instanceId;

      // Mock concurrent claim attempts
      let claimCount = 0;
      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        claimCount++;
        if (claimCount === 1) {
          // First instance successfully claims
          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.PENDING,
                processingInstanceId: null,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: 'test-1',
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              }),
            },
          });
        } else {
          // Second instance fails to claim
          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.VALIDATING,
                processingInstanceId: instanceId1,
              }),
              update: jest.fn(),
            },
          });
        }
      });

      // Both instances try to claim the same message
      const claimed1 = await (signingWorker1 as any).claimMessages(messages);
      const claimed2 = await (signingWorker2 as any).claimMessages(messages);

      expect(claimed1).toHaveLength(1);
      expect(claimed2).toHaveLength(0);
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle processing timeout scenario', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-1',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      await signingWorker1.initialize();

      // Mock a message that has been processing for too long
      const processingStartedAt = new Date();
      processingStartedAt.setMinutes(processingStartedAt.getMinutes() - 10); // 10 minutes ago

      mockDbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.VALIDATING,
              processingInstanceId: 'stale-instance',
              processingStartedAt: processingStartedAt,
            }),
            update: jest.fn(),
          },
        });
      });

      // This test demonstrates that the current implementation doesn't handle timeouts
      // In a production system, you would implement timeout detection and recovery
      const result = await signingWorker1.processMessage(withdrawalRequest);
      expect(result).toBeNull();
    });
  });
});
