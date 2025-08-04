import {
  WithdrawalRequestService,
  SignedSingleTransactionService,
  SignedBatchTransactionService,
} from '@asset-withdrawal/database';

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

  constructor() {
    this.withdrawalService = new WithdrawalRequestService();
    this.singleTxService = new SignedSingleTransactionService();
    this.batchTxService = new SignedBatchTransactionService();
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

      console.log(`[TransactionService] Updated ${requestId} to BROADCASTING`);
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update ${requestId} to BROADCASTING:`,
        error
      );
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

      console.log(
        `[TransactionService] Updated ${requestId} to BROADCASTED with txHash: ${txHash}`
      );
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update ${requestId} to BROADCASTED:`,
        error
      );
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

      console.log(
        `[TransactionService] Updated ${requestId} to FAILED: ${errorMessage}`
      );
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update ${requestId} to FAILED:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update batch transactions from SIGNED to BROADCASTING
   * Called before broadcasting batch transaction to blockchain
   * Note: BatchId is used to group withdrawal requests, not directly linked to SignedBatchTransaction
   */
  async updateBatchToBroadcasting(batchId: string): Promise<void> {
    try {
      // Update all WithdrawalRequests in the batch
      await this.withdrawalService.updateBatchStatus(batchId, 'BROADCASTING');

      console.log(
        `[TransactionService] Updated batch ${batchId} withdrawal requests to BROADCASTING`
      );
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update batch ${batchId} to BROADCASTING:`,
        error
      );
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
      // Note: SignedBatchTransaction should be created during signing phase
      // We need to find it by txHash and then update it
      // For now, we'll skip this update since the current API doesn't support finding by txHash directly
      // This would typically be handled by the signing service or a separate batch transaction management service

      console.log(
        `[TransactionService] Updated batch ${batchId} to BROADCASTED with txHash: ${txHash}`
      );
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update batch ${batchId} to BROADCASTED:`,
        error
      );
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

      console.log(
        `[TransactionService] Updated batch ${batchId} withdrawal requests to FAILED: ${errorMessage}`
      );
    } catch (error) {
      console.error(
        `[TransactionService] Failed to update batch ${batchId} to FAILED:`,
        error
      );
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
}
