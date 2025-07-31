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
  'function approve(address spender, uint256 amount) returns (bool)',
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

      // Initialize MAX approvals for development environment
      // Don't await to avoid blocking initialization
      this.logger.info('About to call initializeMaxApprovals');
      this.initializeMaxApprovals(this.chainProvider.chain, this.chainProvider.network).catch(error => {
        this.logger.error('Failed to initialize MAX approvals', error);
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

        // Approve tokens automatically
        // TODO: In production, implement proper allowance tracking:
        // - Track pending transactions and their allowance consumption
        // - Queue approval requests when allowance is insufficient
        // - Sync with blockchain state before approving
        // - Consider batch approval strategies
        for (const approval of needsApproval) {
          await this.approveToken(approval.tokenAddress, multicall3Address, approval.requiredAmount);
        }

        this.logger.info('Token approvals completed', {
          batchId,
          approvedTokens: needsApproval.map(a => a.tokenAddress),
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

        // Approve tokens automatically
        // TODO: In production, implement proper allowance tracking:
        // - Track pending transactions and their allowance consumption
        // - Queue approval requests when allowance is insufficient
        // - Sync with blockchain state before approving
        // - Consider batch approval strategies
        for (const approval of needsApproval) {
          await this.approveToken(approval.tokenAddress, multicall3Address, approval.requiredAmount);
        }

        this.logger.info('Token approvals completed', {
          batchId,
          approvedTokens: needsApproval.map(a => a.tokenAddress),
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

  /**
   * Calculate optimal allowance amount based on configuration
   */
  private async calculateOptimalAllowance(
    tokenAddress: string,
    requiredAmount: bigint
  ): Promise<bigint> {
    const { allowanceStrategy, allowanceMultiplier, allowanceAmount } = this.config.batchProcessing;

    if (allowanceStrategy === 'multiplier') {
      // Multiplier strategy: approve required amount * multiplier
      return requiredAmount * BigInt(Math.floor(allowanceMultiplier));
    } else {
      // Fixed strategy: approve a fixed human-readable amount
      if (!allowanceAmount) {
        this.logger.warn('Fixed allowance strategy selected but no amount configured, falling back to multiplier');
        return requiredAmount * BigInt(10); // Default multiplier
      }

      try {
        // Get token decimals
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          this.provider
        );

        const decimals = await tokenContract.decimals();

        // Parse human-readable amount to wei
        const fixedAmount = ethers.parseUnits(allowanceAmount, decimals);

        // Ensure we approve at least the required amount
        return fixedAmount > requiredAmount ? fixedAmount : requiredAmount;
      } catch (error) {
        this.logger.error('Failed to get token decimals for fixed allowance calculation', error, {
          tokenAddress,
          allowanceAmount,
        });
        // Fallback to multiplier strategy
        return requiredAmount * BigInt(10);
      }
    }
  }

  private async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    requiredAmount: bigint
  ): Promise<void> {
    // TODO: In production, this method should not send transactions directly.
    // Instead, it should create approval requests and send them to the tx-broadcaster
    // via the queue system to maintain proper nonce management and transaction ordering.
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      // Calculate optimal allowance amount based on strategy
      const approvalAmount = await this.calculateOptimalAllowance(tokenAddress, requiredAmount);

      // Create token contract instance
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.wallet
      );

      // Get nonce for approval transaction
      const nonce = await this.nonceCache.getAndIncrement(this.wallet.address, this.chainProvider.chain, this.chainProvider.network);

      this.logger.debug('Approving token for Multicall3', {
        tokenAddress,
        spenderAddress,
        requiredAmount: requiredAmount.toString(),
        approvalAmount: approvalAmount.toString(),
        strategy: this.config.batchProcessing.allowanceStrategy,
        nonce,
      });

      // Prepare approval transaction
      const transaction: ethers.TransactionRequest = {
        to: tokenAddress,
        data: tokenContract.interface.encodeFunctionData('approve', [
          spenderAddress,
          approvalAmount,
        ]),
        nonce,
        chainId: this.chainProvider.getChainId(),
        type: 2, // EIP-1559
      };

      // Estimate gas with error handling
      let gasLimit: bigint;
      try {
        const gasEstimate = await this.wallet.estimateGas(transaction);
        gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer
      } catch (estimateError) {
        this.logger.error('Failed to estimate gas for approval, using fallback', estimateError, {
          tokenAddress,
          nonce,
        });
        // Use a reasonable fallback gas limit for approve
        gasLimit = 100000n;
      }

      // Get gas price
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.getGasPrice();

      // Complete transaction object
      transaction.gasLimit = gasLimit;
      transaction.maxFeePerGas = maxFeePerGas;
      transaction.maxPriorityFeePerGas = maxPriorityFeePerGas;

      // Send approval transaction
      const tx = await this.wallet.sendTransaction(transaction);

      this.logger.info('Approval transaction sent', {
        tokenAddress,
        spenderAddress,
        requiredAmount: requiredAmount.toString(),
        approvalAmount: approvalAmount.toString(),
        strategy: this.config.batchProcessing.allowanceStrategy,
        txHash: tx.hash,
        nonce,
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        this.logger.info('Token approval confirmed', {
          tokenAddress,
          spenderAddress,
          requiredAmount: requiredAmount.toString(),
          approvalAmount: approvalAmount.toString(),
          strategy: this.config.batchProcessing.allowanceStrategy,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        throw new Error(`Approval transaction failed: ${tx.hash}`);
      }
    } catch (error) {
      // If it's a nonce error, we need to handle it specially
      if (error instanceof Error && error.message.includes('nonce')) {
        this.logger.error('Nonce error in approval, syncing with network', error, {
          tokenAddress,
          spenderAddress,
        });

        // Try to sync nonce with network
        try {
          if (!this.provider) {
            throw new Error('Provider not initialized');
          }
          const networkNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
          await this.nonceCache.set(this.wallet.address, networkNonce, this.chainProvider.chain, this.chainProvider.network);
          this.logger.info('Nonce synchronized with network', {
            address: this.wallet.address,
            networkNonce,
          });
        } catch (syncError) {
          this.logger.error('Failed to sync nonce with network', syncError);
        }
      }

      this.logger.error('Failed to approve token', error, {
        tokenAddress,
        spenderAddress,
        requiredAmount: requiredAmount.toString(),
        strategy: this.config.batchProcessing.allowanceStrategy,
      });
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

  private async initializeMaxApprovals(chain: string, network: string): Promise<void> {
    try {
      this.logger.info('Checking MAX approval initialization', {
        nodeEnv: this.config.nodeEnv,
        chain: chain,
        network: network
      });
      
      if (this.config.nodeEnv !== 'development') {
        this.logger.info('Skipping MAX approvals - not in development environment');
        return;
      }

      this.logger.info('Initializing MAX approvals for development environment', {
        chain: chain,
        network: network
      });
      
      const multicall3Address = this.chainProvider.getMulticall3Address();
      this.logger.info('Got multicall3 address', { multicall3Address });
      
      const tokens = this.getConfiguredTokens(chain, network);
      
      this.logger.info('Found configured tokens', {
        tokenCount: tokens.length,
        tokens: tokens.map(t => ({ symbol: t.symbol, address: t.address }))
      });
      
      if (tokens.length === 0) {
        this.logger.warn('No tokens configured for this chain/network', { chain, network });
        return;
      }
      
      if (!this.provider) {
        this.logger.error('Provider not initialized for MAX approval');
        return;
      }
      
      for (const token of tokens) {
        try {
          if (!this.wallet) {
            this.logger.error('Wallet not initialized for MAX approval');
            return;
          }
          
          const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.provider);
          const currentAllowance = await tokenContract.allowance(this.wallet.address, multicall3Address);
          
          if (currentAllowance < ethers.MaxUint256 / 2n) {
            this.logger.info(`Setting MAX approval for ${token.symbol}`, {
              tokenAddress: token.address,
              currentAllowance: currentAllowance.toString()
            });
            
            // Get nonce from cache to avoid conflicts
            const nonce = await this.nonceCache.getAndIncrement(this.wallet.address, chain, network);
            
            const tokenContractWithSigner = new ethers.Contract(token.address, ERC20_ABI, this.wallet);
            
            // Build transaction with explicit nonce
            const transaction = await tokenContractWithSigner.approve.populateTransaction(multicall3Address, ethers.MaxUint256);
            transaction.nonce = nonce;
            
            // Send transaction
            const tx = await this.wallet.sendTransaction(transaction);
            const receipt = await tx.wait();
            
            this.logger.info(`MAX approval confirmed for ${token.symbol}`, {
              txHash: tx.hash,
              blockNumber: receipt?.blockNumber,
              nonce: nonce
            });
          } else {
            this.logger.info(`${token.symbol} already has sufficient allowance`, {
              currentAllowance: currentAllowance.toString()
            });
          }
        } catch (error) {
          this.logger.error(`Failed to set MAX approval for ${token.symbol}`, error);
        }
      }
      
      this.logger.info('MAX approval initialization completed');
    } catch (error) {
      this.logger.error('Failed in initializeMaxApprovals', error);
    }
  }

  private getConfiguredTokens(chain: string, network: string) {
    const tokens = tokenService.getSupportedTokens(network, chain);
    
    return tokens.map(token => ({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      name: token.name
    }));
  }
}
