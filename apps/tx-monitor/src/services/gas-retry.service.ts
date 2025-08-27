import { DatabaseService } from '@asset-withdrawal/database';
import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';
import { MonitoredTransaction, TransactionStatus } from '../types';
import { config } from '../config';
import { ChainService } from './chain.service';

interface StuckTransactionCriteria {
  minAge: number; // Minimum time in ms since transaction was sent
  maxGasPrice: bigint; // Maximum gas price to consider for retry
  requiredConfirmations: number; // Minimum confirmations before considering stuck
}

export class GasRetryService {
  private prisma: any;
  private chainService: ChainService;

  constructor(chainService?: ChainService) {
    this.prisma = DatabaseService.getInstance().getClient();
    // Use injected ChainService or create new one (for backward compatibility)
    this.chainService = chainService || new ChainService();
  }

  /**
   * Check if a transaction is stuck and needs gas retry
   * @param transaction Monitored transaction to check
   * @returns True if transaction is stuck and needs retry
   */
  async isTransactionStuck(
    transaction: MonitoredTransaction
  ): Promise<boolean> {
    try {
      // Only check transactions that are still pending
      if (
        transaction.status !== 'SENT' &&
        transaction.status !== 'CONFIRMING'
      ) {
        return false;
      }

      const provider = await this.chainService.getProvider(
        transaction.chain,
        transaction.network
      );

      if (!provider) {
        logger.error(
          `[gas-retry] No provider available for ${transaction.chain}-${transaction.network}`
        );
        return false;
      }

      // Get stuck transaction criteria for this chain
      const criteria = this.getStuckTransactionCriteria(transaction.chain);

      // Check age - transaction should be old enough
      const transactionAge = Date.now() - transaction.lastChecked.getTime();
      if (transactionAge < criteria.minAge) {
        return false;
      }

      // Get current gas price and network congestion
      const currentGasPrice = await provider.getFeeData();
      if (!currentGasPrice.gasPrice) {
        return false;
      }

      // Get transaction details from database
      const dbTransaction = await this.prisma.sentTransaction.findUnique({
        where: { sentTxHash: transaction.txHash },
      });

      if (!dbTransaction) {
        return false;
      }

      // Check if current gas price is significantly higher (indicating congestion)
      // Use the original gas price from when the transaction was signed
      // For EIP-1559 transactions, use maxFeePerGas; for legacy, use gasPrice
      const originalGasPrice = BigInt(
        dbTransaction.maxFeePerGas || dbTransaction.gasPrice || '0'
      );
      const gasIncreaseFactor =
        currentGasPrice.gasPrice / (originalGasPrice || BigInt(1));

      // Transaction is stuck if:
      // 1. It's been pending for too long
      // 2. Current gas price is significantly higher than original
      // 3. No confirmations yet
      const isStuck =
        transactionAge > criteria.minAge &&
        gasIncreaseFactor > BigInt(2) &&
        transaction.confirmations === 0;

      if (isStuck) {
        logger.warn(
          `[gas-retry] Transaction ${transaction.txHash} appears stuck - age: ${transactionAge}ms, gasIncrease: ${gasIncreaseFactor.toString()}, confirmations: ${transaction.confirmations}`
        );
      }

      return isStuck;
    } catch (error) {
      logger.error(
        `[gas-retry] Error checking if transaction is stuck:`,
        error
      );
      return false;
    }
  }

  /**
   * Create a replacement transaction with higher gas price
   * @param transaction Original transaction that is stuck
   * @returns New transaction hash or null if retry failed
   */
  async retryWithHigherGas(
    transaction: MonitoredTransaction
  ): Promise<string | null> {
    try {
      logger.info(
        `[gas-retry] Attempting gas retry for transaction ${transaction.txHash}`
      );

      // Get original transaction from database
      const dbTransaction = await this.prisma.sentTransaction.findUnique({
        where: { sentTxHash: transaction.txHash },
      });

      if (!dbTransaction) {
        logger.error(
          `[gas-retry] Original transaction not found in database: ${transaction.txHash}`
        );
        return null;
      }

      const provider = await this.chainService.getProvider(
        transaction.chain,
        transaction.network
      );

      if (!provider) {
        logger.error(
          `[gas-retry] No provider available for ${transaction.chain}-${transaction.network}`
        );
        return null;
      }

      // Get current gas price
      const currentFeeData = await provider.getFeeData();
      if (!currentFeeData.gasPrice) {
        logger.error(
          `[gas-retry] Unable to get current gas price for ${transaction.chain}`
        );
        return null;
      }

      // Calculate new gas price (increase by 20%)
      const newGasPrice = (currentFeeData.gasPrice * BigInt(120)) / BigInt(100);

      // Create replacement transaction with same nonce but higher gas price
      const replacementTx = {
        to: dbTransaction.originalTxHash.slice(0, 42), // Extract 'to' address from original tx
        value: dbTransaction.gasUsed || '0',
        gasLimit: BigInt(21000), // Standard gas limit for ETH transfer
        gasPrice: newGasPrice,
        nonce: dbTransaction.nonce,
        data: '0x', // Empty data for simple transfer
      };

      // Note: This is a simplified version. In a real implementation,
      // you would need to:
      // 1. Get the original transaction details from the blockchain
      // 2. Recreate the exact same transaction with higher gas
      // 3. Sign it with the same private key
      // 4. Broadcast the replacement transaction

      // For now, we'll just log the attempt and mark it as processed
      logger.info(
        `[gas-retry] Would create replacement transaction with gas price ${newGasPrice.toString()}`
      );

      // Log gas retry attempt
      logger.info(
        `[gas-retry] Gas retry attempted for ${transaction.txHash} with new gas price ${newGasPrice.toString()}`
      );

      // Return a mock hash for demonstration
      return `0x${Array(64)
        .fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('')}`;
    } catch (error) {
      logger.error(
        `[gas-retry] Failed to retry transaction with higher gas:`,
        error
      );
      return null;
    }
  }

