import {
  ErrorCode,
  AppError,
  ValidationError,
  NotFoundError,
  BusinessError,
  DatabaseError,
  BlockchainError,
} from '../errors';

describe('ErrorCode', () => {
  it('should contain all expected error codes', () => {
    // Validation errors (400)
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    expect(ErrorCode.INVALID_AMOUNT).toBe('INVALID_AMOUNT');
    expect(ErrorCode.INVALID_ADDRESS).toBe('INVALID_ADDRESS');
    expect(ErrorCode.INVALID_NETWORK).toBe('INVALID_NETWORK');

    // Resource errors (404)
    expect(ErrorCode.TRANSACTION_NOT_FOUND).toBe('TRANSACTION_NOT_FOUND');
    expect(ErrorCode.USER_NOT_FOUND).toBe('USER_NOT_FOUND');

    // Business logic errors (422)
    expect(ErrorCode.INSUFFICIENT_BALANCE).toBe('INSUFFICIENT_BALANCE');
    expect(ErrorCode.WITHDRAWAL_LIMIT_EXCEEDED).toBe(
      'WITHDRAWAL_LIMIT_EXCEEDED'
    );
    expect(ErrorCode.DUPLICATE_REQUEST).toBe('DUPLICATE_REQUEST');

    // Server errors (500)
    expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    expect(ErrorCode.BLOCKCHAIN_ERROR).toBe('BLOCKCHAIN_ERROR');
    expect(ErrorCode.QUEUE_ERROR).toBe('QUEUE_ERROR');
    expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });

  it('should have all enum values as strings', () => {
    Object.values(ErrorCode).forEach(code => {
      expect(typeof code).toBe('string');
    });
  });
});

describe('AppError', () => {
  it('should create instance with required parameters', () => {
    const error = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Test error message',
      400
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.message).toBe('Test error message');
    expect(error.statusCode).toBe(400);
    expect(error.details).toBeUndefined();
  });

  it('should create instance with optional details', () => {
    const details = { field: 'amount', value: 'invalid' };
    const error = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Test error message',
      400,
      details
    );

    expect(error.details).toEqual(details);
  });

  it('should default to status code 500', () => {
    const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Test error message');

    expect(error.statusCode).toBe(500);
  });

  it('should capture stack trace', () => {
    const error = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Test error message',
      400
    );

    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });

  it('should be catchable as regular Error', () => {
    const error = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Test error message',
      400
    );

    expect(() => {
      throw error;
    }).toThrow(Error);
  });
});

describe('ValidationError', () => {
  it('should create instance with message only', () => {
    const error = new ValidationError('Invalid input');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.details).toBeUndefined();
  });

  it('should create instance with message and details', () => {
    const details = { fields: ['amount', 'address'] };
    const error = new ValidationError('Multiple validation errors', details);

    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.message).toBe('Multiple validation errors');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
  });

  it('should be catchable as AppError', () => {
    const error = new ValidationError('Invalid input');

    expect(() => {
      throw error;
    }).toThrow(AppError);
  });
});

describe('NotFoundError', () => {
  it('should create instance with resource name only', () => {
    const error = new NotFoundError('Transaction');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.TRANSACTION_NOT_FOUND);
    expect(error.message).toBe('Transaction not found');
    expect(error.statusCode).toBe(404);
  });

  it('should create instance with resource name and id', () => {
    const error = new NotFoundError('Transaction', 'tx-123');

    expect(error.code).toBe(ErrorCode.TRANSACTION_NOT_FOUND);
    expect(error.message).toBe('Transaction with id tx-123 not found');
    expect(error.statusCode).toBe(404);
  });

  it('should handle different resource types', () => {
    const userError = new NotFoundError('User', 'user-456');
    const transactionError = new NotFoundError('Transaction', 'tx-789');

    expect(userError.message).toBe('User with id user-456 not found');
    expect(transactionError.message).toBe(
      'Transaction with id tx-789 not found'
    );
  });
});

