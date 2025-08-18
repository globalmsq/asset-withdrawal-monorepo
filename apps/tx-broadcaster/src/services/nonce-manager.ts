import { LoggerService } from '@asset-withdrawal/shared';
import { getRedisClient, NonceRedisService } from './redis-client';
import type { Redis } from 'ioredis';
import { ethers } from 'ethers';
import {
  getChainConfigService,
  ChainConfigService,
} from './chain-config.service';
import { QueueService } from './queue-client';
import type { AppConfig } from '../config';
import type { ChainContext } from '../types/chain-context';

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
  chainContext: ChainContext; // Chain and network context with provider access
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
 * - Memory buffer for out-of-order transactions
 * - Address-based transaction queueing
 * - Sequential processing for same address
 * - Parallel processing for different addresses
 * - Nonce gap detection and prevention
 */
export class NonceManager {
  private redis!: Redis;
  private nonceRedisService!: NonceRedisService;
  private chainConfigService: ChainConfigService;
  private queueService?: QueueService;
  private config?: AppConfig;
  private processingTimeout = 60000; // 60 seconds timeout for processing
  private logger: LoggerService;

  // Memory buffers for managing out-of-order transactions
  private buffers: Map<string, Map<number, QueuedTransaction>>;
  private lastBroadcastedNonces: Map<string, number>;
  private waitingForNonces: Map<string, { nonce: number; since: Date }>;

  // Timers for dummy transaction sending
  private dummyTxTimers: Map<string, NodeJS.Timeout>;

  // Individual address timers for NONCE_TOO_HIGH handling
  private addressTimers: Map<string, NodeJS.Timeout>;
  private addressTimerStartTimes: Map<string, number>;

  // Buffer size limits
  private readonly MAX_BUFFER_SIZE_PER_ADDRESS = 100;
  private readonly MAX_BUFFER_AGE_MS = 5 * 60 * 1000; // 5 minutes
  private readonly DUMMY_TX_WAIT_TIME = 60 * 1000; // 1 minute before sending dummy tx
  private readonly NONCE_CHECK_INTERVAL = 10 * 1000; // Check blockchain nonce every 10 seconds

