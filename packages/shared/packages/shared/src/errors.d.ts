export declare enum ErrorCode {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
    INVALID_AMOUNT = "INVALID_AMOUNT",
    INVALID_ADDRESS = "INVALID_ADDRESS",
    INVALID_NETWORK = "INVALID_NETWORK",
    TRANSACTION_NOT_FOUND = "TRANSACTION_NOT_FOUND",
    USER_NOT_FOUND = "USER_NOT_FOUND",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    WITHDRAWAL_LIMIT_EXCEEDED = "WITHDRAWAL_LIMIT_EXCEEDED",
    DUPLICATE_REQUEST = "DUPLICATE_REQUEST",
    DATABASE_ERROR = "DATABASE_ERROR",
    BLOCKCHAIN_ERROR = "BLOCKCHAIN_ERROR",
    QUEUE_ERROR = "QUEUE_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export declare class AppError extends Error {
    code: ErrorCode;
    message: string;
    statusCode: number;
    details?: any | undefined;
    constructor(code: ErrorCode, message: string, statusCode?: number, details?: any | undefined);
}
export declare class ValidationError extends AppError {
    constructor(message: string, details?: any);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string, id?: string);
}
export declare class BusinessError extends AppError {
    constructor(code: ErrorCode, message: string, details?: any);
}
export declare class DatabaseError extends AppError {
    constructor(message: string, originalError?: any);
}
export declare class BlockchainError extends AppError {
    constructor(message: string, network?: string, originalError?: any);
}
