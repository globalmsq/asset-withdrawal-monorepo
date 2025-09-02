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

describe('SigningWorker Validation', () => {
  let signingWorker: SigningWorker;
  let mockConfig: Config;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWithdrawalRequestService: jest.Mocked<WithdrawalRequestService>;
  let mockSignedTransactionService: jest.Mocked<SignedTransactionService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockDbClient: any;
  let mockInputQueue: any;
  let mockOutputQueue: any;
  let mockProvider: any;

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
        enabled: true, // Enable batch processing to test validation logic
        minBatchSize: 10, // Set high to force single processing
        batchThreshold: 10, // Set high to force single processing
        minGasSavingsPercent: 100, // Set high to force single processing
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
        findUnique: jest.fn().mockResolvedValue({
          status: TransactionStatus.PENDING,
          processingInstanceId: null,
        }),
      },
      batchTransaction: {
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async fn => {
        // Execute the transaction function with the mock client
        return await fn(mockDbClient);
      }),
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
    mockProvider = {
      getProvider: jest.fn().mockReturnValue({
        getFeeData: jest.fn().mockResolvedValue({
          maxFeePerGas: BigInt('20000000000'),
          maxPriorityFeePerGas: BigInt('1000000000'),
        }),
      }),
      getMulticall3Address: jest.fn().mockReturnValue('0x1234567890abcdef'),
      getChainId: jest.fn().mockReturnValue(80002),
    };

    (ChainProviderFactory.createPolygonProvider as jest.Mock).mockReturnValue(
      mockProvider
    );
    (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
      mockProvider
    );

    // Create worker instance
    signingWorker = new SigningWorker(
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

    // Access private properties using any type
    (signingWorker as any).inputQueue = mockInputQueue;
    (signingWorker as any).outputQueue = mockOutputQueue;
    (signingWorker as any).batchSize = 10;
  });

  afterEach(async () => {
    // Stop the worker to prevent processLoop from continuing
    if (signingWorker) {
      await signingWorker.stop();
    }
    jest.clearAllMocks();
  });

  describe('validateWithdrawalRequest', () => {
    it('should return null for valid request', () => {
      const validRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        validRequest
      );
      expect(result).toBeNull();
    });

    it('should return error for unsupported chain/network combination', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'unsupported',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      // Mock ChainProviderFactory to throw error for unsupported chain
      (ChainProviderFactory.getProvider as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error('Unsupported chain: unsupported');
        }
      );

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe(
        'Unsupported chain/network combination: unsupported/mainnet'
      );
    });

    it('should return error for missing chain or network information', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        // Missing chain and network fields
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      } as any;

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toContain('Missing chain or network information');
    });

    it('should return error for invalid recipient address', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: 'invalid-address', // Invalid format
        amount: '1000000000000000000',
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe('Invalid recipient address format: invalid-address');
    });

    it('should return error for invalid token address', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: '0xINVALID', // Invalid format
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe('Invalid token address format: 0xINVALID');
    });

    it('should allow null token address for native token transfers', () => {
      const validRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '1000000000000000000',
        tokenAddress: null, // Native token transfer
        symbol: 'MATIC',
      } as any;

      const result = (signingWorker as any).validateWithdrawalRequest(
        validRequest
      );
      expect(result).toBeNull();
    });

    it('should return error for invalid amount', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '-1000', // Negative amount
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe('Invalid amount: -1000. Must be positive');
    });

    it('should return error for zero amount', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: '0', // Zero amount
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe('Invalid amount: 0. Must be positive');
    });

    it('should return error for non-numeric amount', () => {
      const invalidRequest: WithdrawalRequest = {
        id: 'test-id',
        chain: 'polygon',
        network: 'mainnet',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        amount: 'not-a-number', // Non-numeric
        tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
        symbol: 'USDT',
      };

      const result = (signingWorker as any).validateWithdrawalRequest(
        invalidRequest
      );
      expect(result).toBe(
        'Invalid amount format: not-a-number. Must be a valid number'
      );
    });
  });

  describe('processBatch with validation', () => {
    beforeEach(async () => {
      // Initialize the worker
      await signingWorker.initialize();

      // Mock transaction signer initialization
      const mockChainProvider = {
        isConnected: jest.fn().mockReturnValue(true),
        getProvider: jest.fn(),
        chain: 'polygon',
        network: 'mainnet',
      } as any;

      const mockTransactionSigner = {
        initialize: jest.fn(),
        signTransaction: jest.fn().mockResolvedValue({
          hash: '0xabcd',
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
        getChainProvider: jest.fn().mockReturnValue(mockChainProvider),
      };
      (signingWorker as any).transactionSigner = mockTransactionSigner;
      (signingWorker as any).canProcess = jest.fn().mockResolvedValue(true);

      // Mock gas price cache
      const mockGasPriceCache = {
        isValid: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue({
          maxFeePerGas: BigInt('20000000000'),
          maxPriorityFeePerGas: BigInt('1000000000'),
        }),
      };
      (signingWorker as any).gasPriceCache = mockGasPriceCache;

      // Set instance ID for multi-instance testing
      (signingWorker as any).instanceId = 'test-instance-123';
    });

    it('should validate messages immediately after reading from queue', async () => {
      const validMessage: Message<WithdrawalRequest> = {
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
      };

      const invalidMessage: Message<WithdrawalRequest> = {
        id: 'msg-2',
        receiptHandle: 'receipt-2',
        body: {
          id: 'test-2',
          chain: 'unsupported', // Invalid chain
          network: 'mainnet',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
          amount: '1000000000000000000',
          tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
          symbol: 'USDT',
        },
      };

      // Mock ChainProviderFactory to throw error for unsupported chain
      (ChainProviderFactory.getProvider as jest.Mock).mockReset();
      (ChainProviderFactory.getProvider as jest.Mock)
        .mockReturnValueOnce(mockProvider) // Valid chain
        .mockImplementationOnce(() => {
          throw new Error('Unsupported chain: unsupported');
        });

      mockInputQueue.receiveMessages.mockResolvedValue([
        validMessage,
        invalidMessage,
      ]);

      // Mock the claiming process - messages are successfully claimed
      mockDbClient.withdrawalRequest.findUnique
        .mockResolvedValueOnce({
          status: TransactionStatus.PENDING,
          processingInstanceId: null,
        }) // validMessage
        .mockResolvedValueOnce({
          status: TransactionStatus.PENDING,
          processingInstanceId: null,
        }); // invalidMessage

      mockDbClient.withdrawalRequest.update
        .mockResolvedValueOnce({
          requestId: 'test-1',
          status: TransactionStatus.VALIDATING,
        })
        .mockResolvedValueOnce({
          requestId: 'test-2',
          status: TransactionStatus.VALIDATING,
        });

      // Mock withdrawal request findMany to return empty (no previous attempts)
      mockDbClient.withdrawalRequest.findMany.mockResolvedValue([]);

      // Mock processMessage to prevent actual processing
      const processMessageSpy = jest
        .spyOn(signingWorker as any, 'processMessage')
        .mockResolvedValue({
          hash: '0xabcd',
          nonce: 1,
          gasLimit: '21000',
          maxFeePerGas: '20000000000',
          maxPriorityFeePerGas: '1000000000',
          from: '0xfrom',
          to: '0xto',
          value: '0',
          data: '0x',
          chainId: 80002,
        });

      // Execute processBatch
      await (signingWorker as any).processBatch();

      // Verify invalid message was marked as FAILED
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledWith(
        'test-2',
        TransactionStatus.FAILED,
        'Unsupported chain/network combination: unsupported/mainnet'
      );

      // Verify invalid message was deleted from queue
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-2');

      // Verify valid message was processed normally
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).not.toHaveBeenCalledWith(
        'test-1',
        expect.anything(),
        expect.anything()
      );

      // Since we have single processing (not batch), the valid message should be processed and deleted
      // after successful processing through processMessage
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-1');

      // Both messages should be deleted: invalid one immediately, valid one after processing
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledTimes(2);

      // Verify logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid withdrawal request',
        null,
        {
          requestId: 'test-2',
          error: 'Unsupported chain/network combination: unsupported/mainnet',
        }
      );
    });

    it('should handle all invalid messages correctly', async () => {
      const invalidMessages: Message<WithdrawalRequest>[] = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'test-1',
            chain: 'ethereum', // Invalid chain
            network: 'mainnet',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            amount: '1000',
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
            toAddress: 'invalid-address', // Invalid address
            amount: '1000',
            tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
            symbol: 'USDT',
          },
        },
      ];

      // Mock ChainProviderFactory to throw error for ethereum chain
      (ChainProviderFactory.getProvider as jest.Mock).mockReset();
      (ChainProviderFactory.getProvider as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Unsupported chain: ethereum');
        })
        .mockReturnValueOnce(mockProvider); // Valid for polygon

      mockInputQueue.receiveMessages.mockResolvedValue(invalidMessages);

      // Mock the claiming process - messages are successfully claimed
      mockDbClient.withdrawalRequest.findUnique
        .mockResolvedValueOnce({
          status: TransactionStatus.PENDING,
          processingInstanceId: null,
        }) // msg-1
        .mockResolvedValueOnce({
          status: TransactionStatus.PENDING,
          processingInstanceId: null,
        }); // msg-2

      mockDbClient.withdrawalRequest.update
        .mockResolvedValueOnce({
          requestId: 'test-1',
          status: TransactionStatus.VALIDATING,
        })
        .mockResolvedValueOnce({
          requestId: 'test-2',
          status: TransactionStatus.VALIDATING,
        });

      mockDbClient.withdrawalRequest.findMany.mockResolvedValue([]);

      // Execute processBatch
      await (signingWorker as any).processBatch();

      // Verify all invalid messages were marked as FAILED
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledTimes(2);
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledWith(
        'test-1',
        TransactionStatus.FAILED,
        'Unsupported chain/network combination: ethereum/mainnet'
      );
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledWith(
        'test-2',
        TransactionStatus.FAILED,
        'Invalid recipient address format: invalid-address'
      );

      // Verify all invalid messages were deleted from queue
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledTimes(2);
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-1');
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-2');

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No valid messages to process after validation'
      );
    });

    it('should continue processing even if validation error handling fails', async () => {
      const invalidMessage: Message<WithdrawalRequest> = {
        id: 'msg-1',
        receiptHandle: 'receipt-1',
        body: {
          id: 'test-1',
          chain: 'ethereum',
          network: 'mainnet',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
          amount: '1000',
          tokenAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
          symbol: 'USDT',
        },
      };

      // Mock ChainProviderFactory to throw error for ethereum chain
      (ChainProviderFactory.getProvider as jest.Mock).mockReset();
      (ChainProviderFactory.getProvider as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error('Unsupported chain: ethereum');
        }
      );

      mockInputQueue.receiveMessages.mockResolvedValue([invalidMessage]);

      // Mock the claiming process - message is successfully claimed
      mockDbClient.withdrawalRequest.findUnique.mockResolvedValueOnce({
        status: TransactionStatus.PENDING,
        processingInstanceId: null,
      });

      mockDbClient.withdrawalRequest.update.mockResolvedValueOnce({
        requestId: 'test-1',
        status: TransactionStatus.VALIDATING,
      });

      mockDbClient.withdrawalRequest.findMany.mockResolvedValue([]);

      // Make updateStatusWithError fail
      mockWithdrawalRequestService.updateStatusWithError.mockRejectedValue(
        new Error('Database error')
      );

      // Execute processBatch
      await (signingWorker as any).processBatch();

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update invalid request status',
        expect.any(Error),
        { requestId: 'test-1' }
      );

      // Process should continue without throwing
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No valid messages to process after validation'
      );
    });

    it('should handle multi-instance message claiming correctly', async () => {
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

      mockInputQueue.receiveMessages.mockResolvedValue(messages);

      // Mock the claiming process
      // First message: successfully claimed by this instance
      // Second message: already claimed by another instance
      let transactionCallCount = 0;
      mockDbClient.$transaction.mockImplementation(async fn => {
        transactionCallCount++;
        if (transactionCallCount === 1) {
          // First message - successful claim
          mockDbClient.withdrawalRequest.findUnique.mockResolvedValueOnce({
            status: TransactionStatus.PENDING,
            processingInstanceId: null,
          });
          mockDbClient.withdrawalRequest.update.mockResolvedValueOnce({
            requestId: 'test-1',
            status: TransactionStatus.VALIDATING,
            processingInstanceId: 'test-instance-123',
          });
          return await fn(mockDbClient);
        } else if (transactionCallCount === 2) {
          // Second message - already claimed by another instance
          mockDbClient.withdrawalRequest.findUnique.mockResolvedValueOnce({
            status: TransactionStatus.VALIDATING,
            processingInstanceId: 'another-instance',
          });
          // Return null to indicate claim failed
          return null;
        } else {
          // Processing phase
          return await fn(mockDbClient);
        }
      });

      // Set up the rest of the mocks
      mockDbClient.withdrawalRequest.findMany.mockResolvedValue([]);

      // Mock processMessage to prevent actual processing
      const processMessageSpy = jest
        .spyOn(signingWorker as any, 'processMessage')
        .mockResolvedValue({
          hash: '0xabcd',
          nonce: 1,
          gasLimit: '21000',
          maxFeePerGas: '20000000000',
          maxPriorityFeePerGas: '1000000000',
          from: '0xfrom',
          to: '0xto',
          value: '0',
          data: '0x',
          chainId: 80002,
        });

      // Mock the ownership check in processMessage
      mockDbClient.withdrawalRequest.findUnique.mockResolvedValue({
        status: TransactionStatus.VALIDATING,
        processingInstanceId: 'test-instance-123',
      });
      mockDbClient.withdrawalRequest.update.mockResolvedValue({
        requestId: 'test-1',
        status: TransactionStatus.SIGNING,
        tryCount: 1,
      });

      // Mock the gas price cache to avoid fetching gas prices
      const mockGasPriceCache = {
        isValid: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue({
          maxFeePerGas: BigInt('20000000000'),
          maxPriorityFeePerGas: BigInt('1000000000'),
        }),
      };
      (signingWorker as any).gasPriceCache = mockGasPriceCache;

      // Execute processBatch
      await (signingWorker as any).processBatch();

      // Verify the claiming messages were logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Received 2 messages from queue'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully claimed 1 messages'
      );

      // Verify the message already claimed by another instance was handled
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-2');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message already claimed by another instance, removed from queue',
        { requestId: 'test-2' }
      );

      // Since only one message was claimed successfully, only it should be processed
      expect(processMessageSpy).toHaveBeenCalledTimes(1);
    });
  });
});
