import { BaseWorker } from './base-worker';
import { WithdrawalRequest, ChainProviderFactory, TransactionStatus } from '@asset-withdrawal/shared';
import { WithdrawalRequestService, DatabaseService, SignedTransactionService } from '@asset-withdrawal/database';
import { SignedTransaction } from '../types';
import { TransactionSigner } from '../services/transaction-signer';
import { SecureSecretsManager } from '../services/secrets-manager';
import { NonceCacheService } from '../services/nonce-cache.service';
import { GasPriceCache } from '../services/gas-price-cache';
import { Logger } from '../utils/logger';
import { Config } from '../config';

export class SigningWorker extends BaseWorker<
  WithdrawalRequest,
  SignedTransaction
> {
  private withdrawalRequestService: WithdrawalRequestService;
  private signedTransactionService: SignedTransactionService;
  private transactionSigner: TransactionSigner;
  private nonceCache: NonceCacheService;
  private gasPriceCache: GasPriceCache;
  private chainProvider: any;
  private auditLogger: Logger;

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
    this.withdrawalRequestService = new WithdrawalRequestService(dbService.getClient());
    this.signedTransactionService = new SignedTransactionService(dbService.getClient());

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

    this.transactionSigner = new TransactionSigner(
      this.chainProvider,
      this.secretsManager,
      this.nonceCache,
      this.gasPriceCache,
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

    // Gas price is available, proceed with normal processing
    return super.processBatch();
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
