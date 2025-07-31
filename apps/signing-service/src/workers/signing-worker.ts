import { BaseWorker } from './base-worker';
import { WithdrawalRequest, ChainProviderFactory, ChainProvider, TransactionStatus, Message } from '@asset-withdrawal/shared';
import { WithdrawalRequestService, DatabaseService, SignedTransactionService } from '@asset-withdrawal/database';
import { SignedTransaction } from '../types';
import { TransactionSigner } from '../services/transaction-signer';
import { SecureSecretsManager } from '../services/secrets-manager';
import { NonceCacheService } from '../services/nonce-cache.service';
import { GasPriceCache } from '../services/gas-price-cache';
import { MulticallService, BatchTransferRequest } from '../services/multicall.service';
import { Logger } from '../utils/logger';
import { Config } from '../config';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as os from 'os';

export class SigningWorker extends BaseWorker<
  WithdrawalRequest,
  SignedTransaction
> {
  private withdrawalRequestService: WithdrawalRequestService;
  private signedTransactionService: SignedTransactionService;
  private transactionSigner!: TransactionSigner; // Will be set dynamically based on chain
  private nonceCache: NonceCacheService;
  private gasPriceCache: GasPriceCache;
  private multicallServices: Map<string, MulticallService>;
  private signers: Map<string, TransactionSigner>;
  private auditLogger: Logger;
  private dbClient: any; // Prisma client for BatchTransaction operations
  private readonly instanceId: string;

  constructor(
    private config: Config,
    private secretsManager: SecureSecretsManager,
    logger: Logger
  ) {
    super(
      'SigningWorker',
      config.queue.txRequestQueueUrl,
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
      logger
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
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Ensure database is connected before initializing
    const dbService = DatabaseService.getInstance(this.config.database);
    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database is not healthy during SigningWorker initialization');
    }

    // Connect to Redis for nonce management
    await this.nonceCache.connect();

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
      this.auditLogger.info('Pre-initializing signers for development environment');
      
      // Initialize signers for common development configurations
      const developmentChains = [
        { chain: 'localhost', network: 'testnet' },  // Hardhat localhost only
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
      this.auditLogger.error('Failed to pre-initialize development signers', error);
      // Don't throw - this is not critical for operation
    }
  }

  /**
   * Get or create a TransactionSigner for a specific chain/network combination
   */
  private async getOrCreateSigner(chain: string, network: string): Promise<TransactionSigner> {
    const key = `${chain}_${network}`;

    if (!this.signers.has(key)) {
      this.auditLogger.info('Creating new TransactionSigner', { chain, network });

      // Create chain provider
      const chainProvider = ChainProviderFactory.getProvider(chain as any, network as any);

      // Create multicall service for this chain
      const multicallService = new MulticallService(chainProvider, this.auditLogger);
      this.multicallServices.set(key, multicallService);

      // Create transaction signer
      const signer = new TransactionSigner(
        chainProvider,
        this.secretsManager,
        this.nonceCache,
        this.gasPriceCache,
        multicallService,
        this.auditLogger,
        this.config
      );

      // Initialize the signer
      await signer.initialize();

      this.signers.set(key, signer);
    }

    return this.signers.get(key)!;
  }

  /**
   * Claims messages atomically to prevent multiple instances from processing the same message
   * @param messages Messages received from the queue
   * @returns Messages successfully claimed by this instance
   */
  private async claimMessages(messages: Message<WithdrawalRequest>[]): Promise<Message<WithdrawalRequest>[]> {
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
            this.auditLogger.info('Withdrawal request already being processed or completed', {
              requestId: message.body.id,
              status: existing.status,
              processingInstanceId: existing.processingInstanceId,
            });
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
          this.auditLogger.info('Message already claimed by another instance, removed from queue', {
            requestId: message.body.id,
          });
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
    // Check gas price before processing messages
    try {
      await this.updateGasPriceCache();
    } catch (error) {
      this.auditLogger.warn('Failed to fetch gas price, skipping message processing', error);
      return; // Skip this batch
    }

    // If batch processing is disabled, use normal processing
    if (!this.config.batchProcessing.enabled) {
      this.auditLogger.debug('Batch processing disabled, using normal processing');
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

    this.auditLogger.info(`Successfully claimed ${claimedMessages.length} messages`);

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
          this.auditLogger.info('Invalid request marked as FAILED and removed from queue', {
            requestId: message.body.id,
          });
        } catch (error) {
          this.auditLogger.error('Failed to update invalid request status', error, {
            requestId: message.body.id,
          });
        }
      } else {
        validMessages.push(message);
      }
    }

    if (validMessages.length === 0) {
      this.auditLogger.info('No valid messages to process after validation');
      return;
    }

    this.auditLogger.info(`Processing ${validMessages.length} valid messages (${invalidMessages.length} invalid)`, {
      validIds: validMessages.map(m => m.body.id),
      invalidIds: invalidMessages.map(m => m.body.id),
    });

    // Separate valid messages by try count
    const { messagesForBatch, messagesForSingle } = await this.separateMessagesByTryCount(validMessages);

    // Process messages with previous attempts individually
    if (messagesForSingle.length > 0) {
      this.auditLogger.info('Processing messages with previous attempts individually', {
        count: messagesForSingle.length,
        requestIds: messagesForSingle.map(m => m.body.id),
      });
      await this.processSingleTransactions(messagesForSingle);
    }

    // Check if remaining messages should use batch processing
    if (messagesForBatch.length > 0 && await this.shouldUseBatchProcessing(messagesForBatch)) {
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
    this.auditLogger.debug('Gas price cache update skipped - will fetch on demand per chain');
  }

  private async separateMessagesByTryCount(messages: Message<WithdrawalRequest>[]): Promise<{
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
    withdrawalRequests.forEach((req: { requestId: string; tryCount: number }) => {
      requestTryCountMap.set(req.requestId, req.tryCount);
    });

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

  private async shouldUseBatchProcessing(messages: Message<WithdrawalRequest>[]): Promise<boolean> {
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

  private groupByToken(messages: Message<WithdrawalRequest>[]): Map<string, Message<WithdrawalRequest>[]> {
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
    const singleTxTotalGas = BigInt(count) * BigInt(this.config.batchProcessing.singleTxGasEstimate);
    const batchTxTotalGas = BigInt(this.config.batchProcessing.batchBaseGas) +
                            (BigInt(count) * BigInt(this.config.batchProcessing.batchPerTxGas));

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
      ChainProviderFactory.getProvider(request.chain as any, request.network as any);
    } catch (error) {
      return `Unsupported chain/network combination: ${request.chain}/${request.network}`;
    }

    // Validate recipient address format
    if (!request.toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `Invalid recipient address format: ${request.toAddress}`;
    }

    // Validate token address format (if provided - null means native token transfer)
    if (request.tokenAddress && !request.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
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

  private async processBatchTransactions(messages: Message<WithdrawalRequest>[]): Promise<void> {
    const tokenGroups = this.groupByToken(messages);

    for (const [tokenAddress, groupMessages] of tokenGroups) {
      if (groupMessages.length >= this.config.batchProcessing.batchThreshold) {
        try {
          // Process as batch
          await this.processBatchGroup(tokenAddress, groupMessages);
        } catch (error) {
          this.auditLogger.error('Batch processing failed, messages will be retried', error, {
            tokenAddress,
            messageCount: groupMessages.length,
          });
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

  private async processSingleTransactions(messages: Message<WithdrawalRequest>[]): Promise<void> {
    // Process messages individually
    const messagePromises = messages.map(async (message) => {
      const messageId = message.id || message.receiptHandle;
      this.processingMessages.add(messageId);

      try {
        const result = await this.processMessage(message.body);

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
        this.lastError = error instanceof Error ? error.message : 'Unknown error';
        this.errorCount++;
        // Message will be returned to queue after visibility timeout
      } finally {
        this.processingMessages.delete(messageId);
      }
    });

    await Promise.all(messagePromises);
  }

  /**
   * Creates a batch transaction with locking to prevent concurrent processing
   * @param tokenAddress Token address for the batch
   * @param messages Messages to include in the batch
   * @returns BatchTransaction if successful, null if messages were already claimed
   */
  private async createBatchWithLocking(tokenAddress: string, messages: Message<WithdrawalRequest>[]): Promise<any | null> {
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
        this.auditLogger.warn('Some messages were already processed by another instance', {
          expected: messages.length,
          found: validRequests.length,
          tokenAddress,
        });
        return null;
      }

      // Calculate total amount and get symbol
      const totalAmount = messages.reduce((sum, msg) => {
        return sum + BigInt(msg.body.amount);
      }, 0n).toString();

      const symbol = messages[0]?.body.symbol || 'UNKNOWN';

      // Get chain info from first message (all messages in batch should have same chain)
      const firstMessage = messages[0];
      const chain = firstMessage.body.chain || 'polygon';
      const network = firstMessage.body.network || 'mainnet';

      // Get chain provider to get multicall address and chain ID
      const chainProvider = ChainProviderFactory.getProvider(chain as any, network as any);

      // Get the signer to get the current nonce
      const signer = await this.getOrCreateSigner(chain, network);
      const signerAddress = await signer.getAddress();
      
      // Get the next nonce that will be used for this batch
      // This is important to store even if the transaction fails
      const nextNonce = await this.nonceCache.get(signerAddress, chain, network);
      const actualNonce = nextNonce || 0;

      // Create batch transaction
      const batch = await tx.batchTransaction.create({
        data: {
          multicallAddress: chainProvider.getMulticall3Address(),
          totalRequests: messages.length,
          totalAmount: totalAmount,
          symbol: symbol,
          chainId: chainProvider.getChainId(),
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

  private async processBatchGroup(tokenAddress: string, messages: Message<WithdrawalRequest>[]): Promise<void> {
    this.auditLogger.info('Processing batch group', {
      tokenAddress,
      messageCount: messages.length,
      instanceId: this.instanceId,
    });

    let batchTransaction: any;
    try {
      // Create batch transaction with locking
      batchTransaction = await this.createBatchWithLocking(tokenAddress, messages);

      if (!batchTransaction) {
        this.auditLogger.warn('Failed to create batch - messages already processed', {
          tokenAddress,
          messageCount: messages.length,
        });
        // Remove messages from queue as they're being processed elsewhere
        await Promise.all(messages.map(msg => this.inputQueue.deleteMessage(msg.receiptHandle)));
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
          normalizedTokenAddress = ethers.getAddress(message.body.tokenAddress.trim());
        } catch (error) {
          // If checksum validation fails, use lowercase format
          normalizedTokenAddress = message.body.tokenAddress.trim().toLowerCase();
          this.auditLogger.warn('Token address checksum normalization', {
            transactionId: message.body.id,
            originalAddress: message.body.tokenAddress,
            normalizedAddress: normalizedTokenAddress,
          });
        }

        try {
          // Normalize recipient address with proper checksum
          normalizedToAddress = ethers.getAddress(message.body.toAddress.trim());
        } catch (error) {
          // If checksum validation fails, use lowercase format
          normalizedToAddress = message.body.toAddress.trim().toLowerCase();
          this.auditLogger.warn('Recipient address checksum normalization', {
            transactionId: message.body.id,
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
      const preparedBatch = await multicallService.prepareBatchTransfer(transfers, await signer.getAddress(), true);

      // Sign batch transaction
      const signedBatchTx = await signer.signBatchTransaction({
        transfers,
        batchId: batchTransaction.id.toString(),
      });

      // Update batch transaction with txHash and gas details
      await this.dbClient.batchTransaction.update({
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
      await Promise.all(messages.map(msg => this.inputQueue.deleteMessage(msg.receiptHandle)));

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
        await this.dbClient.batchTransaction.update({
          where: { id: batchTransaction.id },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      }

      // Reset withdrawal requests back to PENDING state for retry
      // Remove batchId and type so they can be processed individually or in a new batch
      if (batchId) {
        await this.dbClient.withdrawalRequest.updateMany({
          where: { batchId: batchId },
          data: {
            status: TransactionStatus.PENDING,
            batchId: null,
            processingMode: 'SINGLE',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      }

      this.auditLogger.info('Reset withdrawal requests to PENDING for retry', {
        batchId,
        messageCount: messages.length,
        reason: 'Batch processing failed',
      });

      // Don't throw error to prevent service termination
      // Messages will be processed individually in the catch block of processBatchTransactions

      // IMPORTANT: Don't delete messages from queue on failure
      // They will become visible again after visibility timeout
      // and will be reprocessed as individual transactions
    }
  }

  async processMessage(
    message: WithdrawalRequest
  ): Promise<SignedTransaction | null> {
    const {
      id: transactionId,
      network,
      toAddress: to,
      amount,
      tokenAddress,
      symbol,
    } = message;

    this.auditLogger.info(`Processing withdrawal request: ${transactionId}`, {
      network,
      to,
      amount,
      tokenAddress,
    });

    try {
      // Validation is already done in processBatch()
      // This method only handles single transaction signing

      // Update withdrawal request status to SIGNING with conditional check
      const updated = await this.dbClient.$transaction(async (tx: any) => {
        // Verify the request is still owned by this instance
        const existing = await tx.withdrawalRequest.findUnique({
          where: { requestId: transactionId },
          select: { status: true, processingInstanceId: true },
        });

        if (!existing || existing.processingInstanceId !== this.instanceId) {
          this.auditLogger.warn('Request no longer owned by this instance', {
            transactionId,
            currentInstanceId: this.instanceId,
            ownerInstanceId: existing?.processingInstanceId,
          });
          return null;
        }

        // Update status to SIGNING
        return await tx.withdrawalRequest.update({
          where: {
            requestId: transactionId,
            processingInstanceId: this.instanceId, // Ensure we still own it
          },
          data: {
            status: TransactionStatus.SIGNING,
            tryCount: { increment: 1 },
          },
        });
      });

      if (!updated) {
        this.auditLogger.info('Skipping transaction - no longer owned by this instance', {
          transactionId,
        });
        return null;
      }

      this.auditLogger.auditSuccess('SIGN_TRANSACTION_START', {
        transactionId,
        metadata: { chain: message.chain, network, to, amount, tokenAddress },
      });

      // Get appropriate signer for this chain
      const chain = message.chain || 'polygon';
      const signer = await this.getOrCreateSigner(chain, network);

      // Build and sign transaction
      const signedTx = await signer.signTransaction({
        to,
        amount,
        tokenAddress,
        transactionId,
      });

      // Save signed transaction to database
      try {
        // Check if this is a retry by counting existing signed transactions
        const existingTxs = await this.signedTransactionService.findByRequestId(transactionId);
        const tryCount = existingTxs.length;

        await this.signedTransactionService.create({
          requestId: transactionId,
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
          chainId: signedTx.chainId,
          tryCount,
          status: 'SIGNED',
        });

        this.auditLogger.info('Signed transaction saved to database', {
          transactionId,
          txHash: signedTx.hash,
          tryCount,
        });
      } catch (dbError) {
        // If DB save fails, log error but continue - we don't want to block the flow
        this.auditLogger.error('Failed to save signed transaction to database', dbError, {
          transactionId,
          txHash: signedTx.hash,
        });
        // Throw error to trigger retry - DB save is critical for tracking
        throw new Error(`Failed to save signed transaction: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      // Update withdrawal request status to SIGNED
      // Note: The tx-broadcaster will update to BROADCASTING when it starts broadcasting
      await this.withdrawalRequestService.updateStatus(
        transactionId,
        TransactionStatus.SIGNED
      );

      this.auditLogger.auditSuccess('SIGN_TRANSACTION_COMPLETE', {
        transactionId,
        metadata: {
          hash: signedTx.hash,
          nonce: signedTx.nonce,
          gasLimit: signedTx.gasLimit,
          maxFeePerGas: signedTx.maxFeePerGas,
        },
      });

      return signedTx;
    } catch (error) {
      this.auditLogger.error(
        `Failed to sign transaction: ${transactionId}`,
        error
      );

      this.auditLogger.auditFailure(
        'SIGN_TRANSACTION_FAILED',
        error instanceof Error ? error.message : String(error),
        {
          transactionId,
          metadata: { network, to, amount, tokenAddress },
        }
      );

      // Update withdrawal request status to FAILED with error message
      await this.withdrawalRequestService.updateStatusWithError(
        transactionId,
        TransactionStatus.FAILED,
        error instanceof Error ? error.message : String(error)
      );

      // Determine if error is recoverable
      const recoverableErrors = [
        'nonce too low',
        'replacement transaction underpriced',
        'timeout',
        'network error',
      ];

      const isRecoverable = recoverableErrors.some(
        err =>
          error instanceof Error && error.message.toLowerCase().includes(err)
      );

      if (isRecoverable) {
        throw error; // Let SQS retry
      }

      return null; // Non-recoverable, don't retry
    }
  }

  async stop(): Promise<void> {
    await super.stop();

    // Clean up all signers
    for (const [key, signer] of this.signers) {
      this.auditLogger.info('Cleaning up signer', { key });
      await signer.cleanup();
    }

    // Disconnect from Redis
    await this.nonceCache.disconnect();

    this.auditLogger.info('SigningWorker stopped');
  }
}
