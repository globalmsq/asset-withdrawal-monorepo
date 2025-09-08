import { ethers } from 'ethers';
import {
  ChainProvider,
  tokenService,
  AmountConverter,
} from '@asset-withdrawal/shared';
import { Logger } from '../utils/logger';

// Multicall3 ABI - only the functions we need
const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        components: [
          {
            name: 'target',
            type: 'address',
          },
          {
            name: 'allowFailure',
            type: 'bool',
          },
          {
            name: 'callData',
            type: 'bytes',
          },
        ],
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    outputs: [
      {
        components: [
          {
            name: 'success',
            type: 'bool',
          },
          {
            name: 'returnData',
            type: 'bytes',
          },
        ],
        name: 'returnData',
        type: 'tuple[]',
      },
    ],
  },
];

// ERC20 ABI for transfer functions
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) returns (uint256)',
  'function allowance(address owner, address spender) returns (uint256)',
];

// Interface for Multicall3.Call3 struct
export interface Call3 {
  target: string; // Contract address to call
  allowFailure: boolean; // Whether to allow this call to fail
  callData: string; // Encoded function call data
}

// Result from Multicall3
export interface Call3Result {
  success: boolean;
  returnData: string;
}

// Batch transfer request
export interface BatchTransferRequest {
  tokenAddress: string;
  to: string;
  amount: string;
  transactionId: string;
}

// Prepared batch data
export interface PreparedBatch {
  calls: Call3[];
  estimatedGasPerCall: bigint;
  totalEstimatedGas: bigint;
  batchGroups?: BatchGroup[]; // For split batches
}

// Batch group for split processing
export interface BatchGroup {
  calls: Call3[];
  transfers: BatchTransferRequest[];
  estimatedGas: bigint;
  tokenGroups: Map<string, number>;
}

// Gas estimation configuration
export interface GasConfig {
  blockGasLimit: bigint;
  safetyMargin: number;
  multicallOverhead: bigint;
  baseTransferGas: bigint;
  tokenTransferGas: Map<string, bigint>; // Token-specific gas costs
}

export class MulticallService {
  private multicall3Contract: ethers.Contract;
  private provider: ethers.Provider;
  private gasConfig: GasConfig;

  // Default gas constants for EVM chains
  private static readonly DEFAULT_GAS_CONFIG = {
    blockGasLimit: 30_000_000n, // Common gas limit for many chains
    safetyMargin: 0.75, // Use 75% of block gas limit for safety
    multicallOverhead: 35_000n, // Base overhead for Multicall3
    baseTransferGas: 65_000n, // Base gas for ERC20 transfer
    additionalGasPerCall: 5_000n, // Additional gas per call in batch
  };

  constructor(
    private chainProvider: ChainProvider,
    private logger: Logger
  ) {
    this.provider = this.chainProvider.getProvider();

    // Get Multicall3 address from ChainProvider
    const multicall3Address = this.chainProvider.getMulticall3Address();

    // Create Multicall3 contract instance
    this.multicall3Contract = new ethers.Contract(
      multicall3Address,
      MULTICALL3_ABI,
      this.provider
    );

    // Initialize gas configuration with chain-specific values if available
    this.gasConfig = {
      blockGasLimit: this.getChainBlockGasLimit(),
      safetyMargin: MulticallService.DEFAULT_GAS_CONFIG.safetyMargin,
      multicallOverhead: MulticallService.DEFAULT_GAS_CONFIG.multicallOverhead,
      baseTransferGas: MulticallService.DEFAULT_GAS_CONFIG.baseTransferGas,
      tokenTransferGas: new Map(), // Will be populated as we learn token-specific costs
    };

    this.logger.info('MulticallService initialized', {
      multicall3Address,
      chainId: this.chainProvider.getChainId(),
      chain: this.chainProvider.chain,
      network: this.chainProvider.network,
      gasConfig: {
        blockGasLimit: this.gasConfig.blockGasLimit.toString(),
        safetyMargin: this.gasConfig.safetyMargin,
        multicallOverhead: this.gasConfig.multicallOverhead.toString(),
      },
    });
  }

