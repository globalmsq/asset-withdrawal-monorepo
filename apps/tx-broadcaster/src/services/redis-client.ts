import Redis from 'ioredis';
import { loadConfig } from '../config';
import { LoggerService } from '@asset-withdrawal/shared';

let redisClient: Redis | null = null;
const logger = new LoggerService({ service: 'tx-broadcaster:RedisClient' });

export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    const config = loadConfig();
    redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      enableReadyCheck: true,
      maxRetriesPerRequest: 5, // 5번까지 재시도
      connectTimeout: 10000, // 10초 연결 타임아웃
      lazyConnect: true,
      // 네트워크 중단 대비 재시도 전략
      retryStrategy: times => Math.min(times * 50, 2000), // 최대 2초까지 증가
    });

    redisClient.on('connect', () => {
      // Redis connected successfully
    });

    redisClient.on('error', (error: Error) => {
      logger.error('Redis error', error);
    });

    redisClient.on('close', () => {
      // Redis connection closed
    });

    await redisClient.connect();
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    // Redis client closed
  }
}

// Redis key utilities
export const RedisKeys = {
  // Broadcast tracking keys
  broadcastLock: (txHash: string) => `tx:broadcast:lock:${txHash}`,
  broadcastCompleted: (txHash: string) => `tx:broadcast:completed:${txHash}`,

  // Retry tracking keys
  retryCount: (messageId: string) => `tx:retry:${messageId}`,

  // Processing status keys
  processing: (txHash: string) => `tx:processing:${txHash}`,
} as const;

// Nonce Manager Redis keys
export const NonceRedisKeys = {
  // 대기 중인 트랜잭션 큐 (JSON Array)
  pendingTransactions: (address: string) => `nonce:pending:${address}`,

  // 마지막 브로드캐스트된 nonce
  lastBroadcastedNonce: (address: string) => `nonce:last:${address}`,

  // 처리 중인 주소 락 (TTL: 60초)
  processingLock: (address: string) => `nonce:processing:${address}`,

  // 처리 시작 시간 (TTL: 60초)
  processingStartTime: (address: string) => `nonce:processing:time:${address}`,

  // 마지막 처리 시간 (round-robin용)
  lastProcessed: (address: string) => `nonce:lastprocessed:${address}`,
} as const;

// Redis operations for transaction broadcasting
export class BroadcastRedisService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  // Check if transaction is already being processed
  async isProcessing(txHash: string): Promise<boolean> {
    const exists = await this.redis.exists(RedisKeys.processing(txHash));
    return exists === 1;
  }

  // Set processing lock with TTL (5 minutes)
  async setProcessing(txHash: string): Promise<boolean> {
    const result = await this.redis.set(
      RedisKeys.processing(txHash),
      Date.now().toString(),
      'EX',
      300, // 5 minutes
      'NX' // Only if not exists
    );
    return result === 'OK';
  }

  // Remove processing lock
  async removeProcessing(txHash: string): Promise<void> {
    await this.redis.del(RedisKeys.processing(txHash));
  }

  // Check if transaction was already broadcasted
  async isBroadcasted(txHash: string): Promise<boolean> {
    const exists = await this.redis.exists(
      RedisKeys.broadcastCompleted(txHash)
    );
    return exists === 1;
  }

  // Mark transaction as broadcasted (TTL: 1 hour)
  async markBroadcasted(txHash: string, broadcastHash?: string): Promise<void> {
    await this.redis.set(
      RedisKeys.broadcastCompleted(txHash),
      broadcastHash || 'completed',
      'EX',
      3600 // 1 hour
    );
  }

  // Get retry count for a message
  async getRetryCount(messageId: string): Promise<number> {
    const count = await this.redis.get(RedisKeys.retryCount(messageId));
    return count ? parseInt(count, 10) : 0;
  }

  // Increment retry count (TTL: 24 hours)
  async incrementRetryCount(messageId: string): Promise<number> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(RedisKeys.retryCount(messageId));
    pipeline.expire(RedisKeys.retryCount(messageId), 86400); // 24 hours
    const results = await pipeline.exec();

    if (!results || !results[0] || results[0][0]) {
      throw new Error('Failed to increment retry count');
    }

    return results[0][1] as number;
  }

  // Clean up expired keys (maintenance operation)
  async cleanup(): Promise<void> {
    const patterns = ['tx:broadcast:lock:*', 'tx:processing:*'];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
        // Cleaned up expired keys
      }
    }
  }
}

