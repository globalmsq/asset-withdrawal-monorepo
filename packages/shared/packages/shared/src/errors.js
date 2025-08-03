"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainError = exports.DatabaseError = exports.BusinessError = exports.NotFoundError = exports.ValidationError = exports.AppError = exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    // Validation errors (400)
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    ErrorCode["INVALID_AMOUNT"] = "INVALID_AMOUNT";
    ErrorCode["INVALID_ADDRESS"] = "INVALID_ADDRESS";
    ErrorCode["INVALID_NETWORK"] = "INVALID_NETWORK";
    // Resource errors (404)
    ErrorCode["TRANSACTION_NOT_FOUND"] = "TRANSACTION_NOT_FOUND";
    ErrorCode["USER_NOT_FOUND"] = "USER_NOT_FOUND";
    // Business logic errors (422)
    ErrorCode["INSUFFICIENT_BALANCE"] = "INSUFFICIENT_BALANCE";
    ErrorCode["WITHDRAWAL_LIMIT_EXCEEDED"] = "WITHDRAWAL_LIMIT_EXCEEDED";
    ErrorCode["DUPLICATE_REQUEST"] = "DUPLICATE_REQUEST";
    // Server errors (500)
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["BLOCKCHAIN_ERROR"] = "BLOCKCHAIN_ERROR";
    ErrorCode["QUEUE_ERROR"] = "QUEUE_ERROR";
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class AppError extends Error {
    code;
    message;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.message = message;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(ErrorCode.VALIDATION_ERROR, message, 400, details);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource, id) {
        const message = id
            ? `${resource} with id ${id} not found`
            : `${resource} not found`;
        super(ErrorCode.TRANSACTION_NOT_FOUND, message, 404);
    }
}
exports.NotFoundError = NotFoundError;
class BusinessError extends AppError {
    constructor(code, message, details) {
        super(code, message, 422, details);
    }
}
exports.BusinessError = BusinessError;
class DatabaseError extends AppError {
    constructor(message, originalError) {
        super(ErrorCode.DATABASE_ERROR, message, 500, originalError);
    }
}
exports.DatabaseError = DatabaseError;
class BlockchainError extends AppError {
    constructor(message, network, originalError) {
        super(ErrorCode.BLOCKCHAIN_ERROR, message, 500, { network, originalError });
    }
}
exports.BlockchainError = BlockchainError;
//# sourceMappingURL=errors.js.map