  /**
   * Prepare batch transfers for Multicall3 with dynamic batch splitting
   */
  async prepareBatchTransfer(
    transfers: BatchTransferRequest[],
    fromAddress: string,
    skipGasEstimation: boolean = false
  ): Promise<PreparedBatch> {
    // First, validate the batch
    const validation = await this.validateBatch(transfers, fromAddress);
    if (!validation.valid) {
      throw new Error(
        `Batch validation failed: ${validation.errors.join(', ')}`
      );
    }

    // Create calls for all transfers
    const allCalls: Call3[] = [];
    const callToTransferMap = new Map<number, BatchTransferRequest>();

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      const { tokenAddress, to, amount } = transfer;

      // Get token info to determine decimals for amount conversion
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

      // Convert decimal amount to wei using token decimals
      let amountInWei: string;
      try {
        amountInWei = AmountConverter.toWei(amount, tokenInfo.decimals);
      } catch (error) {
        throw new Error(
          `Failed to convert amount to wei for batch transfer: ${amount} with ${tokenInfo.decimals} decimals`
        );
      }

      // Create ERC20 interface for encoding
      const erc20Interface = new ethers.Interface(ERC20_ABI);

      // Encode transferFrom function call
      // Multicall3 will call transferFrom on behalf of the signing wallet
      const callData = erc20Interface.encodeFunctionData('transferFrom', [
        fromAddress, // from: signing service wallet
        to, // to: recipient
        amountInWei, // amount to transfer in wei
      ]);

      // Add to calls array
      allCalls.push({
        target: tokenAddress,
        allowFailure: false, // We want all transfers to succeed
        callData,
      });

      // Map call index to transfer for later grouping
      callToTransferMap.set(i, transfer);
    }

    // If gas estimation is skipped, return basic result
    if (skipGasEstimation) {
      this.logger.info('Skipping gas estimation for batch preparation', {
        totalTransfers: transfers.length,
      });

      // Use fallback gas estimates based on historical data or defaults
      const estimatedGasPerCall = this.getFallbackGasEstimate(allCalls);
      const totalEstimatedGas =
        this.gasConfig.multicallOverhead +
        estimatedGasPerCall * BigInt(allCalls.length) +
        MulticallService.DEFAULT_GAS_CONFIG.additionalGasPerCall *
          BigInt(allCalls.length - 1);

      return {
        calls: allCalls,
        estimatedGasPerCall,
        totalEstimatedGas,
      };
    }

    // Estimate gas for all calls
    const { estimatedGasPerCall, totalEstimatedGas } =
      await this.estimateBatchGas(allCalls);

    // Check if we need to split the batch
    const maxBatchGas = this.getMaxBatchGas();
    if (totalEstimatedGas <= maxBatchGas) {
      // Single batch is sufficient
      this.logger.info('Single batch processing', {
        totalTransfers: transfers.length,
        estimatedGas: totalEstimatedGas.toString(),
        maxGas: maxBatchGas.toString(),
      });

      return {
        calls: allCalls,
        estimatedGasPerCall,
        totalEstimatedGas,
      };
    }

    // Split into multiple batches
    this.logger.info('Splitting batch due to gas limits', {
      totalTransfers: transfers.length,
      totalEstimatedGas: totalEstimatedGas.toString(),
      maxBatchGas: maxBatchGas.toString(),
    });

    const batchGroups = await this.splitIntoBatches(
      transfers,
      allCalls,
      estimatedGasPerCall
    );

