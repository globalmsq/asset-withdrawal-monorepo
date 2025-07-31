import { createClient } from 'redis';

export interface NonceCache {
  getAndIncrement(address: string, chain: string, network: string): Promise<number>;
  set(address: string, nonce: number, chain: string, network: string): Promise<void>;
  get(address: string, chain: string, network: string): Promise<number | null>;
  clear(address: string, chain: string, network: string): Promise<void>;
  initialize(address: string, networkNonce: number, chain: string, network: string): Promise<void>;
}

export class NonceCacheService implements NonceCache {
  private client: ReturnType<typeof createClient>;
  private connected = false;
  private readonly keyPrefix = 'nonce:';
  private readonly ttl = 86400; // 24 hours in seconds

  constructor(private readonly options?: Parameters<typeof createClient>[0]) {
    this.client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          console.log(`Redis: Reconnecting in ${delay}ms...`);
          return delay;
        },
      },
      ...options,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.connected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Redis Client Disconnected');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
    }
  }

  async initialize(address: string, networkNonce: number, chain: string, network: string): Promise<void> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    const cachedNonce = await this.get(address, chain, network);

    // Use the higher value between cached and network nonce
    const startNonce = Math.max(cachedNonce || 0, networkNonce);

    await this.set(address, startNonce, chain, network);
    console.log(`Nonce initialized for ${address} on ${chain}/${network}: ${startNonce}`);
  }

  async getAndIncrement(address: string, chain: string, network: string): Promise<number> {
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

  async set(address: string, nonce: number, chain: string, network: string): Promise<void> {
    await this.ensureConnected();

    const key = this.getKey(address, chain, network);
    await this.client.set(key, nonce.toString(), {
      EX: this.ttl,
    });
  }

  async get(address: string, chain: string, network: string): Promise<number | null> {
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
}

// Factory function
export function createNonceCacheService(options?: Parameters<typeof createClient>[0]): NonceCacheService {
  return new NonceCacheService(options);
}
