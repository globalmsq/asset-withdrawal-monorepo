"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
describe('Types', () => {
    describe('TransactionStatus', () => {
        it('should have all required transaction statuses', () => {
            expect(types_1.TransactionStatus.PENDING).toBe('PENDING');
            expect(types_1.TransactionStatus.VALIDATING).toBe('VALIDATING');
            expect(types_1.TransactionStatus.SIGNED).toBe('SIGNED');
            expect(types_1.TransactionStatus.BROADCASTING).toBe('BROADCASTING');
            expect(types_1.TransactionStatus.COMPLETED).toBe('COMPLETED');
            expect(types_1.TransactionStatus.FAILED).toBe('FAILED');
        });
        it('should have all enum values as strings', () => {
            Object.values(types_1.TransactionStatus).forEach(status => {
                expect(typeof status).toBe('string');
            });
        });
    });
    describe('WithdrawalRequest interface', () => {
        it('should match expected structure', () => {
            const mockRequest = {
                id: 'tx-1234567890-abc123def',
                amount: '0.5',
                toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                network: 'polygon',
                createdAt: new Date(),
            };
            expect(mockRequest.id).toBe('tx-1234567890-abc123def');
            expect(mockRequest.amount).toBe('0.5');
            expect(mockRequest.toAddress).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd');
            expect(mockRequest.tokenAddress).toBe('0x0000000000000000000000000000000000000000');
            expect(mockRequest.network).toBe('polygon');
            expect(mockRequest.createdAt).toBeInstanceOf(Date);
        });
        it('should work without optional createdAt field', () => {
            const mockRequest = {
                id: 'tx-1234567890-abc123def',
                amount: '0.5',
                toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                network: 'polygon',
            };
            expect(mockRequest.id).toBe('tx-1234567890-abc123def');
            expect(mockRequest.createdAt).toBeUndefined();
        });
    });
    describe('WithdrawalResponse interface', () => {
        it('should match expected structure', () => {
            const mockResponse = {
                id: 'test-id',
                status: types_1.TransactionStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(mockResponse.id).toBe('test-id');
            expect(mockResponse.status).toBe(types_1.TransactionStatus.PENDING);
            expect(mockResponse.createdAt).toBeInstanceOf(Date);
            expect(mockResponse.updatedAt).toBeInstanceOf(Date);
        });
        it('should support optional fields', () => {
            const mockResponse = {
                id: 'test-id',
                status: types_1.TransactionStatus.COMPLETED,
                transactionHash: '0x123abc',
                error: 'Some error message',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(mockResponse.transactionHash).toBe('0x123abc');
            expect(mockResponse.error).toBe('Some error message');
        });
    });
    describe('QueueMessage interface', () => {
        it('should match expected structure', () => {
            const mockMessage = {
                id: 'msg-123',
                data: { test: 'data' },
                timestamp: new Date(),
                retryCount: 0,
            };
            expect(mockMessage.id).toBe('msg-123');
            expect(mockMessage.data).toEqual({ test: 'data' });
            expect(mockMessage.timestamp).toBeInstanceOf(Date);
            expect(mockMessage.retryCount).toBe(0);
        });
        it('should support generic type parameter', () => {
            const stringMessage = {
                id: 'msg-123',
                data: 'test string',
                timestamp: new Date(),
                retryCount: 0,
            };
            expect(typeof stringMessage.data).toBe('string');
            expect(stringMessage.data).toBe('test string');
        });
    });
    describe('DatabaseTransaction interface', () => {
        it('should match expected structure', () => {
            const mockTransaction = {
                id: 'tx-123',
                amount: '1.5',
                toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                network: 'polygon',
                status: types_1.TransactionStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(mockTransaction.id).toBe('tx-123');
            expect(mockTransaction.amount).toBe('1.5');
            expect(mockTransaction.status).toBe(types_1.TransactionStatus.PENDING);
            expect(mockTransaction.createdAt).toBeInstanceOf(Date);
            expect(mockTransaction.updatedAt).toBeInstanceOf(Date);
        });
        it('should support optional fields', () => {
            const mockTransaction = {
                id: 'tx-123',
                amount: '1.5',
                toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                network: 'polygon',
                status: types_1.TransactionStatus.FAILED,
                transactionHash: '0x456def',
                error: 'Transaction failed',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            expect(mockTransaction.transactionHash).toBe('0x456def');
            expect(mockTransaction.error).toBe('Transaction failed');
        });
    });
    describe('ApiResponse interface', () => {
        it('should match expected structure for success', () => {
            const mockResponse = {
                success: true,
                data: { result: 'success' },
                timestamp: new Date(),
            };
            expect(mockResponse.success).toBe(true);
            expect(mockResponse.data).toEqual({ result: 'success' });
            expect(mockResponse.timestamp).toBeInstanceOf(Date);
        });
        it('should match expected structure for error', () => {
            const mockResponse = {
                success: false,
                error: 'Something went wrong',
                code: 'VALIDATION_ERROR',
                details: { field: 'amount' },
                timestamp: new Date(),
            };
            expect(mockResponse.success).toBe(false);
            expect(mockResponse.error).toBe('Something went wrong');
            expect(mockResponse.code).toBe('VALIDATION_ERROR');
            expect(mockResponse.details).toEqual({ field: 'amount' });
        });
        it('should support generic type parameter', () => {
            const stringResponse = {
                success: true,
                data: 'test data',
                timestamp: new Date(),
            };
            expect(typeof stringResponse.data).toBe('string');
            expect(stringResponse.data).toBe('test data');
        });
    });
});
//# sourceMappingURL=types.test.js.map