    return {
      calls: allCalls,
      estimatedGasPerCall,
      totalEstimatedGas,
      batchGroups,
    };
  }

  /**
   * Estimate gas for already prepared calls (public method for post-approval estimation)
   */
  async estimateGasForCalls(calls: Call3[]): Promise<{
    estimatedGasPerCall: bigint;
    totalEstimatedGas: bigint;
  }> {
    return this.estimateBatchGas(calls);
  }

  /**
   * Estimate gas for batch transaction with improved token-specific estimation
   */
  private async estimateBatchGas(calls: Call3[]): Promise<{
    estimatedGasPerCall: bigint;
    totalEstimatedGas: bigint;
  }> {
    try {
      // Try to get actual gas estimate from the network
      const gasEstimate =
        await this.multicall3Contract.aggregate3.estimateGas(calls);

      // Calculate per-call gas with chain-specific adjustments
      const basePerCall = gasEstimate / BigInt(calls.length);

      // On most chains, batch operations have diminishing gas costs per additional call
      const adjustedPerCall = this.adjustGasForBatchOperations(
        basePerCall,
        calls.length
      );

      // Add 15% buffer for gas estimation
      const totalEstimatedGas = (gasEstimate * 115n) / 100n;

      this.logger.debug('Batch gas estimation', {
        rawEstimate: gasEstimate.toString(),
        basePerCall: basePerCall.toString(),
        adjustedPerCall: adjustedPerCall.toString(),
        totalWithBuffer: totalEstimatedGas.toString(),
        callCount: calls.length,
      });

      // Update token-specific gas costs for future estimations
      this.updateTokenGasCosts(calls, adjustedPerCall);

      return {
        estimatedGasPerCall: adjustedPerCall,
        totalEstimatedGas,
      };
    } catch (error) {
      this.logger.error('Failed to estimate batch gas', error, {
        callCount: calls.length,
      });

      // Improved fallback with token-specific estimation
      const estimatedGasPerCall = this.getFallbackGasEstimate(calls);
      const totalEstimatedGas =
        this.gasConfig.multicallOverhead +
        estimatedGasPerCall * BigInt(calls.length) +
        MulticallService.DEFAULT_GAS_CONFIG.additionalGasPerCall *
          BigInt(calls.length - 1);

      this.logger.warn('Using fallback gas estimation', {
        estimatedGasPerCall: estimatedGasPerCall.toString(),
        totalEstimatedGas: totalEstimatedGas.toString(),
      });

      return {
        estimatedGasPerCall,
        totalEstimatedGas,
      };
    }
  }

  /**
   * Encode batch transaction for signing
   */
  encodeBatchTransaction(calls: Call3[]): string {
    return this.multicall3Contract.interface.encodeFunctionData('aggregate3', [
      calls,
    ]);
  }

  /**
   * Decode Multicall3 result
   */
  decodeBatchResult(data: string): Call3Result[] {
    const decoded = this.multicall3Contract.interface.decodeFunctionResult(
      'aggregate3',
      data
    );
    return decoded[0];
  }

  /**
   * Validate batch before execution
   */
  async validateBatch(
    transfers: BatchTransferRequest[],
    signerAddress: string
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check for duplicate transaction IDs
    const txIds = new Set<string>();
    for (const transfer of transfers) {
      if (txIds.has(transfer.transactionId)) {
        errors.push(`Duplicate transaction ID: ${transfer.transactionId}`);
      }
      txIds.add(transfer.transactionId);
    }

    // Calculate total amounts per token
    const tokenTotals = new Map<string, { amount: bigint; symbol: string }>();

    // Get chain and network from chainProvider
    const chain = this.chainProvider.chain;
    const network = this.chainProvider.network;

    // Validate addresses
    for (const transfer of transfers) {
      // Validate token address - accept both checksummed and lowercase addresses
      try {
        // Try direct validation first
        ethers.getAddress(transfer.tokenAddress);
      } catch (error) {
        // If it fails, try with lowercase
        try {
          const lowercaseAddr = transfer.tokenAddress.toLowerCase();
          if (!lowercaseAddr.match(/^0x[a-f0-9]{40}$/)) {
            throw new Error('Invalid format');
          }
        } catch (secondError) {
          errors.push(
            `Invalid token address in transfer ${transfer.transactionId}: "${transfer.tokenAddress}" - ${error instanceof Error ? error.message : 'Invalid format'}`
          );
        }
      }

      // Validate recipient address - accept both checksummed and lowercase addresses
      try {
        // Try direct validation first
        ethers.getAddress(transfer.to);
      } catch (error) {
        // If it fails, try with lowercase
        try {
          const lowercaseAddr = transfer.to.toLowerCase();
          if (!lowercaseAddr.match(/^0x[a-f0-9]{40}$/)) {
            throw new Error('Invalid format');
          }
        } catch (secondError) {
          errors.push(
            `Invalid recipient address in transfer ${transfer.transactionId}: "${transfer.to}" - ${error instanceof Error ? error.message : 'Invalid format'}`
          );
        }
      }

      // Validate amount with token-specific decimals
      try {
        // Get token info to determine decimals
        const tokenInfo = tokenService.getTokenByAddress(
          transfer.tokenAddress,
          network,
          chain
        );

        if (!tokenInfo) {
          errors.push(
            `Token not found: ${transfer.tokenAddress} on ${chain} ${network}`
          );
          continue;
        }

        // Use the centralized validation method
        const amountValidation = AmountConverter.validateAmount(
          transfer.amount,
          tokenInfo.decimals
        );
        if (!amountValidation.valid) {
          errors.push(
            `Invalid amount in transfer ${transfer.transactionId}: ${amountValidation.error}`
          );
          continue;
        }

        const amount = BigInt(
          AmountConverter.toWei(transfer.amount, tokenInfo.decimals)
        );

        // Accumulate token totals for max amount checking
        const key = transfer.tokenAddress.toLowerCase();
        const current = tokenTotals.get(key);
        if (current) {
          current.amount += amount;
        } else {
          tokenTotals.set(key, { amount, symbol: tokenInfo.symbol });
        }
      } catch (error) {
        errors.push(
          `Invalid amount in transfer ${transfer.transactionId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Check max transfer amounts
    for (const [tokenAddress, { amount, symbol }] of tokenTotals) {
      const tokenInfo = tokenService.getTokenByAddress(
        tokenAddress,
        network,
        chain
      );
      if (tokenInfo && tokenInfo.maxTransferAmount) {
        // Convert maxTransferAmount from token units to smallest units (wei equivalent)
        const maxAmount =
          BigInt(tokenInfo.maxTransferAmount) *
          BigInt(10 ** tokenInfo.decimals);
        if (amount > maxAmount) {
          errors.push(
            `Total amount for ${symbol} (${amount.toString()}) exceeds maximum transfer amount (${tokenInfo.maxTransferAmount})`
          );
        }
      }
    }

    // Don't enforce batch size limit here - let gas estimation handle it
    // The limit should be based on gas, not arbitrary count

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get optimal batch size based on gas limits with Polygon-specific optimizations
   */
  getOptimalBatchSize(estimatedGasPerCall: bigint): number {
    const availableGas = BigInt(
      Math.floor(
        Number(this.gasConfig.blockGasLimit) * this.gasConfig.safetyMargin
      )
    );
    const gasForCalls = availableGas - this.gasConfig.multicallOverhead;

    // Calculate with diminishing gas cost per call
    let totalGas = 0n;
    let optimalSize = 0;

    while (totalGas < gasForCalls && optimalSize < 100) {
      const nextCallGas = this.getGasForNthCall(
        estimatedGasPerCall,
        optimalSize
      );
      if (totalGas + nextCallGas > gasForCalls) {
        break;
      }
      totalGas += nextCallGas;
      optimalSize++;
    }

    this.logger.debug('Optimal batch size calculation', {
      estimatedGasPerCall: estimatedGasPerCall.toString(),
      availableGas: availableGas.toString(),
      optimalSize,
      totalGasUsed: totalGas.toString(),
    });

    return Math.max(1, optimalSize);
  }

  /**
   * Get chain-specific block gas limit
   */
  private getChainBlockGasLimit(): bigint {
    // Chain-specific gas limits (can be extended as needed)
    const chainGasLimits: Record<string, bigint> = {
      ethereum: 30_000_000n,
      polygon: 30_000_000n,
      bsc: 140_000_000n,
      localhost: 30_000_000n,
    };

    const chain = this.chainProvider.chain;
    return (
      chainGasLimits[chain] || MulticallService.DEFAULT_GAS_CONFIG.blockGasLimit
    );
  }

  /**
   * Get maximum gas for a single batch
   */
  private getMaxBatchGas(): bigint {
    return BigInt(
      Math.floor(
        Number(this.gasConfig.blockGasLimit) * this.gasConfig.safetyMargin
      )
    );
  }

  /**
   * Adjust gas estimate for batch operations
   */
  private adjustGasForBatchOperations(
    baseGasPerCall: bigint,
    callCount: number
  ): bigint {
    // Most EVM chains have more efficient batch processing
    // Each additional call costs slightly less due to warm storage slots
    const discount = Math.min(0.15, callCount * 0.005); // Max 15% discount
    return (baseGasPerCall * BigInt(Math.floor(100 - discount * 100))) / 100n;
  }

  /**
   * Update token-specific gas costs based on actual usage
   */
  private updateTokenGasCosts(calls: Call3[], gasPerCall: bigint): void {
    // Extract unique token addresses
    const tokenAddresses = new Set(
      calls.map(call => call.target.toLowerCase())
    );

    for (const tokenAddress of tokenAddresses) {
      const currentCost =
        this.gasConfig.tokenTransferGas.get(tokenAddress) || 0n;
      // Use weighted average to smooth out variations
      const newCost =
        currentCost === 0n ? gasPerCall : (currentCost * 4n + gasPerCall) / 5n;
      this.gasConfig.tokenTransferGas.set(tokenAddress, newCost);
    }
  }

  /**
   * Get fallback gas estimate based on token history
   */
  private getFallbackGasEstimate(calls: Call3[]): bigint {
    // Check if we have historical data for these tokens
    const tokenGasEstimates = calls.map(call => {
      const tokenAddress = call.target.toLowerCase();
      return (
        this.gasConfig.tokenTransferGas.get(tokenAddress) ||
        this.gasConfig.baseTransferGas
      );
    });

    // Return the maximum to be safe
    return tokenGasEstimates.reduce(
      (max, current) => (current > max ? current : max),
      0n
    );
  }

  /**
   * Calculate gas for the nth call in a batch (considering diminishing costs)
   */
  private getGasForNthCall(baseGasPerCall: bigint, n: number): bigint {
    // First call has full cost, subsequent calls have diminishing costs
    if (n === 0) return baseGasPerCall;

    // Each additional call is slightly cheaper (up to 15% discount)
    const discount = Math.min(0.15, n * 0.005);
    return (baseGasPerCall * BigInt(Math.floor(100 - discount * 100))) / 100n;
  }

  /**
   * Convert transfer amount to wei with proper token decimals lookup
   */
  private getTransferAmountInWei(
    transfer: BatchTransferRequest,
    network: string,
    chain: string
  ): { amount: bigint; tokenInfo: any } {
    let tokenInfo: any = null;
    try {
      tokenInfo = tokenService.getTokenByAddress(
        transfer.tokenAddress,
        network,
        chain
      );

      if (!tokenInfo) {
        throw new Error(
          `Token not found: ${transfer.tokenAddress} on ${chain} ${network}`
        );
      }

      // Convert decimal amount to wei first, then to BigInt
      const amountInWei = AmountConverter.toWei(
        transfer.amount,
        tokenInfo.decimals
      );
      return { amount: BigInt(amountInWei), tokenInfo };
    } catch (error) {
      this.logger.error(
        `Failed to get token info for ${transfer.tokenAddress} on ${chain} ${network}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(
        `Unable to process transfer: Token ${transfer.tokenAddress} not found or inaccessible on ${chain} ${network}`
      );
    }
  }

  /**
   * Split transfers into optimal batch groups
   */
  private async splitIntoBatches(
    transfers: BatchTransferRequest[],
    calls: Call3[],
    estimatedGasPerCall: bigint
  ): Promise<BatchGroup[]> {
    const maxBatchGas = this.getMaxBatchGas();
    const batchGroups: BatchGroup[] = [];

    // Get chain and network for token lookup
    const chain = this.chainProvider.chain;
    const network = this.chainProvider.network;

    let currentBatch: {
      calls: Call3[];
      transfers: BatchTransferRequest[];
      estimatedGas: bigint;
      tokenGroups: Map<string, number>;
      tokenAmounts: Map<string, bigint>; // Track amounts per token
    } = {
      calls: [],
      transfers: [],
      estimatedGas: this.gasConfig.multicallOverhead,
      tokenGroups: new Map(),
      tokenAmounts: new Map(),
    };

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      const call = calls[i];

      // Calculate gas for adding this call
      const callGas = this.getGasForNthCall(
        estimatedGasPerCall,
        currentBatch.calls.length
      );
      const newTotalGas = currentBatch.estimatedGas + callGas;

      // Check max transfer amount for token
      const tokenAddress = transfer.tokenAddress.toLowerCase();

      // Get token info and convert amount to wei
      const { amount: transferAmount, tokenInfo } = this.getTransferAmountInWei(
        transfer,
        network,
        chain
      );
      const currentTokenAmount =
        currentBatch.tokenAmounts.get(tokenAddress) || 0n;
      const newTokenTotal = currentTokenAmount + transferAmount;

      // Get max transfer amount for this token
      const maxTransferAmount = tokenInfo?.maxTransferAmount
        ? BigInt(
            AmountConverter.toWei(
              tokenInfo.maxTransferAmount,
              tokenInfo.decimals
            )
          )
        : null;

      // Check if adding this transfer would exceed max amount or gas limit
      const exceedsMaxAmount =
        maxTransferAmount && newTokenTotal > maxTransferAmount;
      const exceedsGasLimit =
        newTotalGas > maxBatchGas && currentBatch.calls.length > 0;

      if (exceedsMaxAmount || exceedsGasLimit) {
        // Save current batch
        batchGroups.push({
          calls: [...currentBatch.calls],
          transfers: [...currentBatch.transfers],
          estimatedGas: currentBatch.estimatedGas,
          tokenGroups: new Map(currentBatch.tokenGroups),
        });

        // Start new batch
        currentBatch = {
          calls: [],
          transfers: [],
          estimatedGas: this.gasConfig.multicallOverhead,
          tokenGroups: new Map(),
          tokenAmounts: new Map(),
        };
      }

      // Add to current batch
      currentBatch.calls.push(call);
      currentBatch.transfers.push(transfer);
      currentBatch.estimatedGas += callGas;

      // Update token groups and amounts
      currentBatch.tokenGroups.set(
        tokenAddress,
        (currentBatch.tokenGroups.get(tokenAddress) || 0) + 1
      );
      currentBatch.tokenAmounts.set(
        tokenAddress,
        (currentBatch.tokenAmounts.get(tokenAddress) || 0n) + transferAmount
      );
    }

    // Add remaining batch
    if (currentBatch.calls.length > 0) {
      batchGroups.push({
        calls: currentBatch.calls,
        transfers: currentBatch.transfers,
        estimatedGas: currentBatch.estimatedGas,
        tokenGroups: currentBatch.tokenGroups,
      });
    }

    this.logger.info('Batch splitting complete', {
      totalTransfers: transfers.length,
      batchCount: batchGroups.length,
      batchSizes: batchGroups.map(b => b.calls.length),
      estimatedGasPerBatch: batchGroups.map(b => b.estimatedGas.toString()),
    });

    return batchGroups;
  }

  /**
   * Check and ensure sufficient allowances for all tokens in the batch
   * Returns a list of tokens that need approval
   */
  async checkAndPrepareAllowances(
    transfers: BatchTransferRequest[],
    ownerAddress: string,
    spenderAddress: string
  ): Promise<{
    needsApproval: Array<{
      tokenAddress: string;
      currentAllowance: bigint;
      requiredAmount: bigint;
    }>;
  }> {
    const tokenAmounts = new Map<string, bigint>();

    // Aggregate amounts by token
    for (const transfer of transfers) {
      const { amount: amountToAdd } = this.getTransferAmountInWei(
        transfer,
        this.chainProvider.network,
        this.chainProvider.chain
      );

      const current = tokenAmounts.get(transfer.tokenAddress) || 0n;
      tokenAmounts.set(transfer.tokenAddress, current + amountToAdd);
    }

    const needsApproval: Array<{
      tokenAddress: string;
      currentAllowance: bigint;
      requiredAmount: bigint;
    }> = [];

    // Check allowance for each token
    for (const [tokenAddress, requiredAmount] of tokenAmounts) {
      try {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          this.provider // Use provider directly for read operations
        );

        // Use staticCall to ensure this is treated as a read-only operation
        const currentAllowance = await tokenContract.allowance.staticCall(
          ownerAddress,
          spenderAddress
        );

        if (currentAllowance < requiredAmount) {
          needsApproval.push({
            tokenAddress,
            currentAllowance,
            requiredAmount,
          });

          this.logger.warn('Insufficient allowance for token', {
            tokenAddress,
            currentAllowance: currentAllowance.toString(),
            requiredAmount: requiredAmount.toString(),
            owner: ownerAddress,
            spender: spenderAddress,
          });
        }
      } catch (error) {
        this.logger.error('Failed to check allowance', error, {
          tokenAddress,
          owner: ownerAddress,
          spender: spenderAddress,
        });
        // If we can't check allowance, assume it needs approval
        needsApproval.push({
          tokenAddress,
          currentAllowance: 0n,
          requiredAmount,
        });
      }
    }

    return { needsApproval };
  }
}
