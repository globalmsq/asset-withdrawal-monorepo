import { IQueue, QueueFactory, ChainProviderFactory } from '@asset-withdrawal/shared';
import { DatabaseService, WithdrawalRequestService } from '@asset-withdrawal/database';
import { NonceCacheService } from './nonce-cache.service';
import { Logger } from '../utils/logger';
import { ethers } from 'ethers';

export class QueueRecoveryService {
  private withdrawalRequestService: WithdrawalRequestService;
  private signedTxQueue: IQueue<any>;
  private requestQueue: IQueue<any>;
  private nonceCacheService: NonceCacheService;
  private logger: Logger;
  private dbClient: any;

  constructor(nonceCacheService: NonceCacheService) {
    const dbService = DatabaseService.getInstance();
    this.dbClient = dbService.getClient();
    this.withdrawalRequestService = new WithdrawalRequestService(this.dbClient);
    this.nonceCacheService = nonceCacheService;
    this.signedTxQueue = QueueFactory.createFromEnv('signed-tx-queue');
    this.requestQueue = QueueFactory.createFromEnv('tx-request-queue');
    this.logger = new Logger({ logging: { level: 'info', auditLogPath: './logs/audit.log' } } as any);
  }

  /**
   * Recover messages from signed-tx-queue to request-queue on startup
   * This ensures no transactions are lost during service restarts
   */
  async recoverQueuesOnStartup(): Promise<void> {
    this.logger.info('Starting queue recovery process...');

    try {
      // Get all messages from signed-tx-queue (visibility timeout 0 to see all)
      const messages = await this.signedTxQueue.receiveMessages({ maxMessages: 10 });

      if (messages.length === 0) {
        this.logger.info('No messages found in signed-tx-queue for recovery');
        return;
      }

      this.logger.info(`Found ${messages.length} messages in signed-tx-queue for recovery`);

      for (const message of messages) {
        try {
          const signedTx = message.body;

          // Check transaction type using new message format
          if (signedTx.transactionType === 'BATCH' && signedTx.batchId) {
            await this.recoverBatchTransaction(signedTx.batchId, message.receiptHandle);
          } else if (signedTx.transactionType === 'SINGLE' && signedTx.requestId) {
            // Individual transaction recovery
            await this.recoverIndividualTransaction(signedTx.requestId, message.receiptHandle);
          } else {
            this.logger.error('Invalid message format - missing required fields', {
              transactionType: signedTx.transactionType,
              requestId: signedTx.requestId,
              batchId: signedTx.batchId,
            });
          }
        } catch (error) {
          this.logger.error('Failed to recover message', error);
          // Continue with next message
        }
      }

      this.logger.info('Queue recovery process completed');
    } catch (error) {
      this.logger.error('Queue recovery failed:', error);
      throw error;
    }
  }

  /**
   * Recover individual transaction to request queue
   */
  private async recoverIndividualTransaction(
    withdrawalId: string,
    receiptHandle: string
  ): Promise<void> {
    // Get transaction details from database
    const withdrawalRequest = await this.withdrawalRequestService.getWithdrawalRequestByRequestId(withdrawalId);

    if (!withdrawalRequest) {
      this.logger.warn(`Transaction not found in DB for withdrawal ${withdrawalId}, removing from queue`);
      await this.signedTxQueue.deleteMessage(receiptHandle);
      return;
    }

    // Check if transaction is already completed
    if (withdrawalRequest.status === 'COMPLETED' || withdrawalRequest.status === 'FAILED') {
      this.logger.info(`Transaction ${withdrawalId} already ${withdrawalRequest.status}, removing from queue`);
      await this.signedTxQueue.deleteMessage(receiptHandle);
      return;
    }

    // Restore to request queue
    this.logger.info(`Recovering transaction ${withdrawalId} to request queue`);

    // Create withdrawal request message from data
    const withdrawalRequestMessage = {
      id: withdrawalRequest.requestId,
      amount: withdrawalRequest.amount,
      toAddress: withdrawalRequest.toAddress,
      tokenAddress: withdrawalRequest.tokenAddress,
      symbol: withdrawalRequest.symbol,
      chain: withdrawalRequest.chain,
      network: withdrawalRequest.network,
      createdAt: withdrawalRequest.createdAt,
    };

    // Send to request queue
    await this.requestQueue.sendMessage(withdrawalRequestMessage);

    // Update status to PENDING in database
    await this.withdrawalRequestService.updateStatus(withdrawalId, 'PENDING');

    // Delete from signed-tx-queue
    await this.signedTxQueue.deleteMessage(receiptHandle);

    this.logger.info(`Successfully recovered transaction ${withdrawalId}`);
  }

