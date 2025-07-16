import { SecureSecretsManager } from './secrets-manager';
import { Config } from '../config';
import { Logger } from '../utils/logger';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

jest.mock('@aws-sdk/client-secrets-manager');

describe('SecureSecretsManager', () => {
  let secretsManager: SecureSecretsManager;
  let mockConfig: Config;
  let mockLogger: Logger;
  let mockClient: jest.Mocked<SecretsManagerClient>;
  
  beforeEach(() => {
    mockConfig = {
      nodeEnv: 'test',
      encryptionKey: '12345678901234567890123456789012', // Exactly 32 characters for AES-256
      aws: {
        region: 'us-east-1',
        endpoint: 'http://localhost:4566',
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      secretsManager: {
        privateKeySecret: 'test/private-key',
      },
    } as Config;
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      audit: jest.fn(),
      auditSuccess: jest.fn(),
      auditFailure: jest.fn(),
    } as any;
    
    mockClient = {
      send: jest.fn(),
    } as any;
    
    (SecretsManagerClient as jest.Mock).mockImplementation(() => mockClient);
    
    secretsManager = new SecureSecretsManager(mockConfig, mockLogger);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('initialize', () => {
    it('should load private key successfully', async () => {
      const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
      
      mockClient.send.mockResolvedValueOnce({
        SecretString: mockPrivateKey,
      });
      
      await secretsManager.initialize();
      
      expect(mockClient.send).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Secrets manager initialized successfully');
      expect(mockLogger.auditSuccess).toHaveBeenCalledWith('LOAD_PRIVATE_KEY', expect.any(Object));
    });
    
    it('should fail if private key has invalid format', async () => {
      const invalidPrivateKey = 'invalid-key';
      
      mockClient.send.mockResolvedValueOnce({
        SecretString: invalidPrivateKey,
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
  });
  
  describe('getPrivateKey', () => {
    it('should decrypt and return private key', async () => {
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
});