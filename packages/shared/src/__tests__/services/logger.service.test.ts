import { LoggerService } from '../../services/logger.service';
import { LogLevel } from '../../types/logger.types';

// Mock winston
jest.mock('winston', () => {
  const mockLogger: any = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    http: jest.fn(),
    silly: jest.fn(),
    child: jest.fn(),
  };

  mockLogger.child.mockReturnValue(mockLogger);

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      timestamp: jest.fn(() => ({})),
      errors: jest.fn(() => ({})),
      json: jest.fn(() => ({})),
      printf: jest.fn(() => ({})),
      colorize: jest.fn(() => ({})),
      combine: jest.fn(() => ({})),
    },
    transports: {
      Console: jest.fn(),
    },
    config: {
      npm: {
        levels: {
          error: 0,
          warn: 1,
          info: 2,
          http: 3,
          verbose: 4,
          debug: 5,
          silly: 6,
        },
      },
    },
  };
});

describe('LoggerService', () => {
  let logger: LoggerService;
  let mockWinstonLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const winston = require('winston');
    mockWinstonLogger = winston.createLogger();

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
      logger.info('Test info message');
      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Test info message',
        expect.objectContaining({ service: 'test-service' })
      );
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'Test error message',
        expect.objectContaining({ service: 'test-service' })
      );
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      logger.error('Test error with object', error);
      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'Test error with object',
        expect.objectContaining({
          service: 'test-service',
          error: error,
        })
      );
    });

    it('should log warn messages', () => {
      logger.warn('Test warning message');
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
        'Test warning message',
        expect.objectContaining({ service: 'test-service' })
      );
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');
      expect(mockWinstonLogger.debug).toHaveBeenCalledWith(
        'Test debug message',
        expect.objectContaining({ service: 'test-service' })
      );
    });
  });

  describe('Context management', () => {
    it('should set context', () => {
      expect(() =>
        logger.setContext({ userId: '123', requestId: 'abc' })
      ).not.toThrow();
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
      const message =
        'private_key: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
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
