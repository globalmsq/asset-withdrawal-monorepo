import { LoggerService } from '@asset-withdrawal/shared';

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
  private pendingTransactions = new Map<string, QueuedTransaction[]>();
  private lastBroadcastedNonce = new Map<string, number>();
  private processingAddresses = new Set<string>();
  private processingStartTime = new Map<string, Date>();
  private addressLastProcessed = new Map<string, Date>();
  private roundRobinIndex = 0;
  private processingTimeout = 60000; // 60 seconds timeout for processing
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService({ service: 'NonceManager' });
  }

  /**
   * Add a transaction to the address-specific queue
   * Maintains nonce ordering within the queue
   */
  async addTransaction(transaction: QueuedTransaction): Promise<void> {
    const { fromAddress, nonce, txHash, transactionType } = transaction;

    this.logger.debug('Adding transaction to queue', {
      metadata: {
        fromAddress,
        nonce,
        txHash,
        transactionType: transactionType || 'SINGLE',
      },
    });

    // Get or create queue for this address
    let queue = this.pendingTransactions.get(fromAddress) || [];

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

    this.pendingTransactions.set(fromAddress, queue);

    this.logger.info('Transaction added to queue', {
      metadata: {
        fromAddress,
        nonce,
        queueLength: queue.length,
      },
    });
  }

  /**
   * Get the next transaction that can be processed
   * Uses round-robin with queue length prioritization for fairness
   * Returns null if no transaction is ready
   */
  async getNextTransaction(
    address?: string
  ): Promise<QueuedTransaction | null> {
    // If specific address provided
    if (address) {
      return this.getNextTransactionForAddress(address);
    }

    // Check for stuck transactions (timeout)
    await this.checkAndReleaseTimedOutTransactions();

    // Get all addresses with pending transactions that are not processing
    const availableAddresses = Array.from(this.pendingTransactions.entries())
      .filter(
        ([addr, queue]) =>
          queue.length > 0 && !this.processingAddresses.has(addr)
      )
      .map(([addr, queue]) => ({ address: addr, queueLength: queue.length }));

    if (availableAddresses.length === 0) {
      return null;
    }

    // Sort by queue length (longer queues get priority) and last processed time
    availableAddresses.sort((a, b) => {
      // Prioritize longer queues
      const lengthDiff = b.queueLength - a.queueLength;
      if (lengthDiff !== 0) {
        return lengthDiff;
      }

      // If same length, use round-robin based on last processed time
      const aLastProcessed =
        this.addressLastProcessed.get(a.address)?.getTime() || 0;
      const bLastProcessed =
        this.addressLastProcessed.get(b.address)?.getTime() || 0;
      return aLastProcessed - bLastProcessed;
    });

    // Try to get transaction from the highest priority address
    for (const { address: addr } of availableAddresses) {
      const transaction = await this.getNextTransactionForAddress(addr);
      if (transaction) {
        this.addressLastProcessed.set(addr, new Date());
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
    const queue = this.pendingTransactions.get(address);

    if (!queue || queue.length === 0) {
      return null;
    }

    // Check if address is already processing
    if (this.processingAddresses.has(address)) {
      this.logger.debug('Address is already processing', {
        metadata: { address },
      });
      return null;
    }

    // Get the first transaction in queue (lowest nonce)
    const nextTransaction = queue[0];
    const lastNonce = this.lastBroadcastedNonce.get(address);

    // Check nonce sequence
    if (lastNonce !== undefined && nextTransaction.nonce !== lastNonce + 1) {
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
    this.processingAddresses.add(address);
    this.processingStartTime.set(address, new Date());
    this.logger.debug('Started processing for address', {
      metadata: { address },
    });
  }

  /**
   * Check for timed out transactions and release them
   */
  private async checkAndReleaseTimedOutTransactions(): Promise<void> {
    const now = new Date();
    const timedOutAddresses: string[] = [];

    for (const [address, startTime] of this.processingStartTime.entries()) {
      const processingTime = now.getTime() - startTime.getTime();
      if (processingTime > this.processingTimeout) {
        timedOutAddresses.push(address);
        this.logger.warn('Processing timeout detected, releasing address', {
          metadata: {
            address,
            processingTimeMs: processingTime,
            timeoutMs: this.processingTimeout,
          },
        });
      }
    }

    // Release timed out addresses
    for (const address of timedOutAddresses) {
      this.processingAddresses.delete(address);
      this.processingStartTime.delete(address);
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
    this.logger.info('Completing transaction', {
      metadata: {
        address,
        nonce,
        success,
      },
    });

    if (success) {
      // Update last broadcasted nonce
      this.lastBroadcastedNonce.set(address, nonce);

      // Remove transaction from queue
      const queue = this.pendingTransactions.get(address) || [];
      const updatedQueue = queue.filter(tx => tx.nonce !== nonce);

      if (updatedQueue.length === 0) {
        this.pendingTransactions.delete(address);
      } else {
        this.pendingTransactions.set(address, updatedQueue);
      }
    }

    // Clear processing flag and timing
    this.processingAddresses.delete(address);
    this.processingStartTime.delete(address);

    this.logger.info('Transaction completed', {
      metadata: {
        address,
        nonce,
        success,
        remainingInQueue: this.pendingTransactions.get(address)?.length || 0,
      },
    });
  }

  /**
   * Remove a transaction from queue (e.g., on permanent failure)
   */
  async removeTransaction(address: string, nonce: number): Promise<void> {
    const queue = this.pendingTransactions.get(address) || [];
    const updatedQueue = queue.filter(tx => tx.nonce !== nonce);

    if (updatedQueue.length === 0) {
      this.pendingTransactions.delete(address);
    } else {
      this.pendingTransactions.set(address, updatedQueue);
    }

    // Clear processing flag and timing if this address was processing
    this.processingAddresses.delete(address);
    this.processingStartTime.delete(address);

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
  isAddressProcessing(address: string): boolean {
    return this.processingAddresses.has(address);
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus(address?: string): QueueStatus[] {
    const statuses: QueueStatus[] = [];

    if (address) {
      // Status for specific address
      const queue = this.pendingTransactions.get(address) || [];
      statuses.push({
        address,
        pendingCount: queue.length,
        isProcessing: this.processingAddresses.has(address),
        lastBroadcastedNonce: this.lastBroadcastedNonce.get(address),
        oldestTransactionTime:
          queue.length > 0 ? queue[0].timestamp : undefined,
      });
    } else {
      // Status for all addresses
      const allAddresses = new Set([
        ...this.pendingTransactions.keys(),
        ...this.processingAddresses,
      ]);

      for (const addr of allAddresses) {
        const queue = this.pendingTransactions.get(addr) || [];
        statuses.push({
          address: addr,
          pendingCount: queue.length,
          isProcessing: this.processingAddresses.has(addr),
          lastBroadcastedNonce: this.lastBroadcastedNonce.get(addr),
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
  getPendingTransactions(address: string): QueuedTransaction[] {
    return this.pendingTransactions.get(address) || [];
  }

  /**
   * Clear all queues and reset state (for testing)
   */
  async clearAll(): Promise<void> {
    this.pendingTransactions.clear();
    this.lastBroadcastedNonce.clear();
    this.processingAddresses.clear();
    this.processingStartTime.clear();
    this.addressLastProcessed.clear();
    this.roundRobinIndex = 0;
    this.logger.info('All queues cleared');
  }

  /**
   * Get nonce gap information for an address
   */
  getNonceGapInfo(address: string): {
    hasGap: boolean;
    expectedNonce?: number;
    actualNonce?: number;
    gapSize?: number;
    missingNonces?: number[];
  } | null {
    const queue = this.pendingTransactions.get(address);
    
    if (!queue || queue.length === 0) {
      return null;
    }

    const lastNonce = this.lastBroadcastedNonce.get(address);
    
    if (lastNonce === undefined) {
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
  getStatistics(): {
    totalAddresses: number;
    totalPendingTransactions: number;
    processingAddresses: number;
    addressesWithGaps: number;
    averageQueueLength: number;
    maxQueueLength: number;
    oldestTransactionAge?: number;
    timedOutAddresses: number;
  } {
    let totalPendingTransactions = 0;
    let addressesWithGaps = 0;
    let maxQueueLength = 0;
    let oldestTransactionTime: Date | undefined;
    let timedOutAddresses = 0;
    const now = new Date();

    for (const [address, queue] of this.pendingTransactions.entries()) {
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
      const lastNonce = this.lastBroadcastedNonce.get(address);
      if (lastNonce !== undefined && queue.length > 0) {
        const expectedNonce = lastNonce + 1;
        if (queue[0].nonce !== expectedNonce) {
          addressesWithGaps++;
        }
      }
    }

    // Check for timed out addresses
    for (const [address, startTime] of this.processingStartTime.entries()) {
      const processingTime = now.getTime() - startTime.getTime();
      if (processingTime > this.processingTimeout) {
        timedOutAddresses++;
      }
    }

    const addressCount = this.pendingTransactions.size;

    return {
      totalAddresses: addressCount,
      totalPendingTransactions,
      processingAddresses: this.processingAddresses.size,
      addressesWithGaps,
      averageQueueLength:
        addressCount > 0 ? totalPendingTransactions / addressCount : 0,
      maxQueueLength,
      oldestTransactionAge: oldestTransactionTime
        ? now.getTime() - oldestTransactionTime.getTime()
        : undefined,
      timedOutAddresses,
    };
  }
}
