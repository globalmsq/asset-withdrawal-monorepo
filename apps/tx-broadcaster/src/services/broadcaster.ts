import { ethers } from 'ethers';
import { config } from '../config';
import { BroadcastResult, BroadcastError, BlockchainTransaction } from '../types';

export class TransactionBroadcaster {
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
  }

  // Broadcast a signed transaction to the blockchain
  async broadcastTransaction(signedTransaction: string): Promise<BroadcastResult> {
    try {
      console.log('[tx-broadcaster] Broadcasting transaction...');
      
      // Parse the signed transaction to validate it
      const parsedTx = ethers.Transaction.from(signedTransaction);
      console.log(`[tx-broadcaster] Parsed transaction hash: ${parsedTx.hash}`);

      // Send the transaction
      const response = await this.provider.broadcastTransaction(signedTransaction);
      console.log(`[tx-broadcaster] Transaction broadcasted: ${response.hash}`);

      return {
        success: true,
        transactionHash: response.hash,
      };
    } catch (error) {
      console.error('[tx-broadcaster] Broadcast error:', error);
      return this.handleBroadcastError(error);
    }
  }

  // Wait for transaction confirmation (optional - might be handled by tx-monitor service)
  async waitForConfirmation(
    transactionHash: string,
    confirmations: number = 1,
    timeoutMs: number = 300000 // 5 minutes
  ): Promise<BroadcastResult> {
    try {
      console.log(`[tx-broadcaster] Waiting for ${confirmations} confirmations for ${transactionHash}...`);
      
      const receipt = await this.provider.waitForTransaction(
        transactionHash,
        confirmations,
        timeoutMs
      );

      if (!receipt) {
        throw new BroadcastError(
          'Transaction confirmation timeout',
          'CONFIRMATION_TIMEOUT',
          true
        );
      }

      return {
        success: true,
        transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        receipt,
      };
    } catch (error) {
      console.error('[tx-broadcaster] Confirmation error:', error);
      return this.handleBroadcastError(error);
    }
  }

  // Validate transaction before broadcasting
  async validateTransaction(signedTransaction: string): Promise<{
    valid: boolean;
    error?: string;
    transaction?: BlockchainTransaction;
  }> {
    try {
      const parsedTx = ethers.Transaction.from(signedTransaction);
      
      // Basic validation
      if (!parsedTx.to) {
        return { valid: false, error: 'Transaction must have a recipient address' };
      }

      if (!parsedTx.value || parsedTx.value < 0) {
        return { valid: false, error: 'Transaction value must be non-negative' };
      }

      if (Number(parsedTx.chainId) !== config.CHAIN_ID) {
        return { 
          valid: false, 
          error: `Transaction chain ID ${parsedTx.chainId} does not match expected ${config.CHAIN_ID}` 
        };
      }

      // Check if transaction is properly signed
      if (!parsedTx.signature) {
        return { valid: false, error: 'Transaction is not signed' };
      }

      const transaction: BlockchainTransaction = {
        hash: parsedTx.hash!,
        to: parsedTx.to,
        from: parsedTx.from!,
        value: parsedTx.value.toString(),
        gasLimit: parsedTx.gasLimit.toString(),
        gasPrice: parsedTx.gasPrice!.toString(),
        nonce: parsedTx.nonce,
        data: parsedTx.data,
        chainId: Number(parsedTx.chainId!),
      };

      return { valid: true, transaction };
    } catch (error) {
      return { 
        valid: false, 
        error: `Failed to parse transaction: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  // Get current network status
  async getNetworkStatus(): Promise<{
    blockNumber: number;
    gasPrice: string;
    chainId: number;
  }> {
    try {
      const [blockNumber, gasPrice, network] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getFeeData(),
        this.provider.getNetwork(),
      ]);

      return {
        blockNumber,
        gasPrice: gasPrice.gasPrice?.toString() || '0',
        chainId: Number(network.chainId),
      };
    } catch (error) {
      console.error('[tx-broadcaster] Failed to get network status:', error);
      throw new BroadcastError(
        'Failed to get network status',
        'NETWORK_ERROR',
        true,
        error as Error
      );
    }
  }

  // Check if transaction already exists on blockchain
  async transactionExists(transactionHash: string): Promise<boolean> {
    try {
      const receipt = await this.provider.getTransactionReceipt(transactionHash);
      return receipt !== null;
    } catch (error) {
      // If we can't check, assume it doesn't exist and let broadcast handle duplicates
      console.warn(`[tx-broadcaster] Could not check transaction existence for ${transactionHash}:`, error);
      return false;
    }
  }

  private handleBroadcastError(error: any): BroadcastResult {
    let broadcastError: BroadcastError;

    if (error instanceof BroadcastError) {
      broadcastError = error;
    } else if (error.code) {
      // Handle specific ethers.js error codes
      switch (error.code) {
        case 'INSUFFICIENT_FUNDS':
          broadcastError = new BroadcastError(
            'Insufficient funds for transaction',
            'INSUFFICIENT_FUNDS',
            false,
            error
          );
          break;
        case 'NONCE_EXPIRED':
        case 'REPLACEMENT_UNDERPRICED':
          broadcastError = new BroadcastError(
            'Transaction nonce or gas price issue',
            'NONCE_OR_GAS_ERROR',
            true,
            error
          );
          break;
        case 'NETWORK_ERROR':
        case 'SERVER_ERROR':
          broadcastError = new BroadcastError(
            'Network connectivity issue',
            'NETWORK_ERROR',
            true,
            error
          );
          break;
        default:
          broadcastError = new BroadcastError(
            `Blockchain error: ${error.message}`,
            error.code,
            false,
            error
          );
      }
    } else {
      broadcastError = new BroadcastError(
        `Unknown broadcast error: ${error.message || error}`,
        'UNKNOWN_ERROR',
        false,
        error
      );
    }

    return {
      success: false,
      error: broadcastError.message,
    };
  }
}