import { TransactionSigner } from '../../services/transaction-signer';
import { ChainProvider } from '@asset-withdrawal/shared';
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

describe('TransactionSigner', () => {
  let transactionSigner: TransactionSigner;
  let mockChainProvider: jest.Mocked<ChainProvider>;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockNonceCache: jest.Mocked<NonceCacheService>;
  let mockGasPriceCache: jest.Mocked<GasPriceCache>;
  let mockMulticallService: jest.Mocked<MulticallService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWallet: jest.Mocked<ethers.Wallet>;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockProviderInstance = {
      getTransactionCount: jest.fn().mockResolvedValue(10),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
      getFeeData: jest.fn().mockResolvedValue({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      }),
    };

    mockChainProvider = {
      getProvider: jest.fn().mockReturnValue(mockProviderInstance),
      getChainId: jest.fn().mockReturnValue(80002),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0xcA11bde05977b3631167028862bE2a173976CA11'),
      chain: 'polygon',
      network: 'testnet',
    } as any;

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

    mockWallet = {
      connect: jest.fn().mockReturnThis(),
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      signTransaction: jest.fn(),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
      provider: mockProviderInstance,
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
    (ethers.getAddress as jest.Mock) = jest.fn().mockImplementation(address => {
      // Simple checksum conversion for test
      if (
        address.toLowerCase() === '0x742d35cc6634c0532925a3b844bc9e7595f7faed'
      ) {
        return '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd';
      }
      return address;
    });

    // Mock parseUnits
    (ethers.parseUnits as jest.Mock) = jest
      .fn()
      .mockImplementation((value, unit) => {
        if (unit === 'gwei') {
          return BigInt(value) * BigInt(1000000000);
        }
        return BigInt(value);
      });

    mockConfig = {
      batchProcessing: {},
    };

    transactionSigner = new TransactionSigner(
      mockChainProvider,
      mockSecretsManager,
      mockNonceCache,
      mockGasPriceCache,
      mockMulticallService,
      mockLogger,
      mockConfig
    );
  });

  describe('initialize', () => {
    it('should initialize wallet and nonce cache', async () => {
      await transactionSigner.initialize();

      expect(ethers.Wallet).toHaveBeenCalled();
      expect(mockNonceCache.connect).toHaveBeenCalled();
      expect(mockNonceCache.initialize).toHaveBeenCalledWith(
        '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        10,
        'polygon',
        'testnet'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.objectContaining({
          address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
          chainId: 80002,
          chain: 'polygon',
          network: 'testnet',
          initialNonce: 10,
        })
      );
    });
  });

  describe('signTransaction', () => {
    beforeEach(async () => {
      await transactionSigner.initialize();
    });

    it('should sign ERC20 transfer transaction', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000', // 1 USDT (6 decimals)
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      const signedTx = '0xf86c0a85...'; // Mock signed transaction
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toEqual({
        transactionType: 'SINGLE',
        requestId: 'test-tx-123',
        hash: '0xabc123def456789',
        rawTransaction: signedTx,
        nonce: 10,
        gasLimit: '120000', // 100000 * 1.2
        maxFeePerGas: '33000000000', // 30000000000 * 1.1
        maxPriorityFeePerGas: '1650000000', // 1500000000 * 1.1
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Token address for ERC-20 transfer
        value: '0', // ERC-20 transfers have value 0
        data: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7faed00000000000000000000000000000000000000000000000000000000000f4240',
        chainId: 80002,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signed successfully',
        expect.objectContaining({
          transactionId: 'test-tx-123',
          hash: '0xabc123def456789',
          nonce: 10,
        })
      );
    });

    it('should sign native MATIC transfer transaction', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000000000000000', // 1 MATIC
        transactionId: 'test-tx-456',
      };

      const signedTx = '0xf86c0a85...'; // Mock signed transaction
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      expect(result).toEqual({
        transactionType: 'SINGLE',
        requestId: 'test-tx-456',
        hash: '0xabc123def456789',
        rawTransaction: signedTx,
        nonce: 10,
        gasLimit: '120000', // 100000 * 1.2
        maxFeePerGas: '33000000000', // 30000000000 * 1.1
        maxPriorityFeePerGas: '1650000000', // 1500000000 * 1.1
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // Recipient address for native transfer
        value: '1000000000000000000', // Native transfer has the amount as value
        data: undefined, // No data for native transfers
        chainId: 80002,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signed successfully',
        expect.objectContaining({
          transactionId: 'test-tx-456',
          hash: '0xabc123def456789',
          nonce: 10,
        })
      );
    });

    it('should handle gas estimation failure', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      mockWallet.estimateGas.mockRejectedValue(
        new Error('Gas estimation failed')
      );

      await expect(
        transactionSigner.signTransaction(transactionData)
      ).rejects.toThrow('Gas estimation failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sign transaction',
        expect.any(Error),
        { transactionId: 'test-tx-123' }
      );
    });

    it('should handle insufficient funds error', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      mockWallet.estimateGas.mockRejectedValue(new Error('insufficient funds'));

      await expect(
        transactionSigner.signTransaction(transactionData)
      ).rejects.toThrow('insufficient funds');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sign transaction',
        expect.any(Error),
        { transactionId: 'test-tx-123' }
      );
    });

    it('should handle checksum address validation', async () => {
      const transactionData = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f7faed', // Lowercase address
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      // Update mock to return checksum address
      const mockContract = {
        interface: {
          encodeFunctionData: jest
            .fn()
            .mockReturnValue(
              '0xa9059cbb000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f7fAEd00000000000000000000000000000000000000000000000000000000000f4240'
            ),
        },
      };
      (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

      const result = await transactionSigner.signTransaction(transactionData);

      // Should convert to checksum address - verify the mock was called with checksummed address
      expect(mockContract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'transfer',
        [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // Checksummed address
          '1000000',
        ]
      );

      // Verify the result contains all required fields
      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-tx-123',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        chainId: 80002,
      });
    });

    it('should throw Redis connection error for retry', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      const redisError = new Error('Redis connection failed');
      mockNonceCache.getAndIncrement.mockRejectedValue(redisError);

      await expect(
        transactionSigner.signTransaction(transactionData)
      ).rejects.toThrow('Redis connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis connection error - will retry',
        { transactionId: 'test-tx-123' }
      );
    });

    it('should fetch gas price when cache is empty', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      // Mock empty gas price cache
      mockGasPriceCache.get.mockReturnValue(null);

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signTransaction(transactionData);

      // Verify gas price was fetched from provider
      expect(mockChainProvider.getProvider().getFeeData).toHaveBeenCalled();

      // Verify cache was updated
      expect(mockGasPriceCache.set).toHaveBeenCalledWith({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Gas price cache expired, fetching fresh values'
      );
      expect(result.maxFeePerGas).toBe(
        ((BigInt(30000000000) * 110n) / 100n).toString()
      );
      expect(result.maxPriorityFeePerGas).toBe(
        ((BigInt(1500000000) * 110n) / 100n).toString()
      );

      // Verify the result contains all required fields
      expect(result).toMatchObject({
        transactionType: 'SINGLE',
        requestId: 'test-tx-123',
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        chainId: 80002,
      });
    });

    it('should throw error when RPC fails to fetch gas price', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      // Mock empty gas price cache
      mockGasPriceCache.get.mockReturnValue(null);

      // Mock RPC failure
      mockChainProvider.getProvider().getFeeData.mockResolvedValue({
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
      });

      await expect(
        transactionSigner.signTransaction(transactionData)
      ).rejects.toThrow('Failed to fetch gas price from provider');
    });
  });

  describe('signBatchTransaction', () => {
    beforeEach(async () => {
      await transactionSigner.initialize();
    });

    it('should sign batch transaction successfully', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
            amount: '2000000',
            transactionId: 'tx2',
          },
        ],
        batchId: 'batch-123',
      };

      const signedTx = '0xf86c0a85...'; // Mock signed transaction
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signBatchTransaction(batchRequest);

      expect(mockMulticallService.validateBatch).toHaveBeenCalledWith(
        batchRequest.transfers,
        '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
      );
      expect(mockMulticallService.prepareBatchTransfer).toHaveBeenCalledWith(
        batchRequest.transfers,
        '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        false
      );
      expect(mockMulticallService.encodeBatchTransaction).toHaveBeenCalledWith(
        []
      );

      expect(result).toEqual({
        transactionType: 'BATCH',
        requestId: 'batch-123',
        batchId: 'batch-123',
        hash: '0xabc123def456789',
        rawTransaction: signedTx,
        nonce: 10,
        gasLimit: '200000',
        maxFeePerGas: '33000000000', // 30000000000 * 1.1
        maxPriorityFeePerGas: '1650000000', // 1500000000 * 1.1
        from: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        to: '0xcA11bde05977b3631167028862bE2a173976CA11', // Multicall3 address
        value: '0',
        data: '0xbatchencoded',
        chainId: 80002,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Batch transaction signed successfully',
        expect.objectContaining({
          batchId: 'batch-123',
          hash: '0xabc123def456789',
          nonce: 10,
          transferCount: 2,
          totalGas: '200000',
        })
      );
    });

    it('should handle batch validation failure', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: 'invalid-address',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-invalid',
      };

      mockMulticallService.validateBatch.mockResolvedValueOnce({
        valid: false,
        errors: ['Invalid token address'],
      });

      await expect(
        transactionSigner.signBatchTransaction(batchRequest)
      ).rejects.toThrow('Batch validation failed: Invalid token address');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sign batch transaction',
        expect.any(Error),
        { batchId: 'batch-invalid' }
      );
    });

    it('should handle gas estimation failure for batch', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-gas-fail',
      };

      mockMulticallService.prepareBatchTransfer.mockRejectedValueOnce(
        new Error('Gas estimation failed')
      );

      await expect(
        transactionSigner.signBatchTransaction(batchRequest)
      ).rejects.toThrow('Gas estimation failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to sign batch transaction',
        expect.any(Error),
        { batchId: 'batch-gas-fail' }
      );
    });

    it('should fetch gas price when cache is empty for batch', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-no-cache',
      };

      // Mock empty gas price cache
      mockGasPriceCache.get.mockReturnValueOnce(null);

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signBatchTransaction(batchRequest);

      // Verify gas price was fetched from provider
      expect(mockChainProvider.getProvider().getFeeData).toHaveBeenCalled();

      // Verify cache was updated
      expect(mockGasPriceCache.set).toHaveBeenCalledWith({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(1500000000),
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Gas price cache expired, fetching fresh values for batch'
      );
      expect(result.maxFeePerGas).toBe('33000000000');
      expect(result.maxPriorityFeePerGas).toBe('1650000000');
    });

    it('should handle Redis connection error for batch retry', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-redis-fail',
      };

      const redisError = new Error('Redis connection failed');
      mockNonceCache.getAndIncrement.mockRejectedValueOnce(redisError);

      await expect(
        transactionSigner.signBatchTransaction(batchRequest)
      ).rejects.toThrow('Redis connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis connection error - will retry',
        { batchId: 'batch-redis-fail' }
      );
    });

    it('should handle large batch with multiple tokens', async () => {
      const transfers = [];
      for (let i = 0; i < 50; i++) {
        transfers.push({
          tokenAddress:
            i % 2 === 0
              ? '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
              : '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          amount: String(1000000 * (i + 1)),
          transactionId: `tx${i}`,
        });
      }

      const batchRequest = {
        transfers,
        batchId: 'batch-large',
      };

      mockMulticallService.prepareBatchTransfer.mockResolvedValueOnce({
        calls: Array(50).fill({
          target: '0xtoken',
          allowFailure: false,
          callData: '0x',
        }),
        estimatedGasPerCall: BigInt(65000),
        totalEstimatedGas: BigInt(3500000), // Higher gas for large batch
      });

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const result = await transactionSigner.signBatchTransaction(batchRequest);

      expect(result).toMatchObject({
        transactionType: 'BATCH',
        batchId: 'batch-large',
        gasLimit: '3500000',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Batch transaction signed successfully',
        expect.objectContaining({
          batchId: 'batch-large',
          transferCount: 50,
          totalGas: '3500000',
        })
      );
    });

    it('should handle gas price fetch failure for batch', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-no-gas-price',
      };

      // Mock empty gas price cache to trigger provider call
      mockGasPriceCache.get.mockReturnValueOnce(null);

      // Mock RPC failure to fetch gas price
      mockChainProvider.getProvider().getFeeData.mockResolvedValueOnce({
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
      });

      await expect(
        transactionSigner.signBatchTransaction(batchRequest)
      ).rejects.toThrow('Failed to fetch gas price from provider');
    });
  });

  describe('signBatchTransactionWithSplitting', () => {
    beforeEach(async () => {
      await transactionSigner.initialize();
    });

    it('should sign single batch when no splitting is needed', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-single',
      };

      const signedTx = '0xf86c0a85...';
      mockWallet.signTransaction.mockResolvedValue(signedTx);

      const results =
        await transactionSigner.signBatchTransactionWithSplitting(batchRequest);

      expect(results).toHaveLength(1);
      expect(results[0].batchId).toBe('batch-single');
      expect(mockMulticallService.prepareBatchTransfer).toHaveBeenCalledWith(
        batchRequest.transfers,
        '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        false
      );
    });

    it('should split and sign multiple batches when required', async () => {
      const transfers = Array(100)
        .fill(null)
        .map((_, i) => ({
          tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          amount: '1000000',
          transactionId: `tx${i}`,
        }));

      const batchRequest = {
        transfers,
        batchId: 'batch-split',
      };

      // Mock batch groups from MulticallService
      mockMulticallService.prepareBatchTransfer.mockResolvedValueOnce({
        calls: [],
        estimatedGasPerCall: BigInt(65000),
        totalEstimatedGas: BigInt(7000000),
        batchGroups: [
          {
            calls: Array(50).fill({
              target: '0xtoken',
              allowFailure: false,
              callData: '0x',
            }),
            transfers: transfers.slice(0, 50),
            estimatedGas: BigInt(3500000),
            tokenGroups: new Map([
              ['0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 50],
            ]),
          },
          {
            calls: Array(50).fill({
              target: '0xtoken',
              allowFailure: false,
              callData: '0x',
            }),
            transfers: transfers.slice(50, 100),
            estimatedGas: BigInt(3500000),
            tokenGroups: new Map([
              ['0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 50],
            ]),
          },
        ],
      });

      // Mock different nonces for each batch
      mockNonceCache.getAndIncrement
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(11);

      const signedTx1 = '0xf86c0a85...1';
      const signedTx2 = '0xf86c0a85...2';
      mockWallet.signTransaction
        .mockResolvedValueOnce(signedTx1)
        .mockResolvedValueOnce(signedTx2);

      // Mock different hashes for each transaction
      (ethers.Transaction.from as jest.Mock)
        .mockImplementationOnce(() => ({ hash: '0xhash1' }))
        .mockImplementationOnce(() => ({ hash: '0xhash2' }));

      const results =
        await transactionSigner.signBatchTransactionWithSplitting(batchRequest);

      expect(results).toHaveLength(2);
      expect(results[0].batchId).toBe('batch-split');
      expect(results[1].batchId).toBe('batch-split');
      expect(results[0].hash).toBe('0xhash1');
      expect(results[1].hash).toBe('0xhash2');
      expect(results[0].nonce).toBe(10);
      expect(results[1].nonce).toBe(11);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Batch requires splitting into multiple transactions',
        expect.objectContaining({
          batchId: 'batch-split',
          groupCount: 2,
          transferCount: 100,
        })
      );
    });

    it('should handle validation failure', async () => {
      const batchRequest = {
        transfers: [
          {
            tokenAddress: 'invalid-address',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            amount: '1000000',
            transactionId: 'tx1',
          },
        ],
        batchId: 'batch-invalid',
      };

      mockMulticallService.validateBatch.mockResolvedValueOnce({
        valid: false,
        errors: ['Invalid token address'],
      });

      await expect(
        transactionSigner.signBatchTransactionWithSplitting(batchRequest)
      ).rejects.toThrow('Batch validation failed: Invalid token address');
    });

    it('should handle gas price fetch error during batch splitting', async () => {
      const transfers = Array(100)
        .fill(null)
        .map((_, i) => ({
          tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
          amount: '1000000',
          transactionId: `tx${i}`,
        }));

      const batchRequest = {
        transfers,
        batchId: 'batch-gas-error',
      };

      // Mock batch groups
      mockMulticallService.prepareBatchTransfer.mockResolvedValueOnce({
        calls: [],
        estimatedGasPerCall: BigInt(65000),
        totalEstimatedGas: BigInt(7000000),
        batchGroups: [
          {
            calls: Array(50).fill({
              target: '0xtoken',
              allowFailure: false,
              callData: '0x',
            }),
            transfers: transfers.slice(0, 50),
            estimatedGas: BigInt(3500000),
            tokenGroups: new Map(),
          },
          {
            calls: Array(50).fill({
              target: '0xtoken',
              allowFailure: false,
              callData: '0x',
            }),
            transfers: transfers.slice(50, 100),
            estimatedGas: BigInt(3500000),
            tokenGroups: new Map(),
          },
        ],
      });

      // Mock empty gas price cache
      mockGasPriceCache.get.mockReturnValue(null);

      // Mock RPC failure
      mockChainProvider.getProvider().getFeeData.mockResolvedValueOnce({
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
      });

      await expect(
        transactionSigner.signBatchTransactionWithSplitting(batchRequest)
      ).rejects.toThrow('Failed to fetch gas price from provider');
    });
  });

  describe('cleanup', () => {
    it('should complete cleanup and disconnect Redis', async () => {
      await transactionSigner.initialize();
      await transactionSigner.cleanup();

      expect(mockNonceCache.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.anything()
      );
    });
  });
});
