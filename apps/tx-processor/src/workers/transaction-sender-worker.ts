import { IQueue } from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { BaseWorker, WorkerConfig } from './base-worker';
import { SignedTransaction } from '../types';
import { config } from '../config';
import { PolygonProvider, TransactionSigner } from '../services/blockchain';

export class TransactionSenderWorker extends BaseWorker<
  SignedTransaction,
  void
> {
  private transactionService: TransactionService;
  private polygonProvider: PolygonProvider;
  private transactionSigner: TransactionSigner;

  constructor(
    workerConfig: WorkerConfig,
    inputQueue: IQueue<SignedTransaction>
  ) {
    super(workerConfig, inputQueue);
    this.transactionService = new TransactionService();
    this.polygonProvider = new PolygonProvider();
    this.transactionSigner = new TransactionSigner(this.polygonProvider);
  }

  protected async process(
    signedTx: SignedTransaction,
    messageId: string
  ): Promise<void> {
    this.logger.info(
      `Broadcasting transaction for withdrawal ${signedTx.withdrawalId}`
    );

    try {
      // Step 1: Broadcast transaction to Polygon network
      const txHash = await this.broadcastTransaction(signedTx);

      // Step 2: Update transaction with hash
      await this.transactionService.updateTransactionHash(
        signedTx.withdrawalId,
        txHash
      );

      // Step 3: Update status to PENDING (waiting for confirmation)
      await this.transactionService.updateStatus(
        signedTx.withdrawalId,
        'PENDING'
      );

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
        await this.transactionService.updateStatus(
          signedTx.withdrawalId,
          'FAILED'
        );
        throw error;
      }
    }
  }

  private async broadcastTransaction(
    signedTx: SignedTransaction
  ): Promise<string> {
    this.logger.debug(`Broadcasting to Polygon ${config.polygon.network}`);

    try {
      // Broadcast the signed transaction
      const txHash = await this.transactionSigner.broadcastTransaction(
        signedTx.signedTx
      );

      this.logger.info(
        `Transaction broadcasted to Polygon network. Hash: ${txHash}`
      );

      // Optionally wait for initial confirmation
      if (config.polygon.confirmations > 0) {
        this.logger.debug(
          `Waiting for ${config.polygon.confirmations} confirmations...`
        );
        const receipt = await this.polygonProvider.waitForTransaction(
          txHash,
          1
        );

        if (receipt && receipt.status === 0) {
          throw new Error('Transaction failed on-chain');
        }
      }

      return txHash;
    } catch (error) {
      this.logger.error('Failed to broadcast transaction', error);

      // Check if it's a nonce error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code;

      if (errorMessage.includes('nonce') || errorCode === 'NONCE_EXPIRED') {
        // This is recoverable, the nonce manager will handle it
        throw error;
      }

      // Check if it's insufficient funds
      if (errorMessage.includes('insufficient funds')) {
        // This needs manual intervention
        throw new Error('Insufficient funds in wallet');
      }

      throw error;
    }
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
    return recoverableErrors.some(err =>
      errorMessage.includes(err.toLowerCase())
    );
  }
}
