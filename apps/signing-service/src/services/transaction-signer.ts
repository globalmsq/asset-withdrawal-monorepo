import { ethers } from 'ethers';
import {
  ChainProvider,
  tokenService,
  NoncePoolService,
  GasEstimationError,
  NonceAllocationError,
  AmountConverter,
} from '@asset-withdrawal/shared';
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
  private noncePoolService: NoncePoolService | null = null;

  constructor(
    private chainProvider: ChainProvider,
    private secretsManager: SecureSecretsManager,
    private nonceCache: NonceCacheService,
    private gasPriceCache: GasPriceCache,
    private multicallService: MulticallService,
    private logger: Logger,
    private config: Config,
    noncePoolService?: NoncePoolService
  ) {
    this.noncePoolService = noncePoolService || null;
  }

  async initialize(): Promise<void> {
    try {
      // Get private key from secrets manager
      const privateKey = this.secretsManager.getPrivateKey();

      // Get provider and store it
      this.provider = this.chainProvider.getProvider();

      // Verify chainId matches before proceeding
      try {
        const actualChainIdHex = await (this.provider as any).send(
          'eth_chainId',
          []
        );
        const actualChainId = parseInt(actualChainIdHex, 16);
        const expectedChainId = this.chainProvider.getChainId();

        if (actualChainId !== expectedChainId) {
          const rpcUrl = process.env.RPC_URL || 'configured RPC';
          throw new Error(
            `ChainId mismatch: Config expects ${expectedChainId} for ${this.chainProvider.chain}/${this.chainProvider.network}, ` +
              `but RPC endpoint ${rpcUrl} reports ${actualChainId}. ` +
              `Please check RPC_URL configuration.`
          );
        }

        this.logger.info('ChainId verification passed', {
          chain: this.chainProvider.chain,
          network: this.chainProvider.network,
          chainId: actualChainId,
        });
      } catch (error) {
        this.logger.error('ChainId verification failed', {
          chain: this.chainProvider.chain,
          network: this.chainProvider.network,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Create wallet instance
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      // Connect to Redis
      await this.nonceCache.connect();

      // Initialize nonce with network value
      const networkNonce = await this.provider.getTransactionCount(
        this.wallet.address
      );
      await this.nonceCache.initialize(
        this.wallet.address,
        networkNonce,
        this.chainProvider.chain,
        this.chainProvider.network
      );

      this.logger.info('Transaction signer initialized', {
        address: this.wallet.address,
        chainId: this.chainProvider.getChainId(),
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
        initialNonce: networkNonce,
      });

      // Note: Approve transactions have been removed - assuming sufficient allowances exist
      this.logger.info(
        'Initialization complete - approve TX logic removed, assuming sufficient allowances'
      );
    } catch (error) {
      this.logger.error('Failed to initialize transaction signer', {
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
        rpcUrl: process.env.RPC_URL,
        chainId: this.chainProvider.getChainId(),
        error: error instanceof Error ? error.message : String(error),
      });

      // Provide more specific error message for connection issues
      if (
        error instanceof Error &&
        error.message.includes('could not detect network')
      ) {
        throw new Error(
          `Cannot connect to ${this.chainProvider.chain}/${this.chainProvider.network} RPC endpoint. ` +
            `Please check RPC_URL configuration.`
        );
      }

      throw error;
    }
  }

  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  getChainProvider(): ChainProvider {
    return this.chainProvider;
  }

  /**
   * Estimate gas for a transaction without signing
   */
  async estimateGasForTransaction(request: SigningRequest): Promise<{
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { to, amount, tokenAddress, transactionId } = request;

    // Build transaction WITHOUT nonce for gas estimation
    let transactionForGasEstimate: ethers.TransactionRequest;
    let amountInWei: string;

    if (tokenAddress) {
      // ERC-20 token transfer
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.wallet
      );

      // Get token info to determine decimals
      const network = this.chainProvider.network;
      const chain = this.chainProvider.chain;
      const tokenInfo = tokenService.getTokenByAddress(
        tokenAddress,
        network,
        chain
      );

      if (!tokenInfo) {
        throw new Error(
          `Token not found: ${tokenAddress} on ${chain} ${network}`
        );
      }

      // Convert amount to wei using token decimals
      try {
        amountInWei = AmountConverter.toWei(amount, tokenInfo.decimals);

        this.logger.debug('Amount conversion for gas estimation', {
          originalAmount: amount,
          tokenDecimals: tokenInfo.decimals,
          amountInWei,
          tokenSymbol: tokenInfo.symbol,
          transactionId,
        });
      } catch (error) {
        this.logger.error(
          'Failed to convert amount to wei for gas estimation',
          {
            amount,
            decimals: tokenInfo.decimals,
            tokenAddress,
            transactionId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        throw new Error(
          `Amount conversion failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const data = tokenContract.interface.encodeFunctionData('transfer', [
        to,
        amountInWei,
      ]);

      transactionForGasEstimate = {
        to: tokenAddress,
        data,
        from: this.wallet.address,
        type: 2, // EIP-1559
        chainId: this.chainProvider.getChainId(),
      };
    } else {
      // Native token transfer (ETH, MATIC, BNB - all use 18 decimals)
      try {
        amountInWei = AmountConverter.toWei(amount, 18);

        this.logger.debug('Native token amount conversion for gas estimation', {
          originalAmount: amount,
          decimals: 18,
          amountInWei,
          chain: this.chainProvider.chain,
          transactionId,
        });
      } catch (error) {
        this.logger.error(
          'Failed to convert native token amount to wei for gas estimation',
          {
            amount,
            decimals: 18,
            transactionId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        throw new Error(
          `Native token amount conversion failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      transactionForGasEstimate = {
        to,
        value: amountInWei,
        from: this.wallet.address,
        type: 2, // EIP-1559
        chainId: this.chainProvider.getChainId(),
      };
    }

    // Estimate gas
    const gasEstimate = await this.wallet.estimateGas(
      transactionForGasEstimate
    );
    const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

    // Get gas price
    let cachedGasPrice = this.gasPriceCache.get();
    let maxFeePerGas: bigint;
    let maxPriorityFeePerGas: bigint;

    if (cachedGasPrice) {
      maxFeePerGas = cachedGasPrice.maxFeePerGas;
      maxPriorityFeePerGas = cachedGasPrice.maxPriorityFeePerGas;
    } else {
      if (!this.provider) {
        throw new Error('Provider not initialized');
      }

      const feeData = await this.provider.getFeeData();

      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new GasEstimationError(
          'Failed to fetch gas price from provider',
          {
            chain: this.chainProvider.chain,
            network: this.chainProvider.network,
          }
        );
      }

      // Update cache for next use
      this.gasPriceCache.set({
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      });

      maxFeePerGas = feeData.maxFeePerGas;
      maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    }

    // Adjust gas price with a buffer (10% higher)
    maxFeePerGas = (maxFeePerGas * 110n) / 100n;
    maxPriorityFeePerGas = (maxPriorityFeePerGas * 110n) / 100n;

    return {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  async signTransaction(
    request: SigningRequest,
    preAllocatedNonce?: number,
    preEstimatedGas?: {
      gasLimit: bigint;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    }
  ): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { to, amount, tokenAddress, transactionId } = request;
    let nonce: number | undefined;
    let maxFeePerGas: bigint = 0n;
    let maxPriorityFeePerGas: bigint = 0n;

    try {
      // Build transaction WITHOUT nonce first (for gas estimation)
      let transactionForGasEstimate: ethers.TransactionRequest;
      let amountInWei: string;

      if (tokenAddress) {
        // ERC-20 token transfer
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          this.wallet
        );

        // Get token info to determine decimals
        const network = this.chainProvider.network;
        const chain = this.chainProvider.chain;
        const tokenInfo = tokenService.getTokenByAddress(
          tokenAddress,
          network,
          chain
        );

        if (!tokenInfo) {
          throw new Error(
            `Token not found: ${tokenAddress} on ${chain} ${network}`
          );
        }

        // Convert amount to wei using token decimals
        try {
          amountInWei = AmountConverter.toWei(amount, tokenInfo.decimals);

          this.logger.debug('Amount conversion', {
            originalAmount: amount,
            tokenDecimals: tokenInfo.decimals,
            amountInWei,
            tokenSymbol: tokenInfo.symbol,
            transactionId,
          });
        } catch (error) {
          this.logger.error('Failed to convert amount to wei', {
            amount,
            decimals: tokenInfo.decimals,
            tokenAddress,
            transactionId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(
            `Amount conversion failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }

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
          amountInWei,
        ]);

        transactionForGasEstimate = {
          to: tokenAddress,
          data,
          chainId: this.chainProvider.getChainId(),
        };
      } else {
        // Native token transfer - get decimals from chain configuration
        const nativeCurrency = this.chainProvider.getNativeCurrency();
        if (!nativeCurrency || typeof nativeCurrency.decimals !== 'number') {
          throw new Error(
            'Native currency decimals not configured for this chain'
          );
        }

        try {
          amountInWei = AmountConverter.toWei(amount, nativeCurrency.decimals);

          this.logger.debug('Native token amount conversion', {
            originalAmount: amount,
            decimals: nativeCurrency.decimals,
            symbol: nativeCurrency.symbol,
            amountInWei,
            chain: this.chainProvider.chain,
            transactionId,
          });
        } catch (error) {
          this.logger.error('Failed to convert native token amount to wei', {
            amount,
            decimals: nativeCurrency.decimals,
            symbol: nativeCurrency.symbol,
            transactionId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(
            `Native token amount conversion failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        transactionForGasEstimate = {
          to,
          value: amountInWei,
          chainId: this.chainProvider.getChainId(),
        };
      }

      // Use pre-estimated gas if provided, otherwise estimate
      let gasEstimate: bigint;

      if (preEstimatedGas) {
        // Use pre-estimated values
        gasEstimate = preEstimatedGas.gasLimit;
        maxFeePerGas = preEstimatedGas.maxFeePerGas;
        maxPriorityFeePerGas = preEstimatedGas.maxPriorityFeePerGas;

        this.logger.debug('Using pre-estimated gas', {
          transactionId,
          gasEstimate: gasEstimate.toString(),
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        });
      } else {
        // Estimate gas
        try {
          gasEstimate = await this.wallet.estimateGas(
            transactionForGasEstimate
          );
          this.logger.debug('Gas estimation successful', {
            transactionId,
            gasEstimate: gasEstimate.toString(),
          });
        } catch (gasError) {
          // Gas estimation failed - DO NOT allocate nonce
          this.logger.error(
            'Gas estimation failed - nonce not allocated',
            gasError,
            {
              transactionId,
              to,
              amount,
              tokenAddress,
            }
          );

          // Throw a specific error for gas estimation failure
          throw new GasEstimationError(
            gasError instanceof Error
              ? gasError.message
              : 'Unknown gas estimation error',
            {
              transactionId,
              to,
              amount,
              tokenAddress,
            },
            gasError
          );
        }
      }

      // Use pre-allocated nonce if provided, otherwise get a new one
      if (preAllocatedNonce !== undefined) {
        nonce = preAllocatedNonce;
        this.logger.debug('Using pre-allocated nonce for transaction', {
          address: this.wallet.address,
          nonce,
          transactionId,
        });
      } else {
        // Only get nonce if gas estimation succeeded
        nonce = await this.nonceCache.getAndIncrement(
          this.wallet.address,
          this.chainProvider.chain,
          this.chainProvider.network
        );

        this.logger.debug('Using newly allocated nonce for transaction', {
          address: this.wallet.address,
          nonce,
          transactionId,
        });
      }

      // Build final transaction with nonce
      let transaction: ethers.TransactionRequest = {
        ...transactionForGasEstimate,
        nonce,
      };
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Get gas price from cache or fetch new one (unless pre-estimated)
      if (!preEstimatedGas) {
        let cachedGasPrice = this.gasPriceCache.get();

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
            throw new GasEstimationError(
              'Failed to fetch gas price from provider',
              {
                chain: this.chainProvider.chain,
                network: this.chainProvider.network,
              }
            );
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
      }

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
        value: tokenAddress ? '0' : amountInWei, // ERC-20 transfers have value 0, native transfers have the amount in wei
        data: transaction.data?.toString(),
        chainId: this.chainProvider.getChainId(),
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
      };

      this.logger.info('Transaction signed successfully', {
        transactionId,
        hash: result.hash,
        nonce: result.nonce,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to sign transaction', error, { transactionId });

      // If nonce was allocated but transaction failed, return it to pool
      if (nonce !== undefined) {
        await this.returnNonceToPool(nonce);
      }

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

  async signBatchTransaction(
    request: BatchSigningRequest
  ): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { transfers, batchId } = request;
    let nonce: number | undefined;

    try {
      // Sync nonce with network at the beginning to avoid conflicts
      try {
        if (!this.provider) {
          throw new Error('Provider not initialized');
        }
        const networkNonce = await this.provider.getTransactionCount(
          this.wallet.address,
          'pending'
        );
        const cachedNonce = await this.nonceCache.get(
          this.wallet.address,
          this.chainProvider.chain,
          this.chainProvider.network
        );

        // If cached nonce is behind network nonce, update it
        if (cachedNonce === null || cachedNonce < networkNonce) {
          await this.nonceCache.set(
            this.wallet.address,
            networkNonce,
            this.chainProvider.chain,
            this.chainProvider.network
          );
          this.logger.info('Nonce synchronized at batch start', {
            batchId,
            networkNonce,
            previousCached: cachedNonce,
          });
        }
      } catch (syncError) {
        this.logger.warn(
          'Failed to sync nonce at batch start, continuing anyway',
          {
            batchId,
            error:
              syncError instanceof Error ? syncError.message : 'Unknown error',
          }
        );
      }

      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(
        transfers,
        this.wallet.address
      );
      if (!validation.valid) {
        throw new Error(
          `Batch validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Get Multicall3 address
      const multicall3Address = this.chainProvider.getMulticall3Address();

      // Check allowances for all tokens
      const { needsApproval } =
        await this.multicallService.checkAndPrepareAllowances(
          transfers,
          this.wallet.address,
          multicall3Address
        );

      if (needsApproval.length > 0) {
        this.logger.info(
          'Insufficient allowances detected, approving tokens automatically',
          {
            batchId,
            needsApproval: needsApproval.map(a => ({
              token: a.tokenAddress,
              current: a.currentAllowance.toString(),
              required: a.requiredAmount.toString(),
            })),
          }
        );

        // Approve logic removed - assuming sufficient allowances exist
        // If allowance is insufficient, transaction will fail and be handled by error recovery
        this.logger.warn(
          'Insufficient allowances detected but approve logic removed',
          {
            batchId,
            tokensNeedingApproval: needsApproval.map(a => ({
              token: a.tokenAddress,
              currentAllowance: a.currentAllowance.toString(),
              required: a.requiredAmount.toString(),
            })),
          }
        );
      }

      // IMPORTANT: Estimate gas BEFORE allocating nonce to prevent gaps
      // Prepare batch transfers with gas estimation
      let preparedBatch;
      try {
        preparedBatch = await this.multicallService.prepareBatchTransfer(
          transfers,
          this.wallet.address,
          false
        );

        this.logger.info('Batch prepared with gas estimation', {
          batchId,
          estimatedGas: preparedBatch.totalEstimatedGas.toString(),
          transferCount: transfers.length,
        });
      } catch (gasError) {
        // Gas estimation failed - DO NOT allocate nonce
        this.logger.error('Gas estimation failed for batch', gasError, {
          batchId,
          transferCount: transfers.length,
        });
        throw new Error(
          `Gas estimation failed: ${gasError instanceof Error ? gasError.message : 'Unknown error'}`
        );
      }

      // Only get nonce AFTER successful gas estimation
      nonce = await this.nonceCache.getAndIncrement(
        this.wallet.address,
        this.chainProvider.chain,
        this.chainProvider.network
      );

      this.logger.debug('Using nonce for batch transaction', {
        address: this.wallet.address,
        nonce,
        batchId,
        transferCount: transfers.length,
      });

      // Encode the batch transaction data
      const data = this.multicallService.encodeBatchTransaction(
        preparedBatch.calls
      );

      // Build transaction
      const transaction: ethers.TransactionRequest = {
        to: multicall3Address,
        data,
        nonce,
        chainId: this.chainProvider.getChainId(),
        type: 2, // EIP-1559
      };

      // Use the gas estimate from preparedBatch
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
        this.logger.debug(
          'Gas price cache expired, fetching fresh values for batch'
        );

        if (!this.provider) {
          throw new Error('Provider not initialized');
        }

        const feeData = await this.provider.getFeeData();

        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
          throw new GasEstimationError(
            'Failed to fetch gas price from provider',
            {
              chain: this.chainProvider.chain,
              network: this.chainProvider.network,
            }
          );
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
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
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

      // If nonce was allocated but transaction failed, return it to pool
      if (nonce !== undefined) {
        await this.returnNonceToPool(nonce);
      }

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

  async signBatchTransactionWithSplitting(
    request: BatchSigningRequest
  ): Promise<SignedTransaction[]> {
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
        const networkNonce = await this.provider.getTransactionCount(
          this.wallet.address,
          'pending'
        );
        const cachedNonce = await this.nonceCache.get(
          this.wallet.address,
          this.chainProvider.chain,
          this.chainProvider.network
        );

        // If cached nonce is behind network nonce, update it
        if (cachedNonce === null || cachedNonce < networkNonce) {
          await this.nonceCache.set(
            this.wallet.address,
            networkNonce,
            this.chainProvider.chain,
            this.chainProvider.network
          );
          this.logger.info('Nonce synchronized at batch start', {
            batchId,
            networkNonce,
            previousCached: cachedNonce,
          });
        }
      } catch (syncError) {
        this.logger.warn(
          'Failed to sync nonce at batch start, continuing anyway',
          {
            batchId,
            error:
              syncError instanceof Error ? syncError.message : 'Unknown error',
          }
        );
      }

      // Validate batch before processing
      const validation = await this.multicallService.validateBatch(
        transfers,
        this.wallet.address
      );
      if (!validation.valid) {
        throw new Error(
          `Batch validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Get Multicall3 address
      const multicall3Address = this.chainProvider.getMulticall3Address();

      // Check allowances for all tokens
      const { needsApproval } =
        await this.multicallService.checkAndPrepareAllowances(
          transfers,
          this.wallet.address,
          multicall3Address
        );

      if (needsApproval.length > 0) {
        this.logger.info(
          'Insufficient allowances detected, approving tokens automatically',
          {
            batchId,
            needsApproval: needsApproval.map(a => ({
              token: a.tokenAddress,
              current: a.currentAllowance.toString(),
              required: a.requiredAmount.toString(),
            })),
          }
        );

        // Approve logic removed - assuming sufficient allowances exist
        // If allowance is insufficient, transaction will fail and be handled by error recovery
        this.logger.warn(
          'Insufficient allowances detected but approve logic removed',
          {
            batchId,
            tokensNeedingApproval: needsApproval.map(a => ({
              token: a.tokenAddress,
              currentAllowance: a.currentAllowance.toString(),
              required: a.requiredAmount.toString(),
            })),
          }
        );
      }

      // IMPORTANT: Estimate gas BEFORE allocating nonce to prevent gaps
      // Prepare batch transfers with potential splitting and gas estimation
      let preparedBatch;
      try {
        preparedBatch = await this.multicallService.prepareBatchTransfer(
          transfers,
          this.wallet.address,
          false
        );
      } catch (gasError) {
        // Gas estimation failed - DO NOT allocate nonce
        this.logger.error(
          'Gas estimation failed for batch with splitting',
          gasError,
          {
            batchId,
            transferCount: transfers.length,
          }
        );
        throw new Error(
          `Gas estimation failed: ${gasError instanceof Error ? gasError.message : 'Unknown error'}`
        );
      }

      // Check if batch was split into groups
      if (preparedBatch.batchGroups && preparedBatch.batchGroups.length > 1) {
        this.logger.info(
          'Batch requires splitting into multiple transactions',
          {
            batchId,
            groupCount: preparedBatch.batchGroups.length,
            transferCount: transfers.length,
          }
        );

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

          // Only get nonce AFTER gas estimation succeeded for this group
          const nonce = await this.nonceCache.getAndIncrement(
            this.wallet.address,
            this.chainProvider.chain,
            this.chainProvider.network
          );

          // Get Multicall3 address
          const multicall3Address = this.chainProvider.getMulticall3Address();

          // Encode the batch transaction data
          const data = this.multicallService.encodeBatchTransaction(
            group.calls
          );

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
          const { maxFeePerGas, maxPriorityFeePerGas } =
            await this.getGasPrice();

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
            chain: this.chainProvider.chain,
            network: this.chainProvider.network,
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
      this.logger.error(
        'Failed to sign batch transaction with splitting',
        error,
        { batchId }
      );
      throw error;
    }
  }

  private async getGasPrice(): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
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
        throw new GasEstimationError(
          'Failed to fetch gas price from provider',
          {
            chain: this.chainProvider.chain,
            network: this.chainProvider.network,
          }
        );
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

  /**
   * Return nonce to pool for reuse when transaction fails after nonce allocation
   */
  async returnNonceToPool(nonce: number): Promise<void> {
    if (!this.noncePoolService) {
      this.logger.warn(
        'NoncePoolService not available, cannot return nonce to pool',
        {
          nonce,
        }
      );
      return;
    }

    try {
      const chainId = this.chainProvider.getChainId();
      const address = await this.getAddress();

      await this.noncePoolService.returnNonce(chainId, address, nonce);

      this.logger.info('Nonce returned to pool for reuse', {
        nonce,
        chainId,
        address,
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
      });
    } catch (error) {
      this.logger.error('Failed to return nonce to pool', error, {
        nonce,
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
      });
      // Don't throw - nonce return is best effort
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