  /**
   * Recover batch transaction by splitting into individual transactions
   */
  private async recoverBatchTransaction(
    batchId: string,
    receiptHandle: string
  ): Promise<void> {
    this.logger.info(`Recovering batch transaction ${batchId}`);

    try {
      // Get all withdrawal requests associated with this batch
      const batchWithdrawalRequests = await this.dbClient.withdrawalRequest.findMany({
        where: { batchId: batchId },
      });

      if (batchWithdrawalRequests.length === 0) {
        this.logger.warn(`No withdrawal requests found for batch ${batchId}, removing from queue`);
        await this.signedTxQueue.deleteMessage(receiptHandle);
        return;
      }

      this.logger.info(`Found ${batchWithdrawalRequests.length} withdrawal requests in batch ${batchId}`);

      // Check if batch is already completed or failed
      const allCompleted = batchWithdrawalRequests.every(
        (req: any) => req.status === 'COMPLETED' || req.status === 'FAILED'
      );

      if (allCompleted) {
        this.logger.info(`All transactions in batch ${batchId} already completed/failed, removing from queue`);
        await this.signedTxQueue.deleteMessage(receiptHandle);
        return;
      }

      // Update batch transaction status to FAILED
      await this.dbClient.batchTransaction.update({
        where: { id: BigInt(batchId) },
        data: {
          status: 'FAILED',
          errorMessage: 'Recovered during service restart',
        },
      });

      // Recover each withdrawal request individually
      for (const withdrawalRequest of batchWithdrawalRequests) {
        // Skip if already completed or failed
        if (withdrawalRequest.status === 'COMPLETED' || withdrawalRequest.status === 'FAILED') {
          this.logger.info(`Skipping ${withdrawalRequest.requestId} - already ${withdrawalRequest.status}`);
          continue;
        }

        // Create withdrawal request message
        const withdrawalRequestMessage = {
          id: withdrawalRequest.requestId,
          amount: withdrawalRequest.amount,
          toAddress: withdrawalRequest.toAddress,
          tokenAddress: withdrawalRequest.tokenAddress,
          symbol: withdrawalRequest.symbol,
          chain: withdrawalRequest.chain,
          network: withdrawalRequest.network,
          createdAt: withdrawalRequest.createdAt,
        };

        // Send to request queue
        await this.requestQueue.sendMessage(withdrawalRequestMessage);
        this.logger.info(`Sent ${withdrawalRequest.requestId} to request queue`);
      }

      // Update all withdrawal requests to PENDING and remove batchId
      await this.dbClient.withdrawalRequest.updateMany({
        where: {
          batchId: batchId,
          status: { notIn: ['COMPLETED', 'FAILED'] },
        },
        data: {
          status: 'PENDING',
          batchId: null,
          processingMode: 'SINGLE',
          errorMessage: 'Recovered from batch during service restart',
        },
      });

      // Delete from signed-tx-queue
      await this.signedTxQueue.deleteMessage(receiptHandle);

      this.logger.info(`Successfully recovered batch ${batchId} with ${batchWithdrawalRequests.length} transactions`);
    } catch (error) {
      this.logger.error(`Failed to recover batch ${batchId}:`, error);
      throw error;
    }
  }

