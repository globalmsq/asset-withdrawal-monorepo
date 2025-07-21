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
}

export class MulticallService {
  private multicall3Contract: ethers.Contract;
  private provider: ethers.Provider;

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

    this.logger.info('MulticallService initialized', {
      multicall3Address,
      chainId: this.chainProvider.getChainId(),
      chain: this.chainProvider.chain,
      network: this.chainProvider.network,
    });
  }

  /**
   * Prepare batch transfers for Multicall3
   */
  async prepareBatchTransfer(transfers: BatchTransferRequest[]): Promise<PreparedBatch> {
    const calls: Call3[] = [];

    // Group transfers by token address for logging
    const tokenGroups = new Map<string, number>();

    for (const transfer of transfers) {
      const { tokenAddress, to, amount } = transfer;

      // Create ERC20 interface for encoding
      const erc20Interface = new ethers.Interface(ERC20_ABI);

      // Encode transfer function call
      const callData = erc20Interface.encodeFunctionData('transfer', [
        to,
        amount,
      ]);

      // Add to calls array
      calls.push({
        target: tokenAddress,
        allowFailure: false, // We want all transfers to succeed
        callData,
      });

      // Track token groups
      tokenGroups.set(tokenAddress, (tokenGroups.get(tokenAddress) || 0) + 1);
    }

    this.logger.info('Prepared batch transfer', {
      totalTransfers: transfers.length,
      uniqueTokens: tokenGroups.size,
      tokenGroups: Array.from(tokenGroups.entries()).map(([token, count]) => ({
        token,
        count,
      })),
    });

    // Estimate gas for the batch
    const { estimatedGasPerCall, totalEstimatedGas } = await this.estimateBatchGas(calls);

    return {
      calls,
      estimatedGasPerCall,
      totalEstimatedGas,
    };
  }

  /**
   * Estimate gas for batch transaction
   */
  private async estimateBatchGas(calls: Call3[]): Promise<{
    estimatedGasPerCall: bigint;
    totalEstimatedGas: bigint;
  }> {
    try {
      // Estimate gas for the aggregate3 call
      const gasEstimate = await this.multicall3Contract.aggregate3.estimateGas(calls);

      // Calculate per-call gas (approximate)
      const estimatedGasPerCall = gasEstimate / BigInt(calls.length);

      // Add 20% buffer for safety
      const totalEstimatedGas = (gasEstimate * 120n) / 100n;

      this.logger.debug('Batch gas estimation', {
        rawEstimate: gasEstimate.toString(),
        perCallEstimate: estimatedGasPerCall.toString(),
        totalWithBuffer: totalEstimatedGas.toString(),
        callCount: calls.length,
      });

      return {
        estimatedGasPerCall,
        totalEstimatedGas,
      };
    } catch (error) {
      this.logger.error('Failed to estimate batch gas', error, {
        callCount: calls.length,
      });

      // Fallback: estimate based on typical ERC20 transfer gas
      const TYPICAL_ERC20_TRANSFER_GAS = 65000n;
      const MULTICALL_OVERHEAD = 30000n;

      const estimatedGasPerCall = TYPICAL_ERC20_TRANSFER_GAS;
      const totalEstimatedGas = MULTICALL_OVERHEAD + (estimatedGasPerCall * BigInt(calls.length));

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
      try {
        ethers.getAddress(transfer.tokenAddress);
        ethers.getAddress(transfer.to);
      } catch (error) {
        errors.push(`Invalid address in transfer ${transfer.transactionId}`);
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

    // Check batch size limits
    const MAX_BATCH_SIZE = 100; // Reasonable limit to avoid gas issues
    if (transfers.length > MAX_BATCH_SIZE) {
      errors.push(`Batch size ${transfers.length} exceeds maximum ${MAX_BATCH_SIZE}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get optimal batch size based on gas limits
   */
  getOptimalBatchSize(estimatedGasPerCall: bigint): number {
    // Polygon block gas limit is around 30M
    const BLOCK_GAS_LIMIT = 30_000_000n;
    const SAFETY_MARGIN = 0.8; // Use only 80% of block gas limit
    const MULTICALL_OVERHEAD = 30000n;

    const availableGas = BigInt(Math.floor(Number(BLOCK_GAS_LIMIT) * SAFETY_MARGIN));
    const gasForCalls = availableGas - MULTICALL_OVERHEAD;

    const optimalSize = Number(gasForCalls / estimatedGasPerCall);

    // Cap at reasonable maximum
    const MAX_BATCH_SIZE = 100;
    return Math.min(optimalSize, MAX_BATCH_SIZE);
  }
}