// Redis operations for nonce management
export class NonceRedisService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  // Get pending transactions for an address (sorted by nonce)
  async getPendingTransactions(address: string): Promise<any[]> {
    const data = await this.redis.lrange(
      NonceRedisKeys.pendingTransactions(address),
      0,
      -1
    );
    return data.map(item => JSON.parse(item));
  }

  // Set pending transactions for an address (replaces entire list)
  async setPendingTransactions(
    address: string,
    transactions: any[]
  ): Promise<void> {
    const key = NonceRedisKeys.pendingTransactions(address);
    const pipeline = this.redis.pipeline();

    // Clear existing list and set new one
    pipeline.del(key);
    if (transactions.length > 0) {
      const serialized = transactions.map(tx => JSON.stringify(tx));
      pipeline.lpush(key, ...serialized);
    }

    await pipeline.exec();
  }

  // Get last broadcasted nonce for an address
  async getLastBroadcastedNonce(address: string): Promise<number | null> {
    const value = await this.redis.get(
      NonceRedisKeys.lastBroadcastedNonce(address)
    );
    return value ? parseInt(value, 10) : null;
  }

  // Set last broadcasted nonce for an address
  async setLastBroadcastedNonce(address: string, nonce: number): Promise<void> {
    await this.redis.set(
      NonceRedisKeys.lastBroadcastedNonce(address),
      nonce.toString()
    );
  }

  // Check if address is currently being processed
  async isProcessing(address: string): Promise<boolean> {
    const exists = await this.redis.exists(
      NonceRedisKeys.processingLock(address)
    );
    return exists === 1;
  }

  // Set processing lock for address (with TTL)
  async setProcessingLock(address: string): Promise<boolean> {
    const result = await this.redis.set(
      NonceRedisKeys.processingLock(address),
      Date.now().toString(),
      'EX',
      60, // 60 seconds TTL
      'NX' // Only if not exists
    );
    return result === 'OK';
  }

  // Remove processing lock for address
  async removeProcessingLock(address: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(NonceRedisKeys.processingLock(address));
    pipeline.del(NonceRedisKeys.processingStartTime(address));
    await pipeline.exec();
  }

  // Set processing start time
  async setProcessingStartTime(address: string): Promise<void> {
    await this.redis.set(
      NonceRedisKeys.processingStartTime(address),
      Date.now().toString(),
      'EX',
      60 // 60 seconds TTL
    );
  }

  // Get processing start time
  async getProcessingStartTime(address: string): Promise<number | null> {
    const value = await this.redis.get(
      NonceRedisKeys.processingStartTime(address)
    );
    return value ? parseInt(value, 10) : null;
  }

  // Get last processed time for address (round-robin)
  async getLastProcessedTime(address: string): Promise<number | null> {
    const value = await this.redis.get(NonceRedisKeys.lastProcessed(address));
    return value ? parseInt(value, 10) : null;
  }

  // Set last processed time for address
  async setLastProcessedTime(address: string): Promise<void> {
    await this.redis.set(
      NonceRedisKeys.lastProcessed(address),
      Date.now().toString()
    );
  }

  // Get all addresses with pending transactions
  async getAddressesWithPendingTransactions(): Promise<string[]> {
    const pattern = NonceRedisKeys.pendingTransactions('*');
    const keys = await this.redis.keys(pattern);

    // Extract address from key: "nonce:pending:{address}" -> "{address}"
    return keys.map(key => {
      const parts = key.split(':');
      return parts[parts.length - 1];
    });
  }

  // Get all processing addresses
  async getProcessingAddresses(): Promise<string[]> {
    const pattern = NonceRedisKeys.processingLock('*');
    const keys = await this.redis.keys(pattern);

    // Extract address from key: "nonce:processing:{address}" -> "{address}"
    return keys.map(key => {
      const parts = key.split(':');
      return parts[parts.length - 1];
    });
  }

  // Clean up all nonce-related keys (for testing)
  async clearAll(): Promise<void> {
    const patterns = [
      'nonce:pending:*',
      'nonce:last:*',
      'nonce:processing:*',
      'nonce:processing:time:*',
      'nonce:lastprocessed:*',
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    }
  }

  // Check and release timed out processing locks
  async releaseTimedOutLocks(timeoutMs: number = 60000): Promise<string[]> {
    const now = Date.now();
    const processingAddresses = await this.getProcessingAddresses();
    const timedOutAddresses: string[] = [];

    for (const address of processingAddresses) {
      const startTime = await this.getProcessingStartTime(address);
      if (startTime && now - startTime > timeoutMs) {
        await this.removeProcessingLock(address);
        timedOutAddresses.push(address);
      }
    }

    return timedOutAddresses;
  }
}
