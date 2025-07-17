import { BaseWorker } from './base-worker';
import { WithdrawalRequest } from '@asset-withdrawal/shared';
import { WithdrawalRequestService, DatabaseService } from '@asset-withdrawal/database';
import { SignedTransaction } from '../types';
import { PolygonProvider } from '../services/polygon-provider';
import { TransactionSigner } from '../services/transaction-signer';
import { SecureSecretsManager } from '../services/secrets-manager';
import { Logger } from '../utils/logger';
import { Config } from '../config';

export class SigningWorker extends BaseWorker<
  WithdrawalRequest,
  SignedTransaction
> {
  private withdrawalRequestService: WithdrawalRequestService;
  private polygonProvider: PolygonProvider;
  private transactionSigner: TransactionSigner;
  private auditLogger: Logger;

  constructor(
    config: Config,
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
    this.polygonProvider = new PolygonProvider(
      config.polygon.rpcUrl,
      config.polygon.chainId,
      logger
    );
    this.transactionSigner = new TransactionSigner(
      this.polygonProvider,
      this.secretsManager,
      this.auditLogger
    );
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.transactionSigner.initialize();
    this.auditLogger.info('SigningWorker initialized successfully');
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
      // Validate network support - map 'polygon' to configured network
      const normalizedNetwork =
        network === 'polygon' ? this.polygonProvider.network : network;
      if (normalizedNetwork !== this.polygonProvider.network) {
        throw new Error(
          `Unsupported network: ${network}. Expected: ${this.polygonProvider.network}`
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
        'SIGNING'
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

      // Update withdrawal request status to BROADCASTING
      // Note: The actual transaction hash will be recorded by tx-processor after broadcasting
      await this.withdrawalRequestService.updateStatus(
        transactionId,
        'BROADCASTING'
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
        'FAILED',
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
