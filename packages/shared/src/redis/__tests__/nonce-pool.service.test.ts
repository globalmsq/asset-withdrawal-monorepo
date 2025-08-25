import { Redis } from 'ioredis';
import { NoncePoolService } from '../nonce-pool.service';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedis = {
    eval: jest.fn(),
    zadd: jest.fn(),
    zcard: jest.fn(),
    zrange: jest.fn(),
    zrem: jest.fn(),
    zpopmin: jest.fn(),
    zscore: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  return {
    Redis: jest.fn(() => mockRedis),
  };
});

describe('NoncePoolService', () => {
  let service: NoncePoolService;
  let mockRedis: any;

  const TEST_CHAIN_ID = '137';
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    mockRedis = new Redis() as any;
    service = new NoncePoolService(mockRedis);
    jest.clearAllMocks();
  });

  describe('returnNonce', () => {
    it('should add nonce to pool using Lua script', async () => {
      const nonce = 42;
      mockRedis.eval.mockResolvedValue(1);

      await service.returnNonce(TEST_CHAIN_ID, TEST_ADDRESS, nonce);

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('zadd'),
        1,
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        nonce.toString(),
        '86400'
      );
    });

    it('should handle errors when returning nonce', async () => {
      const nonce = 42;
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.returnNonce(TEST_CHAIN_ID, TEST_ADDRESS, nonce)
      ).rejects.toThrow('Redis error');
    });
  });

  describe('getAvailableNonce', () => {
    it('should retrieve and remove the smallest nonce from pool', async () => {
      // ZPOPMIN returns [member, score] array
      const expectedNonce = ['10', '10'];
      mockRedis.zpopmin.mockResolvedValue(expectedNonce);
      mockRedis.zcard.mockResolvedValue(2);

      const result = await service.getAvailableNonce(
        TEST_CHAIN_ID,
        TEST_ADDRESS
      );

      expect(result).toBe(10);
      expect(mockRedis.zpopmin).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        1
      );
    });

    it('should return null when pool is empty', async () => {
      // ZPOPMIN returns empty array when no elements
      mockRedis.zpopmin.mockResolvedValue([]);

      const result = await service.getAvailableNonce(
        TEST_CHAIN_ID,
        TEST_ADDRESS
      );

      expect(result).toBeNull();
    });

    it('should handle errors when getting nonce', async () => {
      mockRedis.zpopmin.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.getAvailableNonce(TEST_CHAIN_ID, TEST_ADDRESS)
      ).rejects.toThrow('Redis error');
    });
  });

  describe('clearPool', () => {
    it('should delete all nonces from pool', async () => {
      mockRedis.zcard.mockResolvedValue(5);
      mockRedis.del.mockResolvedValue(1);

      await service.clearPool(TEST_CHAIN_ID, TEST_ADDRESS);

      expect(mockRedis.zcard).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`
      );
    });

    it('should not delete if pool is empty', async () => {
      mockRedis.zcard.mockResolvedValue(0);

      await service.clearPool(TEST_CHAIN_ID, TEST_ADDRESS);

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('getPoolSize', () => {
    it('should return the number of nonces in pool', async () => {
      mockRedis.zcard.mockResolvedValue(3);

      const size = await service.getPoolSize(TEST_CHAIN_ID, TEST_ADDRESS);

      expect(size).toBe(3);
      expect(mockRedis.zcard).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`
      );
    });

    it('should return 0 on error', async () => {
      mockRedis.zcard.mockRejectedValue(new Error('Redis error'));

      const size = await service.getPoolSize(TEST_CHAIN_ID, TEST_ADDRESS);

      expect(size).toBe(0);
    });
  });

  describe('getPoolContents', () => {
    it('should return all nonces in pool as numbers', async () => {
      mockRedis.zrange.mockResolvedValue(['10', '15', '20']);

      const contents = await service.getPoolContents(
        TEST_CHAIN_ID,
        TEST_ADDRESS
      );

      expect(contents).toEqual([10, 15, 20]);
      expect(mockRedis.zrange).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        0,
        -1
      );
    });

    it('should return empty array on error', async () => {
      mockRedis.zrange.mockRejectedValue(new Error('Redis error'));

      const contents = await service.getPoolContents(
        TEST_CHAIN_ID,
        TEST_ADDRESS
      );

      expect(contents).toEqual([]);
    });
  });

  describe('returnMultipleNonces', () => {
    it('should add multiple nonces to pool efficiently', async () => {
      const nonces = [10, 15, 20];
      const mockPipeline = {
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      mockRedis.zcard.mockResolvedValue(3);

      await service.returnMultipleNonces(TEST_CHAIN_ID, TEST_ADDRESS, nonces);

      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        10,
        '10',
        15,
        '15',
        20,
        '20'
      );
      expect(mockPipeline.expire).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        86400
      );
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty nonce array', async () => {
      await service.returnMultipleNonces(TEST_CHAIN_ID, TEST_ADDRESS, []);

      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('hasNonce', () => {
    it('should return true if nonce exists in pool', async () => {
      mockRedis.zscore.mockResolvedValue('42');

      const exists = await service.hasNonce(TEST_CHAIN_ID, TEST_ADDRESS, 42);

      expect(exists).toBe(true);
      expect(mockRedis.zscore).toHaveBeenCalledWith(
        `nonce_pool:${TEST_CHAIN_ID}:${TEST_ADDRESS.toLowerCase()}`,
        '42'
      );
    });

    it('should return false if nonce does not exist', async () => {
      mockRedis.zscore.mockResolvedValue(null);

      const exists = await service.hasNonce(TEST_CHAIN_ID, TEST_ADDRESS, 42);

      expect(exists).toBe(false);
    });

    it('should return false on error', async () => {
      mockRedis.zscore.mockRejectedValue(new Error('Redis error'));

      const exists = await service.hasNonce(TEST_CHAIN_ID, TEST_ADDRESS, 42);

      expect(exists).toBe(false);
    });
  });

  describe('getPoolStatistics', () => {
    it('should return statistics for all pools', async () => {
      const keys = ['nonce_pool:137:0xabc', 'nonce_pool:137:0xdef'];
      mockRedis.keys.mockResolvedValue(keys);
      mockRedis.zcard.mockResolvedValueOnce(5).mockResolvedValueOnce(3);

      const stats = await service.getPoolStatistics(TEST_CHAIN_ID);

      expect(stats).toEqual({
        totalPools: 2,
        totalNonces: 8,
        largestPool: { address: '0xabc', size: 5 },
        averagePoolSize: 4,
      });
    });

    it('should return empty statistics when no pools exist', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const stats = await service.getPoolStatistics(TEST_CHAIN_ID);

      expect(stats).toEqual({
        totalPools: 0,
        totalNonces: 0,
        largestPool: null,
        averagePoolSize: 0,
      });
    });

    it('should handle errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const stats = await service.getPoolStatistics(TEST_CHAIN_ID);

      expect(stats).toEqual({
        totalPools: 0,
        totalNonces: 0,
        largestPool: null,
        averagePoolSize: 0,
      });
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent nonce returns without duplication', async () => {
      const nonce = 42;
      mockRedis.eval.mockResolvedValue(1);

      // Simulate concurrent calls
      const promises = [
        service.returnNonce(TEST_CHAIN_ID, TEST_ADDRESS, nonce),
        service.returnNonce(TEST_CHAIN_ID, TEST_ADDRESS, nonce),
        service.returnNonce(TEST_CHAIN_ID, TEST_ADDRESS, nonce),
      ];

      await Promise.all(promises);

      // All calls should complete without error
      expect(mockRedis.eval).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent nonce retrievals atomically', async () => {
      // ZPOPMIN returns [member, score] arrays or empty array
      mockRedis.zpopmin
        .mockResolvedValueOnce(['10', '10'])
        .mockResolvedValueOnce(['11', '11'])
        .mockResolvedValueOnce([]);
      mockRedis.zcard.mockResolvedValue(0);

      // Simulate concurrent calls
      const promises = [
        service.getAvailableNonce(TEST_CHAIN_ID, TEST_ADDRESS),
        service.getAvailableNonce(TEST_CHAIN_ID, TEST_ADDRESS),
        service.getAvailableNonce(TEST_CHAIN_ID, TEST_ADDRESS),
      ];

      const results = await Promise.all(promises);

      // Each call should get a different nonce or null
      expect(results).toEqual([10, 11, null]);
      expect(mockRedis.zpopmin).toHaveBeenCalledTimes(3);
    });
  });
});
