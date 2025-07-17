import { SecureSecretsManager } from '../../services/secrets-manager';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Config } from '../../config';
import { Logger } from '../../utils/logger';

jest.mock('@aws-sdk/client-secrets-manager');

describe('SecureSecretsManager', () => {
  let secretsManager: SecureSecretsManager;
  let mockClient: jest.Mocked<SecretsManagerClient>;
  let mockLogger: jest.Mocked<Logger>;
  let mockConfig: Config;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      auditSuccess: jest.fn(),
      auditFailure: jest.fn(),
    } as any;

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

    mockClient = {
      send: jest.fn(),
    } as any;

    (SecretsManagerClient as jest.Mock).mockImplementation(() => mockClient);

    secretsManager = new SecureSecretsManager(mockConfig, mockLogger);
  });

  describe('initialize', () => {
    it('should successfully initialize and load private key', async () => {
      const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

      mockClient.send.mockResolvedValueOnce({
        SecretString: mockPrivateKey,
      });

      await secretsManager.initialize();

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
      expect(mockLogger.auditSuccess).toHaveBeenCalledWith(
        'LOAD_PRIVATE_KEY',
        expect.objectContaining({
          metadata: { secretName: 'test-private-key' },
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Secrets manager initialized successfully'
      );
    });

    it('should throw error if private key format is invalid', async () => {
      mockClient.send.mockResolvedValueOnce({
        SecretString: 'invalid-key',
      });

      await expect(secretsManager.initialize()).rejects.toThrow(
        'Private key must be 66 characters long including 0x prefix'
      );

      expect(mockLogger.auditFailure).toHaveBeenCalledWith(
        'LOAD_PRIVATE_KEY',
        'Private key must be 66 characters long including 0x prefix',
        {}
      );
    });

    it('should handle missing secret', async () => {
      mockClient.send.mockRejectedValueOnce(new Error('Secret not found'));

      await expect(secretsManager.initialize()).rejects.toThrow('Secret not found');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to retrieve secret: test-private-key',
        expect.any(Error)
      );
    });

    it('should use development fallback in development mode', async () => {
      mockConfig.nodeEnv = 'development';
      mockClient.send.mockRejectedValueOnce(new Error('Secret not found'));

      await secretsManager.initialize();

      expect(mockLogger.auditSuccess).toHaveBeenCalledWith(
        'LOAD_PRIVATE_KEY',
        expect.objectContaining({
          metadata: { secretName: 'test-private-key' },
        })
      );
    });
  });

  describe('getPrivateKey', () => {
    it('should return decrypted private key', async () => {
      const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

      mockClient.send.mockResolvedValueOnce({
        SecretString: mockPrivateKey,
      });

      await secretsManager.initialize();
      const privateKey = secretsManager.getPrivateKey();

      expect(privateKey).toBe(mockPrivateKey);
    });

    it('should throw error if private key not loaded', () => {
      expect(() => secretsManager.getPrivateKey()).toThrow('Private key not loaded');
    });
  });

  describe('refreshSecrets', () => {
    it('should refresh secrets successfully', async () => {
      const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

      mockClient.send.mockResolvedValue({
        SecretString: mockPrivateKey,
      });

      await secretsManager.initialize();
      await secretsManager.refreshSecrets();

      expect(mockLogger.info).toHaveBeenCalledWith('Refreshing secrets...');
      expect(mockClient.send).toHaveBeenCalledTimes(2); // Initial + refresh
    });
  });

  describe('caching', () => {
    it('should cache secrets for 5 minutes', async () => {
      const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

      mockClient.send.mockResolvedValueOnce({
        SecretString: mockPrivateKey,
      });

      await secretsManager.initialize();

      // First call should load the private key
      expect(mockClient.send).toHaveBeenCalledTimes(1);

      // Subsequent calls should use cache
      const privateKey = secretsManager.getPrivateKey();
      expect(privateKey).toBe(mockPrivateKey);

      // No additional calls to AWS
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });
  });
});
