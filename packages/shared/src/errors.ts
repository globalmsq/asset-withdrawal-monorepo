export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_NETWORK = 'INVALID_NETWORK',
  
  // Resource errors (404)
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Business logic errors (422)
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  WITHDRAWAL_LIMIT_EXCEEDED = 'WITHDRAWAL_LIMIT_EXCEEDED',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  
  // Server errors (500)
  DATABASE_ERROR = 'DATABASE_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  QUEUE_ERROR = 'QUEUE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(ErrorCode.TRANSACTION_NOT_FOUND, message, 404);
  }
}

export class BusinessError extends AppError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, 422, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: any) {
    super(ErrorCode.DATABASE_ERROR, message, 500, originalError);
  }
}

export class BlockchainError extends AppError {
  constructor(message: string, network?: string, originalError?: any) {
    super(ErrorCode.BLOCKCHAIN_ERROR, message, 500, { network, originalError });
  }
}