import { PrismaClient } from '@asset-withdrawal/database';
import { ethers } from 'ethers';
import Redis from 'ioredis';
import { logger } from '@asset-withdrawal/shared';
import {
  MonitoredTransaction,
  TransactionStatus,
  TransactionReceipt,
  StatusUpdateMessage,
} from '../types';
import { config } from '../config';
import { ChainService } from './chain.service';
import { GasRetryService } from './gas-retry.service';

export class MonitorService {
  private prisma: PrismaClient;
  private redis: Redis;
  private chainService: ChainService;
  private gasRetryService: GasRetryService;
  private activeTransactions: Map<string, MonitoredTransaction>;
  private isMonitoring: boolean = false;
  private monitoringIntervals: NodeJS.Timeout[] = [];

  constructor() {
    this.prisma = new PrismaClient();
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });
    this.chainService = new ChainService();
    this.gasRetryService = new GasRetryService();
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
            in: ['SENT', 'CONFIRMING'],
          },
        },
        orderBy: {
          sentAt: 'asc',
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
          confirmations: 0, // tx.confirmations, // TODO: Fix Prisma schema sync
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

    this.activeTransactions.set(transaction.txHash, monitoredTx);
    logger.info(
      `[tx-monitor] Added transaction ${transaction.txHash} for monitoring`
    );
  }

  async checkTransaction(txHash: string): Promise<MonitoredTransaction | null> {
    const monitoredTx = this.activeTransactions.get(txHash);
    if (!monitoredTx) {
      logger.warn(
        `[tx-monitor] Transaction ${txHash} not found in active monitoring`
      );
      return null;
    }

    try {
      const provider = await this.chainService.getProvider(
        monitoredTx.chain,
        monitoredTx.network
      );
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        // Transaction not yet mined
        monitoredTx.lastChecked = new Date();
        monitoredTx.retryCount++;
        return monitoredTx;
      }

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

  private async updateTransactionStatus(
    transaction: MonitoredTransaction,
    receipt: ethers.TransactionReceipt | null
  ): Promise<void> {
    try {
      // Update database
      await this.prisma.sentTransaction.update({
        where: { sentTxHash: transaction.txHash },
        data: {
          status: transaction.status,
          blockNumber: transaction.blockNumber
            ? BigInt(transaction.blockNumber)
            : null,
          // confirmations: transaction.confirmations, // TODO: Fix Prisma schema sync
          gasUsed: receipt ? receipt.gasUsed.toString() : null,
          confirmedAt: transaction.status === 'CONFIRMED' ? new Date() : null,
          error:
            transaction.status === 'FAILED'
              ? 'Transaction failed on chain'
              : null,
        },
      });

      // Publish status update to Redis
      const statusUpdate: StatusUpdateMessage = {
        txHash: transaction.txHash,
        requestId: transaction.requestId,
        batchId: transaction.batchId,
        status: transaction.status,
        blockNumber: transaction.blockNumber,
        confirmations: transaction.confirmations,
        gasUsed: receipt ? receipt.gasUsed.toString() : undefined,
        error:
          transaction.status === 'FAILED'
            ? 'Transaction failed on chain'
            : undefined,
        timestamp: new Date().toISOString(),
      };

      await this.redis.publish(
        'tx-status-updates',
        JSON.stringify(statusUpdate)
      );

      logger.info(
        `[tx-monitor] Updated transaction ${transaction.txHash} status to ${transaction.status}`
      );
    } catch (error) {
      logger.error(`[tx-monitor] Failed to update transaction status:`, error);
      throw error;
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

    // Clear all intervals
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals = [];

    // Close connections
    await this.prisma.$disconnect();
    this.redis.disconnect();
    await this.gasRetryService.shutdown();

    logger.info('[tx-monitor] Monitor service shut down');
  }
}
