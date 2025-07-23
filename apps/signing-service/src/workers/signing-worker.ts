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
      waitTimeSeconds: 20,
      visibilityTimeout: 300,
    });

    if (messages.length === 0) {
      return;
    }

    this.auditLogger.info(`Processing batch of ${messages.length} messages`);

    // Check if we should use batch processing
    if (await this.shouldUseBatchProcessing(messages)) {
      await this.processBatchTransactions(messages);
    } else {
      // Process messages individually
      await this.processSingleTransactions(messages);
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

  private async processBatchTransactions(messages: Message<WithdrawalRequest>[]): Promise<void> {
    const tokenGroups = this.groupByToken(messages);

    for (const [tokenAddress, groupMessages] of tokenGroups) {
      if (groupMessages.length >= this.config.batchProcessing.batchThreshold) {
        // Process as batch
        await this.processBatchGroup(tokenAddress, groupMessages);
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

    const batchId = crypto.randomUUID();

    try {
      // Create BatchTransaction record
      const batchTransaction = await this.dbClient.batchTransaction.create({
        data: {
          id: batchId,
          multicallAddress: this.chainProvider.getMulticall3Address(),
          totalRequests: messages.length,
          status: 'PENDING',
        },
      });

      // Update withdrawal requests with batchId
      const requestIds = messages.map(m => m.body.id);
      await this.dbClient.withdrawalRequest.updateMany({
        where: { requestId: { in: requestIds } },
        data: {
          batchId: batchId,
          type: 'BATCH',
          status: TransactionStatus.SIGNING,
        },
      });

      // Prepare batch transfers
      const transfers: BatchTransferRequest[] = messages.map(message => ({
        tokenAddress: message.body.tokenAddress,
        to: message.body.toAddress,
        amount: message.body.amount,
        transactionId: message.body.id,
      }));

      // Prepare batch transaction data
      const preparedBatch = await this.multicallService.prepareBatchTransfer(transfers);

      // Sign batch transaction
      const signedBatchTx = await this.transactionSigner.signBatchTransaction({
        transfers,
        batchId,
      });

      // Update batch transaction with txHash
      await this.dbClient.batchTransaction.update({
        where: { id: batchId },
        data: {
          txHash: signedBatchTx.hash,
          status: 'SIGNED',
        },
      });

      // Update withdrawal requests to SIGNED status
      await this.dbClient.withdrawalRequest.updateMany({
        where: { batchId: batchId },
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
          batchId,
          txHash: signedBatchTx.hash,
          messageCount: messages.length,
          tokenAddress,
        },
      });

    } catch (error) {
      this.auditLogger.error('Failed to process batch group', error, {
        batchId,
        tokenAddress,
        messageCount: messages.length,
      });

      // Update batch transaction status to FAILED
      await this.dbClient.batchTransaction.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      // Update withdrawal requests to FAILED status
      await this.dbClient.withdrawalRequest.updateMany({
        where: { batchId: batchId },
        data: {
          status: TransactionStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      // Don't delete messages - let them retry
      throw error;
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
    } = message;

    this.auditLogger.info(`Processing withdrawal request: ${transactionId}`, {
      network,
      to,
      amount,
      tokenAddress,
    });

    try {
      // Validate network support
      if (network !== 'polygon') {
        throw new Error(
          `Unsupported network: ${network}. This service only supports Polygon`
        );
      }

      // Validate address format
      if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error(`Invalid address format: ${to}`);
      }

      // Validate amount
      const amountBigInt = BigInt(amount);
      if (amountBigInt <= 0n) {
        throw new Error(`Invalid amount: ${amount}. Must be positive`);
      }

      // Update withdrawal request status to SIGNING
      await this.withdrawalRequestService.updateStatus(
        transactionId,
        TransactionStatus.SIGNING
      );

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
        const retryCount = existingTxs.length;

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
          data: signedTx.data,
          chainId: signedTx.chainId,
          retryCount,
          status: 'SIGNED',
        });

        this.auditLogger.info('Signed transaction saved to database', {
          transactionId,
          txHash: signedTx.hash,
          retryCount,
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