  /**
   * Sync blockchain nonce with Redis cache
   * This ensures nonce consistency after service restarts
   */
  async syncNonceWithBlockchain(
    signerAddress: string,
    chains: { chain: string; network: string }[]
  ): Promise<void> {
    this.logger.info('Starting nonce synchronization with blockchain...');

    for (const { chain, network } of chains) {
      try {
        // Get provider for this chain/network
        const chainProvider = ChainProviderFactory.getProvider(chain as any, network as any);
        const provider = chainProvider.getProvider();

        // Get current nonce from blockchain
        const blockchainNonce = await provider.getTransactionCount(signerAddress, 'latest');

        // Get current nonce from cache
        const cachedNonce = await this.nonceCacheService.getCurrentNonce(
          chain,
          network,
          signerAddress
        );

        this.logger.info(`Nonce sync for ${chain}/${network}/${signerAddress}:`, {
          blockchain: blockchainNonce,
          cached: cachedNonce,
        });

        // If blockchain nonce is higher, update cache
        if (blockchainNonce > cachedNonce) {
          await this.nonceCacheService.setNonce(
            chain,
            network,
            signerAddress,
            blockchainNonce
          );
          this.logger.info(`Updated nonce cache to ${blockchainNonce} for ${chain}/${network}`);
        }
      } catch (error) {
        this.logger.error(`Failed to sync nonce for ${chain}/${network}:`, error);
        // Continue with other chains
      }
    }

    this.logger.info('Nonce synchronization completed');
  }

  /**
   * Handle nonce collision by recovering transaction to request queue
   */
  async handleNonceCollision(
    withdrawalId: string,
    receiptHandle?: string
  ): Promise<void> {
    this.logger.warn(`Handling nonce collision for withdrawal ${withdrawalId}`);

    try {
      // Get transaction details from database
      const withdrawalRequest = await this.withdrawalRequestService.getWithdrawalRequestByRequestId(withdrawalId);

      if (!withdrawalRequest) {
        this.logger.error(`Transaction not found for withdrawal ${withdrawalId}`);
        return;
      }

      // Create withdrawal request message from data
      const withdrawalRequestMessage = {
        id: withdrawalRequest.requestId,
        amount: withdrawalRequest.amount,
        toAddress: withdrawalRequest.toAddress,
        tokenAddress: withdrawalRequest.tokenAddress,
        symbol: withdrawalRequest.symbol,
        chain: withdrawalRequest.chain,
        network: withdrawalRequest.network,
        createdAt: withdrawalRequest.createdAt,
      };

      // Send back to request queue
      await this.requestQueue.sendMessage(withdrawalRequestMessage);

      // Update status to PENDING
      await this.withdrawalRequestService.updateStatus(withdrawalId, 'PENDING');

      // Delete from signed-tx-queue if receipt handle provided
      if (receiptHandle) {
        await this.signedTxQueue.deleteMessage(receiptHandle);
      }

      this.logger.info(`Successfully recovered transaction ${withdrawalId} after nonce collision`);
    } catch (error) {
      this.logger.error(`Failed to handle nonce collision for ${withdrawalId}:`, error);
      throw error;
    }
  }

  /**
   * Recover transaction to request queue on error
   */
  async recoverTransactionOnError(
    withdrawalId: string,
    error: any,
    receiptHandle?: string
  ): Promise<void> {
    const errorMessage = error.message || error.toString();
    this.logger.warn(`Recovering transaction ${withdrawalId} due to error: ${errorMessage}`);

    // Check if it's a recoverable error
    const recoverableErrors = [
      'insufficient balance',
      'insufficient funds',
      'insufficient allowance',
      'gas required exceeds',
      'nonce too low',
      'nonce has already been used',
    ];

    const isRecoverable = recoverableErrors.some(err =>
      errorMessage.toLowerCase().includes(err)
    );

    if (!isRecoverable) {
      this.logger.error(`Non-recoverable error for ${withdrawalId}: ${errorMessage}`);
      // Update status to FAILED for non-recoverable errors
      await this.withdrawalRequestService.updateStatus(withdrawalId, 'FAILED');
      return;
    }

    // Recover to request queue
    await this.handleNonceCollision(withdrawalId, receiptHandle);
  }
}
