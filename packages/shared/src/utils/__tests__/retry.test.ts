import { retryWithBackoff, simpleRetry, retryWithCondition } from '../retry';

// Mock isRetryableError function
jest.mock('../network-errors', () => ({
  isRetryableError: jest.fn((error: any) => {
    if (!error) return false;
    const message = error.message?.toLowerCase() || '';
    return message.includes('retry') || message.includes('network');
  }),
}));

describe('Retry Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retryWithBackoff', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('retry error'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-retryable errors', async () => {
      const nonRetryableError = new Error('invalid input');
      const fn = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(retryWithBackoff(fn)).rejects.toThrow('invalid input');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      const error = new Error('network error');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toThrow(
        'network error'
      );
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff delays', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retry error'))
        .mockRejectedValueOnce(new Error('retry error'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 100,
        factor: 2,
      });
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      // Should have delays of 100ms and 200ms (total 300ms minimum)
      expect(elapsedTime).toBeGreaterThanOrEqual(300);
    });

    it('should respect maxDelay limit', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retry error'))
        .mockRejectedValueOnce(new Error('retry error'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 1500,
        factor: 10,
      });
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe('success');
      // Delays should be capped at maxDelay (1000ms + 1500ms = 2500ms)
      expect(elapsedTime).toBeLessThan(3000);
    });

    it('should call onRetry callback when provided', async () => {
      const onRetry = jest.fn();
      const error = new Error('retry error');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      await retryWithBackoff(fn, {
        maxRetries: 2,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, error);
    });
  });

  describe('simpleRetry', () => {
    it('should retry with fixed delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retry error'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await simpleRetry(fn, 2, 100);
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      // Should have a fixed delay of 100ms
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
      expect(elapsedTime).toBeLessThan(200);
    });

    it('should throw after max retries', async () => {
      const error = new Error('retry error');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(simpleRetry(fn, 2, 50)).rejects.toThrow('retry error');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-retryable errors', async () => {
      const error = new Error('invalid input');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(simpleRetry(fn, 3, 50)).rejects.toThrow('invalid input');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryWithCondition', () => {
    it('should retry based on custom condition', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('custom error'))
        .mockResolvedValue('success');

      const shouldRetry = jest.fn((error: any, attempt: number) => {
        return error.message === 'custom error' && attempt < 3;
      });

      const result = await retryWithCondition(fn, shouldRetry);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should not retry when condition returns false', async () => {
      const error = new Error('do not retry');
      const fn = jest.fn().mockRejectedValue(error);

      const shouldRetry = jest.fn(() => false);

      await expect(retryWithCondition(fn, shouldRetry)).rejects.toThrow(
        'do not retry'
      );
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(error, 1);
    });

    it('should apply exponential backoff with custom condition', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retry'))
        .mockRejectedValueOnce(new Error('retry'))
        .mockResolvedValue('success');

      const shouldRetry = (error: any) => error.message === 'retry';

      const startTime = Date.now();
      const result = await retryWithCondition(fn, shouldRetry, {
        maxRetries: 3,
        initialDelay: 50,
        factor: 2,
      });
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      // Should have delays of 50ms and 100ms (total 150ms minimum)
      expect(elapsedTime).toBeGreaterThanOrEqual(150);
    });

    it('should call onRetry callback when provided', async () => {
      const onRetry = jest.fn();
      const error = new Error('retry');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const shouldRetry = () => true;

      await retryWithCondition(fn, shouldRetry, {
        maxRetries: 2,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, error);
    });
  });
});
