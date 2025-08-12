import { GasPriceCache } from '../../services/gas-price-cache';

describe('GasPriceCache', () => {
  let cache: GasPriceCache;

  beforeEach(() => {
    cache = new GasPriceCache(1); // 1 second cache for testing
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('get', () => {
    it('should return null when cache is empty', () => {
      expect(cache.get()).toBeNull();
    });

    it('should return cached value when valid', () => {
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      cache.set(gasPrice);
      const result = cache.get();

      expect(result).toEqual(gasPrice);
    });

    it('should return null when cache expired', () => {
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      cache.set(gasPrice);

      // Advance time beyond cache duration
      jest.advanceTimersByTime(2000); // 2 seconds

      expect(cache.get()).toBeNull();
    });
  });

  describe('set', () => {
    it('should update cache with new values', () => {
      const gasPrice1 = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      const gasPrice2 = {
        maxFeePerGas: BigInt(60000000000),
        maxPriorityFeePerGas: BigInt(3000000000),
      };

      cache.set(gasPrice1);
      expect(cache.get()).toEqual(gasPrice1);

      cache.set(gasPrice2);
      expect(cache.get()).toEqual(gasPrice2);
    });
  });

  describe('isValid', () => {
    it('should return false when cache is empty', () => {
      expect(cache.isValid()).toBe(false);
    });

    it('should return true when cache is valid', () => {
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      cache.set(gasPrice);
      expect(cache.isValid()).toBe(true);
    });

    it('should return false when cache expired', () => {
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      cache.set(gasPrice);
      jest.advanceTimersByTime(2000); // 2 seconds

      expect(cache.isValid()).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear the cache', () => {
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      cache.set(gasPrice);
      expect(cache.get()).not.toBeNull();

      cache.clear();
      expect(cache.get()).toBeNull();
    });
  });

  describe('custom cache duration', () => {
    it('should use custom cache duration', () => {
      const customCache = new GasPriceCache(60); // 60 seconds
      const gasPrice = {
        maxFeePerGas: BigInt(50000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      };

      customCache.set(gasPrice);

      // Advance time less than cache duration
      jest.advanceTimersByTime(30000); // 30 seconds
      expect(customCache.get()).not.toBeNull();

      // Advance time beyond cache duration
      jest.advanceTimersByTime(31000); // 31 more seconds (total 61)
      expect(customCache.get()).toBeNull();
    });
  });
});
