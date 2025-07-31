import { IQueue, ChainProviderFactory, ChainProvider } from '@asset-withdrawal/shared';
import { TransactionService } from '@asset-withdrawal/database';
import { BaseWorker, WorkerConfig } from './base-worker';
import { WithdrawalRequest, SignedTransaction } from '../types';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { TransactionSigner, SecretsManager } from '../services/blockchain';

export class ValidationSigningWorker extends BaseWorker<WithdrawalRequest, SignedTransaction> {
  private transactionService: TransactionService;
  private chainProviders: Map<string, ChainProvider>;
  private signers: Map<string, TransactionSigner>;
  private secretsManager: SecretsManager;
  private privateKey?: string;

  constructor(
    workerConfig: WorkerConfig,
    inputQueue: IQueue<WithdrawalRequest>,
    outputQueue: IQueue<SignedTransaction>
  ) {
    super(workerConfig, inputQueue, outputQueue);
    this.transactionService = new TransactionService();
    this.chainProviders = new Map();
    this.signers = new Map();
    this.secretsManager = new SecretsManager();
  }

  async start(): Promise<void> {
    // Get private key from Secrets Manager once
    try {
      this.privateKey = await this.secretsManager.getPrivateKey();
      this.logger.info('Private key loaded from Secrets Manager');
    } catch (error) {
      this.logger.error('Failed to load private key', error);
      throw error;
    }

    await super.start();
  }

  private async getOrCreateSigner(chain: string, network: string): Promise<{ provider: ChainProvider; signer: TransactionSigner }> {
    const key = `${chain}_${network}`;

    if (!this.chainProviders.has(key)) {
      this.logger.info('Creating new ChainProvider and TransactionSigner', { chain, network });

      // Create chain provider
      const chainProvider = ChainProviderFactory.getProvider(chain as any, network as any);
      this.chainProviders.set(key, chainProvider);

      // Create transaction signer
      const signer = new TransactionSigner(chainProvider, this.privateKey);
      this.signers.set(key, signer);

      this.logger.info(`Signer initialized with address: ${signer.getAddress()}`);
    }

    return {
      provider: this.chainProviders.get(key)!,
      signer: this.signers.get(key)!,
    };
  }

  protected async process(
    withdrawalRequest: WithdrawalRequest,
    messageId: string
  ): Promise<SignedTransaction> {
    this.logger.info(`Processing withdrawal request ${withdrawalRequest.id}`);

    try {
      // Step 1: Validate withdrawal request
      await this.validateRequest(withdrawalRequest);

      // Step 2: Check balance
      await this.checkBalance(withdrawalRequest);

      // Step 3: Build and sign transaction
      const signedTx = await this.buildTransaction(withdrawalRequest);

      // Step 4: Update transaction status in database
      await this.transactionService.updateStatus(withdrawalRequest.id, 'SIGNED');

      this.logger.info(`Successfully signed transaction for withdrawal ${withdrawalRequest.id}`);

      // Return signed transaction
      return signedTx;
    } catch (error) {
      this.logger.error(`Failed to process withdrawal ${withdrawalRequest.id}`, error);

      // Update status to FAILED in database
      await this.transactionService.updateStatus(withdrawalRequest.id, 'FAILED');

      throw error;
    }
  }

  private async validateRequest(request: WithdrawalRequest): Promise<void> {
    // Validate chain and network are provided
    if (!request.chain || !request.network) {
      throw new Error(`Missing chain or network information. Chain: ${request.chain}, Network: ${request.network}`);
    }

    // Validate chain support
    try {
      ChainProviderFactory.getProvider(request.chain as any, request.network as any);
    } catch (error) {
      throw new Error(`Unsupported chain/network combination: ${request.chain}/${request.network}`);
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
    const chain = request.chain || 'polygon';
    const network = request.network;
    const { provider, signer } = await this.getOrCreateSigner(chain, network);

    if (!signer.getAddress()) {
      throw new Error('Wallet not initialized');
    }

    // Check native token balance for gas fees
    const walletAddress = signer.getAddress()!;
    const balance = await provider.getBalance(walletAddress);

    // Estimate gas cost
    const gasPrice = await provider.getGasPrice();
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
    const chain = request.chain || 'polygon';
    const network = request.network;
    const { signer } = await this.getOrCreateSigner(chain, network);

    // Check if it's a token transfer or native currency
    if (request.tokenAddress && request.tokenAddress !== '0x0000000000000000000000000000000000000000') {
      // ERC-20 token transfer
      // TODO: Get token decimals from contract
      const decimals = 18; // Default for most tokens
      return await signer.signERC20Transfer(
        request.tokenAddress,
        request.toAddress,
        request.amount,
        decimals,
        request.id
      );
    } else {
      // Native token transfer
      return await signer.signTransaction(
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
