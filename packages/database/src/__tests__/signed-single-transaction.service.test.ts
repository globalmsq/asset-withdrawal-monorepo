import { PrismaClient } from '@prisma/client';
import { SignedSingleTransactionService } from '../services/signed-single-transaction.service';
import { CreateSignedTransactionDto } from '../services/signed-single-transaction.service';

describe('SignedSingleTransactionService', () => {
  let service: SignedSingleTransactionService;
  let mockPrismaClient: any;

  beforeEach(() => {
    mockPrismaClient = {
      signedSingleTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new SignedSingleTransactionService(mockPrismaClient);
  });

  describe('create', () => {
    it('should create a signed transaction', async () => {
      const dto: CreateSignedTransactionDto = {
        requestId: 'test-request-id',
        txHash: '0x1234567890abcdef',
        nonce: 5,
        gasLimit: '21000',
        maxFeePerGas: '20000000000',
        maxPriorityFeePerGas: '1000000000',
        from: '0xfrom',
        to: '0xto',
        value: '1000000000000000000',
        amount: '1000000000000000000',
        symbol: 'USDT',
        chainId: 80002,
      };

      const expectedResult = {
        id: 1n,
        ...dto,
        status: 'SIGNED',
        tryCount: 0,
        gasUsed: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        broadcastedAt: null,
        confirmedAt: null,
        errorMessage: null,
      };

      mockPrismaClient.signedSingleTransaction.create.mockResolvedValue(
        expectedResult
      );

      const result = await service.create(dto);

      expect(result).toEqual(expectedResult);
      expect(
        mockPrismaClient.signedSingleTransaction.create
      ).toHaveBeenCalledWith({
        data: {
          ...dto,
          status: 'SIGNED',
        },
      });
    });

    it('should create with custom status', async () => {
      const dto: CreateSignedTransactionDto = {
        requestId: 'test-request-id',
        txHash: '0x1234567890abcdef',
        nonce: 5,
        gasLimit: '21000',
        maxFeePerGas: '20000000000',
        maxPriorityFeePerGas: '1000000000',
        from: '0xfrom',
        to: '0xto',
        value: '1000000000000000000',
        amount: '1000000000000000000',
        symbol: 'USDC',
        chainId: 80002,
        status: 'FAILED',
        errorMessage: 'Test error',
      };

      mockPrismaClient.signedSingleTransaction.create.mockResolvedValue({
        id: 1n,
        ...dto,
      });

      await service.create(dto);

      expect(
        mockPrismaClient.signedSingleTransaction.create
      ).toHaveBeenCalledWith({
        data: dto,
      });
    });
  });

  describe('findByRequestId', () => {
    it('should find transactions by request ID', async () => {
      const requestId = 'test-request-id';
      const mockResults = [
        { id: 1n, requestId, createdAt: new Date('2025-01-01') },
        { id: 2n, requestId, createdAt: new Date('2025-01-02') },
      ];

      mockPrismaClient.signedSingleTransaction.findMany.mockResolvedValue(
        mockResults
      );

      const result = await service.findByRequestId(requestId);

      expect(result).toEqual(mockResults);
      expect(
        mockPrismaClient.signedSingleTransaction.findMany
      ).toHaveBeenCalledWith({
        where: { requestId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findByTxHash', () => {
    it('should find transaction by hash', async () => {
      const txHash = '0x1234567890abcdef';
      const mockResult = { id: 1n, txHash };

      mockPrismaClient.signedSingleTransaction.findFirst.mockResolvedValue(
        mockResult
      );

      const result = await service.findByTxHash(txHash);

      expect(result).toEqual(mockResult);
      expect(
        mockPrismaClient.signedSingleTransaction.findFirst
      ).toHaveBeenCalledWith({
        where: { txHash },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.signedSingleTransaction.findFirst.mockResolvedValue(
        null
      );

      const result = await service.findByTxHash('0xnotfound');

      expect(result).toBeNull();
    });
  });

  describe('getLatestByRequestId', () => {
    it('should get latest transaction for request', async () => {
      const requestId = 'test-request-id';
      const mockResult = { id: 2n, requestId, createdAt: new Date() };

      mockPrismaClient.signedSingleTransaction.findFirst.mockResolvedValue(
        mockResult
      );

      const result = await service.getLatestByRequestId(requestId);

      expect(result).toEqual(mockResult);
      expect(
        mockPrismaClient.signedSingleTransaction.findFirst
      ).toHaveBeenCalledWith({
        where: { requestId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update transaction status', async () => {
      const id = 1n;
      const updateData = {
        status: 'BROADCASTED',
        broadcastedAt: new Date(),
      };

      const mockResult = { id, ...updateData };
      mockPrismaClient.signedSingleTransaction.update.mockResolvedValue(
        mockResult
      );

      const result = await service.updateStatus(id, updateData);

      expect(result).toEqual(mockResult);
      expect(
        mockPrismaClient.signedSingleTransaction.update
      ).toHaveBeenCalledWith({
        where: { id },
        data: updateData,
      });
    });
  });

  describe('updateStatusByTxHash', () => {
    it('should update status by transaction hash', async () => {
      const txHash = '0x1234567890abcdef';
      const updateData = {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      };

      const mockFindResult = { id: 1n, txHash };
      const mockUpdateResult = { ...mockFindResult, ...updateData };

      mockPrismaClient.signedSingleTransaction.findFirst.mockResolvedValue(
        mockFindResult
      );
      mockPrismaClient.signedSingleTransaction.update.mockResolvedValue(
        mockUpdateResult
      );

      const result = await service.updateStatusByTxHash(txHash, updateData);

      expect(result).toEqual(mockUpdateResult);
      expect(
        mockPrismaClient.signedSingleTransaction.findFirst
      ).toHaveBeenCalledWith({
        where: { txHash },
      });
      expect(
        mockPrismaClient.signedSingleTransaction.update
      ).toHaveBeenCalledWith({
        where: { id: 1n },
        data: updateData,
      });
    });

    it('should throw error when transaction not found', async () => {
      mockPrismaClient.signedSingleTransaction.findFirst.mockResolvedValue(
        null
      );

      await expect(
        service.updateStatusByTxHash('0xnotfound', { status: 'FAILED' })
      ).rejects.toThrow(
        'SignedSingleTransaction with txHash 0xnotfound not found'
      );
    });
  });

  describe('countByStatus', () => {
    it('should count transactions by status', async () => {
      mockPrismaClient.signedSingleTransaction.count.mockResolvedValue(5);

      const result = await service.countByStatus('SIGNED');

      expect(result).toBe(5);
      expect(
        mockPrismaClient.signedSingleTransaction.count
      ).toHaveBeenCalledWith({
        where: { status: 'SIGNED' },
      });
    });
  });

  describe('getRecentSignedTransactions', () => {
    it('should get recent transactions with default limit', async () => {
      const mockResults = [
        { id: 1n, createdAt: new Date() },
        { id: 2n, createdAt: new Date() },
      ];

      mockPrismaClient.signedSingleTransaction.findMany.mockResolvedValue(
        mockResults
      );

      const result = await service.getRecentSignedTransactions();

      expect(result).toEqual(mockResults);
      expect(
        mockPrismaClient.signedSingleTransaction.findMany
      ).toHaveBeenCalledWith({
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get recent transactions with custom limit', async () => {
      mockPrismaClient.signedSingleTransaction.findMany.mockResolvedValue([]);

      await service.getRecentSignedTransactions(20);

      expect(
        mockPrismaClient.signedSingleTransaction.findMany
      ).toHaveBeenCalledWith({
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getByRequestIdAndStatus', () => {
    it('should get transactions by request ID and status', async () => {
      const requestId = 'test-request-id';
      const status = 'SIGNED';
      const mockResults = [{ id: 1n, requestId, status }];

      mockPrismaClient.signedSingleTransaction.findMany.mockResolvedValue(
        mockResults
      );

      const result = await service.getByRequestIdAndStatus(requestId, status);

      expect(result).toEqual(mockResults);
      expect(
        mockPrismaClient.signedSingleTransaction.findMany
      ).toHaveBeenCalledWith({
        where: { requestId, status },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
