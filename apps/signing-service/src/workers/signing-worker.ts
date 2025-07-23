import { BaseWorker } from './base-worker';
import { WithdrawalRequest, ChainProviderFactory, TransactionStatus, Message } from '@asset-withdrawal/shared';
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

export class SigningWorker extends BaseWorker<
  WithdrawalRequest,
  SignedTransaction
> {
  private withdrawalRequestService: WithdrawalRequestService;
  private signedTransactionService: SignedTransactionService;
  private transactionSigner: TransactionSigner;
  private nonceCache: NonceCacheService;
  private gasPriceCache: GasPriceCache;
  private multicallService: MulticallService;
  private chainProvider: any;
  private auditLogger: Logger;
  private dbClient: any; // Prisma client for BatchTransaction operations

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

    // Initialize database with config
    const dbService = DatabaseService.getInstance(config.database);
    this.dbClient = dbService.getClient();
    this.withdrawalRequestService = new WithdrawalRequestService(this.dbClient);
    this.signedTransactionService = new SignedTransactionService(this.dbClient);

    // Create chain provider based on config
    const network = config.polygon.chainId === 80002 ? 'testnet' : 'mainnet';
    this.chainProvider = ChainProviderFactory.createPolygonProvider(
      network,
      config.polygon.rpcUrl
    );

    // Create nonce cache service
    this.nonceCache = new NonceCacheService();

    // Create gas price cache (30 seconds TTL)
    this.gasPriceCache = new GasPriceCache(30);

    // Create multicall service
    this.multicallService = new MulticallService(
      this.chainProvider,
      this.auditLogger
    );

    this.transactionSigner = new TransactionSigner(
      this.chainProvider,
      this.secretsManager,
      this.nonceCache,
      this.gasPriceCache,
      this.multicallService,
      this.auditLogger
    );
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Ensure database is connected before initializing transaction signer
    const dbService = DatabaseService.getInstance(this.config.database);
    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database is not healthy during SigningWorker initialization');
    }

    await this.transactionSigner.initialize();
    this.auditLogger.info('SigningWorker initialized successfully');
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

    this.auditLogger.info(`Processing batch of ${messages.length} messages`);

    // Validate messages immediately after reading from queue
    const validMessages: Message<WithdrawalRequest>[] = [];
    const invalidMessages: Message<WithdrawalRequest>[] = [];

    for (const message of messages) {
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
    // Check if cache is still valid
    if (this.gasPriceCache.isValid()) {
      return; // Use cached value
    }

    // Fetch new gas price
    const provider = this.chainProvider.getProvider();
    const feeData = await provider.getFeeData();

    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
      throw new Error('Failed to fetch gas price from provider');
    }

    // Update cache
    this.gasPriceCache.set({
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    this.auditLogger.debug('Gas price updated', {
      maxFeePerGas: feeData.maxFeePerGas.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
    });
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
    // Validate network support
    if (request.network !== 'polygon') {
      return `Unsupported network: ${request.network}. This service only supports Polygon`;
    }

    // Validate recipient address format
    if (!request.toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `Invalid recipient address format: ${request.toAddress}`;
    }

    // Validate token address format
    if (!request.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
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

  private async processBatchGroup(tokenAddress: string, messages: Message<WithdrawalRequest>[]): Promise<void> {
    this.auditLogger.info('Processing batch group', {
      tokenAddress,
      messageCount: messages.length,
    });

    // Calculate total amount and get symbol (all messages should have the same token/symbol)
    const totalAmount = messages.reduce((sum, msg) => {
      return sum + BigInt(msg.body.amount);
    }, 0n).toString();

    // Get symbol from the first message (all should be the same since they're grouped by token)
    const symbol = messages[0]?.body.symbol || 'UNKNOWN';

    let batchTransaction: any;
    try {
      // Create BatchTransaction record
      batchTransaction = await this.dbClient.batchTransaction.create({
        data: {
          multicallAddress: this.chainProvider.getMulticall3Address(),
          totalRequests: messages.length,
          totalAmount: totalAmount,
          symbol: symbol,
          chainId: this.chainProvider.getChainId(),
          nonce: 0, // Will be updated when signed
          gasLimit: '0', // Will be updated when signed
          tryCount: 0,
          status: 'PENDING',
        },
      });

      // Update withdrawal requests with batchId and increment try count
      const requestIds = messages.map(m => m.body.id);
      await this.dbClient.withdrawalRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: {
          batchId: batchTransaction.id.toString(),
          processingMode: 'BATCH',
          status: TransactionStatus.SIGNING,
          tryCount: { increment: 1 },
        },
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

      // Prepare batch transaction data
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers);

      // Sign batch transaction
      const signedBatchTx = await this.transactionSigner.signBatchTransaction({
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
          totalAmount,
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

      // Update withdrawal request status to SIGNING and increment try count
      await this.dbClient.withdrawalRequest.update({
        where: { requestId: transactionId },
        data: {
          status: TransactionStatus.SIGNING,
          tryCount: { increment: 1 },
        },
      });

      this.auditLogger.auditSuccess('SIGN_TRANSACTION_START', {
        transactionId,
        metadata: { network, to, amount, tokenAddress },
      });

      // Build and sign transaction
      const signedTx = await this.transactionSigner.signTransaction({
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
    await this.transactionSigner.cleanup();
    this.auditLogger.info('SigningWorker stopped');
  }
}
