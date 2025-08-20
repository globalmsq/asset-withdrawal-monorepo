import { DatabaseService } from '@asset-withdrawal/database';
import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';
import { MonitoredTransaction, TransactionStatus } from '../types';
import { config } from '../config';
import { ChainService } from './chain.service';
import { GasRetryService } from './gas-retry.service';

export class MonitorService {
  private prisma: any;
  private chainService: ChainService;
  private gasRetryService: GasRetryService;
  private activeTransactions: Map<string, MonitoredTransaction>;
  private isMonitoring: boolean = false;

  constructor(chainService?: ChainService) {
    this.prisma = DatabaseService.getInstance().getClient();
    // Use injected ChainService or create new one (for backward compatibility)
    this.chainService = chainService || new ChainService();
    this.gasRetryService = new GasRetryService(this.chainService);
    this.activeTransactions = new Map();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('[tx-monitor] Initializing monitor service...');

      // Load pending transactions from database
      await this.loadPendingTransactions();

      // Set up monitoring
      this.isMonitoring = true;

      logger.info(
        `[tx-monitor] Initialized with ${this.activeTransactions.size} active transactions`
      );
    } catch (error) {
      logger.error('[tx-monitor] Failed to initialize:', error);
      throw error;
    }
  }

  private async loadPendingTransactions(): Promise<void> {
    try {
      const pendingTransactions = await this.prisma.sentTransaction.findMany({
        where: {
          status: {
            in: ['BROADCASTED', 'SENT', 'CONFIRMING'],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      for (const tx of pendingTransactions) {
        const monitoredTx: MonitoredTransaction = {
          txHash: tx.sentTxHash,
          requestId: tx.requestId,
          batchId: tx.batchId,
          chain: tx.chain,
          network: tx.network,
          status: tx.status as TransactionStatus,
          blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined,
          confirmations: 0,
          lastChecked: new Date(),
          retryCount: 0,
          nonce: tx.nonce,
        };

        this.activeTransactions.set(tx.sentTxHash, monitoredTx);
      }

      logger.info(
        `[tx-monitor] Loaded ${pendingTransactions.length} pending transactions`
      );
    } catch (error) {
      logger.error('[tx-monitor] Failed to load pending transactions:', error);
      throw error;
    }
  }

  async addTransaction(
    transaction: Partial<MonitoredTransaction>
  ): Promise<void> {
    if (!transaction.txHash) {
      throw new Error('Transaction hash is required');
    }

    const monitoredTx: MonitoredTransaction = {
      txHash: transaction.txHash,
      requestId: transaction.requestId || null,
      batchId: transaction.batchId || null,
      chain: transaction.chain || 'polygon',
      network: transaction.network || 'mainnet',
      status: transaction.status || 'SENT',
      blockNumber: transaction.blockNumber,
      confirmations: transaction.confirmations || 0,
      lastChecked: new Date(),
      retryCount: 0,
      nonce: transaction.nonce || 0,
    };

    // Only add to activeTransactions Map, no DB operations
    this.activeTransactions.set(transaction.txHash, monitoredTx);
    logger.info(
      `[tx-monitor] Added transaction ${transaction.txHash} to active monitoring`
    );
  }

  async checkTransaction(txHash: string): Promise<MonitoredTransaction | null> {
    logger.info(`[tx-monitor] checkTransaction called for ${txHash}`);

    const monitoredTx = this.activeTransactions.get(txHash);
    if (!monitoredTx) {
      logger.warn(
        `[tx-monitor] Transaction ${txHash} not found in active monitoring`
      );
      return null;
    }

    logger.info(
      `[tx-monitor] Found transaction in memory: ${txHash}, status: ${monitoredTx.status}`
    );

    try {
      const provider = await this.chainService.getProvider(
        monitoredTx.chain,
        monitoredTx.network
      );

      // First try to get receipt
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        // Receipt not yet available, but check if transaction is in a block
        const tx = await provider.getTransaction(txHash);

        if (tx && tx.blockNumber) {
          // Transaction is in a block but receipt not yet available
          logger.info(
            `[tx-monitor] Transaction ${txHash} is in block ${tx.blockNumber} but receipt not yet available`
          );

          // Update status to CONFIRMING since it's in a block
          const previousStatus = monitoredTx.status;
          monitoredTx.status = 'CONFIRMING';
          monitoredTx.blockNumber = tx.blockNumber;
          monitoredTx.confirmations = 0;
          monitoredTx.lastChecked = new Date();

          // Update DB if status changed
          if (previousStatus !== monitoredTx.status) {
            await this.updateTransactionStatus(monitoredTx, null);
          }

          return monitoredTx;
        }

        // Transaction not yet mined
        monitoredTx.lastChecked = new Date();
        monitoredTx.retryCount++;
        return monitoredTx;
      }

      // Wait for tx-broadcaster to save to DB
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get current block number for confirmation calculation
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      // Get required confirmations for this chain
      const requiredConfirmations =
        await this.chainService.getRequiredConfirmations(
          monitoredTx.chain,
          monitoredTx.network
        );

      // Update transaction status based on confirmations
      const previousStatus = monitoredTx.status;
      monitoredTx.blockNumber = receipt.blockNumber;
      monitoredTx.confirmations = confirmations;
      monitoredTx.lastChecked = new Date();

      if (receipt.status === 0) {
        // Transaction failed
        monitoredTx.status = 'FAILED';
      } else if (confirmations >= requiredConfirmations) {
        // Transaction fully confirmed
        monitoredTx.status = 'CONFIRMED';
      } else if (confirmations > 0) {
        // Transaction confirming
        monitoredTx.status = 'CONFIRMING';
      }

      // Check for stuck transactions if still pending
      if (
        monitoredTx.status === 'SENT' ||
        monitoredTx.status === 'CONFIRMING'
      ) {
        const isStuck =
          await this.gasRetryService.isTransactionStuck(monitoredTx);
        if (isStuck) {
          logger.warn(
            `[tx-monitor] Transaction ${txHash} appears to be stuck, considering gas retry`
          );
          // Note: In production, you would implement the retry logic here
        }
      }

      // Update database if status changed
      if (previousStatus !== monitoredTx.status) {
        await this.updateTransactionStatus(monitoredTx, receipt);
      }

      // Remove from active monitoring if finalized
      if (
        monitoredTx.status === 'CONFIRMED' ||
        monitoredTx.status === 'FAILED'
      ) {
        this.activeTransactions.delete(txHash);
        logger.info(
          `[tx-monitor] Transaction ${txHash} finalized with status: ${monitoredTx.status}`
        );
      }

      return monitoredTx;
    } catch (error) {
      logger.error(`[tx-monitor] Error checking transaction ${txHash}:`, error);
      monitoredTx.retryCount++;

      // Mark as failed after max retries
      if (monitoredTx.retryCount >= config.monitoring.maxRetries) {
        monitoredTx.status = 'FAILED';
        await this.updateTransactionStatus(monitoredTx, null);
        this.activeTransactions.delete(txHash);
      }

      return monitoredTx;
    }
  }

  // Made public so WebSocket can call directly
  public async updateTransactionStatus(
    transaction: MonitoredTransaction,
    receipt: ethers.TransactionReceipt | null
  ): Promise<void> {
    try {
      logger.info(
        `[tx-monitor] Updating DB status for ${transaction.txHash} to ${transaction.status}`
      );

      // Update database
      await this.prisma.sentTransaction.update({
        where: { sentTxHash: transaction.txHash },
        data: {
          status: transaction.status,
          blockNumber: transaction.blockNumber
            ? BigInt(transaction.blockNumber)
            : null,
          gasUsed: receipt ? receipt.gasUsed.toString() : null,
          confirmedAt: transaction.status === 'CONFIRMED' ? new Date() : null,
          error:
            transaction.status === 'FAILED'
              ? 'Transaction failed on chain'
              : null,
        },
      });

      logger.info(
        `[tx-monitor] Successfully updated ${transaction.txHash} status to ${transaction.status}`
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Record to update not found')
      ) {
        logger.warn(
          `[tx-monitor] Record not found for ${transaction.txHash}, will retry in next polling cycle`
        );
        return; // Don't throw, let polling handle it
      }
      logger.error(`[tx-monitor] Failed to update transaction status:`, error);
      // Don't throw - let monitoring continue
    }
  }

  async checkBatch(
    transactions: string[]
  ): Promise<Map<string, MonitoredTransaction | null>> {
    const results = new Map<string, MonitoredTransaction | null>();

    // Process in parallel with concurrency limit
    const batchSize = config.monitoring.batchSize;
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(txHash => this.checkTransaction(txHash))
      );

      batch.forEach((txHash, index) => {
        results.set(txHash, batchResults[index]);
      });
    }

    return results;
  }

  getActiveTransactions(): Map<string, MonitoredTransaction> {
    return new Map(this.activeTransactions);
  }

  getTransactionsByTier(tier: 'fast' | 'medium' | 'full'): string[] {
    const now = Date.now();
    const tierConfig = config.pollingTiers[tier];

    return Array.from(this.activeTransactions.entries())
      .filter(([_, tx]) => {
        const age = now - tx.lastChecked.getTime();
        return age >= tierConfig.interval && age <= tierConfig.maxAge;
      })
      .map(([txHash, _]) => txHash);
  }

  async shutdown(): Promise<void> {
    logger.info('[tx-monitor] Shutting down monitor service...');

    this.isMonitoring = false;

    // Close connections
    await this.prisma.$disconnect();
    await this.gasRetryService.shutdown();

    logger.info('[tx-monitor] Monitor service shut down');
  }
}