  constructor(chainId?: number, config?: AppConfig) {
    this.logger = new LoggerService({ service: 'NonceManager' });
    this.chainConfigService = getChainConfigService();
    this.config = config;

    if (config) {
      this.queueService = new QueueService(config);
    }

    // Initialize memory buffers
    this.buffers = new Map();
    this.lastBroadcastedNonces = new Map();
    this.waitingForNonces = new Map();
    this.dummyTxTimers = new Map();

    // Initialize address-specific timers
    this.addressTimers = new Map();
    this.addressTimerStartTimes = new Map();

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
   * Process a transaction with memory buffer logic
   * Returns true if transaction was processed immediately, false if buffered
   */
  async processTransaction(transaction: QueuedTransaction): Promise<boolean> {
    const { fromAddress, nonce, txHash, chainContext } = transaction;

    // Get expected nonce using chainContext from transaction
    const expectedNonce = await this.getExpectedNonce(
      fromAddress,
      chainContext
    );

    this.logger.debug('Processing transaction', {
      metadata: {
        fromAddress,
        nonce,
        expectedNonce,
        txHash,
      },
    });

    if (nonce === expectedNonce) {
      // Perfect match - process immediately
      this.logger.info('Processing transaction immediately', {
        metadata: { fromAddress, nonce, txHash },
      });

      // Clear waiting status
      if (this.waitingForNonces.has(fromAddress)) {
        this.waitingForNonces.delete(fromAddress);
      }

      return true; // Ready to broadcast
    } else if (nonce > expectedNonce) {
      // Future nonce - add to buffer
      this.addToBuffer(fromAddress, nonce, transaction);

      // Mark that we're waiting for a nonce
      if (!this.waitingForNonces.has(fromAddress)) {
        this.waitingForNonces.set(fromAddress, {
          nonce: expectedNonce,
          since: new Date(),
        });

        this.logger.warn('Nonce gap detected, buffering transaction', {
          metadata: {
            fromAddress,
            expectedNonce,
            receivedNonce: nonce,
            gap: nonce - expectedNonce,
          },
        });
      }

      return false; // Buffered for later
    } else {
      // Old nonce - should not happen normally
      this.logger.warn('Received old nonce, skipping', {
        metadata: {
          fromAddress,
          expectedNonce,
          receivedNonce: nonce,
        },
      });

      return false; // Skip old nonce
    }
  }

  /**
   * Add transaction to memory buffer
   */
  private addToBuffer(
    address: string,
    nonce: number,
    transaction: QueuedTransaction
  ): void {
    if (!this.buffers.has(address)) {
      this.buffers.set(address, new Map());
    }

    const addressBuffer = this.buffers.get(address)!;

    // Check buffer size limit
    if (addressBuffer.size >= this.MAX_BUFFER_SIZE_PER_ADDRESS) {
      this.logger.error('Buffer size limit reached', {
        metadata: {
          address,
          bufferSize: addressBuffer.size,
          limit: this.MAX_BUFFER_SIZE_PER_ADDRESS,
        },
      });
      // Could implement buffer cleanup here if needed
      return;
    }

    addressBuffer.set(nonce, transaction);

    this.logger.debug('Transaction added to buffer', {
      metadata: {
        address,
        nonce,
        bufferSize: addressBuffer.size,
      },
    });
  }

  /**
   * Process buffered transactions in sequence after a successful broadcast
   */
  async processBufferedSequence(
    address: string,
    context: ChainContext
  ): Promise<QueuedTransaction[]> {
    const buffer = this.buffers.get(address);
    if (!buffer || buffer.size === 0) {
      return [];
    }

    const processed: QueuedTransaction[] = [];
    let currentNonce = await this.getExpectedNonce(address, context);

    // Process consecutive nonces from buffer
    while (buffer.has(currentNonce)) {
      const transaction = buffer.get(currentNonce)!;
      processed.push(transaction);
      buffer.delete(currentNonce);

      this.logger.info('Processing buffered transaction', {
        metadata: {
          address,
          nonce: currentNonce,
          remainingInBuffer: buffer.size,
        },
      });

      // Update last nonce (will be persisted by caller)
      this.lastBroadcastedNonces.set(address, currentNonce);
      currentNonce++;
    }

    // Check if gap is resolved
    if (this.waitingForNonces.has(address)) {
      const waiting = this.waitingForNonces.get(address)!;
      if (waiting.nonce < currentNonce) {
        this.waitingForNonces.delete(address);
        this.logger.info('Nonce gap resolved', {
          metadata: {
            address,
            resolvedNonce: waiting.nonce,
            currentNonce: currentNonce - 1,
          },
        });
      }
    }

    // Clean up empty buffer
    if (buffer.size === 0) {
      this.buffers.delete(address);
    }

    return processed;
  }

  /**
   * Get the expected next nonce for an address
   */
  private async getExpectedNonce(
    address: string,
    context: ChainContext
  ): Promise<number> {
    // Check memory cache first
    if (this.lastBroadcastedNonces.has(address)) {
      return this.lastBroadcastedNonces.get(address)! + 1;
    }

    // Fall back to Redis
    const lastNonce =
      await this.nonceRedisService.getLastBroadcastedNonce(address);
    if (lastNonce !== null) {
      this.lastBroadcastedNonces.set(address, lastNonce);
      return lastNonce + 1;
    }

    // No previous transactions in memory or Redis - fetch from blockchain
    try {
      const blockchainNonce = await this.getBlockchainNonce(address, context);

      // Cache the blockchain nonce as the "last broadcasted" nonce
      // This handles the case where transactions were sent outside this service
      if (blockchainNonce > 0) {
        // Blockchain nonce is the next nonce to use, so last broadcasted is nonce - 1
        const lastBroadcasted = blockchainNonce - 1;
        this.lastBroadcastedNonces.set(address, lastBroadcasted);
        await this.nonceRedisService.setLastBroadcastedNonce(
          address,
          lastBroadcasted
        );

        this.logger.info('Initialized nonce from blockchain', {
          metadata: {
            address,
            blockchainNonce,
            lastBroadcasted,
          },
        });
      }

      return blockchainNonce;
    } catch (error) {
      this.logger.error(
        'Failed to fetch blockchain nonce, defaulting to 0',
        error,
        {
          metadata: { address },
        }
      );
      // If blockchain fetch fails, default to 0
      return 0;
    }
  }

  /**
   * Get blockchain nonce for an address
   */
  async getBlockchainNonce(
    address: string,
    context: ChainContext
  ): Promise<number> {
    try {
      const provider = context.getProvider();
      if (!provider) {
        throw new Error(`No provider available for ${context.toString()}`);
      }

      const nonce = await provider.getTransactionCount(address, 'latest');

      this.logger.debug('Retrieved blockchain nonce', {
        metadata: {
          address,
          chain: context.chain,
          network: context.network,
          chainId: context.chainId,
          nonce,
        },
      });

      return nonce;
    } catch (error) {
      this.logger.error('Failed to get blockchain nonce', error, {
        metadata: {
          address,
          chain: context.chain,
          network: context.network,
          chainId: context.chainId,
        },
      });
      throw error;
    }
  }

  /**
   * Update last broadcasted nonce (both memory and Redis)
   */
  async updateLastBroadcastedNonce(
    address: string,
    nonce: number
  ): Promise<void> {
    this.lastBroadcastedNonces.set(address, nonce);
    await this.nonceRedisService.setLastBroadcastedNonce(address, nonce);

    this.logger.debug('Updated last broadcasted nonce', {
      metadata: { address, nonce },
    });
  }

  /**
   * Get nonce gap status for monitoring
   */
  getGapStatus(): Map<
    string,
    {
      waitingFor: number;
      waitingSince: Date;
      bufferedNonces: number[];
      bufferSize: number;
    }
  > {
    const status = new Map();

    for (const [address, waiting] of this.waitingForNonces.entries()) {
      const buffer = this.buffers.get(address);
      const bufferedNonces = buffer
        ? Array.from(buffer.keys()).sort((a, b) => a - b)
        : [];

      status.set(address, {
        waitingFor: waiting.nonce,
        waitingSince: waiting.since,
        bufferedNonces,
        bufferSize: buffer?.size || 0,
      });
    }

    return status;
  }

  /**
   * Clean up old buffered transactions
   */
  cleanupOldBuffers(): void {
    const now = Date.now();

    for (const [address, buffer] of this.buffers.entries()) {
      for (const [nonce, transaction] of buffer.entries()) {
        const age = now - transaction.timestamp.getTime();
        if (age > this.MAX_BUFFER_AGE_MS) {
          buffer.delete(nonce);
          this.logger.warn('Removed old buffered transaction', {
            metadata: {
              address,
              nonce,
              age: Math.floor(age / 1000) + 's',
            },
          });
        }
      }

      // Remove empty buffers
      if (buffer.size === 0) {
        this.buffers.delete(address);
      }
    }
  }

  /**
   * Add transaction to the queue (used for testing only)
   * @deprecated This method is only used in tests. Production code should use processTransactionWithSQSSearch()
   * @internal For testing purposes only
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
      // Use binary search to find the correct insertion point for better performance
      const index = queue.findIndex(
        tx =>
          tx.nonce > transaction.nonce ||
          (tx.nonce === transaction.nonce &&
            (tx.priority || 0) < (transaction.priority || 0))
      );

      if (index === -1) {
        // If no transaction has a higher nonce/priority, add to the end
        queue.push(transaction);
      } else {
        // Insert at the correct position to maintain sort order
        queue.splice(index, 0, transaction);
      }
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

      // Clear address timer if buffer is empty
      const buffer = this.buffers.get(address);
      if (!buffer || buffer.size === 0) {
        this.clearAddressTimer(address);
      }
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
   * Handle NONCE_TOO_HIGH error by buffering and setting up dummy tx timer
   */
  async handleNonceTooHigh(transaction: QueuedTransaction): Promise<void> {
    const { fromAddress, nonce, chainContext } = transaction;

    try {
      // Get current blockchain nonce using chainContext from transaction
      const blockchainNonce = await this.getBlockchainNonce(
        fromAddress,
        chainContext
      );

      this.logger.warn('NONCE_TOO_HIGH detected, buffering transaction', {
        metadata: {
          fromAddress,
          expectedNonce: nonce,
          blockchainNonce,
          gap: nonce - blockchainNonce,
        },
      });

      // Add to buffer
      this.addToBuffer(fromAddress, nonce, transaction);

      // Start address-specific timer if not already running
      this.startAddressTimer(fromAddress, chainContext);
    } catch (error) {
      this.logger.error('Error handling NONCE_TOO_HIGH', error, {
        metadata: { fromAddress, nonce },
      });
      throw error;
    }
  }

  /**
   * Start or restart timer for a specific address
   */
  private startAddressTimer(address: string, context: ChainContext): void {
    // Clear existing timer if any
    this.clearAddressTimer(address);

    // Record start time
    this.addressTimerStartTimes.set(address, Date.now());

    // Set up periodic check
    const timer = setInterval(async () => {
      try {
        // Check how long we've been waiting
        const startTime = this.addressTimerStartTimes.get(address);
        if (!startTime) {
          this.clearAddressTimer(address);
          return;
        }

        const waitTime = Date.now() - startTime;

        // Get current blockchain nonce using the provided context
        const blockchainNonce = await this.getBlockchainNonce(address, context);

        // Check if any buffered transaction can now be processed
        const buffer = this.buffers.get(address);
        if (!buffer || buffer.size === 0) {
          // No more buffered transactions, clear timer
          this.clearAddressTimer(address);
          return;
        }

        // Check if we have a transaction ready to process
        if (buffer.has(blockchainNonce)) {
          this.logger.info('Buffered transaction now ready to process', {
            metadata: {
              address,
              nonce: blockchainNonce,
              waitTime: Math.floor(waitTime / 1000) + 's',
            },
          });

          // Clear timer as transaction is now ready
          this.clearAddressTimer(address);
          return;
        }

        // Check if we've waited too long (1 minute)
        if (waitTime >= this.DUMMY_TX_WAIT_TIME) {
          // Find the lowest buffered nonce
          const bufferedNonces = Array.from(buffer.keys()).sort(
            (a, b) => a - b
          );
          const lowestBufferedNonce = bufferedNonces[0];

          this.logger.warn('Timeout reached, preparing dummy transactions', {
            metadata: {
              address,
              fromNonce: blockchainNonce,
              toNonce: lowestBufferedNonce,
              waitTime: Math.floor(waitTime / 1000) + 's',
            },
          });

          // Send dummy transactions to fill the gap
          await this.sendDummyTransactions(
            address,
            blockchainNonce,
            lowestBufferedNonce,
            context
          );

          // Clear timer after sending dummy transactions
          this.clearAddressTimer(address);
        }
      } catch (error) {
        this.logger.error('Error in address timer', error, {
          metadata: { address },
        });
      }
    }, this.NONCE_CHECK_INTERVAL);

    this.addressTimers.set(address, timer);

    this.logger.info('Started address timer for NONCE_TOO_HIGH handling', {
      metadata: {
        address,
        chain: context.chain,
        network: context.network,
        chainId: context.chainId,
        checkInterval: this.NONCE_CHECK_INTERVAL / 1000 + 's',
        timeout: this.DUMMY_TX_WAIT_TIME / 1000 + 's',
      },
    });
  }

  /**
   * Clear timer for a specific address
   */
  private clearAddressTimer(address: string): void {
    const timer = this.addressTimers.get(address);
    if (timer) {
      clearInterval(timer);
      this.addressTimers.delete(address);
      this.addressTimerStartTimes.delete(address);

      this.logger.debug('Cleared address timer', {
        metadata: { address },
      });
    }
  }

  /**
   * Send dummy transactions to fill nonce gaps
   */
  private async sendDummyTransactions(
    fromAddress: string,
    startNonce: number,
    endNonce: number,
    context: ChainContext
  ): Promise<void> {
    try {
      const provider = context.getProvider();
      if (!provider) {
        throw new Error(`No provider available for ${context.toString()}`);
      }

      // Get wallet/signer - this needs to be implemented based on your setup
      // For now, we'll just log what would be done
      this.logger.warn('Dummy transaction sending not fully implemented', {
        metadata: {
          fromAddress,
          startNonce,
          endNonce,
          chain: context.chain,
          network: context.network,
          chainId: context.chainId,
          gapSize: endNonce - startNonce,
        },
      });

      // TODO: Implement actual dummy transaction sending
      // This would require:
      // 1. Access to the private key or signer for fromAddress
      // 2. Creating minimal value transactions (e.g., 0 ETH to self)
      // 3. Sending them with the missing nonces

      // For now, we'll simulate by removing the buffered transaction
      // In a real implementation, this would send actual transactions
      const buffer = this.buffers.get(fromAddress);
      if (buffer && buffer.has(endNonce)) {
        this.logger.info(
          'Removing buffered transaction after dummy tx timeout',
          {
            metadata: {
              fromAddress,
              nonce: endNonce,
              reason: 'dummy_tx_timeout',
            },
          }
        );

        // Remove the buffered transaction that couldn't be processed
        buffer.delete(endNonce);

        // Clean up empty buffer
        if (buffer.size === 0) {
          this.buffers.delete(fromAddress);
        }

        // Clear waiting status
        if (this.waitingForNonces.has(fromAddress)) {
          this.waitingForNonces.delete(fromAddress);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send dummy transactions', error, {
        metadata: {
          fromAddress,
          startNonce,
          endNonce,
          chain: context.chain,
          network: context.network,
          chainId: context.chainId,
        },
      });
      throw error;
    }
  }

  /**
   * Search SQS for missing nonces
   * Returns found transactions that match the missing nonces
   */
  async searchSQSForMissingNonces(
    address: string,
    missingNonces: number[],
    context: ChainContext
  ): Promise<QueuedTransaction[]> {
    if (!this.queueService || !this.config) {
      this.logger.warn('QueueService not initialized, cannot search SQS');
      return [];
    }

    const chainId = context.getChainId();
    this.logger.info('Searching SQS for missing nonces', {
      metadata: {
        address,
        missingNonces,
        chain: context.chain,
        network: context.network,
        chainId,
      },
    });

    try {
      // Receive messages from SQS with visibility timeout 0 to peek without consuming
      const messages = await this.queueService.receiveMessages(
        this.config.SIGNED_TX_QUEUE_URL,
        10, // Max messages to check
        0 // Don't wait, just check immediately
      );

      const foundTransactions: QueuedTransaction[] = [];

      for (const message of messages) {
        // Cast message body to any to handle type issues
        const txData = message.body as any;

        // Parse the transaction to get nonce and from address
        try {
          // Use ethers v6 syntax: Transaction.from()
          const tx = ethers.Transaction.from(txData.signedTransaction);

          // Check if this is a missing nonce for our address
          if (
            tx.from?.toLowerCase() === address.toLowerCase() &&
            tx.chainId === BigInt(chainId) &&
            tx.nonce !== undefined &&
            missingNonces.includes(Number(tx.nonce))
          ) {
            this.logger.info('Found missing nonce in SQS', {
              metadata: {
                address,
                nonce: Number(tx.nonce),
                txHash: tx.hash,
                messageId: message.id,
              },
            });

            // Convert to QueuedTransaction format
            const queuedTx: QueuedTransaction = {
              txHash: tx.hash || '',
              nonce: Number(tx.nonce),
              signedTx: txData.signedTransaction,
              requestId: txData.withdrawalId || txData.id,
              fromAddress: address,
              timestamp: new Date(txData.createdAt || Date.now()),
              transactionType: txData.transactionType,
              batchId: txData.batchId,
              chainContext: context, // Add chainContext from parameter
            };

            foundTransactions.push(queuedTx);

            // Delete the message from SQS since we're processing it
            await this.queueService.deleteMessage(
              this.config.SIGNED_TX_QUEUE_URL,
              message.receiptHandle
            );
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse transaction from SQS message', {
            metadata: {
              messageId: message.id,
              parseError: String(parseError),
            },
          });
        }
      }

      if (foundTransactions.length > 0) {
        this.logger.info('Found transactions in SQS', {
          metadata: {
            address,
            foundNonces: foundTransactions.map(tx => tx.nonce),
            totalFound: foundTransactions.length,
          },
        });
      } else {
        this.logger.info('No missing nonces found in SQS', {
          metadata: {
            address,
            searchedFor: missingNonces,
          },
        });
      }

      return foundTransactions;
    } catch (error) {
      this.logger.error('Failed to search SQS for missing nonces', {
        metadata: {
          address,
          missingNonces,
          errorMessage: String(error),
        },
      });
      return [];
    }
  }

