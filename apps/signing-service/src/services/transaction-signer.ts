import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
import { SignedTransaction } from '../types';
import { SecureSecretsManager } from './secrets-manager';
import { NonceCacheService } from './nonce-cache.service';
import { GasPriceCache } from './gas-price-cache';
import { Logger } from '../utils/logger';
import { MulticallService, BatchTransferRequest } from './multicall.service';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

export interface SigningRequest {
  to: string;
  amount: string;
  tokenAddress?: string;
  transactionId: string;
}

export interface BatchSigningRequest {
  transfers: BatchTransferRequest[];
  batchId: string;
}

export class TransactionSigner {
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.Provider | null = null;

  constructor(
    private chainProvider: ChainProvider,
    private secretsManager: SecureSecretsManager,
    private nonceCache: NonceCacheService,
    private gasPriceCache: GasPriceCache,
    private multicallService: MulticallService,
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
        // Native token transfer
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

      // Adjust gas price with a buffer (10% higher)
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
        from: this.wallet.address,
        to: tokenAddress || to, // Use tokenAddress for ERC-20, or recipient address for native transfers
        value: tokenAddress ? '0' : amount, // ERC-20 transfers have value 0, native transfers have the amount
        data: transaction.data?.toString(),
        chainId: this.chainProvider.getChainId(),
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

  async signBatchTransaction(request: BatchSigningRequest): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { transfers, batchId } = request;

    try {
      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(transfers, this.wallet.address);
      if (!validation.valid) {
        throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
      }

      // Prepare batch transfers
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers);

      // Get nonce from Redis (atomic increment)
      const nonce = await this.nonceCache.getAndIncrement(this.wallet.address);

      this.logger.debug('Using nonce for batch transaction', {
        address: this.wallet.address,
        nonce,
        batchId,
        transferCount: transfers.length,
      });

      // Get Multicall3 address
      const multicall3Address = this.chainProvider.getMulticall3Address();

      // Encode the batch transaction data
      const data = this.multicallService.encodeBatchTransaction(preparedBatch.calls);

      // Build transaction
      const transaction: ethers.TransactionRequest = {
        to: multicall3Address,
        data,
        nonce,
        chainId: this.chainProvider.getChainId(),
        type: 2, // EIP-1559
      };

      // Use prepared gas estimate
      const gasLimit = preparedBatch.totalEstimatedGas;

      // Get gas price from cache or fetch new one
      let cachedGasPrice = this.gasPriceCache.get();
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (cachedGasPrice) {
        // Use cached values
        maxFeePerGas = cachedGasPrice.maxFeePerGas;
        maxPriorityFeePerGas = cachedGasPrice.maxPriorityFeePerGas;

        this.logger.debug('Using cached gas price for batch', {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      } else {
        // Cache expired, fetch fresh gas price
        this.logger.debug('Gas price cache expired, fetching fresh values for batch');

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

        this.logger.debug('Fetched fresh gas price for batch', {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      }

      // Adjust gas price with a buffer (10% higher)
      maxFeePerGas = (maxFeePerGas * 110n) / 100n;
      maxPriorityFeePerGas = (maxPriorityFeePerGas * 110n) / 100n;

      // Complete transaction object
      transaction.gasLimit = gasLimit;
      transaction.maxFeePerGas = maxFeePerGas;
      transaction.maxPriorityFeePerGas = maxPriorityFeePerGas;

      // Sign transaction
      const signedTx = await this.wallet.signTransaction(transaction);
      const parsedTx = ethers.Transaction.from(signedTx);

      const result: SignedTransaction = {
        transactionId: batchId,
        hash: parsedTx.hash!,
        rawTransaction: signedTx,
        nonce: Number(nonce),
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        from: this.wallet.address,
        to: multicall3Address,
        value: '0', // Multicall3 transactions have no value
        data: data,
        chainId: this.chainProvider.getChainId(),
      };

      this.logger.info('Batch transaction signed successfully', {
        batchId,
        hash: result.hash,
        nonce: result.nonce,
        transferCount: transfers.length,
        totalGas: gasLimit.toString(),
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to sign batch transaction', error, { batchId });

      // If it's a Redis connection error, throw to trigger SQS retry
      if (error instanceof Error && error.message.includes('Redis')) {
        this.logger.error('Redis connection error - will retry', {
          batchId,
        });
        throw error;
      }

      throw error;
    }
  }

  async signBatchTransactionWithSplitting(request: BatchSigningRequest): Promise<SignedTransaction[]> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { transfers, batchId } = request;

    try {
      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(transfers, this.wallet.address);
      if (!validation.valid) {
        throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
      }

      // Prepare batch transfers with potential splitting
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers);

      // Check if batch was split into groups
      if (preparedBatch.batchGroups && preparedBatch.batchGroups.length > 1) {
        this.logger.info('Batch requires splitting into multiple transactions', {
          batchId,
          groupCount: preparedBatch.batchGroups.length,
          transferCount: transfers.length,
        });

        // Sign each batch group separately
        const signedTransactions: SignedTransaction[] = [];

        for (let i = 0; i < preparedBatch.batchGroups.length; i++) {
          const group = preparedBatch.batchGroups[i];
          const groupBatchId = `${batchId}-${i + 1}`;

          this.logger.debug('Signing batch group', {
            groupIndex: i + 1,
            totalGroups: preparedBatch.batchGroups.length,
            groupBatchId,
            transferCount: group.transfers.length,
            estimatedGas: group.estimatedGas.toString(),
          });

          // Get nonce for this transaction
          const nonce = await this.nonceCache.getAndIncrement(this.wallet.address);

          // Get Multicall3 address
          const multicall3Address = this.chainProvider.getMulticall3Address();

          // Encode the batch transaction data
          const data = this.multicallService.encodeBatchTransaction(group.calls);

          // Build transaction
          const transaction: ethers.TransactionRequest = {
            to: multicall3Address,
            data,
            nonce,
            chainId: this.chainProvider.getChainId(),
            type: 2, // EIP-1559
            gasLimit: group.estimatedGas,
          };

          // Get gas price
          const { maxFeePerGas, maxPriorityFeePerGas } = await this.getGasPrice();

          // Complete transaction object
          transaction.maxFeePerGas = maxFeePerGas;
          transaction.maxPriorityFeePerGas = maxPriorityFeePerGas;

          // Sign transaction
          const signedTx = await this.wallet.signTransaction(transaction);
          const parsedTx = ethers.Transaction.from(signedTx);

          const result: SignedTransaction = {
            transactionId: groupBatchId,
            hash: parsedTx.hash!,
            rawTransaction: signedTx,
            nonce: Number(nonce),
            gasLimit: group.estimatedGas.toString(),
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
            from: this.wallet.address,
            to: multicall3Address,
            value: '0',
            data: data,
            chainId: this.chainProvider.getChainId(),
          };

          signedTransactions.push(result);

          this.logger.info('Batch group signed successfully', {
            groupBatchId,
            hash: result.hash,
            nonce: result.nonce,
            groupIndex: i + 1,
            totalGroups: preparedBatch.batchGroups.length,
          });
        }

        return signedTransactions;
      } else {
        // Single batch, use regular signing
        const signedTx = await this.signBatchTransaction(request);
        return [signedTx];
      }
    } catch (error) {
      this.logger.error('Failed to sign batch transaction with splitting', error, { batchId });
      throw error;
    }
  }

  private async getGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
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

    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  async cleanup(): Promise<void> {
    // Clear sensitive data
    this.wallet = null;
    this.provider = null;

    // Disconnect from Redis
    await this.nonceCache.disconnect();
  }
}
