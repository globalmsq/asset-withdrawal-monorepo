import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
import { SignedTransaction } from '../types';
import { SecureSecretsManager } from './secrets-manager';
import { NonceCacheService } from './nonce-cache.service';
import { GasPriceCache } from './gas-price-cache';
import { Logger } from '../utils/logger';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

export interface SigningRequest {
  to: string;
  amount: string;
  tokenAddress?: string;
  transactionId: string;
}

export class TransactionSigner {
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.Provider | null = null;

  constructor(
    private chainProvider: ChainProvider,
    private secretsManager: SecureSecretsManager,
    private nonceCache: NonceCacheService,
    private gasPriceCache: GasPriceCache,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    try {
      // Get private key from secrets manager
      const privateKey = this.secretsManager.getPrivateKey();

      // Get provider and store it
      this.provider = this.chainProvider.getProvider();

      // Create wallet instance
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      // Connect to Redis
      await this.nonceCache.connect();

      // Initialize nonce with network value
      const networkNonce = await this.provider.getTransactionCount(
        this.wallet.address
      );
      await this.nonceCache.initialize(this.wallet.address, networkNonce);

      this.logger.info('Transaction signer initialized', {
        address: this.wallet.address,
        chainId: this.chainProvider.getChainId(),
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
        initialNonce: networkNonce,
      });
    } catch (error) {
      this.logger.error('Failed to initialize transaction signer', error);
      throw error;
    }
  }

  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  async signTransaction(request: SigningRequest): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { to, amount, tokenAddress, transactionId } = request;

    try {
      // Get nonce from Redis (atomic increment)
      const nonce = await this.nonceCache.getAndIncrement(this.wallet.address);

      this.logger.debug('Using nonce for transaction', {
        address: this.wallet.address,
        nonce,
        transactionId,
      });

      // Build transaction
      let transaction: ethers.TransactionRequest;

      if (tokenAddress) {
        // ERC-20 token transfer
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          this.wallet
        );
        // Normalize address with error handling
        let normalizedTo: string;
        try {
          // Trim any whitespace and convert to lowercase first
          const cleanedTo = to.trim().toLowerCase();
          normalizedTo = ethers.getAddress(cleanedTo);
        } catch (error) {
          this.logger.error('Failed to normalize address', {
            to,
            toLength: to.length,
            toHex: Buffer.from(to).toString('hex'),
            error: error instanceof Error ? error.message : String(error),
          });
          // Fallback: use the address as-is if it's a valid format
          if (to.match(/^0x[a-fA-F0-9]{40}$/)) {
            this.logger.warn('Using address without checksum validation', {
              to,
            });
            normalizedTo = to;
          } else {
            throw error;
          }
        }

        const data = tokenContract.interface.encodeFunctionData('transfer', [
          normalizedTo,
          amount,
        ]);

        transaction = {
          to: tokenAddress,
          data,
          nonce,
          chainId: this.chainProvider.getChainId(),
        };
      } else {
        // Native MATIC transfer
        transaction = {
          to,
          value: amount,
          nonce,
          chainId: this.chainProvider.getChainId(),
        };
      }

      // Estimate gas
      const gasEstimate = await this.wallet.estimateGas(transaction);
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Get gas price from cache or fetch new one
      let cachedGasPrice = this.gasPriceCache.get();
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (cachedGasPrice) {
        // Use cached values
        maxFeePerGas = cachedGasPrice.maxFeePerGas;
        maxPriorityFeePerGas = cachedGasPrice.maxPriorityFeePerGas;

        this.logger.debug('Using cached gas price', {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      } else {
        // Cache expired, fetch fresh gas price
        this.logger.debug('Gas price cache expired, fetching fresh values');

        if (!this.provider) {
          throw new Error('Provider not initialized');
        }

        const feeData = await this.provider.getFeeData();

        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
          throw new Error('Failed to fetch gas price from provider');
        }

        // Update cache for next use
        this.gasPriceCache.set({
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        });

        maxFeePerGas = feeData.maxFeePerGas;
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

        this.logger.debug('Fetched fresh gas price', {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      }

      // Adjust gas price for Polygon (10% higher)
      maxFeePerGas = (maxFeePerGas * 110n) / 100n;
      maxPriorityFeePerGas = (maxPriorityFeePerGas * 110n) / 100n;

      // Complete transaction object
      transaction = {
        ...transaction,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };

      // Sign transaction
      const signedTx = await this.wallet.signTransaction(transaction);
      const parsedTx = ethers.Transaction.from(signedTx);

      const result: SignedTransaction = {
        transactionId,
        hash: parsedTx.hash!,
        rawTransaction: signedTx,
        nonce: Number(nonce),
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      };

      this.logger.info('Transaction signed successfully', {
        transactionId,
        hash: result.hash,
        nonce: result.nonce,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to sign transaction', error, { transactionId });

      // If it's a Redis connection error, throw to trigger SQS retry
      if (error instanceof Error && error.message.includes('Redis')) {
        this.logger.error('Redis connection error - will retry', {
          transactionId,
        });
        throw error;
      }

      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // Clear sensitive data
    this.wallet = null;
    this.provider = null;

    // Disconnect from Redis
    await this.nonceCache.disconnect();
  }
}
