import {
  WithdrawalRequestService,
  SignedSingleTransactionService,
  SignedBatchTransactionService,
  SentTransactionService,
} from '@asset-withdrawal/database';
import { LoggerService } from '@asset-withdrawal/shared';

/**
 * TransactionService for TX Broadcaster
 *
 * Manages transaction state transitions according to the transaction lifecycle:
 * SIGNED → BROADCASTING → BROADCASTED/FAILED
 *
 * This service coordinates between WithdrawalRequest and SignedTransaction tables
 * to maintain consistent state during the broadcasting phase.
 */
export class TransactionService {
  private withdrawalService: WithdrawalRequestService;
  private singleTxService: SignedSingleTransactionService;
  private batchTxService: SignedBatchTransactionService;
  private sentTxService: SentTransactionService;
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService({
      service: 'tx-broadcaster:TransactionService',
    });
    this.withdrawalService = new WithdrawalRequestService();
    this.singleTxService = new SignedSingleTransactionService();
    this.batchTxService = new SignedBatchTransactionService();
    this.sentTxService = new SentTransactionService();
  }

  /**
   * Update transaction status from SIGNED to BROADCASTING
   * Called before broadcasting to blockchain
   */
  async updateToBroadcasting(requestId: string): Promise<void> {
    try {
      // Update WithdrawalRequest status
      await this.withdrawalService.updateStatus(requestId, 'BROADCASTING');

      // Update SignedSingleTransaction status if exists
      const signedTx =
        await this.singleTxService.getLatestByRequestId(requestId);
      if (signedTx) {
        await this.singleTxService.updateStatus(signedTx.id, {
          status: 'BROADCASTING',
        });
      }

      this.logger.info('Transaction status updated to BROADCASTING', {
        requestId,
      });
    } catch (error) {
      this.logger.error('Failed to update transaction to BROADCASTING', error, {
        requestId,
      });
      throw error;
    }
  }

  /**
   * Update transaction status from BROADCASTING to BROADCASTED
   * Called after successful blockchain broadcast
   */
  async updateToBroadcasted(
    requestId: string,
    txHash: string,
    broadcastedAt: Date = new Date()
  ): Promise<void> {
    try {
      // Update WithdrawalRequest status
      await this.withdrawalService.updateStatus(requestId, 'BROADCASTED');

      // Update SignedSingleTransaction with txHash and broadcastedAt
      const signedTx =
        await this.singleTxService.getLatestByRequestId(requestId);
      if (signedTx) {
        await this.singleTxService.updateStatus(signedTx.id, {
          status: 'BROADCASTED',
          broadcastedAt,
        });

        // Update txHash if not already set (txHash should already be set during signing)
        // Note: In the current schema, txHash is set during signing phase
      }

      this.logger.info('Transaction status updated to BROADCASTED', {
        requestId,
        metadata: {
          txHash,
          broadcastedAt: broadcastedAt.toISOString(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to update transaction to BROADCASTED', error, {
        requestId,
        metadata: {
          txHash,
        },
      });
      throw error;
    }
  }

  /**
   * Update transaction status to FAILED
   * Called when broadcasting fails
   */
  async updateToFailed(requestId: string, errorMessage: string): Promise<void> {
    try {
      // Update WithdrawalRequest with error
      await this.withdrawalService.updateStatusWithError(
        requestId,
        'FAILED',
        errorMessage
      );

      // Update SignedSingleTransaction status
      const signedTx =
        await this.singleTxService.getLatestByRequestId(requestId);
      if (signedTx) {
        await this.singleTxService.updateStatus(signedTx.id, {
          status: 'FAILED',
          errorMessage,
        });
      }

      this.logger.warn('Transaction status updated to FAILED', {
        requestId,
        metadata: {
          errorMessage,
        },
      });
    } catch (error) {
      this.logger.error('Failed to update transaction to FAILED', error, {
        requestId,
        metadata: {
          originalError: errorMessage,
        },
      });
      throw error;
    }
  }

  /**
   * Update batch transactions from SIGNED to BROADCASTING
   * Called before broadcasting batch transaction to blockchain
   * Note: BatchId is used to group withdrawal requests, not directly linked to SignedBatchTransaction
   * SignedBatchTransaction will be updated later when we have the txHash
   */
  async updateBatchToBroadcasting(batchId: string): Promise<void> {
    try {
      // Update all WithdrawalRequests in the batch
      await this.withdrawalService.updateBatchStatus(batchId, 'BROADCASTING');

      // Note: SignedBatchTransaction status update is deferred until we have the txHash
      // It will be updated in updateBatchToBroadcasted or updateBatchToFailed

      this.logger.info('Batch status updated to BROADCASTING', {
        metadata: {
          batchId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to update batch to BROADCASTING', error, {
        metadata: {
          batchId,
        },
      });
      throw error;
    }
  }

  /**
   * Update batch transactions from BROADCASTING to BROADCASTED
   * Called after successful batch broadcast
   * Note: Updates SignedBatchTransaction by txHash since it's created during signing phase
   */
  async updateBatchToBroadcasted(
    batchId: string,
    txHash: string,
    broadcastedAt: Date = new Date()
  ): Promise<void> {
    try {
      // Update all WithdrawalRequests in the batch
      await this.withdrawalService.updateBatchStatus(batchId, 'BROADCASTED');

      // Update the SignedBatchTransaction record if it exists
      // Find and update SignedBatchTransaction by txHash
      const updatedBatchTx =
        await this.batchTxService.updateBatchStatusByTxHash(
          txHash,
          'BROADCASTED',
          broadcastedAt
        );

      if (!updatedBatchTx) {
        this.logger.warn('SignedBatchTransaction not found for txHash', {
          metadata: {
            txHash,
            batchId,
          },
        });
      }

      this.logger.info('Batch status updated to BROADCASTED', {
        metadata: {
          batchId,
          txHash,
          broadcastedAt: broadcastedAt.toISOString(),
          signedBatchTxUpdated: !!updatedBatchTx,
        },
      });
    } catch (error) {
      this.logger.error('Failed to update batch to BROADCASTED', error, {
        metadata: {
          batchId,
          txHash,
        },
      });
      throw error;
    }
  }

  /**
   * Update batch transactions to FAILED
   * Called when batch broadcasting fails
   */
  async updateBatchToFailed(
    batchId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      // Update all WithdrawalRequests in the batch with error
      await this.withdrawalService.updateBatchStatusWithError(
        batchId,
        'FAILED',
        errorMessage
      );

      this.logger.warn('Batch status updated to FAILED', {
        metadata: {
          batchId,
          errorMessage,
        },
      });
    } catch (error) {
      this.logger.error('Failed to update batch to FAILED', error, {
        metadata: {
          batchId,
          originalError: errorMessage,
        },
      });
      throw error;
    }
  }

  /**
   * Get withdrawal request by requestId
   * Utility method for checking transaction state
   */
  async getWithdrawalRequest(requestId: string) {
    return await this.withdrawalService.getWithdrawalRequestByRequestId(
      requestId
    );
  }

  /**
   * Get batch withdrawal requests by batchId
   * Utility method for checking batch transaction state
   */
  async getBatchWithdrawalRequests(batchId: string) {
    return await this.withdrawalService.getWithdrawalRequestsByBatchId(batchId);
  }

  /**
   * Save a sent transaction record
   * Called after successful broadcast to blockchain
   */
  async saveSentTransaction(data: {
    requestId?: string;
    batchId?: string;
    transactionType: 'SINGLE' | 'BATCH';
    originalTxHash: string;
    sentTxHash: string;
    chainId: number;
    blockNumber?: number;
  }) {
    try {
      const sentTransaction = await this.sentTxService.create({
        ...data,
        blockNumber: data.blockNumber ? BigInt(data.blockNumber) : undefined,
        status: 'SENT',
        sentAt: new Date(),
      });

      this.logger.info('Sent transaction saved successfully', {
        requestId: data.requestId,
        chainId: data.chainId,
        metadata: {
          batchId: data.batchId,
          transactionType: data.transactionType,
          sentTxHash: data.sentTxHash,
        },
      });

      return sentTransaction;
    } catch (error) {
      this.logger.error('Failed to save sent transaction', error, {
        requestId: data.requestId,
        metadata: {
          batchId: data.batchId,
          transactionType: data.transactionType,
        },
      });
      throw error;
    }
  }

  /**
   * Check if a transaction has been sent
   */
  async isTransactionSent(originalTxHash: string): Promise<boolean> {
    return await this.sentTxService.isSent(originalTxHash);
  }

  /**
   * Get sent transaction by request ID
   */
  async getSentTransactionByRequestId(requestId: string) {
    return await this.sentTxService.getByRequestId(requestId);
  }

  /**
   * Update sent transaction status
   */
  async updateSentTransactionStatus(
    sentTxHash: string,
    status: 'CONFIRMED' | 'FAILED',
    data?: {
      blockNumber?: number;
      gasUsed?: string;
      error?: string;
    }
  ) {
    try {
      if (status === 'CONFIRMED' && data?.blockNumber) {
        return await this.sentTxService.markAsConfirmed(
          sentTxHash,
          BigInt(data.blockNumber),
          data.gasUsed
        );
      } else if (status === 'FAILED' && data?.error) {
        return await this.sentTxService.markAsFailed(sentTxHash, data.error);
      }
    } catch (error) {
      this.logger.error('Failed to update sent transaction status', error, {
        metadata: {
          sentTxHash,
          status,
          blockNumber: data?.blockNumber,
          error: data?.error,
        },
      });
      throw error;
    }
  }
}
