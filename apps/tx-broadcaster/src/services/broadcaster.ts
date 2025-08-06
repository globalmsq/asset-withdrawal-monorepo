import { ethers } from 'ethers';
import { loadConfig } from '../config';
import {
  BroadcastResult,
  BroadcastError,
  BlockchainTransaction,
} from '../types';
import {
  getChainConfigService,
  ChainConfigService,
} from './chain-config.service';
import { TransactionService } from './transaction.service';
import { LoggerService } from '@asset-withdrawal/shared';

export class TransactionBroadcaster {
  private chainConfigService: ChainConfigService;
  private defaultProvider: ethers.JsonRpcProvider;
  private transactionService: TransactionService;
  private config = loadConfig();
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService({ service: 'tx-broadcaster:Broadcaster' });
    this.chainConfigService = getChainConfigService();
    // 기본 프로바이더 (환경변수 기반)
    this.defaultProvider = new ethers.JsonRpcProvider(this.config.RPC_URL);
    // 트랜잭션 상태 관리 서비스
    this.transactionService = new TransactionService();

    // 지원되는 체인 정보 로깅
    this.chainConfigService.logSupportedChains();
  }

  // Broadcast a signed transaction to the blockchain
  async broadcastTransaction(
    signedTransaction: string,
    chainId?: number
  ): Promise<BroadcastResult> {
    let txChainId: number | undefined;
    try {
      // Parse the signed transaction to validate it
      const parsedTx = ethers.Transaction.from(signedTransaction);
      txChainId = chainId || Number(parsedTx.chainId);

      // 체인 ID에 맞는 프로바이더 선택
      const provider = this.getProviderForChain(txChainId);
      if (!provider) {
        return {
          success: false,
          error: `Unsupported chain ID: ${txChainId}. Supported chains: ${this.chainConfigService.getSupportedChainIds().join(', ')}`,
        };
      }

      // Send the transaction
      const response = await provider.broadcastTransaction(signedTransaction);

      this.logger.info('Transaction broadcasted successfully', {
        transactionHash: response.hash,
        chainId: txChainId,
      });

      return {
        success: true,
        transactionHash: response.hash,
      };
    } catch (error) {
      this.logger.error('Broadcast error', error, {
        chainId: txChainId,
        metadata: {
          signedTxLength: signedTransaction.length,
        },
      });
      return this.handleBroadcastError(error);
    }
  }

  // Wait for transaction confirmation (optional - might be handled by tx-monitor service)
  async waitForConfirmation(
    transactionHash: string,
    chainId: number,
    confirmations: number = 1,
    timeoutMs: number = 300000 // 5 minutes
  ): Promise<BroadcastResult> {
    try {
      // Wait for transaction confirmations

      const provider = this.getProviderForChain(chainId);
      if (!provider) {
        return {
          success: false,
          error: `Unsupported chain ID for confirmation: ${chainId}`,
        };
      }

      const receipt = await provider.waitForTransaction(
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
      this.logger.error('Confirmation error', error, {
        transactionHash,
        chainId,
        metadata: {
          confirmations,
          timeoutMs,
        },
      });
      return this.handleBroadcastError(error);
    }
  }

  // Validate transaction before broadcasting
  async validateTransaction(
    signedTransaction: string,
    expectedChainId?: number
  ): Promise<{
    valid: boolean;
    error?: string;
    transaction?: BlockchainTransaction;
  }> {
    try {
      // Debug: Check if signedTransaction is valid
      if (!signedTransaction || typeof signedTransaction !== 'string') {
        return {
          valid: false,
          error: `Invalid signed transaction: expected string, got ${typeof signedTransaction}`,
        };
      }

      if (!signedTransaction.startsWith('0x')) {
        return {
          valid: false,
          error: 'Signed transaction must start with 0x',
        };
      }

      const parsedTx = ethers.Transaction.from(signedTransaction);
      const txChainId = Number(parsedTx.chainId);

      // Basic validation
      if (!parsedTx.to) {
        return {
          valid: false,
          error: 'Transaction must have a recipient address',
        };
      }

      if (!parsedTx.value || parsedTx.value < 0) {
        return {
          valid: false,
          error: 'Transaction value must be non-negative',
        };
      }

      // 체인 ID 검증 (동적)
      if (expectedChainId && txChainId !== expectedChainId) {
        return {
          valid: false,
          error: `Transaction chain ID ${txChainId} does not match expected ${expectedChainId}`,
        };
      }

      // 지원되는 체인인지 확인
      if (!this.chainConfigService.isChainSupported(txChainId)) {
        return {
          valid: false,
          error: `Unsupported chain ID: ${txChainId}. Supported chains: ${this.chainConfigService.getSupportedChainIds().join(', ')}`,
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
        chainId: txChainId,
      };

      return { valid: true, transaction };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Get current network status for a specific chain
  async getNetworkStatus(chainId?: number): Promise<{
    blockNumber: number;
    gasPrice: string;
    chainId: number;
  }> {
    try {
      const provider = chainId
        ? this.getProviderForChain(chainId)
        : this.defaultProvider;

      if (!provider) {
        throw new BroadcastError(
          `No provider available for chain ID: ${chainId}`,
          'PROVIDER_ERROR',
          false
        );
      }

      const [blockNumber, gasPrice, network] = await Promise.all([
        provider.getBlockNumber(),
        provider.getFeeData(),
        provider.getNetwork(),
      ]);

      return {
        blockNumber,
        gasPrice: gasPrice.gasPrice?.toString() || '0',
        chainId: Number(network.chainId),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get network status for chain ${chainId}`,
        error
      );
      throw new BroadcastError(
        'Failed to get network status',
        'NETWORK_ERROR',
        true,
        error as Error
      );
    }
  }

  // Check if transaction already exists on blockchain
  async transactionExists(
    transactionHash: string,
    chainId?: number
  ): Promise<boolean> {
    try {
      const provider = chainId
        ? this.getProviderForChain(chainId)
        : this.defaultProvider;

      if (!provider) {
        this.logger.warn(
          `No provider available for chain ${chainId}, assuming transaction doesn't exist`
        );
        return false;
      }

      const receipt = await provider.getTransactionReceipt(transactionHash);
      return receipt !== null;
    } catch (error) {
      // If we can't check, assume it doesn't exist and let broadcast handle duplicates
      this.logger.warn(
        `Could not check transaction existence for ${transactionHash} on chain ${chainId}`,
        {
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        }
      );
      return false;
    }
  }

  /**
   * 체인 ID에 해당하는 프로바이더를 가져옵니다
   * 환경변수가 설정된 경우 우선 사용합니다
   */
  private getProviderForChain(chainId: number): ethers.JsonRpcProvider | null {
    // 환경변수로 설정된 체인 ID와 일치하면 기본 프로바이더 사용
    if (chainId === this.config.CHAIN_ID) {
      return this.defaultProvider;
    }

    // chains.config.json에서 프로바이더 가져오기
    return this.chainConfigService.getProvider(chainId);
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

  /**
   * Broadcast signed transaction with automatic state management
   * Implements transaction lifecycle: SIGNED → BROADCASTING → BROADCASTED/FAILED
   */
  async broadcastTransactionWithStateManagement(
    requestId: string,
    signedTransaction: string,
    chainId?: number
  ): Promise<BroadcastResult> {
    try {
      // 1. Update status to BROADCASTING before broadcast
      await this.transactionService.updateToBroadcasting(requestId);

      // 2. Perform the broadcast
      const result = await this.broadcastTransaction(
        signedTransaction,
        chainId
      );

      if (result.success && result.transactionHash) {
        // 3. Update status to BROADCASTED on success
        await this.transactionService.updateToBroadcasted(
          requestId,
          result.transactionHash,
          new Date()
        );

        return result;
      } else {
        // 4. Update status to FAILED on broadcast failure
        const errorMessage = result.error || 'Unknown broadcast error';
        await this.transactionService.updateToFailed(requestId, errorMessage);

        return result;
      }
    } catch (error) {
      // 5. Handle unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Unexpected error for withdrawal ${requestId}`, error);

      try {
        await this.transactionService.updateToFailed(requestId, errorMessage);
      } catch (dbError) {
        this.logger.error(`Failed to update ${requestId} to FAILED`, dbError);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Broadcast batch transaction with automatic state management
   * Implements batch transaction lifecycle: SIGNED → BROADCASTING → BROADCASTED/FAILED
   */
  async broadcastBatchTransactionWithStateManagement(
    batchId: string,
    signedTransaction: string,
    chainId?: number
  ): Promise<BroadcastResult> {
    try {
      // 1. Update batch status to BROADCASTING before broadcast
      await this.transactionService.updateBatchToBroadcasting(batchId);

      // 2. Perform the broadcast
      const result = await this.broadcastTransaction(
        signedTransaction,
        chainId
      );

      if (result.success && result.transactionHash) {
        // 3. Update batch status to BROADCASTED on success
        await this.transactionService.updateBatchToBroadcasted(
          batchId,
          result.transactionHash,
          new Date()
        );

        return result;
      } else {
        // 4. Update batch status to FAILED on broadcast failure
        const errorMessage = result.error || 'Unknown broadcast error';
        await this.transactionService.updateBatchToFailed(
          batchId,
          errorMessage
        );

        return result;
      }
    } catch (error) {
      // 5. Handle unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Unexpected error for batch ${batchId}`, error);

      try {
        await this.transactionService.updateBatchToFailed(
          batchId,
          errorMessage
        );
      } catch (dbError) {
        this.logger.error(
          `Failed to update batch ${batchId} to FAILED`,
          dbError
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get withdrawal request status
   * Utility method for checking transaction state
   */
  async getTransactionStatus(requestId: string) {
    return await this.transactionService.getWithdrawalRequest(requestId);
  }

  /**
   * Get batch transaction status
   * Utility method for checking batch transaction state
   */
  async getBatchTransactionStatus(batchId: string) {
    return await this.transactionService.getBatchWithdrawalRequests(batchId);
  }
}
