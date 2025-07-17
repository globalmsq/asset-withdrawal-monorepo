import { TransactionSigner } from '../../services/transaction-signer';
import { ChainProvider } from '@asset-withdrawal/shared';
import { SecureSecretsManager } from '../../services/secrets-manager';
import { Logger } from '../../utils/logger';
import { ethers } from 'ethers';

jest.mock('ethers');
jest.mock('../../services/nonce-manager');

describe('TransactionSigner', () => {
  let transactionSigner: TransactionSigner;
  let mockChainProvider: jest.Mocked<ChainProvider>;
  let mockSecretsManager: jest.Mocked<SecureSecretsManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWallet: jest.Mocked<ethers.Wallet>;
  let mockNonceManager: any;

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
      chain: 'polygon',
      network: 'testnet',
    } as any;

    mockSecretsManager = {
      getPrivateKey: jest.fn().mockReturnValue('0x0000000000000000000000000000000000000000000000000000000000000001'),
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

    mockNonceManager = {
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      getNonce: jest.fn().mockResolvedValue(10),
      getNextNonce: jest.fn().mockResolvedValue(10),
      incrementNonce: jest.fn(),
      reset: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      markNoncePending: jest.fn(),
      provider: mockProviderInstance,
    };

    (ethers.Wallet as jest.Mock).mockImplementation(() => mockWallet);

    // Mock NonceManager from our module
    const NonceManager = require('../../services/nonce-manager').NonceManager;
    NonceManager.mockImplementation(() => mockNonceManager);

    // Mock Contract for ERC20
    const mockContract = {
      interface: {
        encodeFunctionData: jest.fn().mockReturnValue('0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7faed00000000000000000000000000000000000000000000000000000000000f4240'),
      },
    };
    (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

    // Mock parseTransaction
    (ethers.Transaction.from as jest.Mock) = jest.fn().mockImplementation((tx) => ({
      hash: '0xabc123def456789',
      ...tx,
    }));

    // Mock getAddress for checksum validation
    (ethers.getAddress as jest.Mock) = jest.fn().mockImplementation((address) => {
      // Simple checksum conversion for test
      if (address.toLowerCase() === '0x742d35cc6634c0532925a3b844bc9e7595f7faed') {
        return '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd';
      }
      return address;
    });

    transactionSigner = new TransactionSigner(mockChainProvider, mockSecretsManager, mockLogger);
  });

  describe('initialize', () => {
    it('should initialize wallet and nonce manager', async () => {
      await transactionSigner.initialize();

      expect(ethers.Wallet).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.objectContaining({
          address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
          chainId: 80002,
          chain: 'polygon',
          network: 'testnet',
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
        transactionId: 'test-tx-123',
        hash: '0xabc123def456789',
        rawTransaction: signedTx,
        nonce: 10,
        gasLimit: '120000', // 100000 * 1.2
        maxFeePerGas: '33000000000', // 30000000000 * 1.1
        maxPriorityFeePerGas: '1650000000', // 1500000000 * 1.1
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

    it('should handle gas estimation failure', async () => {
      const transactionData = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        amount: '1000000',
        tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        transactionId: 'test-tx-123',
      };

      mockWallet.estimateGas.mockRejectedValue(new Error('Gas estimation failed'));

      await expect(transactionSigner.signTransaction(transactionData))
        .rejects.toThrow('Gas estimation failed');

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

      await expect(transactionSigner.signTransaction(transactionData))
        .rejects.toThrow('insufficient funds');

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
          encodeFunctionData: jest.fn().mockReturnValue('0xa9059cbb000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f7fAEd00000000000000000000000000000000000000000000000000000000000f4240'),
        },
      };
      (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

      const result = await transactionSigner.signTransaction(transactionData);

      // Should convert to checksum address - verify the mock was called with checksummed address
      expect(mockContract.interface.encodeFunctionData).toHaveBeenCalledWith('transfer', [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // Checksummed address
        '1000000',
      ]);
    });
  });

  describe('cleanup', () => {
    it('should complete cleanup', async () => {
      await transactionSigner.initialize();
      await transactionSigner.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signer initialized',
        expect.anything()
      );
    });
  });
});
