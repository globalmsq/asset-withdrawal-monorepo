import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
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

// ERC20 ABI for transfer function
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

// Interface for Multicall3.Call3 struct
export interface Call3 {
  target: string;      // Contract address to call
  allowFailure: boolean; // Whether to allow this call to fail
  callData: string;    // Encoded function call data
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

  // Polygon-specific gas constants
  private static readonly POLYGON_GAS_CONFIG = {
    blockGasLimit: 30_000_000n, // 30M gas limit on Polygon
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

    // Initialize gas configuration
    this.gasConfig = {
      blockGasLimit: MulticallService.POLYGON_GAS_CONFIG.blockGasLimit,
      safetyMargin: MulticallService.POLYGON_GAS_CONFIG.safetyMargin,
      multicallOverhead: MulticallService.POLYGON_GAS_CONFIG.multicallOverhead,
      baseTransferGas: MulticallService.POLYGON_GAS_CONFIG.baseTransferGas,
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
  async prepareBatchTransfer(transfers: BatchTransferRequest[]): Promise<PreparedBatch> {
    // First, validate the batch
    const validation = await this.validateBatch(transfers, '0x0'); // Signer address not needed for basic validation
    if (!validation.valid) {
      throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
    }

    // Create calls for all transfers
    const allCalls: Call3[] = [];
    const callToTransferMap = new Map<number, BatchTransferRequest>();

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      const { tokenAddress, to, amount } = transfer;

      // Create ERC20 interface for encoding
      const erc20Interface = new ethers.Interface(ERC20_ABI);

      // Encode transfer function call
      const callData = erc20Interface.encodeFunctionData('transfer', [
        to,
        amount,
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

    // Estimate gas for all calls
    const { estimatedGasPerCall, totalEstimatedGas } = await this.estimateBatchGas(allCalls);

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

    const batchGroups = await this.splitIntoBatches(transfers, allCalls, estimatedGasPerCall);

    return {
      calls: allCalls,
      estimatedGasPerCall,
      totalEstimatedGas,
      batchGroups,
    };
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
      const gasEstimate = await this.multicall3Contract.aggregate3.estimateGas(calls);

      // Calculate per-call gas with Polygon-specific adjustments
      const basePerCall = gasEstimate / BigInt(calls.length);

      // On Polygon, batch operations have diminishing gas costs per additional call
      const adjustedPerCall = this.adjustGasForPolygon(basePerCall, calls.length);

      // Add 15% buffer for Polygon (lower than Ethereum due to more predictable gas)
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
      const totalEstimatedGas = this.gasConfig.multicallOverhead +
        (estimatedGasPerCall * BigInt(calls.length)) +
        (MulticallService.POLYGON_GAS_CONFIG.additionalGasPerCall * BigInt(calls.length - 1));

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
    return this.multicall3Contract.interface.encodeFunctionData('aggregate3', [calls]);
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
  async validateBatch(transfers: BatchTransferRequest[], signerAddress: string): Promise<{
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
          errors.push(`Invalid token address in transfer ${transfer.transactionId}: "${transfer.tokenAddress}" - ${error instanceof Error ? error.message : 'Invalid format'}`);
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
          errors.push(`Invalid recipient address in transfer ${transfer.transactionId}: "${transfer.to}" - ${error instanceof Error ? error.message : 'Invalid format'}`);
        }
      }

      // Validate amount
      try {
        const amount = BigInt(transfer.amount);
        if (amount <= 0n) {
          errors.push(`Invalid amount in transfer ${transfer.transactionId}: must be positive`);
        }
      } catch (error) {
        errors.push(`Invalid amount in transfer ${transfer.transactionId}`);
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
    const availableGas = BigInt(Math.floor(Number(this.gasConfig.blockGasLimit) * this.gasConfig.safetyMargin));
    const gasForCalls = availableGas - this.gasConfig.multicallOverhead;

    // Calculate with diminishing gas cost per call
    let totalGas = 0n;
    let optimalSize = 0;

    while (totalGas < gasForCalls && optimalSize < 100) {
      const nextCallGas = this.getGasForNthCall(estimatedGasPerCall, optimalSize);
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
   * Get maximum gas for a single batch
   */
  private getMaxBatchGas(): bigint {
    return BigInt(Math.floor(Number(this.gasConfig.blockGasLimit) * this.gasConfig.safetyMargin));
  }

  /**
   * Adjust gas estimate for Polygon network characteristics
   */
  private adjustGasForPolygon(baseGasPerCall: bigint, callCount: number): bigint {
    // Polygon has more efficient batch processing
    // Each additional call costs slightly less due to warm storage slots
    const discount = Math.min(0.15, callCount * 0.005); // Max 15% discount
    return (baseGasPerCall * BigInt(Math.floor(100 - discount * 100))) / 100n;
  }

  /**
   * Update token-specific gas costs based on actual usage
   */
  private updateTokenGasCosts(calls: Call3[], gasPerCall: bigint): void {
    // Extract unique token addresses
    const tokenAddresses = new Set(calls.map(call => call.target.toLowerCase()));

    for (const tokenAddress of tokenAddresses) {
      const currentCost = this.gasConfig.tokenTransferGas.get(tokenAddress) || 0n;
      // Use weighted average to smooth out variations
      const newCost = currentCost === 0n ? gasPerCall : (currentCost * 4n + gasPerCall) / 5n;
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
      return this.gasConfig.tokenTransferGas.get(tokenAddress) || this.gasConfig.baseTransferGas;
    });

    // Return the maximum to be safe
    return tokenGasEstimates.reduce((max, current) => current > max ? current : max, 0n);
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
   * Split transfers into optimal batch groups
   */
  private async splitIntoBatches(
    transfers: BatchTransferRequest[],
    calls: Call3[],
    estimatedGasPerCall: bigint
  ): Promise<BatchGroup[]> {
    const maxBatchGas = this.getMaxBatchGas();
    const batchGroups: BatchGroup[] = [];

    let currentBatch: {
      calls: Call3[];
      transfers: BatchTransferRequest[];
      estimatedGas: bigint;
      tokenGroups: Map<string, number>;
    } = {
      calls: [],
      transfers: [],
      estimatedGas: this.gasConfig.multicallOverhead,
      tokenGroups: new Map(),
    };

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      const call = calls[i];

      // Calculate gas for adding this call
      const callGas = this.getGasForNthCall(estimatedGasPerCall, currentBatch.calls.length);
      const newTotalGas = currentBatch.estimatedGas + callGas;

      // Check if adding this call would exceed gas limit
      if (newTotalGas > maxBatchGas && currentBatch.calls.length > 0) {
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
        };
      }

      // Add to current batch
      currentBatch.calls.push(call);
      currentBatch.transfers.push(transfer);
      currentBatch.estimatedGas += callGas;

      // Update token groups
      const tokenAddress = transfer.tokenAddress.toLowerCase();
      currentBatch.tokenGroups.set(
        tokenAddress,
        (currentBatch.tokenGroups.get(tokenAddress) || 0) + 1
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
}
