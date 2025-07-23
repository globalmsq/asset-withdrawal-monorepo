import { SigningWorker } from '../../workers/signing-worker';
import { Config } from '../../config';
import { Logger } from '../../utils/logger';
import { SecureSecretsManager } from '../../services/secrets-manager';
import { WithdrawalRequestService, DatabaseService, SignedTransactionService } from '@asset-withdrawal/database';
import { WithdrawalRequest, ChainProviderFactory, TransactionStatus } from '@asset-withdrawal/shared';

jest.mock('@asset-withdrawal/database');
jest.mock('@asset-withdrawal/shared', () => ({
  ...jest.requireActual('@asset-withdrawal/shared'),
  ChainProviderFactory: {
    createPolygonProvider: jest.fn(),
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

describe('SigningWorker', () => {
  let signingWorker: SigningWorker;
  let mockConfig: Config;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWithdrawalRequestService: jest.Mocked<WithdrawalRequestService>;
  let mockSignedTransactionService: jest.Mocked<SignedTransactionService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

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
        txRequestQueueUrl: 'http://localhost:4566/queue/tx-request',
        signedTxQueueUrl: 'http://localhost:4566/queue/signed-tx',
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
      getPrivateKey: jest.fn().mockReturnValue('0x0000000000000000000000000000000000000000000000000000000000000001'),
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
      create: jest.fn().mockResolvedValue({}),
      findByRequestId: jest.fn().mockResolvedValue([]),
    } as any;

    mockDatabaseService = {
      getClient: jest.fn().mockReturnValue({
        withdrawalRequest: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
        },
      }),
      getInstance: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue(true),
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDatabaseService);
    (WithdrawalRequestService as jest.Mock).mockImplementation(() => mockWithdrawalRequestService);
    (SignedTransactionService as jest.Mock).mockImplementation(() => mockSignedTransactionService);

    // Mock ChainProviderFactory
    const mockChainProvider = {
      getProvider: jest.fn().mockReturnValue({}),
      getChainId: jest.fn().mockReturnValue(80002),
      getMulticall3Address: jest.fn().mockReturnValue('0xcA11bde05977b3631167028862bE2a173976CA11'),
      chain: 'polygon',
      network: 'testnet',
    };
    (ChainProviderFactory.createPolygonProvider as jest.Mock).mockReturnValue(mockChainProvider);

    signingWorker = new SigningWorker(mockConfig, mockSecretsManager, mockLogger);
  });

  describe('processMessage', () => {
    it('should successfully process and sign a withdrawal request', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'polygon',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      const mockTransactionSigner = {
        signTransaction: jest.fn().mockResolvedValue({
          transactionId: 'test-tx-123',
          hash: '0xabc123...',
          rawTransaction: '0xf86c0a85...',
          nonce: 10,
          gasLimit: '100000',
          maxFeePerGas: '30000000000',
          maxPriorityFeePerGas: '1500000000',
          from: '0x1234567890123456789012345678901234567890',
          to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          value: '0',
          data: '0xa9059cbb...',
          chainId: 80002,
        }),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };

      // Mock the transaction signer
      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      const mockDbClient = mockDatabaseService.getClient();
      expect(mockDbClient.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { requestId: 'test-tx-123' },
        data: {
          status: TransactionStatus.SIGNING,
          tryCount: { increment: 1 },
        },
      });
      expect(mockWithdrawalRequestService.updateStatus).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.SIGNED
      );
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledWith({
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      });
      expect(result).toMatchObject({
        transactionId: 'test-tx-123',
        rawTransaction: '0xf86c0a85...',
      });
    });

    it('should handle unsupported network error', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'ethereum', // Unsupported network
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      expect(mockWithdrawalRequestService.updateStatusWithError).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.FAILED,
        expect.stringContaining('Unsupported network')
      );
      expect(result).toBeNull();
    });

    it('should handle invalid address format', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'polygon',
        toAddress: 'invalid-address',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      expect(mockWithdrawalRequestService.updateStatusWithError).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.FAILED,
        expect.stringContaining('Invalid address format')
      );
      expect(result).toBeNull();
    });

    it('should handle invalid amount', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'polygon',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '-1000', // Invalid negative amount
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      expect(mockWithdrawalRequestService.updateStatusWithError).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.FAILED,
        expect.stringContaining('Invalid amount')
      );
      expect(result).toBeNull();
    });

    it('should handle recoverable errors and throw for retry', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'polygon',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      const mockTransactionSigner = {
        signTransaction: jest.fn().mockRejectedValue(new Error('nonce too low')),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };

      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();

      await expect(signingWorker.processMessage(withdrawalRequest)).rejects.toThrow('nonce too low');

      expect(mockWithdrawalRequestService.updateStatusWithError).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.FAILED,
        'nonce too low'
      );
    });

    it('should handle non-recoverable errors and return null', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'test-tx-123',
        network: 'polygon',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      };

      const mockTransactionSigner = {
        signTransaction: jest.fn().mockRejectedValue(new Error('Invalid token address')),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };

      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      expect(mockWithdrawalRequestService.updateStatusWithError).toHaveBeenCalledWith(
        'test-tx-123',
        TransactionStatus.FAILED,
        'Invalid token address'
      );
      expect(result).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const mockTransactionSigner = {
        initialize: jest.fn(),
      };

      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();

      expect(mockTransactionSigner.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('SigningWorker initialized successfully');
    });
  });

  describe('stop', () => {
    it('should cleanup resources on stop', async () => {
      const mockTransactionSigner = {
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };

      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();
      await signingWorker.stop();

      expect(mockTransactionSigner.cleanup).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('SigningWorker stopped');
    });
  });

  describe('Batch Processing', () => {
    let mockMessages: any[];
    let mockDbClient: any;
    let mockMulticallService: any;
    let mockTransactionSigner: any;

    beforeEach(() => {
      mockMessages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: {
            id: 'req-1',
            amount: '1000000000000000000',
            toAddress: '0x1234567890123456789012345678901234567890',
            tokenAddress: '0xAAA1234567890123456789012345678901234567',
            network: 'polygon',
          },
        },
        {
          id: 'msg-2',
          receiptHandle: 'receipt-2',
          body: {
            id: 'req-2',
            amount: '2000000000000000000',
            toAddress: '0x2234567890123456789012345678901234567890',
            tokenAddress: '0xAAA1234567890123456789012345678901234567',
            network: 'polygon',
          },
        },
        {
          id: 'msg-3',
          receiptHandle: 'receipt-3',
          body: {
            id: 'req-3',
            amount: '3000000000000000000',
            toAddress: '0x3234567890123456789012345678901234567890',
            tokenAddress: '0xAAA1234567890123456789012345678901234567',
            network: 'polygon',
          },
        },
      ];

      mockDbClient = {
        batchTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'batch-123' }),
          update: jest.fn().mockResolvedValue({}),
        },
        withdrawalRequest: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]), // Default: no previous attempts
        },
      };

      mockMulticallService = {
        prepareBatchTransfer: jest.fn().mockResolvedValue({
          calls: [{ target: '0xAAA', allowFailure: false, callData: '0x' }],
          estimatedGasPerCall: 50000n,
          totalEstimatedGas: 150000n,
        }),
      };

      mockTransactionSigner = {
        initialize: jest.fn(),
        signBatchTransaction: jest.fn().mockResolvedValue({
          transactionId: 'batch-123',
          hash: '0xbatchhash',
          rawTransaction: '0xraw',
          nonce: 1,
          gasLimit: '150000',
          maxFeePerGas: '1000000000',
          maxPriorityFeePerGas: '1000000000',
          from: '0x1234',
          to: '0x5678',
          value: '0',
          data: '0x',
          chainId: 80002,
        }),
      };

      // Setup signing worker with mocks
      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.dbClient = mockDbClient;
      signingWorkerAny.multicallService = mockMulticallService;
      signingWorkerAny.transactionSigner = mockTransactionSigner;
      signingWorkerAny.processingMessages = new Set();
      signingWorkerAny.processedCount = 0;
      signingWorkerAny.errorCount = 0;
      signingWorkerAny.inputQueue = {
        receiveMessages: jest.fn().mockResolvedValue(mockMessages),
        deleteMessage: jest.fn().mockResolvedValue({}),
      };
      signingWorkerAny.outputQueue = {
        sendMessage: jest.fn().mockResolvedValue({}),
      };
    });

    describe('shouldUseBatchProcessing', () => {
      it('should return false when batch processing is disabled', async () => {
        mockConfig.batchProcessing.enabled = false;
        const signingWorkerAny = signingWorker as any;
        const result = await signingWorkerAny.shouldUseBatchProcessing(mockMessages);
        expect(result).toBe(false);
      });

      it('should return false when message count is below minimum', async () => {
        mockConfig.batchProcessing.enabled = true;
        mockConfig.batchProcessing.minBatchSize = 5;
        const signingWorkerAny = signingWorker as any;
        const result = await signingWorkerAny.shouldUseBatchProcessing(mockMessages.slice(0, 2));
        expect(result).toBe(false);
      });

      it('should return false when no token group meets threshold', async () => {
        mockConfig.batchProcessing.enabled = true;
        mockConfig.batchProcessing.minBatchSize = 2;
        mockConfig.batchProcessing.batchThreshold = 5;
        const signingWorkerAny = signingWorker as any;
        const result = await signingWorkerAny.shouldUseBatchProcessing(mockMessages);
        expect(result).toBe(false);
      });

      it('should return false when gas savings are below threshold', async () => {
        mockConfig.batchProcessing.enabled = true;
        mockConfig.batchProcessing.minBatchSize = 2;
        mockConfig.batchProcessing.batchThreshold = 2;
        mockConfig.batchProcessing.minGasSavingsPercent = 90; // Very high threshold
        const signingWorkerAny = signingWorker as any;
        const result = await signingWorkerAny.shouldUseBatchProcessing(mockMessages);
        expect(result).toBe(false);
      });

      it('should return true when all conditions are met', async () => {
        mockConfig.batchProcessing.enabled = true;
        mockConfig.batchProcessing.minBatchSize = 2;
        mockConfig.batchProcessing.batchThreshold = 2;
        mockConfig.batchProcessing.minGasSavingsPercent = 10;
        const signingWorkerAny = signingWorker as any;
        const result = await signingWorkerAny.shouldUseBatchProcessing(mockMessages);
        expect(result).toBe(true);
      });

    });

    describe('separateMessagesByTryCount', () => {
      it('should separate messages with previous attempts', async () => {
        mockDbClient.withdrawalRequest.findMany.mockResolvedValue([
          { requestId: 'req-1', tryCount: 1 },
          { requestId: 'req-2', tryCount: 0 },
          { requestId: 'req-3', tryCount: 2 },
        ]);

        const signingWorkerAny = signingWorker as any;
        const { messagesForBatch, messagesForSingle } = await signingWorkerAny.separateMessagesByTryCount(mockMessages);

        expect(messagesForSingle).toHaveLength(2);
        expect(messagesForSingle.map(m => m.body.id).sort()).toEqual(['req-1', 'req-3']);
        expect(messagesForBatch).toHaveLength(1);
        expect(messagesForBatch[0].body.id).toBe('req-2');
      });

      it('should handle all messages without previous attempts', async () => {
        mockDbClient.withdrawalRequest.findMany.mockResolvedValue([
          { requestId: 'req-1', tryCount: 0 },
          { requestId: 'req-2', tryCount: 0 },
          { requestId: 'req-3', tryCount: 0 },
        ]);

        const signingWorkerAny = signingWorker as any;
        const { messagesForBatch, messagesForSingle } = await signingWorkerAny.separateMessagesByTryCount(mockMessages);

        expect(messagesForSingle).toHaveLength(0);
        expect(messagesForBatch).toHaveLength(3);
      });
    });

    describe('groupByToken', () => {
      it('should group messages by token address', () => {
        const mixedMessages = [
          ...mockMessages,
          {
            id: 'msg-4',
            receiptHandle: 'receipt-4',
            body: {
              id: 'req-4',
              amount: '4000000000000000000',
              toAddress: '0x4234567890123456789012345678901234567890',
              tokenAddress: '0xBBB1234567890123456789012345678901234567',
              network: 'polygon',
            },
          },
        ];

        const signingWorkerAny = signingWorker as any;
        const groups = signingWorkerAny.groupByToken(mixedMessages);

        expect(groups.size).toBe(2);
        expect(groups.get('0xaaa1234567890123456789012345678901234567')).toHaveLength(3);
        expect(groups.get('0xbbb1234567890123456789012345678901234567')).toHaveLength(1);
      });

      it('should normalize token addresses to lowercase', () => {
        const mixedCaseMessages = [
          {
            id: 'msg-1',
            body: { tokenAddress: '0xAAA1234567890123456789012345678901234567' },
          },
          {
            id: 'msg-2',
            body: { tokenAddress: '0xaaa1234567890123456789012345678901234567' },
          },
        ];

        const signingWorkerAny = signingWorker as any;
        const groups = signingWorkerAny.groupByToken(mixedCaseMessages);

        expect(groups.size).toBe(1);
        expect(groups.get('0xaaa1234567890123456789012345678901234567')).toHaveLength(2);
      });

      it('should handle addresses with invalid checksum', () => {
        // This address has invalid checksum: 0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd
        const checksumMessages = [
          {
            id: 'msg-1',
            receiptHandle: 'receipt-1',
            body: {
              id: 'req-1',
              amount: '1000000000000000000',
              toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // Invalid checksum
              tokenAddress: '0xAAA1234567890123456789012345678901234567',
              network: 'polygon',
            },
          },
        ];

        const signingWorkerAny = signingWorker as any;
        // This should not throw an error - addresses should be normalized
        expect(() => {
          const transfers = signingWorkerAny.processBatchGroup('0xaaa1234567890123456789012345678901234567', checksumMessages);
        }).not.toThrow();
      });
    });

    describe('calculateGasSavings', () => {
      it('should calculate correct gas savings percentage', () => {
        const signingWorkerAny = signingWorker as any;
        const savings = signingWorkerAny.calculateGasSavings(mockMessages);

        // Single tx: 3 * 65000 = 195000
        // Batch tx: 100000 + (3 * 25000) = 175000
        // Savings: (195000 - 175000) / 195000 * 100 = ~10.26%
        expect(savings).toBeCloseTo(10.26, 0);
      });

      it('should return 0 when batch is more expensive', () => {
        mockConfig.batchProcessing.singleTxGasEstimate = 10000;
        mockConfig.batchProcessing.batchBaseGas = 100000;
        mockConfig.batchProcessing.batchPerTxGas = 25000;

        const signingWorkerAny = signingWorker as any;
        const savings = signingWorkerAny.calculateGasSavings(mockMessages.slice(0, 1));

        expect(savings).toBe(0);
      });
    });

    describe('processBatchGroup', () => {
      it('should successfully process a batch group', async () => {
        const signingWorkerAny = signingWorker as any;
        await signingWorkerAny.processBatchGroup('0xaaa1234567890123456789012345678901234567', mockMessages);

        // Verify BatchTransaction creation
        expect(mockDbClient.batchTransaction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
            totalRequests: 3,
            status: 'PENDING',
          }),
        });

        // Verify withdrawal requests update
        expect(mockDbClient.withdrawalRequest.updateMany).toHaveBeenCalledWith({
          where: { requestId: { in: ['req-1', 'req-2', 'req-3'] } },
          data: expect.objectContaining({
            processingMode: 'BATCH',
            status: TransactionStatus.SIGNING,
            tryCount: { increment: 1 },
          }),
        });

        // Verify transaction signing
        expect(mockTransactionSigner.signBatchTransaction).toHaveBeenCalled();

        // Verify batch transaction update
        expect(mockDbClient.batchTransaction.update).toHaveBeenCalledWith({
          where: { id: expect.any(String) },
          data: {
            txHash: '0xbatchhash',
            status: 'SIGNED',
          },
        });

        // Verify messages deleted from queue
        expect(signingWorkerAny.inputQueue.deleteMessage).toHaveBeenCalledTimes(3);

        // Verify output queue
        expect(signingWorkerAny.outputQueue.sendMessage).toHaveBeenCalled();
      });

      it('should handle batch processing failure gracefully', async () => {
        mockTransactionSigner.signBatchTransaction.mockRejectedValue(new Error('Signing failed'));

        const signingWorkerAny = signingWorker as any;

        // Should not throw error, just handle it internally
        await signingWorkerAny.processBatchGroup('0xaaa1234567890123456789012345678901234567', mockMessages);

        // Verify failure handling
        expect(mockDbClient.batchTransaction.update).toHaveBeenCalledWith({
          where: { id: expect.any(String) },
          data: {
            status: 'FAILED',
            errorMessage: 'Signing failed',
          },
        });

        // Verify withdrawal requests are reset to PENDING for retry
        expect(mockDbClient.withdrawalRequest.updateMany).toHaveBeenCalledWith({
          where: { batchId: expect.any(String) },
          data: {
            status: TransactionStatus.PENDING,
            batchId: null,
            processingMode: 'SINGLE',
            errorMessage: 'Signing failed',
          },
        });

        // Messages should NOT be deleted on failure
        expect(signingWorkerAny.inputQueue.deleteMessage).not.toHaveBeenCalled();
      });

      it('should not process messages individually after batch failure', async () => {
        mockTransactionSigner.signBatchTransaction.mockRejectedValue(new Error('Batch failed'));

        const signingWorkerAny = signingWorker as any;
        const processSingleTransactionsSpy = jest.spyOn(signingWorkerAny, 'processSingleTransactions');

        await signingWorkerAny.processBatchTransactions(mockMessages);

        // Should NOT call processSingleTransactions after batch failure
        expect(processSingleTransactionsSpy).not.toHaveBeenCalled();
      });

    });

    describe('processBatch with mixed messages', () => {
      it('should process messages with previous attempts individually and others as batch', async () => {
        // Add a fourth message to make batch processing worthwhile
        const additionalMessage = {
          id: 'msg-4',
          receiptHandle: 'receipt-4',
          body: {
            id: 'req-4',
            amount: '4000000000000000000',
            toAddress: '0x4234567890123456789012345678901234567890',
            tokenAddress: '0xAAA1234567890123456789012345678901234567',
            network: 'polygon',
          },
        };
        const allMessages = [...mockMessages, additionalMessage];

        // Mock gas price cache
        const signingWorkerAny = signingWorker as any;
        signingWorkerAny.gasPriceCache = {
          isValid: jest.fn().mockReturnValue(true),
        };

        // Mock DB to return some messages with previous attempts
        mockDbClient.withdrawalRequest.findMany.mockResolvedValue([
          { requestId: 'req-1', tryCount: 1 },
          { requestId: 'req-2', tryCount: 0 },
          { requestId: 'req-3', tryCount: 0 },
          { requestId: 'req-4', tryCount: 0 },
        ]);

        // Mock queue to return messages
        signingWorkerAny.inputQueue = {
          receiveMessages: jest.fn().mockResolvedValue(allMessages),
          deleteMessage: jest.fn().mockResolvedValue({}),
        };

        // Setup proper mocks for the signing worker instance
        signingWorkerAny.multicallService = mockMulticallService;
        signingWorkerAny.transactionSigner = mockTransactionSigner;
        signingWorkerAny.dbClient = mockDbClient;
        signingWorkerAny.processingMessages = new Set();
        signingWorkerAny.processedCount = 0;
        signingWorkerAny.errorCount = 0;
        signingWorkerAny.outputQueue = {
          sendMessage: jest.fn().mockResolvedValue({}),
        };

        // Mock processMessage to simulate successful processing
        jest.spyOn(signingWorkerAny, 'processMessage').mockResolvedValue({
          transactionId: 'test-tx',
          hash: '0xhash',
          rawTransaction: '0xraw',
        });

        // Spy on processing methods
        const processSingleSpy = jest.spyOn(signingWorkerAny, 'processSingleTransactions');
        const processBatchSpy = jest.spyOn(signingWorkerAny, 'processBatchTransactions');

        // Enable batch processing
        mockConfig.batchProcessing.enabled = true;
        mockConfig.batchProcessing.minBatchSize = 3;
        mockConfig.batchProcessing.batchThreshold = 3;
        mockConfig.batchProcessing.minGasSavingsPercent = 10;

        await signingWorkerAny.processBatch();

        // Debug logging removed - test should pass now

        // Should process message with previous attempts individually
        expect(processSingleSpy).toHaveBeenCalled();
        expect(processSingleSpy.mock.calls[0][0]).toHaveLength(1);
        expect(processSingleSpy.mock.calls[0][0][0].body.id).toBe('req-1');

        // Should process remaining messages as batch (now we have 3 messages which is profitable for batching)
        expect(processBatchSpy).toHaveBeenCalled();
        expect(processBatchSpy.mock.calls[0][0]).toHaveLength(3);
        expect(processBatchSpy.mock.calls[0][0].map((m: any) => m.body.id).sort()).toEqual(['req-2', 'req-3', 'req-4']);
      });
    });
  });
});
