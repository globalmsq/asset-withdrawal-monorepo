import { ethers } from 'ethers';
import { Logger } from '../utils/logger';
import { TransactionService } from '@asset-withdrawal/database';
import { TransactionToMonitor, MonitorStatus } from '../types';
import { config } from '../config';

export class TransactionMonitor {
  private static instance: TransactionMonitor;
  private logger = new Logger('TransactionMonitor');
  private provider: ethers.JsonRpcProvider;
  private transactionService: TransactionService;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPollTime: Date | null = null;
  private stats = {
    processed: 0,
    failed: 0,
  };

  private constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.transactionService = new TransactionService();
  }

  static getInstance(): TransactionMonitor {
    if (!TransactionMonitor.instance) {
      TransactionMonitor.instance = new TransactionMonitor();
    }
    return TransactionMonitor.instance;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Transaction Monitor...');

    // Verify provider connection
    try {
      const network = await this.provider.getNetwork();
      this.logger.info(
        `Connected to network: ${network.name} (chainId: ${network.chainId})`
      );

      if (network.chainId !== BigInt(config.blockchain.chainId)) {
        throw new Error(
          `Chain ID mismatch. Expected ${config.blockchain.chainId}, got ${network.chainId}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to connect to blockchain provider', error);
      throw error;
    }

    // Start monitoring
    await this.start();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Monitor is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting transaction monitoring...');

    // Initial poll
    await this.pollTransactions();

    // Set up interval
    this.pollInterval = setInterval(async () => {
      await this.pollTransactions();
    }, config.monitoring.pollInterval);

    this.logger.info(
      `Monitor started with poll interval: ${config.monitoring.pollInterval}ms`
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Monitor is not running');
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.logger.info('Monitor stopped');
  }

  private async pollTransactions(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.lastPollTime = new Date();
    this.logger.info('Polling for pending transactions...');

    try {
      // Get pending transactions
      const allPendingTransactions =
        await this.transactionService.getTransactionsByStatus('PENDING');

      // Limit to batch size
      const pendingTransactions = allPendingTransactions.slice(
        0,
        config.monitoring.batchSize
      );

      if (pendingTransactions.length === 0) {
        this.logger.debug('No pending transactions found');
        return;
      }

      this.logger.info(
        `Found ${pendingTransactions.length} pending transactions`
      );

      // Process each transaction
      for (const tx of pendingTransactions) {
        await this.checkTransactionStatus({
          id: tx.id,
          transactionHash: tx.txHash!,
          network: tx.network || 'polygon',
          status: tx.status,
          sentAt: tx.createdAt,
        });
      }
    } catch (error) {
      this.logger.error('Error polling transactions', error);
    }
  }

  private async checkTransactionStatus(
    tx: TransactionToMonitor
  ): Promise<void> {
    try {
      this.logger.info(
        `Checking status for transaction: ${tx.transactionHash}`
      );

      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(
        tx.transactionHash
      );

      if (!receipt) {
        // Transaction not found yet, check if it's been too long
        const waitTime = Date.now() - tx.sentAt.getTime();

        if (waitTime > config.monitoring.maxWaitTime) {
          this.logger.warn(
            `Transaction ${tx.transactionHash} not found after ${waitTime}ms, marking as failed`
          );
          await this.transactionService.updateStatus(tx.id, 'FAILED');
          this.stats.failed++;
        } else {
          this.logger.debug(
            `Transaction ${tx.transactionHash} not found yet, will retry`
          );
        }

        return;
      }

      // Check transaction status
      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      if (receipt.status === 0) {
        // Transaction failed
        this.logger.error(`Transaction ${tx.transactionHash} failed on chain`);
        await this.transactionService.updateTransaction(tx.id, {
          status: 'FAILED',
          confirmations: 0,
        });
        this.stats.failed++;
      } else if (confirmations >= config.monitoring.confirmationsRequired) {
        // Transaction confirmed
        this.logger.info(
          `Transaction ${tx.transactionHash} confirmed with ${confirmations} confirmations`
        );
        await this.transactionService.updateTransaction(tx.id, {
          status: 'CONFIRMED',
          blockNumber: receipt.blockNumber,
          confirmations,
        });
        this.stats.processed++;
      } else {
        // Still waiting for confirmations
        this.logger.debug(
          `Transaction ${tx.transactionHash} has ${confirmations}/${config.monitoring.confirmationsRequired} confirmations`
        );
      }

      // Check for chain reorganization
      if (tx.status === 'CONFIRMING' && receipt.blockNumber) {
        const txDetails = await this.transactionService.getTransactionById(
          tx.id
        );
        if (
          txDetails &&
          txDetails.blockNumber &&
          txDetails.blockNumber !== receipt.blockNumber
        ) {
          this.logger.warn(
            `Chain reorganization detected for transaction ${tx.transactionHash}`
          );
          await this.transactionService.updateStatus(tx.id, 'PENDING');
        }
      }
    } catch (error) {
      this.logger.error(
        `Error checking transaction ${tx.transactionHash}`,
        error
      );
    }
  }

  async getStatus(): Promise<MonitorStatus> {
    const pendingTransactions =
      await this.transactionService.getTransactionsByStatus('PENDING');

    return {
      isRunning: this.isRunning,
      lastPollTime: this.lastPollTime,
      pendingTransactions: pendingTransactions.length,
      processedTransactions: this.stats.processed,
      failedTransactions: this.stats.failed,
    };
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }
}
