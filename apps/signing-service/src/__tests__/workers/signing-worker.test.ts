import { SigningWorker } from '../../workers/signing-worker';
import { Config } from '../../config';
import { Logger } from '../../utils/logger';
import { SecureSecretsManager } from '../../services/secrets-manager';
import { WithdrawalRequestService, DatabaseService } from '@asset-withdrawal/database';
import { WithdrawalRequest } from '@asset-withdrawal/shared';

jest.mock('@asset-withdrawal/database');
jest.mock('../../services/polygon-provider');
jest.mock('../../services/transaction-signer');
jest.mock('@aws-sdk/client-sqs');

describe('SigningWorker', () => {
  let signingWorker: SigningWorker;
  let mockConfig: Config;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWithdrawalRequestService: jest.Mocked<WithdrawalRequestService>;
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

    mockDatabaseService = {
      getClient: jest.fn().mockReturnValue({}),
      getInstance: jest.fn(),
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDatabaseService);
    (WithdrawalRequestService as jest.Mock).mockImplementation(() => mockWithdrawalRequestService);

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
          id: 'test-tx-123',
          from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
          to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          signedTx: '0xf86c0a85...',
          hash: '0xabc123...',
          nonce: 10,
          gasLimit: '100000',
          maxFeePerGas: '30000000000',
        }),
        initialize: jest.fn(),
        cleanup: jest.fn(),
      };

      // Mock the transaction signer
      const signingWorkerAny = signingWorker as any;
      signingWorkerAny.transactionSigner = mockTransactionSigner;

      await signingWorker.initialize();
      const result = await signingWorker.processMessage(withdrawalRequest);

      expect(mockWithdrawalRequestService.updateStatus).toHaveBeenCalledWith(
        'test-tx-123',
        'SIGNING'
      );
      expect(mockWithdrawalRequestService.updateStatus).toHaveBeenCalledWith(
        'test-tx-123',
        'BROADCASTING'
      );
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledWith({
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      });
      expect(result).toMatchObject({
        id: 'test-tx-123',
        signedTx: '0xf86c0a85...',
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
        'FAILED',
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
        'FAILED',
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
        'FAILED',
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
        'FAILED',
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
        'FAILED',
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
});
