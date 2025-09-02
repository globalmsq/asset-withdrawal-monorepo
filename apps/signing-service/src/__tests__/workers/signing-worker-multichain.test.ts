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
  IQueue,
} from '@asset-withdrawal/shared';
import { TransactionSigner } from '../../services/transaction-signer';

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
    getProvider: jest.fn().mockReturnValue({
      getProvider: jest.fn(),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0x1234567890123456789012345678901234567890'),
      getChainId: jest.fn().mockReturnValue(137),
      chain: 'polygon',
      network: 'mainnet',
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
jest.mock('@aws-sdk/client-sqs');

describe('SigningWorker - Multi-chain Support', () => {
  let signingWorker: SigningWorker;
  let mockConfig: Config;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWithdrawalRequestService: jest.Mocked<WithdrawalRequestService>;
  let mockSignedTransactionService: jest.Mocked<SignedTransactionService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockInputQueue: jest.Mocked<IQueue<WithdrawalRequest>>;
  let mockOutputQueue: jest.Mocked<IQueue<any>>;
  let mockTransactionSigner: jest.Mocked<TransactionSigner>;

  const createMockChainProvider = (
    chain: string,
    network: string,
    chainId: number
  ) => {
    const mockProviderInstance = {
      getTransactionCount: jest.fn().mockResolvedValue(10),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
      getFeeData: jest.fn().mockResolvedValue({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      }),
    };

    return {
      getProvider: jest.fn().mockReturnValue(mockProviderInstance),
      getChainId: jest.fn().mockReturnValue(chainId),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0xcA11bde05977b3631167028862bE2a173976CA11'),
      chain,
      network,
    };
  };

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
    } as any;

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
      findPendingWithdrawals: jest.fn().mockResolvedValue([]),
    } as any;

    mockSignedTransactionService = {
      saveSignedTransaction: jest.fn(),
      saveBatchSignedTransaction: jest.fn(),
      create: jest.fn(),
      findByRequestId: jest.fn().mockResolvedValue([]),
    } as any;

    mockDatabaseService = {
      getWithdrawalRequestService: jest
        .fn()
        .mockReturnValue(mockWithdrawalRequestService),
      getSignedTransactionService: jest
        .fn()
        .mockReturnValue(mockSignedTransactionService),
    } as any;

    mockInputQueue = {
      receiveMessages: jest.fn().mockResolvedValue([]),
      deleteMessage: jest.fn(),
      sendMessage: jest.fn(),
    } as any;

    mockOutputQueue = {
      sendMessage: jest.fn(),
      receiveMessages: jest.fn().mockResolvedValue([]),
      deleteMessage: jest.fn(),
    } as any;

    // Create mock ChainProvider
    const mockChainProvider = {
      isConnected: jest.fn().mockReturnValue(true),
      getProvider: jest.fn(),
      chain: 'polygon',
      network: 'mainnet',
    } as any;

    mockTransactionSigner = {
      initialize: jest.fn(),
      signTransaction: jest.fn().mockResolvedValue({
        transactionId: 'test-tx-id',
        hash: '0xabc123',
        rawTransaction: '0xf86c0a85...',
        nonce: 10,
        gasLimit: '100000',
        maxFeePerGas: '30000000000',
        maxPriorityFeePerGas: '1500000000',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        value: '1000000000000000000',
        chainId: 137,
      }),
      signBatchTransaction: jest.fn(),
      signBatchTransactionWithSplitting: jest.fn(),
      cleanup: jest.fn(),
      getAddress: jest
        .fn()
        .mockReturnValue('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'),
      getChainProvider: jest.fn().mockReturnValue(mockChainProvider),
    } as any;

    (TransactionSigner as jest.Mock).mockImplementation(
      () => mockTransactionSigner
    );

    const mockDbClient = {
      withdrawalRequest: {
        findMany: jest.fn().mockResolvedValue([]),
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

    (DatabaseService as any).getInstance = jest.fn().mockReturnValue({
      getClient: jest.fn().mockReturnValue(mockDbClient),
      healthCheck: jest.fn().mockResolvedValue(true),
    });
    (WithdrawalRequestService as jest.Mock).mockImplementation(
      () => mockWithdrawalRequestService
    );
    (SignedTransactionService as jest.Mock).mockImplementation(
      () => mockSignedTransactionService
    );
  });

  describe('Multi-chain withdrawal processing', () => {
    let dbClient: any;

    beforeEach(() => {
      signingWorker = new SigningWorker(
        mockConfig,
        mockSecretsManager,
        mockLogger as any
      );

      // Set up queues
      (signingWorker as any).inputQueue = mockInputQueue;
      (signingWorker as any).outputQueue = mockOutputQueue;

      // Get database client
      dbClient = (DatabaseService.getInstance as jest.Mock)().getClient();

      // Mock getOrCreateSigner to also log and add to signers Map
      (signingWorker as any).getOrCreateSigner = jest
        .fn()
        .mockImplementation(async (chain: string, network: string) => {
          mockLogger.info('Creating new TransactionSigner', { chain, network });
          const key = `${chain}_${network}`;
          (signingWorker as any).signers.set(key, mockTransactionSigner);
          return mockTransactionSigner;
        });

      // Mock canProcess to always return true (bypass connection check)
      (signingWorker as any).canProcess = jest.fn().mockResolvedValue(true);
    });

    afterEach(async () => {
      // Stop the worker to prevent the processLoop from continuing
      if (signingWorker) {
        (signingWorker as any).isRunning = false;
        await signingWorker.stop();
      }
    });

    const setupClaimAndProcessMocks = (requestId: string) => {
      let transactionCount = 0;
      dbClient.$transaction = jest.fn().mockImplementation(async (fn: any) => {
        transactionCount++;
        if (transactionCount === 1) {
          // claimMessages
          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.PENDING,
                processingInstanceId: null,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: requestId,
                status: TransactionStatus.VALIDATING,
                processingInstanceId: (signingWorker as any).instanceId,
              }),
            },
          });
        } else {
          // processMessage ownership check
          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.VALIDATING,
                processingInstanceId: (signingWorker as any).instanceId,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: requestId,
                status: TransactionStatus.SIGNING,
                tryCount: 1,
              }),
            },
          });
        }
      });
    };

    it('should process withdrawal on Polygon network', async () => {
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        polygonProvider
      );

      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-polygon-1',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: null,
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        chain: 'polygon',
        network: 'mainnet',
      };

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupClaimAndProcessMocks('wr-polygon-1');

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'polygon',
        'mainnet'
      );
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledWith({
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000',
        tokenAddress: null,
        transactionId: 'wr-polygon-1',
      });

      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'test-tx-id',
          hash: '0xabc123',
          chainId: 137,
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new TransactionSigner',
        { chain: 'polygon', network: 'mainnet' }
      );
    });

    it('should process withdrawal on Ethereum network', async () => {
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        ethereumProvider
      );

      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-ethereum-1',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        chain: 'ethereum',
        network: 'mainnet',
      };

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupClaimAndProcessMocks('wr-ethereum-1');

      mockTransactionSigner.signTransaction.mockResolvedValueOnce({
        transactionId: 'wr-ethereum-1',
        hash: '0xeth123',
        rawTransaction: '0xf86c0a85...',
        nonce: 10,
        gasLimit: '100000',
        maxFeePerGas: '50000000000',
        maxPriorityFeePerGas: '2000000000',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        value: '0',
        chainId: 1,
      });

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'ethereum',
        'mainnet'
      );
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledWith({
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000',
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        transactionId: 'wr-ethereum-1',
      });

      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'wr-ethereum-1',
          hash: '0xeth123',
          chainId: 1,
        })
      );
    });

    it('should process withdrawal on BSC network', async () => {
      const bscProvider = createMockChainProvider('bsc', 'mainnet', 56);
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        bscProvider
      );

      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-bsc-1',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: null, // Native BNB transfer
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        chain: 'bsc',
        network: 'mainnet',
      };

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupClaimAndProcessMocks('wr-bsc-1');

      mockTransactionSigner.signTransaction.mockResolvedValueOnce({
        transactionId: 'wr-bsc-1',
        hash: '0xbsc123',
        rawTransaction: '0xf86c0a85...',
        nonce: 10,
        gasLimit: '100000',
        maxFeePerGas: '5000000000', // BSC has lower gas fees
        maxPriorityFeePerGas: '1000000000',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        value: '1000000000000000000',
        chainId: 56,
      });

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'bsc',
        'mainnet'
      );
      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'wr-bsc-1',
          hash: '0xbsc123',
          chainId: 56,
        })
      );
    });

    it('should process withdrawal on localhost network', async () => {
      const localhostProvider = createMockChainProvider(
        'localhost',
        'localhost',
        31337
      );
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        localhostProvider
      );

      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-localhost-1',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: null,
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        chain: 'localhost',
        network: 'localhost',
      };

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupClaimAndProcessMocks('wr-localhost-1');

      mockTransactionSigner.signTransaction.mockResolvedValueOnce({
        transactionId: 'wr-localhost-1',
        hash: '0xlocal123',
        rawTransaction: '0xf86c0a85...',
        nonce: 10,
        gasLimit: '100000',
        maxFeePerGas: '1000000000', // Local network minimal fees
        maxPriorityFeePerGas: '1000000000',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        value: '1000000000000000000',
        chainId: 31337,
      });

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'localhost',
        'localhost'
      );
      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'wr-localhost-1',
          hash: '0xlocal123',
          chainId: 31337,
        })
      );
    });

    const setupMultipleClaimMocks = (requestIds: string[]) => {
      let claimCount = 0;
      let processCount = 0;

      dbClient.$transaction = jest.fn().mockImplementation(async (fn: any) => {
        const isClaimPhase = claimCount < requestIds.length;

        if (isClaimPhase) {
          // Claim phase
          const requestId = requestIds[claimCount];
          claimCount++;

          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.PENDING,
                processingInstanceId: null,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: requestId,
                status: TransactionStatus.VALIDATING,
                processingInstanceId: (signingWorker as any).instanceId,
              }),
            },
          });
        } else {
          // Process phase
          const requestId = requestIds[processCount];
          processCount++;

          return await fn({
            withdrawalRequest: {
              findUnique: jest.fn().mockResolvedValueOnce({
                status: TransactionStatus.VALIDATING,
                processingInstanceId: (signingWorker as any).instanceId,
              }),
              update: jest.fn().mockResolvedValueOnce({
                requestId: requestId,
                status: TransactionStatus.SIGNING,
                tryCount: 1,
              }),
            },
          });
        }
      });
    };

    it('should reuse signers for the same chain/network combination', async () => {
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        polygonProvider
      );

      const withdrawalRequests: WithdrawalRequest[] = [
        {
          id: 'wr-polygon-1',
          amount: '1000000000000000000',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          tokenAddress: null,
          status: TransactionStatus.SIGNING,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          chain: 'polygon',
          network: 'mainnet',
        },
        {
          id: 'wr-polygon-2',
          amount: '2000000000000000000',
          toAddress: '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
          tokenAddress: null,
          status: TransactionStatus.SIGNING,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          chain: 'polygon',
          network: 'mainnet',
        },
      ];

      const messages = withdrawalRequests.map((wr, index) => ({
        id: `msg-${index}`,
        receiptHandle: `receipt-${index}`,
        body: wr,
      }));

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupMultipleClaimMocks(['wr-polygon-1', 'wr-polygon-2']);

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      // Should create provider for polygon
      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'polygon',
        'mainnet'
      );

      // Should sign both transactions
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledTimes(2);

      // Should log creation of signer
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new TransactionSigner',
        { chain: 'polygon', network: 'mainnet' }
      );

      // Should call getOrCreateSigner twice (once per message)
      expect((signingWorker as any).getOrCreateSigner).toHaveBeenCalledTimes(2);

      // Both calls should be for the same chain/network
      expect((signingWorker as any).getOrCreateSigner).toHaveBeenCalledWith(
        'polygon',
        'mainnet'
      );
    });

    it('should handle multiple chains in the same batch', async () => {
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );

      (ChainProviderFactory.getProvider as jest.Mock).mockImplementation(
        (chain: string, network: string) => {
          if (chain === 'polygon') return polygonProvider;
          if (chain === 'ethereum') return ethereumProvider;
          throw new Error(`Unknown chain: ${chain}`);
        }
      );

      const withdrawalRequests: WithdrawalRequest[] = [
        {
          id: 'wr-polygon-1',
          amount: '1000000000000000000',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          tokenAddress: null,
          status: TransactionStatus.SIGNING,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          chain: 'polygon',
          network: 'mainnet',
        },
        {
          id: 'wr-ethereum-1',
          amount: '2000000000000000000',
          toAddress: '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
          tokenAddress: null,
          status: TransactionStatus.SIGNING,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          chain: 'ethereum',
          network: 'mainnet',
        },
      ];

      const messages = withdrawalRequests.map((wr, index) => ({
        id: `msg-${index}`,
        receiptHandle: `receipt-${index}`,
        body: wr,
      }));

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      setupMultipleClaimMocks(['wr-polygon-1', 'wr-ethereum-1']);

      // Mock different chainIds for different transactions
      let callCount = 0;
      mockTransactionSigner.signTransaction.mockImplementation(
        async (params: any) => {
          callCount++;
          const chainId = callCount === 1 ? 137 : 1; // First is polygon, second is ethereum
          return {
            transactionId: params.transactionId,
            hash: '0xabc123',
            rawTransaction: '0xf86c0a85...',
            nonce: 10,
            gasLimit: '100000',
            maxFeePerGas: '30000000000',
            maxPriorityFeePerGas: '1500000000',
            from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            value: '1000000000000000000',
            chainId: chainId,
          };
        }
      );

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      // Should create providers for both chains
      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'polygon',
        'mainnet'
      );
      expect(ChainProviderFactory.getProvider).toHaveBeenCalledWith(
        'ethereum',
        'mainnet'
      );

      // Should sign both transactions
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledTimes(2);

      // Should send both to output queue with correct chain info
      expect(mockOutputQueue.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 137,
        })
      );
      expect(mockOutputQueue.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
        })
      );
    });

    it('should handle unsupported chain gracefully', async () => {
      (ChainProviderFactory.getProvider as jest.Mock).mockImplementation(() => {
        throw new Error('Unsupported chain: unsupported');
      });

      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-unsupported-1',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: null,
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        chain: 'unsupported',
        network: 'mainnet',
      };

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      // Set up claim mock that will succeed, but validation will fail
      dbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.PENDING,
              processingInstanceId: null,
            }),
            update: jest.fn().mockResolvedValueOnce({
              requestId: 'wr-unsupported-1',
              status: TransactionStatus.VALIDATING,
              processingInstanceId: (signingWorker as any).instanceId,
            }),
          },
        });
      });

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledWith(
        'wr-unsupported-1',
        TransactionStatus.FAILED,
        expect.stringContaining('Unsupported chain')
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid withdrawal request',
        null,
        expect.objectContaining({
          requestId: 'wr-unsupported-1',
          error: expect.stringContaining('Unsupported chain'),
        })
      );

      // Should delete the message to prevent retries
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-1');
    });

    it('should handle missing chain/network information', async () => {
      const withdrawalRequest: WithdrawalRequest = {
        id: 'wr-no-chain',
        amount: '1000000000000000000',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: null,
        status: TransactionStatus.SIGNING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Missing chain and network
      } as any;

      const messages = [
        {
          id: 'msg-1',
          receiptHandle: 'receipt-1',
          body: withdrawalRequest,
        },
      ];

      mockInputQueue.receiveMessages.mockResolvedValueOnce(messages);

      // Set up claim mock that will succeed, but validation will fail
      dbClient.$transaction.mockImplementation(async (fn: any) => {
        return await fn({
          withdrawalRequest: {
            findUnique: jest.fn().mockResolvedValueOnce({
              status: TransactionStatus.PENDING,
              processingInstanceId: null,
            }),
            update: jest.fn().mockResolvedValueOnce({
              requestId: 'wr-no-chain',
              status: TransactionStatus.VALIDATING,
              processingInstanceId: (signingWorker as any).instanceId,
            }),
          },
        });
      });

      // Create a default polygon provider for fallback
      const polygonProvider = createMockChainProvider(
        'polygon',
        'testnet',
        80002
      );
      (ChainProviderFactory.getProvider as jest.Mock).mockReturnValue(
        polygonProvider
      );

      await signingWorker.initialize();
      await (signingWorker as any).processBatch();

      // Should fail validation and mark as FAILED
      expect(
        mockWithdrawalRequestService.updateStatusWithError
      ).toHaveBeenCalledWith(
        'wr-no-chain',
        TransactionStatus.FAILED,
        expect.stringContaining('Missing chain or network information')
      );

      // Should delete the message
      expect(mockInputQueue.deleteMessage).toHaveBeenCalledWith('receipt-1');
    });
  });
});
