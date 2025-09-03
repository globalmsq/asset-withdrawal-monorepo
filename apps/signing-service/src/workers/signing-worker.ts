import { BaseWorker } from './base-worker';
import {
  WithdrawalRequest,
  ChainProviderFactory,
  ChainProvider,
  TransactionStatus,
  Message,
  NoncePoolService,
  isNetworkError,
  retryWithBackoff,
} from '@asset-withdrawal/shared';
import {
  WithdrawalRequestService,
  DatabaseService,
  SignedTransactionService,
} from '@asset-withdrawal/database';
import { SignedTransaction } from '../types';
import { TransactionSigner } from '../services/transaction-signer';
import { SecureSecretsManager } from '../services/secrets-manager';
import { NonceCacheService } from '../services/nonce-cache.service';
import { GasPriceCache } from '../services/gas-price-cache';
import {
  MulticallService,
  BatchTransferRequest,
} from '../services/multicall.service';
import { QueueRecoveryService } from '../services/queue-recovery.service';
import { Logger } from '../utils/logger';
import { Config } from '../config';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as os from 'os';
import Redis from 'ioredis';

export class SigningWorker extends BaseWorker<
  WithdrawalRequest,
  SignedTransaction
> {
  private withdrawalRequestService: WithdrawalRequestService;
  private signedTransactionService: SignedTransactionService;
  private nonceCache: NonceCacheService;
  private noncePoolService!: NoncePoolService; // Initialized in initialize()
  private gasPriceCache: GasPriceCache;
  private multicallServices: Map<string, MulticallService>;
  private signers: Map<string, TransactionSigner>;
  private auditLogger: Logger;
  private dbClient: any; // Prisma client for BatchTransaction operations
  private readonly instanceId: string;
  private queueRecoveryService: QueueRecoveryService;

  constructor(
    private config: Config,
    private secretsManager: SecureSecretsManager,
    logger: Logger
  ) {
    super(
      'SigningWorker',
      config.queue.requestQueueUrl,
      config.queue.signedTxQueueUrl,
      {
        region: config.aws.region,
        endpoint: config.aws.endpoint,
        credentials: config.aws.endpoint
          ? {
              accessKeyId: config.aws.accessKeyId || 'test',
              secretAccessKey: config.aws.secretAccessKey || 'test',
            }
          : undefined,
      },
      logger,
      {
        inputDlqUrl: config.queue.requestDlqUrl,
        outputDlqUrl: config.queue.signedTxDlqUrl,
      }
    );

    this.auditLogger = logger;

    // Generate unique instance ID
    this.instanceId = `${os.hostname()}-${process.pid}-${Date.now()}`;

    // Initialize database with config
    const dbService = DatabaseService.getInstance(config.database);
    this.dbClient = dbService.getClient();
    this.withdrawalRequestService = new WithdrawalRequestService(this.dbClient);
    this.signedTransactionService = new SignedTransactionService(this.dbClient);

    // Initialize empty maps for multi-chain support
    this.multicallServices = new Map();
    this.signers = new Map();

    // Create nonce cache service
    this.nonceCache = new NonceCacheService();

    // Create gas price cache (30 seconds TTL)
    this.gasPriceCache = new GasPriceCache(30);

    // Create queue recovery service
    this.queueRecoveryService = new QueueRecoveryService(this.nonceCache);

    // NoncePoolService will be initialized in initialize() method
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Ensure database is connected before initializing
    const dbService = DatabaseService.getInstance(this.config.database);
    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error(
        'Database is not healthy during SigningWorker initialization'
      );
    }

    // Connect to Redis for nonce management
    await this.nonceCache.connect();

    // Initialize NoncePoolService with Redis
    if (this.config.redis) {
      const redisClient = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
      });
      this.noncePoolService = new NoncePoolService(redisClient);
    } else {
      throw new Error('Redis configuration is required for NoncePoolService');
    }

    // Skip pre-initialization to avoid network connection issues at startup
    // Signers will be created on-demand when first message is received
    // if (this.config.nodeEnv === 'development') {
    //   await this.preInitializeDevelopmentSigners();
    // }

    this.auditLogger.info('SigningWorker initialized successfully', {
      instanceId: this.instanceId,
    });
  }

  /**
   * Pre-initialize signers for commonly used chains in development
   * This ensures MAX approvals are set on startup
   */
  private async preInitializeDevelopmentSigners(): Promise<void> {
    try {
      this.auditLogger.info(
        'Pre-initializing signers for development environment'
      );

      // Initialize signers for common development configurations
      const developmentChains = [
        { chain: 'localhost', network: 'testnet' }, // Hardhat localhost only
        // { chain: 'polygon', network: 'testnet' },    // Skip Polygon Amoy testnet in local development
      ];

      for (const config of developmentChains) {
        try {
          this.auditLogger.info('Pre-initializing signer', config);
          await this.getOrCreateSigner(config.chain, config.network);
        } catch (error) {
          // Log error but continue - some chains might not be configured
          this.auditLogger.warn('Failed to pre-initialize signer', {
            ...config,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.auditLogger.info('Development signers pre-initialization completed');
    } catch (error) {
      this.auditLogger.error(
        'Failed to pre-initialize development signers',
        error
      );
      // Don't throw - this is not critical for operation
    }
  }

  /**
   * Get or create a TransactionSigner for a specific chain/network combination
   */
  private async getOrCreateSigner(
    chain: string,
    network: string
  ): Promise<TransactionSigner> {
    const key = `${chain}_${network}`;

    if (!this.signers.has(key)) {
      this.auditLogger.info('Creating new TransactionSigner', {
        chain,
        network,
      });

      // Create chain provider
      const chainProvider = ChainProviderFactory.getProvider(
        chain as any,
        network as any
      );

      // Wait for chainId verification to complete
      const verificationSuccess = await chainProvider.waitForVerification(5000);
      if (!verificationSuccess) {
        const chainIdError = chainProvider.getChainIdError();
        this.auditLogger.error('ChainId verification failed', {
          chain,
          network,
          error: chainIdError,
        });
        // Don't store the invalid signer
        throw new Error(
          `Failed to verify chainId for ${chain}/${network}: ${
            chainIdError || 'Verification timeout'
          }`
        );
      }

      // Create multicall service for this chain
      const multicallService = new MulticallService(
        chainProvider,
        this.auditLogger
      );
      this.multicallServices.set(key, multicallService);

      // Create transaction signer with nonce pool service
      const signer = new TransactionSigner(
        chainProvider,
        this.secretsManager,
        this.nonceCache,
        this.gasPriceCache,
        multicallService,
        this.auditLogger,
        this.config,
        this.noncePoolService
      );

      // Initialize the signer
      await signer.initialize();

      this.signers.set(key, signer);
    }

    return this.signers.get(key)!;
  }

  /**
   * Override canProcess to check blockchain connections
   * Messages are processed only if at least one blockchain is connected
   */
  protected async canProcess(): Promise<boolean> {
    try {
      // Get all currently configured signers/providers
      const availableChains: string[] = [];
      const disconnectedChains: string[] = [];

      // Check all configured chains
      for (const [key, signer] of this.signers) {
        const chainProvider = signer.getChainProvider();
        const isConnected = chainProvider.isConnected();

        if (isConnected) {
          availableChains.push(key);
        } else {
          disconnectedChains.push(key);
        }
      }

      // If no signers are initialized yet, allow processing (they'll be created on demand)
      if (this.signers.size === 0) {
        return true;
      }

      // If ALL chains are disconnected, stop processing
      if (availableChains.length === 0 && disconnectedChains.length > 0) {
        this.auditLogger.warn(
          'All blockchain connections are down, stopping SQS processing',
          {
            disconnectedChains,
          }
        );
        return false;
      }

      // If some chains are disconnected, log warning but continue
      if (disconnectedChains.length > 0) {
        this.auditLogger.warn('Some blockchain connections are down', {
          availableChains,
          disconnectedChains,
        });
      }

      // At least one chain is connected, continue processing
      return true;
    } catch (error) {
      this.auditLogger.error('Error checking blockchain connections', error);
      // On error, allow processing to continue
      return true;
    }
  }

  /**
   * Claims messages atomically to prevent multiple instances from processing the same message
   * @param messages Messages received from the queue
   * @returns Messages successfully claimed by this instance
   */
  private async claimMessages(
    messages: Message<WithdrawalRequest>[]
  ): Promise<Message<WithdrawalRequest>[]> {
    const claimedMessages: Message<WithdrawalRequest>[] = [];

    for (const message of messages) {
      try {
        // Use transaction to atomically update status
        const result = await this.dbClient.$transaction(async (tx: any) => {
          const existing = await tx.withdrawalRequest.findUnique({
            where: { requestId: message.body.id },
            select: { status: true, processingInstanceId: true },
          });

          // Check if already being processed or completed
          if (!existing) {
            this.auditLogger.warn('Withdrawal request not found in database', {
              requestId: message.body.id,
            });
            return null;
          }

          if (existing.status !== TransactionStatus.PENDING) {
            this.auditLogger.info(
              'Withdrawal request already being processed or completed',
              {
                requestId: message.body.id,
                status: existing.status,
                processingInstanceId: existing.processingInstanceId,
              }
            );
            return null;
          }

          // Claim the message by updating status
          return await tx.withdrawalRequest.update({
            where: {
              requestId: message.body.id,
              status: TransactionStatus.PENDING, // Conditional update
            },
            data: {
              status: TransactionStatus.VALIDATING,
              processingInstanceId: this.instanceId,
              processingStartedAt: new Date(),
            },
          });
        });

        if (result) {
          claimedMessages.push(message);
          this.auditLogger.info('Successfully claimed message', {
            requestId: message.body.id,
            instanceId: this.instanceId,
          });
        } else {
          // Another instance is processing this message, remove from queue
          await this.inputQueue.deleteMessage(message.receiptHandle);
          this.auditLogger.info(
            'Message already claimed by another instance, removed from queue',
            {
              requestId: message.body.id,
            }
          );
        }
      } catch (error) {
        this.auditLogger.error('Failed to claim message', error, {
          requestId: message.body.id,
          instanceId: this.instanceId,
        });
        // Don't process messages we couldn't claim
      }
    }

    return claimedMessages;
  }

  protected async processBatch(): Promise<void> {
    // Check gas price before processing messages with retry logic
    try {
      await retryWithBackoff(async () => this.updateGasPriceCache(), {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 4000,
        onRetry: (attempt, error) => {
          this.auditLogger.info('Retrying gas price update', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } catch (error) {
      this.auditLogger.warn(
        'Failed to fetch gas price after retries, skipping message processing',
        error
      );
      return; // Skip this batch
    }

    // If batch processing is disabled, use normal processing
    if (!this.config.batchProcessing.enabled) {
      this.auditLogger.debug(
        'Batch processing disabled, using normal processing'
      );
      return super.processBatch();
    }

    // Receive messages from queue
    const messages = await this.inputQueue.receiveMessages({
      maxMessages: this.batchSize,
      waitTimeSeconds: 20, // Long polling
    });

    if (messages.length === 0) {
      return;
    }

    this.auditLogger.info(`Received ${messages.length} messages from queue`);

    // First, claim messages to prevent other instances from processing them
    const claimedMessages = await this.claimMessages(messages);

    if (claimedMessages.length === 0) {
      this.auditLogger.info('No messages successfully claimed');
      return;
    }

    this.auditLogger.info(
      `Successfully claimed ${claimedMessages.length} messages`
    );

    // Validate claimed messages
    const validMessages: Message<WithdrawalRequest>[] = [];
    const invalidMessages: Message<WithdrawalRequest>[] = [];

    for (const message of claimedMessages) {
      const validationError = this.validateWithdrawalRequest(message.body);
      if (validationError) {
        invalidMessages.push(message);
        this.auditLogger.error('Invalid withdrawal request', null, {
          requestId: message.body.id,
          error: validationError,
        });

        // Mark as FAILED and delete from queue
        try {
          await this.withdrawalRequestService.updateStatusWithError(
            message.body.id,
            TransactionStatus.FAILED,
            validationError
          );
          await this.inputQueue.deleteMessage(message.receiptHandle);
          this.auditLogger.info(
            'Invalid request marked as FAILED and removed from queue',
            {
              requestId: message.body.id,
            }
          );
        } catch (error) {
          this.auditLogger.error(
            'Failed to update invalid request status',
            error,
            {
              requestId: message.body.id,
            }
          );
        }
      } else {
        validMessages.push(message);
      }
    }

    if (validMessages.length === 0) {
      this.auditLogger.info('No valid messages to process after validation');
      return;
    }

    this.auditLogger.info(
      `Processing ${validMessages.length} valid messages (${invalidMessages.length} invalid)`,
      {
        validIds: validMessages.map(m => m.body.id),
        invalidIds: invalidMessages.map(m => m.body.id),
      }
    );

    // Separate valid messages by try count
    const { messagesForBatch, messagesForSingle } =
      await this.separateMessagesByTryCount(validMessages);

    // Process messages with previous attempts individually
    if (messagesForSingle.length > 0) {
      this.auditLogger.info(
        'Processing messages with previous attempts individually',
        {
          count: messagesForSingle.length,
          requestIds: messagesForSingle.map(m => m.body.id),
        }
      );
      await this.processSingleTransactions(messagesForSingle);
    }

    // Check if remaining messages should use batch processing
    if (
      messagesForBatch.length > 0 &&
      (await this.shouldUseBatchProcessing(messagesForBatch))
    ) {
      await this.processBatchTransactions(messagesForBatch);
    } else if (messagesForBatch.length > 0) {
      // Process remaining messages individually if they don't meet batch criteria
      await this.processSingleTransactions(messagesForBatch);
    }
  }

  private async updateGasPriceCache(): Promise<void> {
    // Note: Gas price cache is shared across all chains
    // This is acceptable as gas prices are fetched per-transaction
    // and cached values are only used as a performance optimization

    // For now, we'll skip pre-fetching gas prices since we don't know
    // which chain will be used until we receive messages
    this.auditLogger.debug(
      'Gas price cache update skipped - will fetch on demand per chain'
    );
  }

  private async separateMessagesByTryCount(
    messages: Message<WithdrawalRequest>[]
  ): Promise<{
    messagesForBatch: Message<WithdrawalRequest>[];
    messagesForSingle: Message<WithdrawalRequest>[];
  }> {
    const requestIds = messages.map(m => m.body.id);
    const withdrawalRequests = await this.dbClient.withdrawalRequest.findMany({
      where: { requestId: { in: requestIds } },
      select: { requestId: true, tryCount: true },
    });

    // Create a map for quick lookup
    const requestTryCountMap = new Map<string, number>();
    withdrawalRequests.forEach(
      (req: { requestId: string; tryCount: number }) => {
        requestTryCountMap.set(req.requestId, req.tryCount);
      }
    );

    const messagesForBatch: Message<WithdrawalRequest>[] = [];
    const messagesForSingle: Message<WithdrawalRequest>[] = [];

    // Separate messages based on try count
    messages.forEach(message => {
      const tryCount = requestTryCountMap.get(message.body.id) || 0;
      if (tryCount > 0) {
        // If already tried, process individually
        messagesForSingle.push(message);
      } else {
        // If first attempt, eligible for batch
        messagesForBatch.push(message);
      }
    });

    return { messagesForBatch, messagesForSingle };
  }

  private async shouldUseBatchProcessing(
    messages: Message<WithdrawalRequest>[]
  ): Promise<boolean> {
    // Check if batch processing is enabled
    if (!this.config.batchProcessing.enabled) {
      this.auditLogger.debug('Batch processing disabled by config');
      return false;
    }

    // Check minimum batch size
    if (messages.length < this.config.batchProcessing.minBatchSize) {
      this.auditLogger.debug('Batch size below minimum threshold', {
        messageCount: messages.length,
        minBatchSize: this.config.batchProcessing.minBatchSize,
      });
      return false;
    }

    // Group messages by token
    const tokenGroups = this.groupByToken(messages);

    // Check if any token group meets the batch threshold
    let hasEligibleGroup = false;
    for (const [tokenAddress, groupMessages] of tokenGroups) {
      if (groupMessages.length >= this.config.batchProcessing.batchThreshold) {
        hasEligibleGroup = true;
        break;
      }
    }

    if (!hasEligibleGroup) {
      this.auditLogger.debug('No token group meets batch threshold', {
        tokenGroups: Array.from(tokenGroups.entries()).map(([token, msgs]) => ({
          token,
          count: msgs.length,
        })),
        batchThreshold: this.config.batchProcessing.batchThreshold,
      });
      return false;
    }

    // Calculate gas savings
    const gasSavingsPercent = this.calculateGasSavings(messages);
    if (gasSavingsPercent < this.config.batchProcessing.minGasSavingsPercent) {
      this.auditLogger.debug('Gas savings below minimum threshold', {
        gasSavingsPercent,
        minGasSavingsPercent: this.config.batchProcessing.minGasSavingsPercent,
      });
      return false;
    }

    this.auditLogger.info('Batch processing criteria met', {
      messageCount: messages.length,
      tokenGroupCount: tokenGroups.size,
      estimatedGasSavings: `${gasSavingsPercent.toFixed(2)}%`,
    });

    return true;
  }

  private groupByToken(
    messages: Message<WithdrawalRequest>[]
  ): Map<string, Message<WithdrawalRequest>[]> {
    return messages.reduce((groups, message) => {
      const tokenAddress = message.body.tokenAddress.toLowerCase();
      if (!groups.has(tokenAddress)) {
        groups.set(tokenAddress, []);
      }
      groups.get(tokenAddress)!.push(message);
      return groups;
    }, new Map());
  }

  private calculateGasSavings(messages: Message<WithdrawalRequest>[]): number {
    const count = messages.length;
    const singleTxTotalGas =
      BigInt(count) * BigInt(this.config.batchProcessing.singleTxGasEstimate);
    const batchTxTotalGas =
      BigInt(this.config.batchProcessing.batchBaseGas) +
      BigInt(count) * BigInt(this.config.batchProcessing.batchPerTxGas);

    if (singleTxTotalGas <= batchTxTotalGas) {
      return 0; // No savings
    }

    const savings = singleTxTotalGas - batchTxTotalGas;
    const savingsPercent = Number((savings * 100n) / singleTxTotalGas);

    return savingsPercent;
  }

  /**
   * Validates a withdrawal request before processing
   * @returns Error message if validation fails, null if valid
   */
  private validateWithdrawalRequest(request: WithdrawalRequest): string | null {
    // Validate chain and network are provided
    if (!request.chain || !request.network) {
      return `Missing chain or network information. Chain: ${request.chain}, Network: ${request.network}`;
    }

    // Validate chain support - try to create a provider to check support
    try {
      ChainProviderFactory.getProvider(
        request.chain as any,
        request.network as any
      );
    } catch (error) {
      return `Unsupported chain/network combination: ${request.chain}/${request.network}`;
    }

    // Validate recipient address format
    if (!request.toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `Invalid recipient address format: ${request.toAddress}`;
    }

    // Validate token address format (if provided - null means native token transfer)
    if (
      request.tokenAddress &&
      !request.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)
    ) {
      return `Invalid token address format: ${request.tokenAddress}`;
    }

    // Validate amount
    try {
      const amountBigInt = BigInt(request.amount);
      if (amountBigInt <= 0n) {
        return `Invalid amount: ${request.amount}. Must be positive`;
      }
    } catch (error) {
      return `Invalid amount format: ${request.amount}. Must be a valid number`;
    }

    return null; // No validation errors
  }

  private async processBatchTransactions(
    messages: Message<WithdrawalRequest>[]
  ): Promise<void> {
    const tokenGroups = this.groupByToken(messages);

    for (const [tokenAddress, groupMessages] of tokenGroups) {
      if (groupMessages.length >= this.config.batchProcessing.batchThreshold) {
        try {
          // Process as batch
          await this.processBatchGroup(tokenAddress, groupMessages);
        } catch (error) {
          this.auditLogger.error(
            'Batch processing failed, messages will be retried',
            error,
            {
              tokenAddress,
              messageCount: groupMessages.length,
            }
          );
          // Don't process individually here - messages are still in queue
          // They will be reprocessed after visibility timeout
          // The DB has been updated to PENDING with error message
        }
      } else {
        // Process individually
        await this.processSingleTransactions(groupMessages);
      }
    }
  }

  /**
   * Helper method to estimate gas for a message
   */
  private async estimateGasForMessage(message: WithdrawalRequest): Promise<{
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  } | null> {
    try {
      const chain = message.chain || 'polygon';
      const network = message.network;
      const signer = await this.getOrCreateSigner(chain, network);

      // Call signer's gas estimation method
      const gasEstimate = await signer.estimateGasForTransaction({
        to: message.toAddress,
        amount: message.amount,
        tokenAddress: message.tokenAddress,
        transactionId: message.id,
      });

      return gasEstimate;
    } catch (error) {
      this.auditLogger.error('Failed to estimate gas for message', error, {
        requestId: message.id,
      });
      return null;
    }
  }

  /**
   * Group messages by chain and network
   */
  private groupMessagesByChain(
    messages: Array<{
      message: Message<WithdrawalRequest>;
      gasEstimate: {
        gasLimit: bigint;
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
      };
    }>
  ): Map<string, typeof messages> {
    const groups = new Map<string, typeof messages>();

    for (const item of messages) {
      const chain = item.message.body.chain || 'polygon';
      const network = item.message.body.network;
      const key = `${chain}:${network}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    return groups;
  }

  private async processSingleTransactions(
    messages: Message<WithdrawalRequest>[]
  ): Promise<void> {
    // Step 1: Estimate gas for all messages in parallel
    const gasEstimationPromises = messages.map(async message => {
      const gasEstimate = await this.estimateGasForMessage(message.body);
      if (gasEstimate) {
        return { message, gasEstimate };
      }
      // Gas estimation failed - handle the message
      this.auditLogger.warn('Gas estimation failed, skipping message', {
        requestId: message.body.id,
      });

      // Update status to indicate gas estimation failure
      try {
        await this.withdrawalRequestService.updateStatusWithError(
          message.body.id,
          TransactionStatus.FAILED,
          'Gas estimation failed'
        );
        // Delete message from queue as it's non-recoverable
        await this.inputQueue.deleteMessage(message.receiptHandle);
      } catch (err) {
        this.logger.error(
          'Failed to update status for gas estimation failure',
          err
        );
      }

      return null;
    });

    const gasEstimationResults = await Promise.all(gasEstimationPromises);
    const messagesWithGas = gasEstimationResults.filter(
      (result): result is NonNullable<typeof result> => result !== null
    );

    if (messagesWithGas.length === 0) {
      this.logger.warn('No messages passed gas estimation');
      return;
    }

    this.logger.info('Gas estimation completed', {
      total: messages.length,
      successful: messagesWithGas.length,
      failed: messages.length - messagesWithGas.length,
    });

    // Step 2: Group messages by chain and network
    const chainGroups = this.groupMessagesByChain(messagesWithGas);

    // Step 3: Allocate nonces for each group and process
    const allMessagesWithNonces: Array<{
      message: Message<WithdrawalRequest>;
      nonce: number;
      gasEstimate: {
        gasLimit: bigint;
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
      };
    }> = [];

    for (const [chainKey, group] of chainGroups.entries()) {
      const [chain, network] = chainKey.split(':');

      // Get signer for this chain
      const signer = await this.getOrCreateSigner(chain, network);
      const address = await signer.getAddress();

      // Allocate nonces sequentially for this group
      for (const item of group) {
        try {
          const nonce = await this.nonceCache.getAndIncrement(
            address,
            chain,
            network
          );

          allMessagesWithNonces.push({
            message: item.message,
            nonce,
            gasEstimate: item.gasEstimate,
          });

          this.auditLogger.info('Allocated nonce for message', {
            requestId: item.message.body.id,
            nonce,
            chain,
            network,
          });
        } catch (error) {
          this.auditLogger.error('Failed to allocate nonce', error, {
            requestId: item.message.body.id,
          });
          // Skip this message if nonce allocation fails
        }
      }
    }

    // Step 4: Process all messages in parallel with pre-allocated nonces and gas estimates
    const messagePromises = allMessagesWithNonces.map(
      async ({ message, nonce, gasEstimate }) => {
        const messageId = message.id || message.receiptHandle;
        this.processingMessages.add(messageId);

        try {
          const result = await this.processMessage(
            message.body,
            nonce,
            gasEstimate
          );

          // Send to output queue if configured and result is provided
          if (this.outputQueue && result !== undefined) {
            await this.outputQueue.sendMessage(result as SignedTransaction);
          }

          // Delete message from input queue
          await this.inputQueue.deleteMessage(message.receiptHandle);
          this.processedCount++;
          this.lastProcessedAt = new Date();
        } catch (error) {
          this.logger.error(`Error processing message ${messageId}`, error);
          this.lastError =
            error instanceof Error ? error.message : 'Unknown error';
          this.errorCount++;

          // Note: Nonces are already allocated and cannot be returned in Redis-based system
          // Failed transactions will skip the nonce, which is acceptable

          // Check if error is recoverable
          const errorMessage =
            error instanceof Error
              ? error.message.toLowerCase()
              : String(error).toLowerCase();
          const isRecoverable = this.isRecoverableError(errorMessage);

          if (isRecoverable) {
            this.auditLogger.info(
              'Recoverable error detected, recovering transaction',
              {
                withdrawalId: message.body.id,
                error: errorMessage,
              }
            );

            try {
              await this.queueRecoveryService.recoverTransactionOnError(
                message.body.id,
                error,
                message.receiptHandle
              );
            } catch (recoveryError) {
              this.auditLogger.error(
                'Failed to recover transaction',
                recoveryError,
                {
                  withdrawalId: message.body.id,
                }
              );
              // Message will be returned to queue after visibility timeout
            }
          } else {
            // Non-recoverable error - delete message from queue
            await this.inputQueue.deleteMessage(message.receiptHandle);
          }
        } finally {
          this.processingMessages.delete(messageId);
        }
      }
    );

    await Promise.all(messagePromises);
  }

  /**
   * Creates a batch transaction with locking to prevent concurrent processing
   * @param tokenAddress Token address for the batch
   * @param messages Messages to include in the batch
   * @returns BatchTransaction if successful, null if messages were already claimed
   */
  private async createBatchWithLocking(
    tokenAddress: string,
    messages: Message<WithdrawalRequest>[]
  ): Promise<any | null> {
    return await this.dbClient.$transaction(async (tx: any) => {
      // Verify all messages are still available for this instance
      const requestIds = messages.map(m => m.body.id);
      const validRequests = await tx.withdrawalRequest.findMany({
        where: {
          requestId: { in: requestIds },
          status: TransactionStatus.VALIDATING,
          processingInstanceId: this.instanceId,
        },
      });

      if (validRequests.length !== messages.length) {
        // Some messages were processed by another instance
        this.auditLogger.warn(
          'Some messages were already processed by another instance',
          {
            expected: messages.length,
            found: validRequests.length,
            tokenAddress,
          }
        );
        return null;
      }

      // Calculate total amount and get symbol
      const totalAmount = messages
        .reduce((sum, msg) => {
          return sum + BigInt(msg.body.amount);
        }, 0n)
        .toString();

      const symbol = messages[0]?.body.symbol || 'UNKNOWN';

      // Get chain info from first message (all messages in batch should have same chain)
      const firstMessage = messages[0];
      const chain = firstMessage.body.chain || 'polygon';
      const network = firstMessage.body.network || 'mainnet';

      // Get chain provider to get multicall address and chain ID
      const chainProvider = ChainProviderFactory.getProvider(
        chain as any,
        network as any
      );

      // Get the signer to get the current nonce
      const signer = await this.getOrCreateSigner(chain, network);
      const signerAddress = await signer.getAddress();

      // Get the next nonce that will be used for this batch
      // This is important to store even if the transaction fails
      const nextNonce = await this.nonceCache.get(
        signerAddress,
        chain,
        network
      );
      const actualNonce = nextNonce || 0;

      // Create batch transaction
      const batch = await tx.signedBatchTransaction.create({
        data: {
          multicallAddress: chainProvider.getMulticall3Address(),
          totalRequests: messages.length,
          totalAmount: totalAmount,
          symbol: symbol,
          chain: chain,
          network: network,
          nonce: actualNonce, // Store the actual nonce that will be used
          gasLimit: '0', // Will be updated when signed
          tryCount: 0,
          status: 'PENDING',
        },
      });

      // Update all withdrawal requests atomically
      await tx.withdrawalRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: {
          batchId: batch.id.toString(),
          processingMode: 'BATCH',
          status: TransactionStatus.SIGNING,
          tryCount: { increment: 1 },
        },
      });

      return batch;
    });
  }

  private async processBatchGroup(
    tokenAddress: string,
    messages: Message<WithdrawalRequest>[]
  ): Promise<void> {
    this.auditLogger.info('Processing batch group', {
      tokenAddress,
      messageCount: messages.length,
      instanceId: this.instanceId,
    });

    let batchTransaction: any;
    try {
      // Create batch transaction with locking
      batchTransaction = await this.createBatchWithLocking(
        tokenAddress,
        messages
      );

      if (!batchTransaction) {
        this.auditLogger.warn(
          'Failed to create batch - messages already processed',
          {
            tokenAddress,
            messageCount: messages.length,
          }
        );
        // Remove messages from queue as they're being processed elsewhere
        await Promise.all(
          messages.map(msg => this.inputQueue.deleteMessage(msg.receiptHandle))
        );
        return;
      }

      this.auditLogger.info('Batch transaction created', {
        batchId: batchTransaction.id.toString(),
        tokenAddress,
        messageCount: messages.length,
      });

      // Prepare batch transfers with address normalization
      // Note: Basic validation already done in processBatch()
      const transfers: BatchTransferRequest[] = messages.map(message => {
        // Normalize addresses to handle checksum formatting
        let normalizedTokenAddress: string;
        let normalizedToAddress: string;

        try {
          // Normalize token address with proper checksum
          normalizedTokenAddress = ethers.getAddress(
            message.body.tokenAddress.trim()
          );
        } catch (error) {
          // If checksum validation fails, use lowercase format
          normalizedTokenAddress = message.body.tokenAddress
            .trim()
            .toLowerCase();
          this.auditLogger.warn('Token address checksum normalization', {
            requestId: message.body.id,
            originalAddress: message.body.tokenAddress,
            normalizedAddress: normalizedTokenAddress,
          });
        }

        try {
          // Normalize recipient address with proper checksum
          normalizedToAddress = ethers.getAddress(
            message.body.toAddress.trim()
          );
        } catch (error) {
          // If checksum validation fails, use lowercase format
          normalizedToAddress = message.body.toAddress.trim().toLowerCase();
          this.auditLogger.warn('Recipient address checksum normalization', {
            requestId: message.body.id,
            originalAddress: message.body.toAddress,
            normalizedAddress: normalizedToAddress,
          });
        }

        return {
          tokenAddress: normalizedTokenAddress,
          to: normalizedToAddress,
          amount: message.body.amount,
          transactionId: message.body.id,
        };
      });

      // Get chain info from first message
      const firstMessage = messages[0];
      const chain = firstMessage.body.chain || 'polygon';
      const network = firstMessage.body.network || 'mainnet';

      // Get appropriate signer and multicall service for this chain
      const signer = await this.getOrCreateSigner(chain, network);
      const multicallKey = `${chain}_${network}`;
      const multicallService = this.multicallServices.get(multicallKey)!;

      // Prepare batch transaction data (skip gas estimation as it will be done during signing after approvals)
      const preparedBatch = await multicallService.prepareBatchTransfer(
        transfers,
        await signer.getAddress(),
        true
      );

      // Sign batch transaction
      const signedBatchTx = await signer.signBatchTransaction({
        transfers,
        batchId: batchTransaction.id.toString(),
      });

      // Update batch transaction with txHash and gas details
      await this.dbClient.signedBatchTransaction.update({
        where: { id: batchTransaction.id },
        data: {
          txHash: signedBatchTx.hash,
          nonce: signedBatchTx.nonce,
          gasLimit: signedBatchTx.gasLimit,
          maxFeePerGas: signedBatchTx.maxFeePerGas,
          maxPriorityFeePerGas: signedBatchTx.maxPriorityFeePerGas,
          status: 'SIGNED',
        },
      });

      // Update withdrawal requests to SIGNED status
      await this.dbClient.withdrawalRequest.updateMany({
        where: { batchId: batchTransaction.id.toString() },
        data: { status: TransactionStatus.SIGNED },
      });

      // Delete messages from queue
      await Promise.all(
        messages.map(msg => this.inputQueue.deleteMessage(msg.receiptHandle))
      );

      // Send signed transaction to output queue
      if (this.outputQueue) {
        await this.outputQueue.sendMessage(signedBatchTx);
      }

      this.processedCount += messages.length;
      this.lastProcessedAt = new Date();

      this.auditLogger.auditSuccess('BATCH_SIGN_COMPLETE', {
        metadata: {
          batchId: batchTransaction.id.toString(),
          txHash: signedBatchTx.hash,
          messageCount: messages.length,
          tokenAddress,
          totalAmount: batchTransaction.totalAmount,
        },
      });
    } catch (error) {
      const batchId = batchTransaction?.id?.toString();
      this.auditLogger.error('Failed to process batch group', error, {
        batchId,
        tokenAddress,
        messageCount: messages.length,
      });

      // Update batch transaction status to FAILED if it was created
      if (batchTransaction?.id) {
        await this.dbClient.signedBatchTransaction.update({
          where: { id: batchTransaction.id },
          data: {
            status: 'FAILED',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        });
      }

      // Check if error is recoverable
      const errorMessage =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase();
      const isRecoverable = this.isRecoverableError(errorMessage);

      if (isRecoverable) {
        this.auditLogger.info(
          'Recoverable error detected, recovering batch transactions',
          {
            batchId,
            messageCount: messages.length,
            error: errorMessage,
          }
        );

        // Recover each message individually
        for (const message of messages) {
          try {
            await this.queueRecoveryService.recoverTransactionOnError(
              message.body.id,
              error,
              message.receiptHandle
            );
          } catch (recoveryError) {
            this.auditLogger.error(
              'Failed to recover transaction',
              recoveryError,
              {
                withdrawalId: message.body.id,
              }
            );
          }
        }
      } else {
        // Non-recoverable error - mark as FAILED
        if (batchId) {
          await this.dbClient.withdrawalRequest.updateMany({
            where: { batchId: batchId },
            data: {
              status: TransactionStatus.FAILED,
              batchId: null,
              processingMode: 'SINGLE',
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          });
        }

        // Delete messages from queue for non-recoverable errors
        await Promise.all(
          messages.map(msg => this.inputQueue.deleteMessage(msg.receiptHandle))
        );
      }

      this.auditLogger.info('Batch error handling completed', {
        batchId,
        messageCount: messages.length,
        isRecoverable,
        reason: 'Batch processing failed',
      });

      // Don't throw error to prevent service termination
    }
  }

  async processMessage(
    message: WithdrawalRequest,
    preAllocatedNonce?: number,
    preEstimatedGas?: {
      gasLimit: bigint;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    }
  ): Promise<SignedTransaction | null> {
    const {
      id: requestId,
      network,
      toAddress: to,
      amount,
      tokenAddress,
      symbol,
    } = message;

    this.auditLogger.info(`Processing withdrawal request: ${requestId}`, {
      network,
      to,
      amount,
      tokenAddress,
      preAllocatedNonce,
    });

    try {
      // Validation is already done in processBatch()
      // This method only handles single transaction signing

      // Update withdrawal request status to SIGNING with conditional check
      const updated = await this.dbClient.$transaction(async (tx: any) => {
        // Verify the request is still owned by this instance
        const existing = await tx.withdrawalRequest.findUnique({
          where: { requestId: requestId },
          select: { status: true, processingInstanceId: true },
        });

        if (!existing || existing.processingInstanceId !== this.instanceId) {
          this.auditLogger.warn('Request no longer owned by this instance', {
            requestId,
            currentInstanceId: this.instanceId,
            ownerInstanceId: existing?.processingInstanceId,
          });
          return null;
        }

        // Update status to SIGNING
        return await tx.withdrawalRequest.update({
          where: {
            requestId: requestId,
            processingInstanceId: this.instanceId, // Ensure we still own it
          },
          data: {
            status: TransactionStatus.SIGNING,
            tryCount: { increment: 1 },
          },
        });
      });

      if (!updated) {
        this.auditLogger.info(
          'Skipping transaction - no longer owned by this instance',
          {
            requestId,
          }
        );

        // Note: Pre-allocated nonces cannot be returned in Redis-based system
        // The nonce will be skipped, which is acceptable for blockchain operation
        if (preAllocatedNonce !== undefined) {
          this.logger.debug(
            'Skipping pre-allocated nonce (cannot be returned)',
            {
              nonce: preAllocatedNonce,
              requestId,
            }
          );
        }

        return null;
      }

      this.auditLogger.auditSuccess('SIGN_TRANSACTION_START', {
        requestId,
        metadata: { chain: message.chain, network, to, amount, tokenAddress },
      });

      // Get appropriate signer for this chain
      const chain = message.chain || 'polygon';
      const signer = await this.getOrCreateSigner(chain, network);

      // Check if the chain provider is valid (connected and chainId verified)
      const chainProvider = signer.getChainProvider();
      if (!chainProvider.isValidProvider()) {
        // Check specific error type
        const chainIdError = chainProvider.getChainIdError();
        if (chainIdError) {
          // ChainId mismatch - configuration error
          throw new Error(
            `ChainId verification failed for ${chain}/${network}: ${chainIdError}`
          );
        } else if (!chainProvider.isConnected()) {
          // WebSocket disconnected
          throw new Error(`Blockchain connection lost for ${chain}/${network}`);
        } else {
          // ChainId verification pending or timed out
          throw new Error(
            `ChainId verification pending or failed for ${chain}/${network}`
          );
        }
      }

      // Build and sign transaction with pre-allocated nonce and gas if provided
      const signedTx = await signer.signTransaction(
        {
          to,
          amount,
          tokenAddress,
          transactionId: requestId,
        },
        preAllocatedNonce,
        preEstimatedGas
      );

      // Save signed transaction to database
      try {
        // Check if this is a retry by counting existing signed transactions
        const existingTxs =
          await this.signedTransactionService.findByRequestId(requestId);
        const tryCount = existingTxs.length;

        await this.signedTransactionService.create({
          requestId: requestId,
          txHash: signedTx.hash,
          nonce: signedTx.nonce,
          gasLimit: signedTx.gasLimit,
          maxFeePerGas: signedTx.maxFeePerGas,
          maxPriorityFeePerGas: signedTx.maxPriorityFeePerGas,
          from: signedTx.from,
          to: signedTx.to,
          value: signedTx.value,
          amount: amount,
          symbol: symbol || 'UNKNOWN',
          data: signedTx.data,
          chain: chain,
          network: network,
          tryCount,
          status: 'SIGNED',
        });

        this.auditLogger.info('Signed transaction saved to database', {
          requestId,
          txHash: signedTx.hash,
          tryCount,
        });
      } catch (dbError) {
        // If DB save fails, log error but continue - we don't want to block the flow
        this.auditLogger.error(
          'Failed to save signed transaction to database',
          dbError,
          {
            requestId,
            txHash: signedTx.hash,
          }
        );
        // Throw error to trigger retry - DB save is critical for tracking
        throw new Error(
          `Failed to save signed transaction: ${dbError instanceof Error ? dbError.message : String(dbError)}`
        );
      }

      // Update withdrawal request status to SIGNED
      // Note: The tx-broadcaster will update to BROADCASTING when it starts broadcasting
      await this.withdrawalRequestService.updateStatus(
        requestId,
        TransactionStatus.SIGNED
      );

      this.auditLogger.auditSuccess('SIGN_TRANSACTION_COMPLETE', {
        requestId,
        metadata: {
          hash: signedTx.hash,
          nonce: signedTx.nonce,
          gasLimit: signedTx.gasLimit,
          maxFeePerGas: signedTx.maxFeePerGas,
        },
      });

      return signedTx;
    } catch (error) {
      // Note: Pre-allocated nonces cannot be returned in Redis-based system
      // Failed transactions will skip the nonce, which is acceptable
      if (preAllocatedNonce !== undefined) {
        this.logger.debug(
          'Pre-allocated nonce lost due to error (cannot be returned)',
          {
            nonce: preAllocatedNonce,
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }

      this.auditLogger.error(`Failed to sign transaction: ${requestId}`, error);

      this.auditLogger.auditFailure(
        'SIGN_TRANSACTION_FAILED',
        error instanceof Error ? error.message : String(error),
        {
          requestId,
          metadata: { network, to, amount, tokenAddress },
        }
      );

      // Check if it's a network error - move to DLQ (RETRYING status)
      if (isNetworkError(error)) {
        this.auditLogger.info(
          'Network error detected, moving to DLQ for later retry',
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }
        );

        // Update status to RETRYING - indicates moved to DLQ
        await this.withdrawalRequestService.updateStatusWithError(
          requestId,
          TransactionStatus.RETRYING,
          `Network error: ${error instanceof Error ? error.message : String(error)}`
        );

        throw error; // Let the caller handle DLQ movement
      }

      // Check if error is recoverable (other than network errors)
      const errorMessage =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase();
      const isRecoverable = this.isRecoverableError(errorMessage);

      if (isRecoverable) {
        this.auditLogger.info(
          'Recoverable error in processMessage, will be recovered',
          {
            requestId,
            error: errorMessage,
          }
        );

        // Update status to PENDING for recovery
        await this.withdrawalRequestService.updateStatus(
          requestId,
          TransactionStatus.PENDING
        );

        throw error; // Let the caller handle recovery
      } else {
        // Non-recoverable error - mark as FAILED
        await this.withdrawalRequestService.updateStatusWithError(
          requestId,
          TransactionStatus.FAILED,
          error instanceof Error ? error.message : String(error)
        );

        return null; // Non-recoverable, don't retry
      }
    }
  }

  /**
   * Check if an error is recoverable
   */
  private isRecoverableError(errorMessage: string): boolean {
    const recoverablePatterns = [
      'insufficient balance',
      'insufficient funds',
      'insufficient allowance',
      'gas required exceeds',
      'nonce too low',
      'nonce has already been used',
      'replacement transaction underpriced',
      'timeout',
      'network error',
      'connection error',
      'etimedout',
      'econnrefused',
      'enotfound',
    ];

    return recoverablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  async stop(): Promise<void> {
    await super.stop();

    // Clean up all signers
    for (const [key, signer] of this.signers) {
      this.auditLogger.info('Cleaning up signer', { key });
      await signer.cleanup();
    }

    // Disconnect from Redis
    try {
      await this.nonceCache.disconnect();
    } catch (error) {
      this.auditLogger.warn('Error disconnecting from Redis:', error);
      // Continue with shutdown even if Redis disconnect fails
    }

    this.auditLogger.info('SigningWorker stopped');
  }
}