  /**
   * Process transaction with SQS search for missing nonces
   */
  async processTransactionWithSQSSearch(
    transaction: QueuedTransaction
  ): Promise<boolean> {
    const { fromAddress, nonce, txHash, chainContext } = transaction;

    // Get expected nonce using chainContext from transaction
    const expectedNonce = await this.getExpectedNonce(
      fromAddress,
      chainContext
    );

    this.logger.debug('Processing transaction with SQS search', {
      metadata: {
        fromAddress,
        nonce,
        expectedNonce,
        txHash,
      },
    });

    if (nonce === expectedNonce) {
      // Perfect match - process immediately
      this.logger.info('Processing transaction immediately', {
        metadata: { fromAddress, nonce, txHash },
      });

      // Clear waiting status
      if (this.waitingForNonces.has(fromAddress)) {
        this.waitingForNonces.delete(fromAddress);
      }

      return true; // Ready to broadcast
    } else if (nonce > expectedNonce) {
      // Future nonce - check SQS for missing nonces first
      const gap = nonce - expectedNonce;
      const missingNonces: number[] = [];

      for (let n = expectedNonce; n < nonce; n++) {
        missingNonces.push(n);
      }

      this.logger.info('Nonce gap detected, searching SQS for missing nonces', {
        metadata: {
          fromAddress,
          expectedNonce,
          receivedNonce: nonce,
          gap,
          missingNonces,
        },
      });

      // Search SQS for missing nonces
      const foundTransactions = await this.searchSQSForMissingNonces(
        fromAddress,
        missingNonces,
        chainContext
      );

      // Add found transactions to buffer
      for (const foundTx of foundTransactions) {
        this.addToBuffer(fromAddress, foundTx.nonce, foundTx);
      }

      // Add current transaction to buffer
      this.addToBuffer(fromAddress, nonce, transaction);

      // Check if we can now process some buffered transactions
      const buffer = this.buffers.get(fromAddress);
      if (buffer && buffer.has(expectedNonce)) {
        this.logger.info(
          'Found expected nonce after SQS search, can process now',
          {
            metadata: {
              fromAddress,
              expectedNonce,
              bufferedNonces: Array.from(buffer.keys()).sort((a, b) => a - b),
            },
          }
        );

        // Clear waiting status since we found what we need
        if (this.waitingForNonces.has(fromAddress)) {
          this.waitingForNonces.delete(fromAddress);
        }

        // Return false here since the caller should get the transaction from buffer
        return false;
      }

      // Still have gaps after SQS search
      if (!this.waitingForNonces.has(fromAddress)) {
        this.waitingForNonces.set(fromAddress, {
          nonce: expectedNonce,
          since: new Date(),
        });

        this.logger.warn('Still have nonce gap after SQS search', {
          metadata: {
            fromAddress,
            expectedNonce,
            receivedNonce: nonce,
            remainingGap: missingNonces.filter(
              n => !foundTransactions.some(tx => tx.nonce === n)
            ),
          },
        });
      }

      return false; // Buffered for later
    } else {
      // Old nonce - should not happen normally
      this.logger.warn('Received old nonce, skipping', {
        metadata: {
          fromAddress,
          expectedNonce,
          receivedNonce: nonce,
        },
      });

      return false; // Skip old nonce
    }
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
