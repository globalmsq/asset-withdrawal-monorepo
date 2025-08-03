import {
  IQueue,
  ChainProviderFactory,
  ChainProvider,
} from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { BaseWorker, WorkerConfig } from './base-worker';
import { SignedTransaction } from '../types';
import { config } from '../config';
import { TransactionSigner } from '../services/blockchain';

export class TransactionSenderWorker extends BaseWorker<
  SignedTransaction,
  void
> {
  private transactionService: TransactionService;
  private chainProviders: Map<string, ChainProvider>;
  private signers: Map<string, TransactionSigner>;

  constructor(
    workerConfig: WorkerConfig,
    inputQueue: IQueue<SignedTransaction>
  ) {
    super(workerConfig, inputQueue);
    this.transactionService = new TransactionService();
    this.chainProviders = new Map();
    this.signers = new Map();
  }

  protected async process(
    signedTx: SignedTransaction,
    messageId: string
  ): Promise<void> {
    this.logger.info(
      `Broadcasting transaction for request ${signedTx.requestId}`
    );

    try {
      // Step 1: Broadcast transaction to blockchain network
      const txHash = await this.broadcastTransaction(signedTx);

      // Step 2: Update transaction with hash
      await this.transactionService.updateTransactionHash(
        signedTx.requestId,
        txHash
      );

      // Step 3: Update status to PENDING (waiting for confirmation)
      await this.transactionService.updateStatus(signedTx.requestId, 'PENDING');

      this.logger.info(
        `Transaction broadcasted successfully for request ${signedTx.requestId}. Hash: ${txHash}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast transaction for request ${signedTx.requestId}`,
        error
      );

      // Check if it's a recoverable error
      if (this.isRecoverableError(error)) {
        // Re-throw to let SQS retry
        throw error;
      } else {
        // Non-recoverable error, mark as failed
        await this.transactionService.updateStatus(
          signedTx.requestId,
          'FAILED'
        );
        throw error;
      }
    }
  }

  private async getOrCreateSigner(
    chain: string,
    network: string
  ): Promise<{ provider: ChainProvider; signer: TransactionSigner }> {
    const key = `${chain}_${network}`;

    if (!this.chainProviders.has(key)) {
      this.logger.info('Creating new ChainProvider and TransactionSigner', {
        chain,
        network,
      });

      // Create chain provider
      const chainProvider = ChainProviderFactory.getProvider(
        chain as any,
        network as any
      );
      this.chainProviders.set(key, chainProvider);

      // Create transaction signer
      const signer = new TransactionSigner(chainProvider);
      this.signers.set(key, signer);
    }

    return {
      provider: this.chainProviders.get(key)!,
      signer: this.signers.get(key)!,
    };
  }

  private async broadcastTransaction(
    signedTx: SignedTransaction
  ): Promise<string> {
    // Extract chain and network from signed transaction
    // This should be included in the SignedTransaction type
    const chain = (signedTx as any).chain || 'polygon';
    const network = (signedTx as any).network || 'mainnet';

    this.logger.debug(`Broadcasting to ${chain} ${network}`);

    // Get appropriate provider and signer
    const { provider, signer } = await this.getOrCreateSigner(chain, network);

    try {
      // Broadcast the signed transaction
      const txHash = await signer.broadcastTransaction(signedTx.rawTransaction);

      this.logger.info(
        `Transaction broadcasted to ${chain} network. Hash: ${txHash}`
      );

      // Optionally wait for initial confirmation
      const confirmations = 1; // Default confirmations
      if (confirmations > 0) {
        this.logger.debug(`Waiting for ${confirmations} confirmations...`);
        const receipt = await provider.waitForTransaction(
          txHash,
          confirmations
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
