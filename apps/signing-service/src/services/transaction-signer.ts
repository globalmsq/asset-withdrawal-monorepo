import { ethers } from 'ethers';
import { ChainProvider, tokenService } from '@asset-withdrawal/shared';
import { SignedTransaction } from '../types';
import { SecureSecretsManager } from './secrets-manager';
import { NonceCacheService } from './nonce-cache.service';
import { GasPriceCache } from './gas-price-cache';
import { Logger } from '../utils/logger';
import { MulticallService, BatchTransferRequest } from './multicall.service';
import { Config } from '../config';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
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
    private logger: Logger,
    private config: Config
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
      await this.nonceCache.initialize(this.wallet.address, networkNonce, this.chainProvider.chain, this.chainProvider.network);

      this.logger.info('Transaction signer initialized', {
        address: this.wallet.address,
        chainId: this.chainProvider.getChainId(),
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
        initialNonce: networkNonce,
      });

      // Note: Approve transactions have been removed - assuming sufficient allowances exist
      this.logger.info('Initialization complete - approve TX logic removed, assuming sufficient allowances');
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
      const nonce = await this.nonceCache.getAndIncrement(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

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
        transactionType: 'SINGLE',
        requestId: transactionId,
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
      // Sync nonce with network at the beginning to avoid conflicts
      try {
        if (!this.provider) {
          throw new Error('Provider not initialized');
        }
        const networkNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
        const cachedNonce = await this.nonceCache.get(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

        // If cached nonce is behind network nonce, update it
        if (cachedNonce === null || cachedNonce < networkNonce) {
          await this.nonceCache.set(this.wallet.address, networkNonce, this.chainProvider.chain, this.chainProvider.network);
          this.logger.info('Nonce synchronized at batch start', {
            batchId,
            networkNonce,
            previousCached: cachedNonce,
          });
        }
      } catch (syncError) {
        this.logger.warn('Failed to sync nonce at batch start, continuing anyway', {
          batchId,
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
        });
      }

      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(transfers, this.wallet.address);
      if (!validation.valid) {
        throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
      }

      // Get Multicall3 address
      const multicall3Address = this.chainProvider.getMulticall3Address();

      // Check allowances for all tokens
      const { needsApproval } = await this.multicallService.checkAndPrepareAllowances(
        transfers,
        this.wallet.address,
        multicall3Address
      );

      if (needsApproval.length > 0) {
        this.logger.info('Insufficient allowances detected, approving tokens automatically', {
          batchId,
          needsApproval: needsApproval.map(a => ({
            token: a.tokenAddress,
            current: a.currentAllowance.toString(),
            required: a.requiredAmount.toString(),
          })),
        });

        // Approve logic removed - assuming sufficient allowances exist
        // If allowance is insufficient, transaction will fail and be handled by error recovery
        this.logger.warn('Insufficient allowances detected but approve logic removed', {
          batchId,
          tokensNeedingApproval: needsApproval.map(a => ({
            token: a.tokenAddress,
            currentAllowance: a.currentAllowance.toString(),
            required: a.requiredAmount.toString(),
          })),
        });
      }

      // Prepare batch transfers (skip gas estimation initially since we might need to approve tokens first)
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers, this.wallet.address, true);

      // After approvals, estimate gas for the actual calls
      const { totalEstimatedGas } = await this.multicallService.estimateGasForCalls(preparedBatch.calls);

      this.logger.info('Gas estimated after approvals', {
        batchId,
        estimatedGas: totalEstimatedGas.toString(),
        transferCount: transfers.length,
      });

      // Get nonce from Redis (atomic increment)
      const nonce = await this.nonceCache.getAndIncrement(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

      this.logger.debug('Using nonce for batch transaction', {
        address: this.wallet.address,
        nonce,
        batchId,
        transferCount: transfers.length,
      });

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

      // Use the newly estimated gas
      const gasLimit = totalEstimatedGas;

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
        transactionType: 'BATCH',
        requestId: batchId,
        batchId: batchId,
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
      // Sync nonce with network at the beginning to avoid conflicts
      try {
        if (!this.provider) {
          throw new Error('Provider not initialized');
        }
        const networkNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
        const cachedNonce = await this.nonceCache.get(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

        // If cached nonce is behind network nonce, update it
        if (cachedNonce === null || cachedNonce < networkNonce) {
          await this.nonceCache.set(this.wallet.address, networkNonce, this.chainProvider.chain, this.chainProvider.network);
          this.logger.info('Nonce synchronized at batch start', {
            batchId,
            networkNonce,
            previousCached: cachedNonce,
          });
        }
      } catch (syncError) {
        this.logger.warn('Failed to sync nonce at batch start, continuing anyway', {
          batchId,
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
        });
      }

      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(transfers, this.wallet.address);
      if (!validation.valid) {
        throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
      }

      // Get Multicall3 address
      const multicall3Address = this.chainProvider.getMulticall3Address();

      // Check allowances for all tokens
      const { needsApproval } = await this.multicallService.checkAndPrepareAllowances(
        transfers,
        this.wallet.address,
        multicall3Address
      );

      if (needsApproval.length > 0) {
        this.logger.info('Insufficient allowances detected, approving tokens automatically', {
          batchId,
          needsApproval: needsApproval.map(a => ({
            token: a.tokenAddress,
            current: a.currentAllowance.toString(),
            required: a.requiredAmount.toString(),
          })),
        });

        // Approve logic removed - assuming sufficient allowances exist
        // If allowance is insufficient, transaction will fail and be handled by error recovery
        this.logger.warn('Insufficient allowances detected but approve logic removed', {
          batchId,
          tokensNeedingApproval: needsApproval.map(a => ({
            token: a.tokenAddress,
            currentAllowance: a.currentAllowance.toString(),
            required: a.requiredAmount.toString(),
          })),
        });
      }

      // Prepare batch transfers with potential splitting (skip gas estimation initially)
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers, this.wallet.address, true);

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
          const nonce = await this.nonceCache.getAndIncrement(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

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
            transactionType: 'BATCH',
            requestId: groupBatchId,
            batchId: batchId, // Keep original batchId for tracking
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
