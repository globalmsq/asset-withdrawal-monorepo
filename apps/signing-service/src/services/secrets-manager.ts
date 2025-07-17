import {
  SecretsManagerClient,
  GetSecretValueCommand,
  SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';
import { Config } from '../config';
import { Logger } from '../utils/logger';

export class SecureSecretsManager {
  private client: SecretsManagerClient;
  private cache: Map<string, { value: any; expires: number }> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private privateKey: string | null = null;

  constructor(
    private config: Config,
    private logger: Logger
  ) {
    const clientConfig: SecretsManagerClientConfig = {
      region: config.aws.region,
    };

    if (config.aws.endpoint) {
      clientConfig.endpoint = config.aws.endpoint;
      clientConfig.credentials = {
        accessKeyId: config.aws.accessKeyId || 'test',
        secretAccessKey: config.aws.secretAccessKey || 'test',
      };
    }

    this.client = new SecretsManagerClient(clientConfig);
  }

  async initialize(): Promise<void> {
    try {
      // Load private key
      await this.loadPrivateKey();

      this.logger.info('Secrets manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize secrets manager', error);
      throw error;
    }
  }

  private async loadPrivateKey(): Promise<void> {
    try {
      const secretName = this.config.secretsManager.privateKeySecret;
      const secret = await this.getSecret(secretName);

      if (!secret || typeof secret !== 'string') {
        throw new Error('Invalid private key format');
      }

      // Validate private key format
      if (!secret.startsWith('0x') || secret.length !== 66) {
        throw new Error(
          'Private key must be 66 characters long including 0x prefix'
        );
      }

      // Encrypt private key in memory
      this.privateKey = this.encrypt(secret);

      this.logger.auditSuccess('LOAD_PRIVATE_KEY', {
        metadata: { secretName },
      });
    } catch (error) {
      this.logger.auditFailure(
        'LOAD_PRIVATE_KEY',
        error instanceof Error ? error.message : String(error),
        {}
      );
      throw error;
    }
  }

  private async getSecret(secretName: string): Promise<any> {
    // Check cache
    const cached = this.cache.get(secretName);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.client.send(command);

      let secretValue: any;
      if (response.SecretString) {
        // Try to parse as JSON
        try {
          secretValue = JSON.parse(response.SecretString);
        } catch {
          secretValue = response.SecretString;
        }
      } else {
        throw new Error('Binary secrets not supported');
      }

      // Cache the secret
      this.cache.set(secretName, {
        value: secretValue,
        expires: Date.now() + this.cacheTimeout,
      });

      return secretValue;
    } catch (error) {
      this.logger.error(`Failed to retrieve secret: ${secretName}`, error);

      // Development fallback
      if (
        this.config.nodeEnv === 'development' &&
        secretName.includes('private-key')
      ) {
        return '0x0000000000000000000000000000000000000000000000000000000000000001';
      }

      throw error;
    }
  }

  getPrivateKey(): string {
    if (!this.privateKey) {
      throw new Error('Private key not loaded');
    }

    // Decrypt private key when needed
    return this.decrypt(this.privateKey);
  }

  // Encryption helpers for additional security
  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
    const parts = encryptedData.split(':');

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Periodic refresh of secrets
  async refreshSecrets(): Promise<void> {
    this.logger.info('Refreshing secrets...');
    this.cache.clear();
    await this.initialize();
  }
}
