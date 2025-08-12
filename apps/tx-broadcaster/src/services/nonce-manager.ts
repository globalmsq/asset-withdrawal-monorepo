import { LoggerService } from '@asset-withdrawal/shared';
import { getRedisClient, NonceRedisService } from './redis-client';
import type { Redis } from 'ioredis';

/**
 * Queued transaction interface for nonce management
 */
export interface QueuedTransaction {
  txHash: string;
  nonce: number;
  signedTx: string;
  requestId: string;
  fromAddress: string;
  timestamp: Date;
  retryCount?: number;
  priority?: number; // Higher number = higher priority
  transactionType?: 'SINGLE' | 'BATCH'; // Track transaction type
  batchId?: string; // Store batchId separately for batch transactions
}

/**
 * Queue status interface for monitoring
 */
export interface QueueStatus {
  address: string;
  pendingCount: number;
  isProcessing: boolean;
  lastBroadcastedNonce?: number;
  oldestTransactionTime?: Date;
}

/**
 * NonceManager - Manages transaction queues per address to ensure nonce ordering
 *
 * Features:
 * - Address-based transaction queueing
 * - Sequential processing for same address
 * - Parallel processing for different addresses
 * - Nonce gap detection and prevention
 */
export class NonceManager {
  private redis!: Redis;
  private nonceRedisService!: NonceRedisService;
  private processingTimeout = 60000; // 60 seconds timeout for processing
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService({ service: 'NonceManager' });
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = await getRedisClient();
      this.nonceRedisService = new NonceRedisService(this.redis);
      this.logger.info('NonceManager initialized with Redis storage');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for NonceManager', error);
      throw new Error(
        'NonceManager requires Redis connection. Service cannot start.'
      );
    }
  }

  /**
   * Add a transaction to the address-specific queue
   * Maintains nonce ordering within the queue
   */
  async addTransaction(transaction: QueuedTransaction): Promise<void> {
    await this.ensureRedisInitialized();

    const { fromAddress, nonce, txHash, transactionType } = transaction;

    this.logger.debug('Adding transaction to queue', {
      metadata: {
        fromAddress,
        nonce,
        txHash,
        transactionType: transactionType || 'SINGLE',
      },
    });

    // Get existing queue for this address
    let queue =
      await this.nonceRedisService.getPendingTransactions(fromAddress);

    // Check for duplicate nonce
    const existingIndex = queue.findIndex(tx => tx.nonce === nonce);
    if (existingIndex !== -1) {
      this.logger.warn(
        'Transaction with same nonce already exists, replacing',
        {
          metadata: {
            fromAddress,
            nonce,
            oldTxHash: queue[existingIndex].txHash,
            newTxHash: txHash,
          },
        }
      );
      queue[existingIndex] = transaction;
    } else {
      // Insert transaction in nonce order (primary) and priority order (secondary)
      queue.push(transaction);
      queue.sort((a, b) => {
        // First sort by nonce
        if (a.nonce !== b.nonce) {
          return a.nonce - b.nonce;
        }
        // If same nonce, sort by priority (higher priority first)
        return (b.priority || 0) - (a.priority || 0);
      });
    }

    // Save updated queue to Redis
    await this.nonceRedisService.setPendingTransactions(fromAddress, queue);

    this.logger.info('Transaction added to queue', {
      metadata: {
        fromAddress,
        nonce,
        queueLength: queue.length,
      },
    });
  }

  private async ensureRedisInitialized(): Promise<void> {
    if (!this.redis || !this.nonceRedisService) {
      await this.initializeRedis();
    }
  }

  /**
   * Get the next transaction that can be processed
   * Uses round-robin with queue length prioritization for fairness
   * Returns null if no transaction is ready
   */
  async getNextTransaction(
    address?: string
  ): Promise<QueuedTransaction | null> {
    await this.ensureRedisInitialized();

    // If specific address provided
    if (address) {
      return this.getNextTransactionForAddress(address);
    }

    // Check for stuck transactions (timeout)
    await this.checkAndReleaseTimedOutTransactions();

    // Get all addresses with pending transactions
    const addressesWithTransactions =
      await this.nonceRedisService.getAddressesWithPendingTransactions();
    const processingAddresses =
      await this.nonceRedisService.getProcessingAddresses();
    const processingAddressSet = new Set(processingAddresses);

    // Filter available addresses (not processing and has transactions)
    const availableAddressesInfo = [];
    for (const addr of addressesWithTransactions) {
      if (!processingAddressSet.has(addr)) {
        const queue = await this.nonceRedisService.getPendingTransactions(addr);
        if (queue.length > 0) {
          availableAddressesInfo.push({
            address: addr,
            queueLength: queue.length,
          });
        }
      }
    }

    if (availableAddressesInfo.length === 0) {
      return null;
    }

    // Sort by queue length (longer queues get priority) and last processed time
    const sortedAddresses = [];
    for (const info of availableAddressesInfo) {
      const lastProcessedTime =
        (await this.nonceRedisService.getLastProcessedTime(info.address)) || 0;
      sortedAddresses.push({ ...info, lastProcessedTime });
    }

    sortedAddresses.sort((a, b) => {
      // Prioritize longer queues
      const lengthDiff = b.queueLength - a.queueLength;
      if (lengthDiff !== 0) {
        return lengthDiff;
      }

      // If same length, use round-robin based on last processed time
      return a.lastProcessedTime - b.lastProcessedTime;
    });

    // Try to get transaction from the highest priority address
    for (const { address: addr } of sortedAddresses) {
      const transaction = await this.getNextTransactionForAddress(addr);
      if (transaction) {
        await this.nonceRedisService.setLastProcessedTime(addr);
        return transaction;
      }
    }

    return null;
  }

  /**
   * Get next transaction for specific address
   */
  private async getNextTransactionForAddress(
    address: string
  ): Promise<QueuedTransaction | null> {
    const queue = await this.nonceRedisService.getPendingTransactions(address);

    if (!queue || queue.length === 0) {
      return null;
    }

    // Check if address is already processing
    const isProcessing = await this.nonceRedisService.isProcessing(address);
    if (isProcessing) {
      this.logger.debug('Address is already processing', {
        metadata: { address },
      });
      return null;
    }

    // Get the first transaction in queue (lowest nonce)
    const nextTransaction = queue[0];
    const lastNonce =
      await this.nonceRedisService.getLastBroadcastedNonce(address);

    // Check nonce sequence
    if (lastNonce !== null && nextTransaction.nonce !== lastNonce + 1) {
      this.logger.warn('Nonce gap detected, waiting for missing nonce', {
        metadata: {
          address,
          expectedNonce: lastNonce + 1,
          actualNonce: nextTransaction.nonce,
          gapSize: nextTransaction.nonce - (lastNonce + 1),
        },
      });
      return null;
    }

    return nextTransaction;
  }

  /**
   * Mark transaction as being processed
   */
  async startProcessing(address: string): Promise<void> {
    await this.ensureRedisInitialized();

    const lockAcquired =
      await this.nonceRedisService.setProcessingLock(address);
    if (!lockAcquired) {
      throw new Error(
        `Failed to acquire processing lock for address: ${address}`
      );
    }

    await this.nonceRedisService.setProcessingStartTime(address);
    this.logger.debug('Started processing for address', {
      metadata: { address },
    });
  }

  /**
   * Check for timed out transactions and release them
   */
  private async checkAndReleaseTimedOutTransactions(): Promise<void> {
    await this.ensureRedisInitialized();

    const timedOutAddresses = await this.nonceRedisService.releaseTimedOutLocks(
      this.processingTimeout
    );

    for (const address of timedOutAddresses) {
      this.logger.warn('Processing timeout detected, releasing address', {
        metadata: {
          address,
          timeoutMs: this.processingTimeout,
        },
      });
    }
  }

  /**
   * Complete transaction processing and update state
   */
  async completeTransaction(
    address: string,
    nonce: number,
    success: boolean
  ): Promise<void> {
    await this.ensureRedisInitialized();

    this.logger.info('Completing transaction', {
      metadata: {
        address,
        nonce,
        success,
      },
    });

    if (success) {
      // Update last broadcasted nonce
      await this.nonceRedisService.setLastBroadcastedNonce(address, nonce);

      // Remove transaction from queue
      const queue =
        await this.nonceRedisService.getPendingTransactions(address);
      const updatedQueue = queue.filter(tx => tx.nonce !== nonce);

      await this.nonceRedisService.setPendingTransactions(
        address,
        updatedQueue
      );
    }

    // Clear processing flag and timing
    await this.nonceRedisService.removeProcessingLock(address);

    const remainingQueue =
      await this.nonceRedisService.getPendingTransactions(address);
    this.logger.info('Transaction completed', {
      metadata: {
        address,
        nonce,
        success,
        remainingInQueue: remainingQueue.length,
      },
    });
  }

  /**
   * Remove a transaction from queue (e.g., on permanent failure)
   */
  async removeTransaction(address: string, nonce: number): Promise<void> {
    await this.ensureRedisInitialized();

    const queue = await this.nonceRedisService.getPendingTransactions(address);
    const updatedQueue = queue.filter(tx => tx.nonce !== nonce);

    await this.nonceRedisService.setPendingTransactions(address, updatedQueue);

    // Clear processing flag and timing if this address was processing
    await this.nonceRedisService.removeProcessingLock(address);

    this.logger.info('Transaction removed from queue', {
      metadata: {
        address,
        nonce,
        remainingInQueue: updatedQueue.length,
      },
    });
  }

  /**
   * Check if an address is currently processing
   */
  async isAddressProcessing(address: string): Promise<boolean> {
    await this.ensureRedisInitialized();
    return this.nonceRedisService.isProcessing(address);
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus(address?: string): Promise<QueueStatus[]> {
    await this.ensureRedisInitialized();

    const statuses: QueueStatus[] = [];

    if (address) {
      // Status for specific address
      const queue =
        await this.nonceRedisService.getPendingTransactions(address);
      const isProcessing = await this.nonceRedisService.isProcessing(address);
      const lastBroadcastedNonce =
        await this.nonceRedisService.getLastBroadcastedNonce(address);

      statuses.push({
        address,
        pendingCount: queue.length,
        isProcessing,
        lastBroadcastedNonce:
          lastBroadcastedNonce !== null ? lastBroadcastedNonce : undefined,
        oldestTransactionTime:
          queue.length > 0 ? queue[0].timestamp : undefined,
      });
    } else {
      // Status for all addresses
      const addressesWithTransactions =
        await this.nonceRedisService.getAddressesWithPendingTransactions();
      const processingAddresses =
        await this.nonceRedisService.getProcessingAddresses();
      const allAddresses = new Set([
        ...addressesWithTransactions,
        ...processingAddresses,
      ]);

      for (const addr of allAddresses) {
        const queue = await this.nonceRedisService.getPendingTransactions(addr);
        const isProcessing = await this.nonceRedisService.isProcessing(addr);
        const lastBroadcastedNonce =
          await this.nonceRedisService.getLastBroadcastedNonce(addr);

        statuses.push({
          address: addr,
          pendingCount: queue.length,
          isProcessing,
          lastBroadcastedNonce:
            lastBroadcastedNonce !== null ? lastBroadcastedNonce : undefined,
          oldestTransactionTime:
            queue.length > 0 ? queue[0].timestamp : undefined,
        });
      }
    }

    return statuses;
  }

  /**
   * Get all pending transactions for an address
   */
  async getPendingTransactions(address: string): Promise<QueuedTransaction[]> {
    await this.ensureRedisInitialized();
    return this.nonceRedisService.getPendingTransactions(address);
  }

  /**
   * Clear all queues and reset state (for testing)
   */
  async clearAll(): Promise<void> {
    await this.ensureRedisInitialized();
    await this.nonceRedisService.clearAll();
    this.logger.info('All queues cleared');
  }

  /**
   * Get nonce gap information for an address
   */
  async getNonceGapInfo(address: string): Promise<{
    hasGap: boolean;
    expectedNonce?: number;
    actualNonce?: number;
    gapSize?: number;
    missingNonces?: number[];
  } | null> {
    await this.ensureRedisInitialized();

    const queue = await this.nonceRedisService.getPendingTransactions(address);

    if (!queue || queue.length === 0) {
      return null;
    }

    const lastNonce =
      await this.nonceRedisService.getLastBroadcastedNonce(address);

    if (lastNonce === null) {
      // No previous broadcasts, no gap
      return { hasGap: false };
    }

    const nextTransaction = queue[0];
    const expectedNonce = lastNonce + 1;

    if (nextTransaction.nonce !== expectedNonce) {
      // Calculate missing nonces
      const missingNonces: number[] = [];
      for (let n = expectedNonce; n < nextTransaction.nonce; n++) {
        missingNonces.push(n);
      }

      return {
        hasGap: true,
        expectedNonce,
        actualNonce: nextTransaction.nonce,
        gapSize: nextTransaction.nonce - expectedNonce,
        missingNonces,
      };
    }

    return { hasGap: false };
  }

  /**
   * Get statistics for monitoring
   */
  async getStatistics(): Promise<{
    totalAddresses: number;
    totalPendingTransactions: number;
    processingAddresses: number;
    addressesWithGaps: number;
    averageQueueLength: number;
    maxQueueLength: number;
    oldestTransactionAge?: number;
    timedOutAddresses: number;
  }> {
    await this.ensureRedisInitialized();

    let totalPendingTransactions = 0;
    let addressesWithGaps = 0;
    let maxQueueLength = 0;
    let oldestTransactionTime: Date | undefined;
    const now = new Date();

    const addressesWithTransactions =
      await this.nonceRedisService.getAddressesWithPendingTransactions();
    const processingAddresses =
      await this.nonceRedisService.getProcessingAddresses();

    for (const address of addressesWithTransactions) {
      const queue =
        await this.nonceRedisService.getPendingTransactions(address);
      totalPendingTransactions += queue.length;

      // Track max queue length
      if (queue.length > maxQueueLength) {
        maxQueueLength = queue.length;
      }

      // Track oldest transaction
      if (queue.length > 0) {
        const firstTx = queue[0];
        if (
          !oldestTransactionTime ||
          firstTx.timestamp < oldestTransactionTime
        ) {
          oldestTransactionTime = firstTx.timestamp;
        }
      }

      // Check for nonce gaps
      const lastNonce =
        await this.nonceRedisService.getLastBroadcastedNonce(address);
      if (lastNonce !== null && queue.length > 0) {
        const expectedNonce = lastNonce + 1;
        if (queue[0].nonce !== expectedNonce) {
          addressesWithGaps++;
        }
      }
    }

    // Check for timed out addresses using Redis-based timeout check
    const timedOutAddresses = (
      await this.nonceRedisService.releaseTimedOutLocks(this.processingTimeout)
    ).length;

    return {
      totalAddresses: addressesWithTransactions.length,
      totalPendingTransactions,
      processingAddresses: processingAddresses.length,
      addressesWithGaps,
      averageQueueLength:
        addressesWithTransactions.length > 0
          ? totalPendingTransactions / addressesWithTransactions.length
          : 0,
      maxQueueLength,
      oldestTransactionAge: oldestTransactionTime
        ? now.getTime() - oldestTransactionTime.getTime()
        : undefined,
      timedOutAddresses,
    };
  }
}
