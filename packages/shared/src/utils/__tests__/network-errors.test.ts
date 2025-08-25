import {
  isNetworkError,
  isRetryableError,
  getErrorType,
  getErrorMessage,
} from '../network-errors';

describe('Network Error Utilities', () => {
  describe('isNetworkError', () => {
    it('should identify common network error codes', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { code: 'ENOTFOUND' },
        { code: 'ECONNRESET' },
        { code: 'EHOSTUNREACH' },
        { code: 'ENETUNREACH' },
        { code: 'EPIPE' },
        { code: 'ECONNABORTED' },
      ];

      networkErrors.forEach(error => {
        expect(isNetworkError(error)).toBe(true);
      });
    });

    it('should identify network errors by message content', () => {
      const networkErrors = [
        { message: 'Network connection failed' },
        { message: 'Request timeout occurred' },
        { message: 'Connection reset by peer' },
        { message: 'network is unreachable' },
        { message: 'Connection timeout' },
      ];

      networkErrors.forEach(error => {
        expect(isNetworkError(error)).toBe(true);
      });
    });

    it('should return false for non-network errors', () => {
      const nonNetworkErrors = [
        { code: 'INVALID_ARGUMENT' },
        { message: 'Invalid input provided' },
        { code: 'PERMISSION_DENIED' },
        null,
        undefined,
        {},
      ];

      nonNetworkErrors.forEach(error => {
        expect(isNetworkError(error)).toBe(false);
      });
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors', () => {
      const retryableErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { message: 'network timeout' },
        { message: 'connection failed' },
      ];

      retryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify retryable gas-related errors', () => {
      const gasErrors = [
        { message: 'replacement transaction underpriced' },
        { message: 'transaction underpriced' },
        { message: 'gas price too low' },
      ];

      gasErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify retryable nonce errors', () => {
      const nonceErrors = [
        { message: 'nonce too low' },
        { message: 'nonce has already been used' },
        { message: 'invalid nonce' },
      ];

      nonceErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableErrors = [
        { message: 'invalid address' },
        { message: 'contract execution reverted' },
        { code: 'INVALID_ARGUMENT' },
        null,
        undefined,
      ];

      nonRetryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('getErrorType', () => {
    it('should return NETWORK for network errors', () => {
      expect(getErrorType({ code: 'ECONNREFUSED' })).toBe('NETWORK');
      expect(getErrorType({ message: 'network timeout' })).toBe('NETWORK');
    });

    it('should return GAS_PRICE for gas-related errors', () => {
      expect(
        getErrorType({ message: 'replacement transaction underpriced' })
      ).toBe('GAS_PRICE');
      expect(getErrorType({ message: 'gas price too low' })).toBe('GAS_PRICE');
    });

    it('should return NONCE for nonce-related errors', () => {
      expect(getErrorType({ message: 'nonce too low' })).toBe('NONCE');
      expect(getErrorType({ message: 'nonce has already been used' })).toBe(
        'NONCE'
      );
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      expect(getErrorType({ message: 'some random error' })).toBe('UNKNOWN');
      expect(getErrorType(null)).toBe('UNKNOWN');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should extract message from error-like objects', () => {
      expect(getErrorMessage({ message: 'Object error message' })).toBe(
        'Object error message'
      );
    });

    it('should convert strings directly', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle null and undefined', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
    });

    it('should convert objects without message to string', () => {
      expect(getErrorMessage({ code: 'ERROR_CODE' })).toBe('[object Object]');
    });
  });
});