describe('BusinessError', () => {
  it('should create instance with code and message', () => {
    const error = new BusinessError(
      ErrorCode.INSUFFICIENT_BALANCE,
      'Insufficient funds for withdrawal'
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(BusinessError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(error.message).toBe('Insufficient funds for withdrawal');
    expect(error.statusCode).toBe(422);
    expect(error.details).toBeUndefined();
  });

  it('should create instance with code, message, and details', () => {
    const details = {
      currentBalance: '100',
      requestedAmount: '150',
      deficit: '50',
    };
    const error = new BusinessError(
      ErrorCode.INSUFFICIENT_BALANCE,
      'Insufficient funds for withdrawal',
      details
    );

    expect(error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(error.message).toBe('Insufficient funds for withdrawal');
    expect(error.statusCode).toBe(422);
    expect(error.details).toEqual(details);
  });

  it('should handle different business error codes', () => {
    const balanceError = new BusinessError(
      ErrorCode.INSUFFICIENT_BALANCE,
      'Insufficient balance'
    );
    const limitError = new BusinessError(
      ErrorCode.WITHDRAWAL_LIMIT_EXCEEDED,
      'Daily limit exceeded'
    );
    const duplicateError = new BusinessError(
      ErrorCode.DUPLICATE_REQUEST,
      'Request already exists'
    );

    expect(balanceError.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(limitError.code).toBe(ErrorCode.WITHDRAWAL_LIMIT_EXCEEDED);
    expect(duplicateError.code).toBe(ErrorCode.DUPLICATE_REQUEST);
  });
});

describe('DatabaseError', () => {
  it('should create instance with message only', () => {
    const error = new DatabaseError('Connection failed');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.message).toBe('Connection failed');
    expect(error.statusCode).toBe(500);
    expect(error.details).toBeUndefined();
  });

  it('should create instance with message and original error', () => {
    const originalError = new Error('ECONNREFUSED');
    const error = new DatabaseError(
      'Database connection failed',
      originalError
    );

    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.message).toBe('Database connection failed');
    expect(error.statusCode).toBe(500);
    expect(error.details).toBe(originalError);
  });

  it('should handle different database errors', () => {
    const connectionError = new DatabaseError('Connection timeout');
    const queryError = new DatabaseError('Invalid query syntax');
    const transactionError = new DatabaseError('Transaction rollback failed');

    expect(connectionError.message).toBe('Connection timeout');
    expect(queryError.message).toBe('Invalid query syntax');
    expect(transactionError.message).toBe('Transaction rollback failed');
  });
});

describe('BlockchainError', () => {
  it('should create instance with message only', () => {
    const error = new BlockchainError('Transaction failed');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(BlockchainError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
    expect(error.message).toBe('Transaction failed');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({
      network: undefined,
      originalError: undefined,
    });
  });

  it('should create instance with message and network', () => {
    const error = new BlockchainError('Gas limit exceeded', 'ethereum');

    expect(error.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
    expect(error.message).toBe('Gas limit exceeded');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({
      network: 'ethereum',
      originalError: undefined,
    });
  });

  it('should create instance with message, network, and original error', () => {
    const originalError = new Error('RPC call failed');
    const error = new BlockchainError(
      'Network request failed',
      'ethereum',
      originalError
    );

    expect(error.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
    expect(error.message).toBe('Network request failed');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({
      network: 'ethereum',
      originalError: originalError,
    });
  });

  it('should handle different blockchain networks', () => {
    const ethereumError = new BlockchainError('Gas too low', 'ethereum');
    const bitcoinError = new BlockchainError('Insufficient fee', 'bitcoin');
    const bscError = new BlockchainError('RPC error', 'bsc');

    expect(ethereumError.details.network).toBe('ethereum');
    expect(bitcoinError.details.network).toBe('bitcoin');
    expect(bscError.details.network).toBe('bsc');
  });
});

describe('Error inheritance and polymorphism', () => {
  it('should allow catching all custom errors as AppError', () => {
    const errors = [
      new ValidationError('Validation failed'),
      new NotFoundError('Resource'),
      new BusinessError(ErrorCode.INSUFFICIENT_BALANCE, 'No funds'),
      new DatabaseError('DB error'),
      new BlockchainError('Chain error'),
    ];

    errors.forEach(error => {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  it('should allow type-specific error handling', () => {
    const errors = [
      new ValidationError('Validation failed'),
      new NotFoundError('Resource'),
      new BusinessError(ErrorCode.INSUFFICIENT_BALANCE, 'No funds'),
      new DatabaseError('DB error'),
      new BlockchainError('Chain error'),
    ];

    errors.forEach(error => {
      if (error instanceof ValidationError) {
        expect(error.statusCode).toBe(400);
      } else if (error instanceof NotFoundError) {
        expect(error.statusCode).toBe(404);
      } else if (error instanceof BusinessError) {
        expect(error.statusCode).toBe(422);
      } else if (error instanceof DatabaseError) {
        expect(error.statusCode).toBe(500);
      } else if (error instanceof BlockchainError) {
        expect(error.statusCode).toBe(500);
      }
    });
  });

  it('should maintain proper error codes for each type', () => {
    const validationError = new ValidationError('Test');
    const notFoundError = new NotFoundError('Test');
    const businessError = new BusinessError(
      ErrorCode.INSUFFICIENT_BALANCE,
      'Test'
    );
    const databaseError = new DatabaseError('Test');
    const blockchainError = new BlockchainError('Test');

    expect(validationError.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(notFoundError.code).toBe(ErrorCode.TRANSACTION_NOT_FOUND);
    expect(businessError.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(databaseError.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(blockchainError.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
  });
});

describe('Error serialization', () => {
  it('should serialize errors to JSON properly', () => {
    const error = new ValidationError('Invalid input', { field: 'amount' });

    // Error objects need special handling for serialization
    const serialized = {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      name: error.name,
    };

    expect(serialized.message).toBe('Invalid input');
    expect(serialized.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(serialized.statusCode).toBe(400);
    expect(serialized.details).toEqual({ field: 'amount' });
  });

  it('should handle errors without details', () => {
    const error = new NotFoundError('Transaction', 'tx-123');

    const serialized = {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      name: error.name,
    };

    expect(serialized.message).toBe('Transaction with id tx-123 not found');
    expect(serialized.code).toBe(ErrorCode.TRANSACTION_NOT_FOUND);
    expect(serialized.statusCode).toBe(404);
  });
});
