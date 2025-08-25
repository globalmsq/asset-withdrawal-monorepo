import { Redis } from 'ioredis';
import { LoggerService } from '../services/logger.service';

/**
 * NoncePool - Manages a pool of reusable nonces for failed transactions
 *
 * This service maintains a pool of nonces that were allocated but not successfully
 * used (due to transaction failures). These nonces can be reused to prevent gaps
 * in the nonce sequence.
 *
 * Uses Redis Sorted Set with nonce as both score and member for efficient
 * retrieval of the smallest available nonce.
 */
export class NoncePoolService {
  private logger: LoggerService;
  private readonly POOL_KEY_PREFIX = 'nonce_pool';
  private readonly POOL_TTL = 86400; // 24 hours in seconds

  constructor(private redis: Redis) {
    this.logger = new LoggerService({ service: 'NoncePoolService' });
  }

  /**
   * Generate Redis key for nonce pool
   */
  private getPoolKey(chainId: string | number, address: string): string {
    return `${this.POOL_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`;
  }

  /**
   * Return a failed nonce to the pool for reuse
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @param nonce - The nonce to return to the pool
   */
  async returnNonce(
    chainId: string | number,
    address: string,
    nonce: number
  ): Promise<void> {
    const key = this.getPoolKey(chainId, address);

    try {
      // Use Lua script for atomic operation
      const script = `
        redis.call('zadd', KEYS[1], ARGV[1], ARGV[1])
        redis.call('expire', KEYS[1], ARGV[2])
        return redis.call('zcard', KEYS[1])
      `;

      const poolSize = (await this.redis.eval(
        script,
        1,
        key,
        nonce.toString(),
        this.POOL_TTL.toString()
      )) as number;

      this.logger.info('Nonce returned to pool', {
        metadata: {
          chainId,
          address,
          nonce,
          poolSize,
        },
      });
    } catch (error) {
      this.logger.error('Failed to return nonce to pool', error, {
        metadata: {
          chainId,
          address,
          nonce,
        },
      });
      throw error;
    }
  }

