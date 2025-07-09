import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { Logger } from '../../utils/logger';
import { config } from '../../config';

export interface SecretConfig {
  secretName: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class SecretsManager {
  private logger = new Logger('SecretsManager');
  private client: SecretsManagerClient;
  private secretCache: Map<string, { value: string; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor(customConfig?: Partial<SecretConfig>) {
    const region = customConfig?.region || config.queue.region;
    const endpoint = customConfig?.endpoint || config.queue.endpoint;
    
    const clientConfig: any = {
      region,
    };

    // For LocalStack development
    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.credentials = {
        accessKeyId: customConfig?.accessKeyId || config.queue.accessKeyId || 'test',
        secretAccessKey: customConfig?.secretAccessKey || config.queue.secretAccessKey || 'test',
      };
    }

    this.client = new SecretsManagerClient(clientConfig);
    this.logger.info(`Initialized Secrets Manager client for region: ${region}`);
  }

  async getPrivateKey(secretName?: string): Promise<string> {
    const name = secretName || 'polygon-wallet-key';
    
    try {
      // Check cache first
      const cached = this.secretCache.get(name);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        this.logger.debug(`Using cached secret for ${name}`);
        return cached.value;
      }

      // Fetch from Secrets Manager
      const command = new GetSecretValueCommand({
        SecretId: name,
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      // Parse the secret (it might be JSON)
      let privateKey: string;
      try {
        const parsed = JSON.parse(response.SecretString);
        privateKey = parsed.privateKey || parsed.key || parsed.value;
      } catch {
        // If not JSON, use as-is
        privateKey = response.SecretString;
      }

      // Validate private key format
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      if (privateKey.length !== 66) { // 0x + 64 hex chars
        throw new Error('Invalid private key format');
      }

      // Cache the secret
      this.secretCache.set(name, {
        value: privateKey,
        timestamp: Date.now(),
      });

      this.logger.info(`Successfully retrieved private key from secret: ${name}`);
      return privateKey;
    } catch (error) {
      this.logger.error(`Failed to get private key from secret ${name}`, error);
      
      // In development, return a test private key
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Using test private key for development');
        return '0x0000000000000000000000000000000000000000000000000000000000000001';
      }
      
      throw error;
    }
  }

  async getSecret(secretName: string): Promise<string> {
    try {
      // Check cache first
      const cached = this.secretCache.get(secretName);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.value;
      }

      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      // Cache the secret
      this.secretCache.set(secretName, {
        value: response.SecretString,
        timestamp: Date.now(),
      });

      return response.SecretString;
    } catch (error) {
      this.logger.error(`Failed to get secret ${secretName}`, error);
      throw error;
    }
  }

  clearCache(): void {
    this.secretCache.clear();
    this.logger.info('Secret cache cleared');
  }
}