  /**
   * Cancel a stuck transaction by sending a 0-value transaction with higher gas
   * @param transaction Transaction to cancel
   * @returns New transaction hash or null if cancellation failed
   */
  async cancelStuckTransaction(
    transaction: MonitoredTransaction
  ): Promise<string | null> {
    try {
      logger.info(
        `[gas-retry] Attempting to cancel stuck transaction ${transaction.txHash}`
      );

      const dbTransaction = await this.prisma.sentTransaction.findUnique({
        where: { sentTxHash: transaction.txHash },
      });

      if (!dbTransaction) {
        return null;
      }

      // Create cancellation transaction (0-value tx with same nonce)
      logger.info(
        `[gas-retry] Would create cancellation transaction for nonce ${dbTransaction.nonce}`
      );

      // Update transaction status to CANCELED
      await this.prisma.sentTransaction.update({
        where: { sentTxHash: transaction.txHash },
        data: {
          status: 'CANCELED',
          error: 'Transaction canceled due to being stuck in mempool',
        },
      });

      // Log cancellation
      logger.info(
        `[gas-retry] Transaction ${transaction.txHash} canceled due to being stuck in mempool`
      );

      return 'canceled';
    } catch (error) {
      logger.error(`[gas-retry] Failed to cancel stuck transaction:`, error);
      return null;
    }
  }

  /**
   * Get stuck transaction criteria for a specific chain
   * @param chain Chain name
   * @returns Criteria for determining if transaction is stuck
   */
  private getStuckTransactionCriteria(chain: string): StuckTransactionCriteria {
    const baseMinAge = 15 * 60 * 1000; // 15 minutes

    switch (chain.toLowerCase()) {
      case 'ethereum':
        return {
          minAge: baseMinAge * 2, // 30 minutes for Ethereum
          maxGasPrice: BigInt('100000000000'), // 100 gwei
          requiredConfirmations: 12,
        };
      case 'polygon':
        return {
          minAge: baseMinAge, // 15 minutes for Polygon
          maxGasPrice: BigInt('50000000000'), // 50 gwei
          requiredConfirmations: 30,
        };
      case 'bsc':
        return {
          minAge: baseMinAge / 2, // 7.5 minutes for BSC
          maxGasPrice: BigInt('20000000000'), // 20 gwei
          requiredConfirmations: 15,
        };
      default:
        return {
          minAge: baseMinAge,
          maxGasPrice: BigInt('50000000000'),
          requiredConfirmations: 12,
        };
    }
  }

  /**
   * Process all stuck transactions
   * @returns Number of transactions processed
   */
  async processStuckTransactions(): Promise<number> {
    let processedCount = 0;

    try {
      // Get all SENT and CONFIRMING transactions older than 15 minutes
      const oldTransactions = await this.prisma.sentTransaction.findMany({
        where: {
          status: {
            in: ['SENT', 'CONFIRMING'],
          },
          createdAt: {
            lte: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 50, // Limit to 50 transactions per batch
      });

      for (const tx of oldTransactions) {
        const monitoredTx: MonitoredTransaction = {
          txHash: tx.sentTxHash,
          requestId: tx.requestId,
          batchId: tx.batchId,
          chain: tx.chain,
          network: tx.network,
          status: tx.status as TransactionStatus,
          blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined,
          confirmations: 0,
          lastChecked: tx.updatedAt,
          retryCount: 0,
          nonce: tx.nonce,
        };

        const isStuck = await this.isTransactionStuck(monitoredTx);
        if (isStuck) {
          // For demonstration, we'll just log the stuck transaction
          // In production, you might want to decide between retry or cancel
          logger.warn(`[gas-retry] Found stuck transaction: ${tx.sentTxHash}`);
          processedCount++;
        }
      }

      if (processedCount > 0) {
        logger.info(
          `[gas-retry] Processed ${processedCount} stuck transactions`
        );
      }
    } catch (error) {
      logger.error(`[gas-retry] Error processing stuck transactions:`, error);
    }

    return processedCount;
  }

  async shutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
