import { BaseWorker } from './base-worker';
import { WithdrawalRequest } from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { SignedTransaction } from '../types';
import { PolygonProvider } from '../services/polygon-provider';
import { TransactionSigner } from '../services/transaction-signer';
import { SecureSecretsManager } from '../services/secrets-manager';
import { Logger } from '../utils/logger';
import { Config } from '../config';

export class SigningWorker extends BaseWorker<WithdrawalRequest, SignedTransaction> {
  private transactionService: TransactionService;
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
        credentials: config.aws.endpoint ? {
          accessKeyId: config.aws.accessKeyId || 'test',
          secretAccessKey: config.aws.secretAccessKey || 'test',
        } : undefined,
      }
    );
    
    this.auditLogger = logger;
    this.logger = logger; // Set the base class logger
    
    this.transactionService = new TransactionService();
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
  
  async processMessage(message: WithdrawalRequest): Promise<SignedTransaction | null> {
    const { id: transactionId, network, toAddress: to, amount, tokenAddress } = message;
    
    this.auditLogger.info(`Processing withdrawal request: ${transactionId}`, {
      network,
      to,
      amount,
      tokenAddress,
    });
    
    try {
      // Validate network support
      if (network !== this.polygonProvider.network) {
        throw new Error(`Unsupported network: ${network}. Expected: ${this.polygonProvider.network}`);
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
      
      // Update transaction status to processing
      await this.transactionService.updateStatus(
        transactionId,
        'processing'
      );
      
      this.auditLogger.auditSuccess('SIGN_TRANSACTION_START', {
        transactionId,
        metadata: { network, to, amount, tokenAddress },
      });
      
      // Check wallet balance for gas
      const walletAddress = await this.transactionSigner.getAddress();
      const balance = await this.polygonProvider.getBalance(walletAddress);
      
      if (balance <= 0n) {
        throw new Error('Insufficient wallet balance for gas fees');
      }
      
      // Build and sign transaction
      const signedTx = await this.transactionSigner.signTransaction({
        to,
        amount,
        tokenAddress,
        transactionId,
      });
      
      // Update transaction with signed data
      await this.transactionService.updateTransactionHash(
        transactionId,
        signedTx.hash
      );
      
      await this.transactionService.updateStatus(
        transactionId,
        'signed'
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
      this.auditLogger.error(`Failed to sign transaction: ${transactionId}`, error);
      
      this.auditLogger.auditFailure('SIGN_TRANSACTION_FAILED', error instanceof Error ? error.message : String(error), {
        transactionId,
        metadata: { network, to, amount, tokenAddress },
      });
      
      // Update transaction status to failed
      await this.transactionService.updateStatus(
        transactionId,
        'failed'
      );
      
      // Determine if error is recoverable
      const recoverableErrors = [
        'nonce too low',
        'replacement transaction underpriced',
        'timeout',
        'network error',
      ];
      
      const isRecoverable = recoverableErrors.some(err => 
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