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
      maxRetriesPerRequest: 3,
      lazyConnect: true,
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
