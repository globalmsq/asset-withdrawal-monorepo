import { IQueue } from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { BaseWorker, WorkerConfig } from './base-worker';
import { WithdrawalRequest, SignedTransaction } from '../types';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { PolygonProvider, TransactionSigner, SecretsManager } from '../services/blockchain';

export class ValidationSigningWorker extends BaseWorker<WithdrawalRequest, SignedTransaction> {
  private transactionService: TransactionService;
  private polygonProvider: PolygonProvider;
  private transactionSigner: TransactionSigner;
  private secretsManager: SecretsManager;
  private isInitialized: boolean = false;

  constructor(
    workerConfig: WorkerConfig,
    inputQueue: IQueue<WithdrawalRequest>,
    outputQueue: IQueue<SignedTransaction>
  ) {
    super(workerConfig, inputQueue, outputQueue);
    this.transactionService = new TransactionService();
    this.polygonProvider = new PolygonProvider();
    this.secretsManager = new SecretsManager();
    this.transactionSigner = new TransactionSigner(this.polygonProvider);
  }

  async start(): Promise<void> {
    // Initialize wallet with private key from Secrets Manager
    if (!this.isInitialized) {
      try {
        const privateKey = await this.secretsManager.getPrivateKey();
        await this.transactionSigner.setPrivateKey(privateKey);
        this.isInitialized = true;
        this.logger.info(`Worker wallet initialized: ${this.transactionSigner.getAddress()}`);
      } catch (error) {
        this.logger.error('Failed to initialize wallet', error);
        throw error;
      }
    }

    await super.start();
  }

  protected async process(
    withdrawalRequest: WithdrawalRequest,
    messageId: string
  ): Promise<SignedTransaction> {
    this.logger.info(`Processing withdrawal request ${withdrawalRequest.id}`);

    try {
      // Step 1: Validate withdrawal request
      await this.validateRequest(withdrawalRequest);

      // Step 2: Check balance (mock for now)
      await this.checkBalance(withdrawalRequest);

      // Step 3: Build and sign transaction
      const signedTx = await this.buildTransaction(withdrawalRequest);

      // Step 4: Update transaction status in database
      await this.transactionService.updateStatus(withdrawalRequest.id, 'SIGNED');

      this.logger.info(`Successfully signed transaction for withdrawal ${withdrawalRequest.id}`);

      return signedTx;
    } catch (error) {
      this.logger.error(`Failed to process withdrawal ${withdrawalRequest.id}`, error);

      // Update status to FAILED in database
      await this.transactionService.updateStatus(withdrawalRequest.id, 'FAILED');

      throw error;
    }
  }

  private async validateRequest(request: WithdrawalRequest): Promise<void> {
    // Validate network
    if (request.network !== 'polygon') {
      throw new Error(`Unsupported network: ${request.network}`);
    }

    // Validate address format
    if (!request.toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(`Invalid address format: ${request.toAddress}`);
    }

    // Validate amount
    const amount = parseFloat(request.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid amount: ${request.amount}`);
    }

    this.logger.debug(`Validation passed for withdrawal ${request.id}`);
  }

  private async checkBalance(request: WithdrawalRequest): Promise<void> {
    if (!this.transactionSigner.getAddress()) {
      throw new Error('Wallet not initialized');
    }

    // Check native token balance for gas fees
    const walletAddress = this.transactionSigner.getAddress()!;
    const balance = await this.polygonProvider.getBalance(walletAddress);

    // Estimate gas cost
    const gasPrice = await this.polygonProvider.getGasPrice();
    const estimatedGasLimit = 100000n; // Reasonable estimate for token transfer
    const estimatedGasCost = gasPrice * estimatedGasLimit;

    if (balance < estimatedGasCost) {
      throw new Error(
        `Insufficient balance for gas. Required: ${estimatedGasCost.toString()}, Available: ${balance.toString()}`
      );
    }

    // TODO: Check token balance if ERC-20 transfer
    this.logger.debug(`Balance check passed for withdrawal ${request.id}`);
  }

  private async buildTransaction(request: WithdrawalRequest): Promise<SignedTransaction> {
    // Check if it's a token transfer or native currency
    if (request.tokenAddress && request.tokenAddress !== '0x0000000000000000000000000000000000000000') {
      // ERC-20 token transfer
      // TODO: Get token decimals from contract
      const decimals = 18; // Default for most tokens
      return await this.transactionSigner.signERC20Transfer(
        request.tokenAddress,
        request.toAddress,
        request.amount,
        decimals,
        request.id
      );
    } else {
      // Native MATIC transfer
      return await this.transactionSigner.signTransaction(
        {
          to: request.toAddress,
          value: request.amount,
        },
        request.id
      );
    }
  }

  private async signTransaction(transaction: any): Promise<SignedTransaction> {
    // This method is no longer needed as signing is done in buildTransaction
    return transaction;
  }
}
