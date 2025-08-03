import { createClient } from 'redis';
import { Logger } from '../utils/logger';

export interface NonceCache {
  getAndIncrement(
    address: string,
    chain: string,
    network: string
  ): Promise<number>;
  set(
    address: string,
    nonce: number,
    chain: string,
    network: string
  ): Promise<void>;
  get(address: string, chain: string, network: string): Promise<number | null>;
  clear(address: string, chain: string, network: string): Promise<void>;
  initialize(
    address: string,
    networkNonce: number,
    chain: string,
    network: string
  ): Promise<void>;
  getCurrentNonce(
    chain: string,
    network: string,
    address: string
  ): Promise<number>;
  setNonce(
    chain: string,
    network: string,
    address: string,
    nonce: number
  ): Promise<void>;
  isNonceDuplicate(
    chain: string,
    network: string,
    address: string,
    nonce: number
  ): Promise<boolean>;
}

export class NonceCacheService implements NonceCache {
  private client: ReturnType<typeof createClient>;
  private connected = false;
  private readonly keyPrefix = 'nonce:';
  private readonly usedNoncePrefix = 'used_nonce:';
  private readonly ttl = 86400; // 24 hours in seconds
  private logger: Logger;

  constructor(
    private readonly options?: Parameters<typeof createClient>[0],
    logger?: Logger
  ) {
    // Create a minimal config for the logger if not provided
    const minimalConfig = {
      logging: {
        level: 'info' as const,
        auditLogPath: './logs/audit.log',
      },
    } as any;
    this.logger = logger || new Logger(minimalConfig);
    this.client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        reconnectStrategy: retries => {
          if (retries > 10) {
            this.logger.error('Redis: Max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          this.logger.info(`Redis: Reconnecting in ${delay}ms...`);
          return delay;
        },
      },
      ...options,
    });

    this.client.on('error', err => {
      this.logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      this.logger.info('Redis Client Connected');
      this.connected = true;
    });

    this.client.on('disconnect', () => {
      this.logger.info('Redis Client Disconnected');
      this.connected = false;
    });

    // Duplicate error handler removed - already handled above
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Check actual Redis client state instead of just the flag
      if (this.client.isOpen) {
        await this.client.disconnect();
      }
    } catch (error) {
      // Ignore if client is already closed
      if (
        error instanceof Error &&
        !error.message?.includes('The client is closed')
      ) {
        throw error;
      }
      this.logger?.warn('Redis client already closed during disconnect');
    } finally {
      this.connected = false;
    }
  }

  async initialize(
    address: string,
    networkNonce: number,
    chain: string,
    network: string
  ): Promise<void> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    const cachedNonce = await this.get(address, chain, network);

    // Use the higher value between cached and network nonce
    const startNonce = Math.max(cachedNonce || 0, networkNonce);

    await this.set(address, startNonce, chain, network);
    this.logger.info(
      `Nonce initialized for ${address} on ${chain}/${network}: ${startNonce}`
    );
  }

  async getAndIncrement(
    address: string,
    chain: string,
    network: string
  ): Promise<number> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    const nonce = await this.client.incr(key);

    // Set TTL on first increment
    if (nonce === 1) {
      await this.client.expire(key, this.ttl);
    }

    // Return the previous value (before increment)
    return nonce - 1;
  }

  async set(
    address: string,
    nonce: number,
    chain: string,
    network: string
  ): Promise<void> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    await this.client.set(key, nonce.toString(), {
      EX: this.ttl,
    });
  }

  async get(
    address: string,
    chain: string,
    network: string
  ): Promise<number | null> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    const value = await this.client.get(key);

    return value ? parseInt(value, 10) : null;
  }

  async clear(address: string, chain: string, network: string): Promise<void> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    await this.client.del(key);
  }

  private getKey(address: string, chain: string, network: string): string {
    return `${this.keyPrefix}${chain}:${network}:${address.toLowerCase()}`;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * Get current nonce without incrementing
   */
  async getCurrentNonce(
    chain: string,
    network: string,
    address: string
  ): Promise<number> {
    const nonce = await this.get(address, chain, network);
    return nonce || 0;
  }

  /**
   * Set nonce value directly
   */
  async setNonce(
    chain: string,
    network: string,
    address: string,
    nonce: number
  ): Promise<void> {
    await this.set(address, nonce, chain, network);
  }

  /**
   * Check if a nonce has been used recently (duplicate detection)
   */
  async isNonceDuplicate(
    chain: string,
    network: string,
    address: string,
    nonce: number
  ): Promise<boolean> {
    await this.ensureConnected();

    const usedKey = this.getUsedNonceKey(address, chain, network, nonce);
    const exists = await this.client.exists(usedKey);

    if (!exists) {
      // Mark this nonce as used
      await this.client.set(usedKey, '1', {
        EX: 300, // 5 minutes TTL for used nonce tracking
      });
      return false;
    }

    this.logger?.warn(
      `Nonce ${nonce} already used for ${address} on ${chain}/${network}`
    );
    return true;
  }

  private getUsedNonceKey(
    address: string,
    chain: string,
    network: string,
    nonce: number
  ): string {
    return `${this.usedNoncePrefix}${chain}:${network}:${address.toLowerCase()}:${nonce}`;
  }
}

// Factory function
export function createNonceCacheService(
  options?: Parameters<typeof createClient>[0],
  logger?: Logger
): NonceCacheService {
  return new NonceCacheService(options, logger);
}