  /**
   * Get an available nonce from the pool
   * Returns null if no nonces are available in the pool
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @returns The smallest available nonce from the pool, or null
   */
  async getAvailableNonce(
    chainId: string | number,
    address: string
  ): Promise<number | null> {
    const key = this.getPoolKey(chainId, address);

    try {
      // Use Redis ZPOPMIN to atomically get and remove the smallest nonce
      // ZPOPMIN returns an array of [member, score] pairs
      const result = (await this.redis.zpopmin(key, 1)) as string[];

      // ZPOPMIN returns empty array if no elements exist
      if (result && result.length > 0) {
        // Result format: [member, score] - we only need the member (nonce)
        const nonce = result[0];
        const nonceNumber = parseInt(nonce, 10);

        this.logger.info('Retrieved nonce from pool', {
          metadata: {
            chainId,
            address,
            nonce: nonceNumber,
            remainingPoolSize: await this.getPoolSize(chainId, address),
          },
        });

        return nonceNumber;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get nonce from pool', error, {
        metadata: {
          chainId,
          address,
        },
      });
      throw error;
    }
  }

  /**
   * Clear all nonces from the pool for a specific address
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   */
  async clearPool(chainId: string | number, address: string): Promise<void> {
    const key = this.getPoolKey(chainId, address);

    try {
      const poolSize = await this.redis.zcard(key);

      if (poolSize > 0) {
        await this.redis.del(key);

        this.logger.info('Nonce pool cleared', {
          metadata: {
            chainId,
            address,
            clearedCount: poolSize,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to clear nonce pool', error, {
        metadata: {
          chainId,
          address,
        },
      });
      throw error;
    }
  }

  /**
   * Get the current size of the nonce pool
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @returns The number of nonces in the pool
   */
  async getPoolSize(
    chainId: string | number,
    address: string
  ): Promise<number> {
    const key = this.getPoolKey(chainId, address);

    try {
      return await this.redis.zcard(key);
    } catch (error) {
      this.logger.error('Failed to get pool size', error, {
        metadata: {
          chainId,
          address,
        },
      });
      return 0;
    }
  }

  /**
   * Get all nonces currently in the pool (for debugging/monitoring)
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @returns Array of nonces in the pool, sorted ascending
   */
  async getPoolContents(
    chainId: string | number,
    address: string
  ): Promise<number[]> {
    const key = this.getPoolKey(chainId, address);

    try {
      const nonces = await this.redis.zrange(key, 0, -1);
      return nonces.map(n => parseInt(n, 10));
    } catch (error) {
      this.logger.error('Failed to get pool contents', error, {
        metadata: {
          chainId,
          address,
        },
      });
      return [];
    }
  }

  /**
   * Add multiple nonces to the pool at once (useful for gap recovery)
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @param nonces - Array of nonces to add to the pool
   */
  async returnMultipleNonces(
    chainId: string | number,
    address: string,
    nonces: number[]
  ): Promise<void> {
    if (nonces.length === 0) {
      return;
    }

    const key = this.getPoolKey(chainId, address);

    try {
      // Build zadd arguments: score1, member1, score2, member2, ...
      const zaddArgs: (string | number)[] = [];
      for (const nonce of nonces) {
        zaddArgs.push(nonce, nonce.toString());
      }

      // Use pipeline for efficiency
      const pipeline = this.redis.pipeline();
      pipeline.zadd(key, ...zaddArgs);
      pipeline.expire(key, this.POOL_TTL);

      await pipeline.exec();

      this.logger.info('Multiple nonces returned to pool', {
        metadata: {
          chainId,
          address,
          nonces,
          count: nonces.length,
          poolSize: await this.getPoolSize(chainId, address),
        },
      });
    } catch (error) {
      this.logger.error('Failed to return multiple nonces to pool', error, {
        metadata: {
          chainId,
          address,
          nonces,
        },
      });
      throw error;
    }
  }

  /**
   * Check if a specific nonce exists in the pool
   *
   * @param chainId - The blockchain chain ID
   * @param address - The wallet address
   * @param nonce - The nonce to check
   * @returns True if the nonce exists in the pool
   */
  async hasNonce(
    chainId: string | number,
    address: string,
    nonce: number
  ): Promise<boolean> {
    const key = this.getPoolKey(chainId, address);

    try {
      const score = await this.redis.zscore(key, nonce.toString());
      return score !== null;
    } catch (error) {
      this.logger.error('Failed to check nonce in pool', error, {
        metadata: {
          chainId,
          address,
          nonce,
        },
      });
      return false;
    }
  }

  /**
   * Get statistics about nonce pools across all addresses
   *
   * @param chainId - The blockchain chain ID
   * @returns Statistics about the nonce pools
   */
  async getPoolStatistics(chainId: string | number): Promise<{
    totalPools: number;
    totalNonces: number;
    largestPool: { address: string; size: number } | null;
    averagePoolSize: number;
  }> {
    try {
      const pattern = `${this.POOL_KEY_PREFIX}:${chainId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return {
          totalPools: 0,
          totalNonces: 0,
          largestPool: null,
          averagePoolSize: 0,
        };
      }

      let totalNonces = 0;
      let largestPool: { address: string; size: number } | null = null;

      for (const key of keys) {
        const size = await this.redis.zcard(key);
        totalNonces += size;

        const address = key.split(':').pop() || '';

        if (largestPool === null || size > largestPool.size) {
          largestPool = { address, size };
        }
      }

      return {
        totalPools: keys.length,
        totalNonces,
        largestPool,
        averagePoolSize: keys.length > 0 ? totalNonces / keys.length : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get pool statistics', error, {
        metadata: { chainId },
      });

      return {
        totalPools: 0,
        totalNonces: 0,
        largestPool: null,
        averagePoolSize: 0,
      };
    }
  }
}
