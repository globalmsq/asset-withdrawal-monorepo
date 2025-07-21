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
      expect(result.totalEstimatedGas).toBe(360000n); // 300000 * 1.2
      expect(result.estimatedGasPerCall).toBe(150000n); // 300000 / 2
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

      expect(mockLogger.info).toHaveBeenCalledWith('Prepared batch transfer', {
        totalTransfers: 2,
        uniqueTokens: 2,
        tokenGroups: expect.arrayContaining([
          { token: TEST_TOKEN_ADDRESS, count: 1 },
          { token: '0x9999999999999999999999999999999999999999', count: 1 },
        ]),
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
        totalEstimatedGas: '95000', // 30000 + 65000
      });
      expect(result.estimatedGasPerCall).toBe(65000n);
      expect(result.totalEstimatedGas).toBe(95000n);
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
      expect(result.errors).toContain('Invalid address in transfer tx1');
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

    it('should detect batch size exceeding limit', async () => {
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

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Batch size 101 exceeds maximum 100');
    });
  });

  describe('getOptimalBatchSize', () => {
    it('should calculate optimal batch size', () => {
      const estimatedGasPerCall = 65000n;
      const optimalSize = multicallService.getOptimalBatchSize(estimatedGasPerCall);

      // (30M * 0.8 - 30000) / 65000 ≈ 369
      // But capped at 100
      expect(optimalSize).toBe(100);
    });

    it('should respect block gas limit', () => {
      const highGasPerCall = 500000n;
      const optimalSize = multicallService.getOptimalBatchSize(highGasPerCall);

      // (30M * 0.8 - 30000) / 500000 ≈ 47
      expect(optimalSize).toBe(47);
    });
  });
});