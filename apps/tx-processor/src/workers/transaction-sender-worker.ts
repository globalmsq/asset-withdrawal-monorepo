import { IQueue } from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { BaseWorker, WorkerConfig } from './base-worker';
import { SignedTransaction } from '../types';
import { config } from '../config';

export class TransactionSenderWorker extends BaseWorker<SignedTransaction, void> {
  private transactionService: TransactionService;

  constructor(
    workerConfig: WorkerConfig,
    inputQueue: IQueue<SignedTransaction>
  ) {
    super(workerConfig, inputQueue);
    this.transactionService = new TransactionService();
  }

  protected async process(
    signedTx: SignedTransaction,
    messageId: string
  ): Promise<void> {
    this.logger.info(`Broadcasting transaction for withdrawal ${signedTx.withdrawalId}`);

    try {
      // Step 1: Broadcast transaction to Polygon network
      const txHash = await this.broadcastTransaction(signedTx);

      // Step 2: Update transaction with hash
      await this.transactionService.updateTransactionHash(
        signedTx.withdrawalId,
        txHash
      );

      // Step 3: Update status to PENDING (waiting for confirmation)
      await this.transactionService.updateStatus(signedTx.withdrawalId, 'PENDING');

      this.logger.info(
        `Transaction broadcasted successfully for withdrawal ${signedTx.withdrawalId}. Hash: ${txHash}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast transaction for withdrawal ${signedTx.withdrawalId}`,
        error
      );

      // Check if it's a recoverable error
      if (this.isRecoverableError(error)) {
        // Re-throw to let SQS retry
        throw error;
      } else {
        // Non-recoverable error, mark as failed
        await this.transactionService.updateStatus(signedTx.withdrawalId, 'FAILED');
        throw error;
      }
    }
  }

  private async broadcastTransaction(signedTx: SignedTransaction): Promise<string> {
    // TODO: Implement actual transaction broadcasting using ethers.js
    // For now, return mock transaction hash
    
    this.logger.debug(`Broadcasting to Polygon ${config.polygon.network}`);
    this.logger.debug(`RPC URL: ${config.polygon.rpcUrl}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock transaction hash
    const mockHash = '0x' + 
      Buffer.from(`${signedTx.withdrawalId}-${Date.now()}`).toString('hex').padEnd(64, '0');
    
    return mockHash;
  }

  private isRecoverableError(error: any): boolean {
    // Define recoverable errors
    const recoverableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'insufficient funds',
      'nonce too low',
      'replacement transaction underpriced',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return recoverableErrors.some(err => errorMessage.includes(err.toLowerCase()));
  }
}