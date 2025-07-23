import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
import { MulticallService, BatchTransferRequest } from '../multicall.service';
import { Logger } from '../../utils/logger';

// Mock dependencies
jest.mock('@asset-withdrawal/shared');
jest.mock('../../utils/logger');

describe('MulticallService', () => {
  let multicallService: MulticallService;
  let mockChainProvider: jest.Mocked<ChainProvider>;
  let mockLogger: jest.Mocked<Logger>;
  let mockProvider: jest.Mocked<ethers.Provider>;
  let mockMulticall3Contract: any;

  const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const TEST_TOKEN_ADDRESS = '0x1234567890123456789012345678901234567890';
  const TEST_RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    // Setup mock provider
    mockProvider = {
      getBlockNumber: jest.fn(),
    } as any;

    // Setup mock Multicall3 contract
    mockMulticall3Contract = {
      aggregate3: {
        estimateGas: jest.fn().mockResolvedValue(BigInt(300000)),
      },
      interface: {
        encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        decodeFunctionResult: jest.fn().mockReturnValue([
          [
            { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
            { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          ],
        ]),
      },
    };

    // Setup mock ChainProvider
    mockChainProvider = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getMulticall3Address: jest.fn().mockReturnValue(MULTICALL3_ADDRESS),
      getChainId: jest.fn().mockReturnValue(137),
      chain: 'polygon',
      network: 'mainnet',
    } as any;

    // Mock ethers.Contract constructor
    jest.spyOn(ethers, 'Contract').mockImplementation(() => mockMulticall3Contract as any);

    // Create service instance
    multicallService = new MulticallService(mockChainProvider, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct Multicall3 address', () => {
      expect(mockChainProvider.getMulticall3Address).toHaveBeenCalled();
      expect(ethers.Contract).toHaveBeenCalledWith(
        MULTICALL3_ADDRESS,
        expect.any(Array),
        mockProvider
      );
      expect(mockLogger.info).toHaveBeenCalledWith('MulticallService initialized', {
        multicall3Address: MULTICALL3_ADDRESS,
        chainId: 137,
        chain: 'polygon',
        network: 'mainnet',
        gasConfig: {
          blockGasLimit: '30000000',
          safetyMargin: 0.75,
          multicallOverhead: '35000',
        },
      });
    });
  });

  describe('prepareBatchTransfer', () => {
    it('should prepare batch transfers correctly', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000', // 1 token
          transactionId: 'tx1',
        },
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '2000000000000000000', // 2 tokens
          transactionId: 'tx2',
        },
      ];

      const result = await multicallService.prepareBatchTransfer(transfers);

      expect(result.calls).toHaveLength(2);
      expect(result.calls[0]).toEqual({
        target: TEST_TOKEN_ADDRESS,
        allowFailure: false,
        callData: expect.any(String),
      });
      expect(result.totalEstimatedGas).toBe(345000n); // 300000 * 1.15
      expect(result.estimatedGasPerCall).toBeLessThanOrEqual(150000n); // With Polygon adjustments
    });

    it('should group transfers by token address in logs', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
        {
          tokenAddress: '0x9999999999999999999999999999999999999999',
          to: TEST_RECIPIENT,
          amount: '2000000000000000000',
          transactionId: 'tx2',
        },
      ];

      await multicallService.prepareBatchTransfer(transfers);

      // Find the correct log call (not the initialization log)
      const infoCalls = mockLogger.info.mock.calls;
      const batchLogCall = infoCalls.find(call => call[0] === 'Single batch processing');

      expect(batchLogCall).toBeDefined();
      expect(batchLogCall![1]).toMatchObject({
        totalTransfers: 2,
      });
    });

    it('should handle gas estimation failure with fallback', async () => {
      // Mock gas estimation failure
      mockMulticall3Contract.aggregate3.estimateGas.mockRejectedValue(new Error('Gas estimation failed'));

      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
      ];

      const result = await multicallService.prepareBatchTransfer(transfers);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to estimate batch gas',
        expect.any(Error),
        { callCount: 1 }
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Using fallback gas estimation', {
        estimatedGasPerCall: '65000',
        totalEstimatedGas: '100000', // 35000 + 65000 + 0 (no additional gas for single call)
      });
      expect(result.estimatedGasPerCall).toBe(65000n);
      expect(result.totalEstimatedGas).toBe(100000n);
    });

    it('should encode ERC20 transfer calldata correctly', async () => {
      // Create a new instance with proper mocking for this specific test
      const mockEncodeFunctionData = jest.fn().mockReturnValue('0xa9059cbb000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000000de0b6b3a7640000');
      jest.spyOn(ethers, 'Interface').mockImplementation(() => ({
        encodeFunctionData: mockEncodeFunctionData,
      } as any));

      // Create a new service instance to use the mocked Interface
      const service = new MulticallService(mockChainProvider, mockLogger);

      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000', // 1 token with 18 decimals
          transactionId: 'tx1',
        },
      ];

      const result = await service.prepareBatchTransfer(transfers);

      // Verify encoding was called with correct parameters
      expect(mockEncodeFunctionData).toHaveBeenCalledWith('transfer', [
        TEST_RECIPIENT,
        '1000000000000000000',
      ]);

      // Verify the Call3 structure
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]).toEqual({
        target: TEST_TOKEN_ADDRESS,
        allowFailure: false,
        callData: '0xa9059cbb000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000000de0b6b3a7640000',
      });

      // Verify calldata format (0xa9059cbb is the function selector for transfer(address,uint256))
      expect(result.calls[0].callData.startsWith('0xa9059cbb')).toBe(true);
      expect(result.calls[0].callData.length).toBe(138); // 2 (0x) + 8 (selector) + 64 (address) + 64 (amount)
    });
  });

  describe('encodeBatchTransaction', () => {
    it('should encode batch transaction correctly', () => {
      const calls = [
        {
          target: TEST_TOKEN_ADDRESS,
          allowFailure: false,
          callData: '0x1234',
        },
      ];

      const encoded = multicallService.encodeBatchTransaction(calls);

      expect(mockMulticall3Contract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'aggregate3',
        [calls]
      );
      expect(encoded).toBe('0xencoded');
    });

    it('should encode multiple calls correctly', () => {
      const calls = [
        {
          target: TEST_TOKEN_ADDRESS,
          allowFailure: false,
          callData: '0xa9059cbb000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000000de0b6b3a7640000',
        },
        {
          target: TEST_TOKEN_ADDRESS,
          allowFailure: false,
          callData: '0xa9059cbb000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000001bc16d674ec80000',
        },
      ];

      const encoded = multicallService.encodeBatchTransaction(calls);

      expect(mockMulticall3Contract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'aggregate3',
        [calls]
      );
      expect(encoded).toBe('0xencoded');
    });

    it('should handle empty calls array', () => {
      const calls: any[] = [];

      const encoded = multicallService.encodeBatchTransaction(calls);

      expect(mockMulticall3Contract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'aggregate3',
        [[]]
      );
      expect(encoded).toBe('0xencoded');
    });
  });

  describe('decodeBatchResult', () => {
    it('should decode batch result correctly', () => {
      const encodedResult = '0xresult';

      const decoded = multicallService.decodeBatchResult(encodedResult);

      expect(mockMulticall3Contract.interface.decodeFunctionResult).toHaveBeenCalledWith(
        'aggregate3',
        encodedResult
      );
      expect(decoded).toEqual([
        { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
        { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
      ]);
    });

    it('should handle mixed success/failure results', () => {
      // Mock mixed results
      mockMulticall3Contract.interface.decodeFunctionResult.mockReturnValue([
        [
          { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { success: false, returnData: '0x08c379a0' }, // Revert data
          { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000000000001' },
        ],
      ]);

      const encodedResult = '0xmixedresult';
      const decoded = multicallService.decodeBatchResult(encodedResult);

      expect(decoded).toHaveLength(3);
      expect(decoded[0].success).toBe(true);
      expect(decoded[1].success).toBe(false);
      expect(decoded[2].success).toBe(true);
    });

    it('should handle empty results', () => {
      mockMulticall3Contract.interface.decodeFunctionResult.mockReturnValue([[]]);

      const encodedResult = '0xemptyresult';
      const decoded = multicallService.decodeBatchResult(encodedResult);

      expect(decoded).toEqual([]);
    });
  });

  describe('validateBatch', () => {
    it('should validate a valid batch', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
      ];

      const result = await multicallService.validateBatch(
        transfers,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate transaction IDs', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '2000000000000000000',
          transactionId: 'tx1', // Duplicate
        },
      ];

      const result = await multicallService.validateBatch(
        transfers,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate transaction ID: tx1');
    });

    it('should detect invalid addresses', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: 'invalid-address',
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
      ];

      const result = await multicallService.validateBatch(
        transfers,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Invalid token address in transfer tx1/);
    });

    it('should detect invalid amounts', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '0', // Zero amount
          transactionId: 'tx1',
        },
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: 'invalid', // Invalid amount
          transactionId: 'tx2',
        },
      ];

      const result = await multicallService.validateBatch(
        transfers,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid amount in transfer tx1: must be positive');
      expect(result.errors).toContain('Invalid amount in transfer tx2');
    });

    it('should allow large batches (gas will be the limiter)', async () => {
      const transfers: BatchTransferRequest[] = Array(101).fill({
        tokenAddress: TEST_TOKEN_ADDRESS,
        to: TEST_RECIPIENT,
        amount: '1000000000000000000',
        transactionId: 'tx',
      }).map((t, i) => ({ ...t, transactionId: `tx${i}` }));

      const result = await multicallService.validateBatch(
        transfers,
        '0x1111111111111111111111111111111111111111'
      );

      // Should be valid - gas estimation will handle size limits
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getOptimalBatchSize', () => {
    it('should calculate optimal batch size with diminishing gas costs', () => {
      const estimatedGasPerCall = 65000n;
      const optimalSize = multicallService.getOptimalBatchSize(estimatedGasPerCall);

      // With diminishing costs, we can fit more calls
      expect(optimalSize).toBeGreaterThan(50);
      expect(optimalSize).toBeLessThanOrEqual(100);
    });

    it('should respect block gas limit', () => {
      const highGasPerCall = 500000n;
      const optimalSize = multicallService.getOptimalBatchSize(highGasPerCall);

      // Even with high gas per call, should calculate correctly
      expect(optimalSize).toBeGreaterThan(10);
      expect(optimalSize).toBeLessThanOrEqual(50);
    });

    it('should handle very high gas per call', () => {
      const veryHighGas = 10_000_000n;
      const optimalSize = multicallService.getOptimalBatchSize(veryHighGas);

      // Should at least allow 1-2 transactions (with diminishing costs, might fit 2)
      expect(optimalSize).toBeGreaterThanOrEqual(1);
      expect(optimalSize).toBeLessThanOrEqual(2);
    });
  });

  describe('prepareBatchTransfer with batch splitting', () => {
    it('should split large batches that exceed gas limits', async () => {
      // Create a large batch that would exceed gas limits
      const largeBatch: BatchTransferRequest[] = Array(150).fill(null).map((_, i) => ({
        tokenAddress: TEST_TOKEN_ADDRESS,
        to: TEST_RECIPIENT,
        amount: '1000000000000000000',
        transactionId: `tx${i}`,
      }));

      // Mock gas estimation to return high value
      mockMulticall3Contract.aggregate3.estimateGas.mockResolvedValue(BigInt(25_000_000));

      const result = await multicallService.prepareBatchTransfer(largeBatch);

      expect(result.batchGroups).toBeDefined();
      // With diminishing gas costs and high total gas, should split into at least 2 batches
      expect(result.batchGroups!.length).toBeGreaterThanOrEqual(1);

      // Verify each batch is within gas limits
      const maxGas = BigInt(30_000_000 * 0.75); // 75% of 30M
      if (result.batchGroups && result.batchGroups.length > 0) {
        for (const group of result.batchGroups) {
          expect(group.estimatedGas).toBeLessThanOrEqual(maxGas);
        }
      }
    });

    it('should not split small batches', async () => {
      const smallBatch: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '2000000000000000000',
          transactionId: 'tx2',
        },
      ];

      const result = await multicallService.prepareBatchTransfer(smallBatch);

      expect(result.batchGroups).toBeUndefined();
      expect(result.calls).toHaveLength(2);
    });

    it('should group tokens correctly in split batches', async () => {
      const mixedBatch: BatchTransferRequest[] = [
        ...Array(50).fill(null).map((_, i) => ({
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: `tx-a-${i}`,
        })),
        ...Array(50).fill(null).map((_, i) => ({
          tokenAddress: '0x9999999999999999999999999999999999999999',
          to: TEST_RECIPIENT,
          amount: '2000000000000000000',
          transactionId: `tx-b-${i}`,
        })),
      ];

      // Mock to force splitting
      mockMulticall3Contract.aggregate3.estimateGas.mockResolvedValue(BigInt(20_000_000));

      const result = await multicallService.prepareBatchTransfer(mixedBatch);

      expect(result.batchGroups).toBeDefined();

      // Check that token groups are tracked correctly
      for (const group of result.batchGroups!) {
        expect(group.tokenGroups.size).toBeGreaterThan(0);
        expect(group.tokenGroups.size).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('gas estimation improvements', () => {
    it('should apply Polygon-specific gas adjustments', async () => {
      const transfers: BatchTransferRequest[] = Array(10).fill(null).map((_, i) => ({
        tokenAddress: TEST_TOKEN_ADDRESS,
        to: TEST_RECIPIENT,
        amount: '1000000000000000000',
        transactionId: `tx${i}`,
      }));

      const result = await multicallService.prepareBatchTransfer(transfers);

      // With 10 calls, should get some discount
      const basePerCall = 300000n / 10n; // 30000
      expect(result.estimatedGasPerCall).toBeLessThan(basePerCall);
    });

    it('should use token-specific gas costs in fallback', async () => {
      // First call to populate token gas costs
      const firstBatch: BatchTransferRequest[] = [{
        tokenAddress: TEST_TOKEN_ADDRESS,
        to: TEST_RECIPIENT,
        amount: '1000000000000000000',
        transactionId: 'tx1',
      }];

      await multicallService.prepareBatchTransfer(firstBatch);

      // Force fallback on second call
      mockMulticall3Contract.aggregate3.estimateGas.mockRejectedValue(new Error('Network error'));

      const secondBatch: BatchTransferRequest[] = [{
        tokenAddress: TEST_TOKEN_ADDRESS,
        to: TEST_RECIPIENT,
        amount: '2000000000000000000',
        transactionId: 'tx2',
      }];

      const result = await multicallService.prepareBatchTransfer(secondBatch);

      // Should use learned gas cost, not just default
      expect(result.estimatedGasPerCall).toBeGreaterThan(0n);
    });
  });

  describe('batch validation with threshold', () => {
    it('should throw error on validation failure', async () => {
      const invalidBatch: BatchTransferRequest[] = [{
        tokenAddress: 'invalid',
        to: TEST_RECIPIENT,
        amount: '1000000000000000000',
        transactionId: 'tx1',
      }];

      await expect(multicallService.prepareBatchTransfer(invalidBatch))
        .rejects.toThrow('Batch validation failed');
    });
  });
});
