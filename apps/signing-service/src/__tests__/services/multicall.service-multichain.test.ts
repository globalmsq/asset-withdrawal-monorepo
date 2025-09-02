import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
import {
  MulticallService,
  BatchTransferRequest,
} from '../../services/multicall.service';
import { Logger } from '../../utils/logger';

// Mock dependencies
jest.mock('@asset-withdrawal/shared');
jest.mock('../../utils/logger');

describe('MulticallService - Multi-chain Support', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockProvider: jest.Mocked<ethers.Provider>;
  let mockMulticall3Contract: any;

  const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const TEST_TOKEN_ADDRESS = '0x1234567890123456789012345678901234567890';
  const TEST_RECIPIENT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  const createMockChainProvider = (
    chain: string,
    network: string,
    chainId: number
  ) => {
    const provider = {
      getBlockNumber: jest.fn(),
    } as any;

    return {
      getProvider: jest.fn().mockReturnValue(provider),
      getMulticall3Address: jest.fn().mockReturnValue(MULTICALL3_ADDRESS),
      getChainId: jest.fn().mockReturnValue(chainId),
      chain,
      network,
    } as any;
  };

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
            {
              success: true,
              returnData:
                '0x0000000000000000000000000000000000000000000000000000000000000001',
            },
            {
              success: true,
              returnData:
                '0x0000000000000000000000000000000000000000000000000000000000000001',
            },
          ],
        ]),
      },
      callStatic: {
        aggregate3: jest.fn().mockResolvedValue([
          [
            {
              success: true,
              returnData:
                '0x0000000000000000000000000000000000000000000000000000000000000001',
            },
            {
              success: true,
              returnData:
                '0x0000000000000000000000000000000000000000000000000000000000000001',
            },
          ],
        ]),
      },
    };

    // Mock ethers.Contract constructor
    jest
      .spyOn(ethers, 'Contract')
      .mockImplementation(() => mockMulticall3Contract as any);
    // Mock ethers.Interface constructor for ERC20
    jest.spyOn(ethers, 'Interface').mockImplementation(
      () =>
        ({
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        }) as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Chain-specific configurations', () => {
    it('should use correct gas limits for Polygon', async () => {
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );

      // Mock the actual MulticallService import to test the constructor behavior
      const { MulticallService: ActualMulticallService } = jest.requireActual(
        '../../services/multicall.service'
      );
      const multicallService = new ActualMulticallService(
        polygonProvider,
        mockLogger
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MulticallService initialized',
        {
          multicall3Address: MULTICALL3_ADDRESS,
          chainId: 137,
          chain: 'polygon',
          network: 'mainnet',
          gasConfig: {
            blockGasLimit: '30000000', // Polygon block gas limit
            safetyMargin: 0.75,
            multicallOverhead: '35000',
          },
        }
      );
    });

    it('should use correct gas limits for Ethereum', async () => {
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(ethereumProvider, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MulticallService initialized',
        {
          multicall3Address: MULTICALL3_ADDRESS,
          chainId: 1,
          chain: 'ethereum',
          network: 'mainnet',
          gasConfig: {
            blockGasLimit: '30000000', // Ethereum block gas limit
            safetyMargin: 0.75,
            multicallOverhead: '35000',
          },
        }
      );
    });

    it('should use correct gas limits for BSC', async () => {
      const bscProvider = createMockChainProvider('bsc', 'mainnet', 56);
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(bscProvider, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MulticallService initialized',
        {
          multicall3Address: MULTICALL3_ADDRESS,
          chainId: 56,
          chain: 'bsc',
          network: 'mainnet',
          gasConfig: {
            blockGasLimit: '140000000', // BSC has much higher block gas limit
            safetyMargin: 0.75,
            multicallOverhead: '35000',
          },
        }
      );
    });

    it('should use correct gas limits for localhost', async () => {
      const localhostProvider = createMockChainProvider(
        'localhost',
        'localhost',
        31337
      );
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(localhostProvider, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MulticallService initialized',
        {
          multicall3Address: MULTICALL3_ADDRESS,
          chainId: 31337,
          chain: 'localhost',
          network: 'localhost',
          gasConfig: {
            blockGasLimit: '30000000', // Default for localhost
            safetyMargin: 0.75,
            multicallOverhead: '35000',
          },
        }
      );
    });
  });

  describe('Batch size optimization per chain', () => {
    it('should calculate optimal batch size for Ethereum', async () => {
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(ethereumProvider, mockLogger);

      const batchSize = multicallService.getOptimalBatchSize(50000n); // 50k gas per call estimate

      // Ethereum has 30M gas limit, so batch size should be reasonable
      expect(batchSize).toBeGreaterThan(0);
      expect(batchSize).toBeLessThanOrEqual(100); // Conservative for Ethereum
    });

    it('should calculate larger batch size for BSC', async () => {
      const bscProvider = createMockChainProvider('bsc', 'mainnet', 56);
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(bscProvider, mockLogger);

      const batchSize = multicallService.getOptimalBatchSize(50000n); // 50k gas per call estimate

      // BSC has 140M gas limit, so should hit the maximum batch size limit
      expect(batchSize).toBe(100); // Limited by the hard cap in getOptimalBatchSize
    });

    it('should split large batches appropriately for each chain', async () => {
      const transfers: BatchTransferRequest[] = Array(200)
        .fill(null)
        .map((_, i) => ({
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: `tx${i}`,
        }));

      // Test on Ethereum (smaller batches expected)
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const ethereumMulticall = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(ethereumProvider, mockLogger);

      // Mock different gas estimates for different batch sizes
      mockMulticall3Contract.aggregate3.estimateGas.mockImplementation(
        (calls: any[]) => {
          // Estimate 65000 gas per call + overhead
          return BigInt(35000 + calls.length * 65000);
        }
      );

      const ethereumResult =
        await ethereumMulticall.prepareBatchTransfer(transfers);

      // For large batches on Ethereum, it might split into groups
      if (ethereumResult.batchGroups) {
        expect(ethereumResult.batchGroups.length).toBeGreaterThan(0);
      }

      // Test on BSC (larger batches expected)
      const bscProvider = createMockChainProvider('bsc', 'mainnet', 56);
      const bscMulticall = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(bscProvider, mockLogger);

      const bscResult = await bscMulticall.prepareBatchTransfer(transfers);

      // BSC with higher gas limit might not need splitting
      if (bscResult.batchGroups && ethereumResult.batchGroups) {
        // If both have batch groups, BSC should have fewer
        expect(bscResult.batchGroups.length).toBeLessThanOrEqual(
          ethereumResult.batchGroups.length
        );
      } else if (ethereumResult.batchGroups && !bscResult.batchGroups) {
        // If Ethereum needs splitting but BSC doesn't, that's expected
        expect(bscResult.batchGroups).toBeUndefined();
      }

      // Both results should have calls
      expect(ethereumResult.calls).toBeDefined();
      expect(ethereumResult.calls.length).toBe(200);
      expect(bscResult.calls).toBeDefined();
      expect(bscResult.calls.length).toBe(200);
    });
  });

  describe('Multi-chain batch validation', () => {
    it('should validate transfers with chain-specific token addresses', async () => {
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(polygonProvider, mockLogger);

      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
          to: TEST_RECIPIENT,
          amount: '5000000', // 5 USDC (under 10000 limit)
          transactionId: 'tx1',
        },
        {
          tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Polygon
          to: TEST_RECIPIENT,
          amount: '3000000', // 3 USDT (under 10000 limit)
          transactionId: 'tx2',
        },
      ];

      const validation = await multicallService.validateBatch(
        transfers,
        '0xSenderAddress'
      );

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle different token decimals across chains', async () => {
      // USDC has 6 decimals on most chains
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(ethereumProvider, mockLogger);

      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
          to: TEST_RECIPIENT,
          amount: '1000000', // 1 USDC (6 decimals)
          transactionId: 'tx1',
        },
      ];

      const result = await multicallService.prepareBatchTransfer(transfers);

      expect(result.calls).toHaveLength(1);
      expect(result.calls[0].target).toBe(
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      );
    });
  });

  describe('Custom Multicall3 addresses', () => {
    it('should use custom Multicall3 address for localhost', async () => {
      const customMulticallAddress =
        '0x1234567890123456789012345678901234567890';
      const localhostProvider = createMockChainProvider(
        'localhost',
        'localhost',
        31337
      );
      localhostProvider.getMulticall3Address.mockReturnValue(
        customMulticallAddress
      );

      const multicallService = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(localhostProvider, mockLogger);

      expect(ethers.Contract).toHaveBeenCalledWith(
        customMulticallAddress,
        expect.any(Array),
        expect.any(Object)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MulticallService initialized',
        {
          multicall3Address: customMulticallAddress,
          chainId: 31337,
          chain: 'localhost',
          network: 'localhost',
          gasConfig: expect.any(Object),
        }
      );
    });

    it('should use universal Multicall3 address for standard chains', async () => {
      const chains = [
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
        { chain: 'polygon', network: 'mainnet', chainId: 137 },
        { chain: 'bsc', network: 'mainnet', chainId: 56 },
      ];

      for (const chainInfo of chains) {
        const provider = createMockChainProvider(
          chainInfo.chain,
          chainInfo.network,
          chainInfo.chainId
        );
        const multicallService = new (jest.requireActual(
          '../../services/multicall.service'
        ).MulticallService)(provider, mockLogger);

        expect(provider.getMulticall3Address).toHaveBeenCalled();
        expect(ethers.Contract).toHaveBeenCalledWith(
          MULTICALL3_ADDRESS,
          expect.any(Array),
          expect.any(Object)
        );
      }
    });
  });

  describe('Gas estimation across chains', () => {
    it('should estimate gas accurately for different chains', async () => {
      const transfers: BatchTransferRequest[] = [
        {
          tokenAddress: TEST_TOKEN_ADDRESS,
          to: TEST_RECIPIENT,
          amount: '1000000000000000000',
          transactionId: 'tx1',
        },
      ];

      // Test Polygon (standard gas prices)
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      const polygonMulticall = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(polygonProvider, mockLogger);

      mockMulticall3Contract.aggregate3.estimateGas.mockResolvedValueOnce(
        BigInt(100000)
      );

      const polygonResult =
        await polygonMulticall.prepareBatchTransfer(transfers);
      // Gas estimate includes 15% buffer
      expect(polygonResult.totalEstimatedGas.toString()).toBe('115000');

      // Test Ethereum (might need higher gas for same operation)
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const ethereumMulticall = new (jest.requireActual(
        '../../services/multicall.service'
      ).MulticallService)(ethereumProvider, mockLogger);

      mockMulticall3Contract.aggregate3.estimateGas.mockResolvedValueOnce(
        BigInt(120000)
      );

      const ethereumResult =
        await ethereumMulticall.prepareBatchTransfer(transfers);
      // Gas estimate includes 15% buffer
      expect(ethereumResult.totalEstimatedGas.toString()).toBe('138000');
    });
  });
});
