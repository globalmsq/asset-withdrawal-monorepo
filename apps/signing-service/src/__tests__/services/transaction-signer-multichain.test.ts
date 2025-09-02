import { TransactionSigner } from '../../services/transaction-signer';
import { ChainProvider, ChainProviderFactory } from '@asset-withdrawal/shared';
import { SecureSecretsManager } from '../../services/secrets-manager';
import { NonceCacheService } from '../../services/nonce-cache.service';
import { GasPriceCache } from '../../services/gas-price-cache';
import { MulticallService } from '../../services/multicall.service';
import { Logger } from '../../utils/logger';
import { ethers } from 'ethers';

jest.mock('ethers');
jest.mock('../../services/nonce-cache.service');
jest.mock('../../services/gas-price-cache');
jest.mock('../../services/multicall.service');

describe('TransactionSigner - Multi-chain Support', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockNonceCache: jest.Mocked<NonceCacheService>;
  let mockGasPriceCache: jest.Mocked<GasPriceCache>;
  let mockMulticallService: jest.Mocked<MulticallService>;
  let mockWallet: jest.Mocked<ethers.Wallet>;
  let mockConfig: any;

  const createMockChainProvider = (
    chain: string,
    network: string,
    chainId: number
  ) => {
    const mockProviderInstance = {
      getTransactionCount: jest.fn().mockResolvedValue(10),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
      getFeeData: jest.fn().mockResolvedValue({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      }),
      send: jest.fn().mockResolvedValue(`0x${chainId.toString(16)}`), // chainId in hex
    };

    return {
      getProvider: jest.fn().mockReturnValue(mockProviderInstance),
      getChainId: jest.fn().mockReturnValue(chainId),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0xcA11bde05977b3631167028862bE2a173976CA11'),
      chain,
      network,
    } as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSecretsManager = {
      getPrivateKey: jest
        .fn()
        .mockReturnValue(
          '0x0000000000000000000000000000000000000000000000000000000000000001'
        ),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      auditSuccess: jest.fn(),
      auditFailure: jest.fn(),
    } as any;

    mockConfig = {
      batchProcessing: {},
    };

    mockWallet = {
      connect: jest.fn().mockReturnThis(),
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      signTransaction: jest.fn(),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
    } as any;

    mockNonceCache = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      getAndIncrement: jest.fn().mockResolvedValue(10),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(10),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockGasPriceCache = {
      get: jest.fn().mockReturnValue({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      }),
      set: jest.fn(),
      isValid: jest.fn().mockReturnValue(true),
      clear: jest.fn(),
    } as any;

    mockMulticallService = {
      validateBatch: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      prepareBatchTransfer: jest.fn().mockResolvedValue({
        calls: [],
        estimatedGasPerCall: BigInt(65000),
        totalEstimatedGas: BigInt(200000),
      }),
      encodeBatchTransaction: jest.fn().mockReturnValue('0xbatchencoded'),
      decodeBatchResult: jest.fn(),
      getOptimalBatchSize: jest.fn().mockReturnValue(50),
      checkAndPrepareAllowances: jest
        .fn()
        .mockResolvedValue({ needsApproval: [] }),
    } as any;

    (ethers.Wallet as jest.Mock).mockImplementation(() => mockWallet);
    (NonceCacheService as jest.Mock).mockImplementation(() => mockNonceCache);
    (GasPriceCache as jest.Mock).mockImplementation(() => mockGasPriceCache);
    (MulticallService as jest.Mock).mockImplementation(
      () => mockMulticallService
    );

    // Mock Contract for ERC20
    const mockContract = {
      interface: {
        encodeFunctionData: jest
          .fn()
          .mockReturnValue(
            '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7faed00000000000000000000000000000000000000000000000000000000000f4240'
          ),
      },
    };
    (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

    // Mock parseTransaction
    (ethers.Transaction.from as jest.Mock) = jest
      .fn()
      .mockImplementation(tx => ({
        hash: '0xabc123def456789',
        ...tx,
      }));

    // Mock getAddress for checksum validation
    (ethers.getAddress as jest.Mock) = jest
      .fn()
      .mockImplementation(address => address);

    // Mock parseUnits
    (ethers.parseUnits as jest.Mock) = jest
      .fn()
      .mockImplementation((value, unit) => {
        if (unit === 'gwei') {
          return BigInt(value) * BigInt(1000000000);
        }
        return BigInt(value);
      });
  });

  describe('Multi-chain transaction signing', () => {
    it('should sign transaction on Polygon mainnet', async () => {
      const mockChainProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      const transactionSigner = new TransactionSigner(
        mockChainProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await transactionSigner.initialize();

      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000', // 1 MATIC
        transactionId: 'test-polygon-mainnet',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-polygon-mainnet',
        chainId: 137,
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.objectContaining({
          chain: 'polygon',
          network: 'mainnet',
          chainId: 137,
        })
      );
    });

    it('should sign transaction on Ethereum mainnet', async () => {
      const mockChainProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const transactionSigner = new TransactionSigner(
        mockChainProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await transactionSigner.initialize();

      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000', // 1 ETH
        transactionId: 'test-ethereum-mainnet',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-ethereum-mainnet',
        chainId: 1,
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.objectContaining({
          chain: 'ethereum',
          network: 'mainnet',
          chainId: 1,
        })
      );
    });

    it('should sign transaction on BSC mainnet', async () => {
      const mockChainProvider = createMockChainProvider('bsc', 'mainnet', 56);
      const transactionSigner = new TransactionSigner(
        mockChainProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await transactionSigner.initialize();

      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000', // 1 BNB
        transactionId: 'test-bsc-mainnet',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-bsc-mainnet',
        chainId: 56,
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      });
    });

    it('should sign transaction on localhost network', async () => {
      const mockChainProvider = createMockChainProvider(
        'localhost',
        'localhost',
        31337
      );
      const transactionSigner = new TransactionSigner(
        mockChainProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await transactionSigner.initialize();

      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000', // 1 ETH
        transactionId: 'test-localhost',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-localhost',
        chainId: 31337,
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.objectContaining({
          chain: 'localhost',
          network: 'localhost',
          chainId: 31337,
        })
      );
    });

    it('should handle different gas prices for different chains', async () => {
      // Ethereum typically has higher gas prices
      const ethereumProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      ethereumProvider.getProvider().getFeeData.mockResolvedValue({
        maxFeePerGas: BigInt(50000000000), // 50 gwei
        maxPriorityFeePerGas: BigInt(2000000000), // 2 gwei
      });

      // Polygon typically has lower gas prices
      const polygonProvider = createMockChainProvider(
        'polygon',
        'mainnet',
        137
      );
      polygonProvider.getProvider().getFeeData.mockResolvedValue({
        maxFeePerGas: BigInt(30000000000), // 30 gwei
        maxPriorityFeePerGas: BigInt(1500000000), // 1.5 gwei
      });

      // Test Ethereum transaction
      const ethereumSigner = new TransactionSigner(
        ethereumProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await ethereumSigner.initialize();

      // Clear gas price cache to force fresh fetch
      mockGasPriceCache.get.mockReturnValueOnce(null);

      const ethereumTx = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000',
        transactionId: 'test-eth-gas',
      };

      mockWallet.signTransaction.mockResolvedValue('0xeth...');
      const ethResult = await ethereumSigner.signTransaction(ethereumTx);

      expect(ethResult.maxFeePerGas).toBe('55000000000'); // 50 gwei * 1.1
      expect(ethResult.maxPriorityFeePerGas).toBe('2200000000'); // 2 gwei * 1.1

      // Test Polygon transaction
      const polygonSigner = new TransactionSigner(
        polygonProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await polygonSigner.initialize();

      // Clear gas price cache to force fresh fetch
      mockGasPriceCache.get.mockReturnValueOnce(null);

      const polygonTx = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000',
        transactionId: 'test-polygon-gas',
      };

      mockWallet.signTransaction.mockResolvedValue('0xpoly...');
      const polyResult = await polygonSigner.signTransaction(polygonTx);

      expect(polyResult.maxFeePerGas).toBe('33000000000'); // 30 gwei * 1.1
      expect(polyResult.maxPriorityFeePerGas).toBe('1650000000'); // 1.5 gwei * 1.1
    });

    it('should sign ERC20 token transfers on different chains', async () => {
      const chains = [
        {
          chain: 'ethereum',
          network: 'mainnet',
          chainId: 1,
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        }, // USDC
        {
          chain: 'polygon',
          network: 'mainnet',
          chainId: 137,
          tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        }, // USDC
        {
          chain: 'bsc',
          network: 'mainnet',
          chainId: 56,
          tokenAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        }, // USDC
      ];

      for (const chainInfo of chains) {
        const mockChainProvider = createMockChainProvider(
          chainInfo.chain,
          chainInfo.network,
          chainInfo.chainId
        );
        const transactionSigner = new TransactionSigner(
          mockChainProvider,
          mockSecretsManager,
          mockNonceCache,
          mockGasPriceCache,
          mockMulticallService,
          mockLogger,
          mockConfig
        );

        await transactionSigner.initialize();

        const transactionData = {
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          amount: '1000000', // 1 USDC (6 decimals)
          tokenAddress: chainInfo.tokenAddress,
          transactionId: `test-${chainInfo.chain}-erc20`,
        };

        const signedTx = `0x${chainInfo.chain}...`;
        mockWallet.signTransaction.mockResolvedValue(signedTx);

        const result = await transactionSigner.signTransaction(transactionData);

        expect(result).toMatchObject({
          transactionType: 'SINGLE',
          requestId: `test-${chainInfo.chain}-erc20`,
          chainId: chainInfo.chainId,
          to: chainInfo.tokenAddress, // ERC20 transactions go to token contract
          value: '0', // ERC20 transfers have 0 native value
        });
      }
    });

    it('should sign batch transactions on different chains', async () => {
      const mockChainProvider = createMockChainProvider(
        'ethereum',
        'mainnet',
        1
      );
      const transactionSigner = new TransactionSigner(
        mockChainProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger,
        mockConfig
      );

      await transactionSigner.initialize();

      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
          {
            tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
            to: '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
            amount: '2000000',
            transactionId: 'tx2',
          },
        ],
        batchId: 'batch-ethereum',
      };

      const signedTx = '0xbatch...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signBatchTransaction(batchRequest);

      expect(result).toMatchObject({
        transactionType: 'BATCH',
        batchId: 'batch-ethereum',
        chainId: 1,
        to: '0xcA11bde05977b3631167028862bE2a173976CA11', // Multicall3 address
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Batch transaction signed successfully',
        expect.objectContaining({
          batchId: 'batch-ethereum',
          transferCount: 2,
        })
      );
    });
  });

  describe('Chain-specific validations', () => {
    it('should handle chain-specific gas limits', async () => {
      // BSC has higher block gas limit
      const bscProvider = createMockChainProvider('bsc', 'mainnet', 56);
      const bscSigner = new TransactionSigner(
        bscProvider,
        mockSecretsManager,
        mockNonceCache,
        mockGasPriceCache,
        mockMulticallService,
        mockLogger
      );

      await bscSigner.initialize();

      // Prepare a large batch that would exceed Ethereum's gas limit
      const transfers = Array(100)
        .fill(null)
        .map((_, i) => ({
          tokenAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          amount: '1000000',
          transactionId: `tx${i}`,
        }));

      const batchRequest = {
        transfers,
        batchId: 'batch-bsc-large',
      };

      // BSC can handle larger batches
      mockMulticallService.prepareBatchTransfer.mockResolvedValueOnce({
        calls: Array(100).fill({
          target: '0xtoken',
          allowFailure: false,
          callData: '0x',
        }),
        estimatedGasPerCall: BigInt(65000),
        totalEstimatedGas: BigInt(7000000), // Large gas usage
      });

      const signedTx = '0xbsc-batch...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await bscSigner.signBatchTransaction(batchRequest);

      expect(result).toMatchObject({
        transactionType: 'BATCH',
        batchId: 'batch-bsc-large',
        chainId: 56,
        gasLimit: '7000000', // BSC can handle this
      });
    });

    it('should use correct multicall address for each chain', async () => {
      const chains = [
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
        { chain: 'polygon', network: 'mainnet', chainId: 137 },
        { chain: 'bsc', network: 'mainnet', chainId: 56 },
        { chain: 'localhost', network: 'localhost', chainId: 31337 },
      ];

      for (const chainInfo of chains) {
        const mockChainProvider = createMockChainProvider(
          chainInfo.chain,
          chainInfo.network,
          chainInfo.chainId
        );

        // Some chains might have custom multicall addresses
        if (chainInfo.chain === 'localhost') {
          mockChainProvider.getMulticall3Address.mockReturnValue(
            '0x1234567890123456789012345678901234567890'
          );
        }

        const transactionSigner = new TransactionSigner(
          mockChainProvider,
          mockSecretsManager,
          mockNonceCache,
          mockGasPriceCache,
          mockMulticallService,
          mockLogger,
          mockConfig
        );

        await transactionSigner.initialize();

        const batchRequest = {
          transfers: [
            {
              tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
              amount: '1000000',
              transactionId: 'tx1',
            },
          ],
          batchId: `batch-${chainInfo.chain}`,
        };

        const signedTx = '0xbatch...';
        mockWallet.signTransaction.mockResolvedValue(signedTx);

        const result =
          await transactionSigner.signBatchTransaction(batchRequest);

        expect(mockChainProvider.getMulticall3Address).toHaveBeenCalled();
        expect(result.to).toBe(mockChainProvider.getMulticall3Address());
      }
    });
  });
});
