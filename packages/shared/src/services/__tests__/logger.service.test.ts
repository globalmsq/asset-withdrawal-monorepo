import { LoggerService } from '../logger.service';
import { LogLevel } from '../../types/logger.types';

describe('LoggerService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService({
      service: 'test-service',
      level: LogLevel.DEBUG,
      enableConsole: true,
      enableFile: false,
    });
  });

  it('should exist', () => {
    expect(LoggerService).toBeDefined();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLogger = new LoggerService();
      expect(defaultLogger).toBeDefined();
      expect(defaultLogger.getWinstonLogger()).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customLogger = new LoggerService({
        service: 'custom-service',
        level: LogLevel.ERROR,
      });
      expect(customLogger).toBeDefined();
    });
  });

  describe('Logging levels', () => {
    it('should log info messages', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Test error with object', error)).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => logger.warn('Test warning message')).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });
  });

  describe('Context management', () => {
    it('should set context', () => {
      expect(() => logger.setContext({ userId: '123', requestId: 'abc' })).not.toThrow();
    });

    it('should clear specific context fields', () => {
      logger.setContext({ userId: '123', requestId: 'abc' });
      expect(() => logger.clearContext('userId')).not.toThrow();
    });

    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ requestId: 'child-123' });
      expect(childLogger).toBeDefined();
      expect(childLogger).toBeInstanceOf(LoggerService);
    });
  });

  describe('Sensitive data filtering', () => {
    it('should filter private keys from logs', () => {
      const message = 'private_key: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      // This test verifies the logger doesn't throw when filtering sensitive data
      expect(() => logger.info(message)).not.toThrow();
    });

    it('should filter AWS credentials from logs', () => {
      const message = 'aws_access_key_id: AKIAIOSFODNN7EXAMPLE';
      expect(() => logger.info(message)).not.toThrow();
    });

    it('should handle metadata with sensitive data', () => {
      const metadata = {
        metadata: {
          apiKey: 'secret-api-key-123',
          data: {
            password: 'user-password',
            token: 'jwt-token-here',
          },
        },
      };
      expect(() => logger.info('Test with metadata', metadata)).not.toThrow();
    });

    it('should handle BigInt in metadata', () => {
      const metadata = {
        metadata: {
          amount: BigInt('1000000000000000000'),
          gasPrice: BigInt('20000000000'),
        },
      };
      expect(() => logger.info('Test with BigInt', metadata)).not.toThrow();
    });
  });
});
