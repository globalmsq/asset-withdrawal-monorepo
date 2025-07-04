import { TransactionStatus } from '../types';
import type {
  WithdrawalRequest,
  WithdrawalResponse,
  QueueMessage,
  DatabaseTransaction,
  ApiResponse,
} from '../types';

describe('Types', () => {
  describe('TransactionStatus', () => {
    it('should have all required transaction statuses', () => {
      expect(TransactionStatus.PENDING).toBe('PENDING');
      expect(TransactionStatus.VALIDATING).toBe('VALIDATING');
      expect(TransactionStatus.SIGNED).toBe('SIGNED');
      expect(TransactionStatus.BROADCASTING).toBe('BROADCASTING');
      expect(TransactionStatus.COMPLETED).toBe('COMPLETED');
      expect(TransactionStatus.FAILED).toBe('FAILED');
    });

    it('should have all enum values as strings', () => {
      Object.values(TransactionStatus).forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('WithdrawalRequest interface', () => {
    it('should match expected structure', () => {
      const mockRequest: WithdrawalRequest = {
        id: 'test-id',
        userId: 'user-123',
        amount: '0.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
        createdAt: new Date(),
      };

      expect(mockRequest.id).toBe('test-id');
      expect(mockRequest.userId).toBe('user-123');
      expect(mockRequest.amount).toBe('0.5');
      expect(mockRequest.toAddress).toBe(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd'
      );
      expect(mockRequest.tokenAddress).toBe(
        '0x0000000000000000000000000000000000000000'
      );
      expect(mockRequest.network).toBe('ethereum');
      expect(mockRequest.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('WithdrawalResponse interface', () => {
    it('should match expected structure', () => {
      const mockResponse: WithdrawalResponse = {
        id: 'test-id',
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockResponse.id).toBe('test-id');
      expect(mockResponse.status).toBe(TransactionStatus.PENDING);
      expect(mockResponse.createdAt).toBeInstanceOf(Date);
      expect(mockResponse.updatedAt).toBeInstanceOf(Date);
    });

    it('should support optional fields', () => {
      const mockResponse: WithdrawalResponse = {
        id: 'test-id',
        status: TransactionStatus.COMPLETED,
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
      const mockMessage: QueueMessage = {
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
      const stringMessage: QueueMessage<string> = {
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
      const mockTransaction: DatabaseTransaction = {
        id: 'tx-123',
        userId: 'user-123',
        amount: '1.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockTransaction.id).toBe('tx-123');
      expect(mockTransaction.userId).toBe('user-123');
      expect(mockTransaction.amount).toBe('1.5');
      expect(mockTransaction.status).toBe(TransactionStatus.PENDING);
      expect(mockTransaction.createdAt).toBeInstanceOf(Date);
      expect(mockTransaction.updatedAt).toBeInstanceOf(Date);
    });

    it('should support optional fields', () => {
      const mockTransaction: DatabaseTransaction = {
        id: 'tx-123',
        userId: 'user-123',
        amount: '1.5',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'ethereum',
        status: TransactionStatus.FAILED,
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
      const mockResponse: ApiResponse = {
        success: true,
        data: { result: 'success' },
        timestamp: new Date(),
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.data).toEqual({ result: 'success' });
      expect(mockResponse.timestamp).toBeInstanceOf(Date);
    });

    it('should match expected structure for error', () => {
      const mockResponse: ApiResponse = {
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
      const stringResponse: ApiResponse<string> = {
        success: true,
        data: 'test data',
        timestamp: new Date(),
      };

      expect(typeof stringResponse.data).toBe('string');
      expect(stringResponse.data).toBe('test data');
    });
  });
});
