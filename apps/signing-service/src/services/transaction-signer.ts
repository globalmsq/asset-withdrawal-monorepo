import { ethers } from 'ethers';
import { ChainProvider } from '@asset-withdrawal/shared';
import { SignedTransaction } from '../types';
import { SecureSecretsManager } from './secrets-manager';
import { NonceManager } from './nonce-manager';
import { Logger } from '../utils/logger';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

export interface SigningRequest {
  to: string;
  amount: string;
  tokenAddress?: string;
  transactionId: string;
}

export class TransactionSigner {
  private wallet: ethers.Wallet | null = null;
  private nonceManager: NonceManager;

  constructor(
    private chainProvider: ChainProvider,
    private secretsManager: SecureSecretsManager,
    private logger: Logger
  ) {
    this.nonceManager = new NonceManager(chainProvider, logger);
  }

  async initialize(): Promise<void> {
    try {
      // Get private key from secrets manager
      const privateKey = this.secretsManager.getPrivateKey();

      // Create wallet instance
      const provider = this.chainProvider.getProvider();
      this.wallet = new ethers.Wallet(privateKey, provider);

      // Initialize nonce manager with wallet address
      await this.nonceManager.initialize(this.wallet.address);

      this.logger.info('Transaction signer initialized', {
        address: this.wallet.address,
        chainId: this.chainProvider.getChainId(),
        chain: this.chainProvider.chain,
        network: this.chainProvider.network,
      });
    } catch (error) {
      this.logger.error('Failed to initialize transaction signer', error);
      throw error;
    }
  }

  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  async signTransaction(request: SigningRequest): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { to, amount, tokenAddress, transactionId } = request;

    try {
      // Get nonce
      const nonce = await this.nonceManager.getNextNonce();

      // Build transaction
      let transaction: ethers.TransactionRequest;

      if (tokenAddress) {
        // ERC-20 token transfer
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          this.wallet
        );
        // Normalize address with error handling
        let normalizedTo: string;
        try {
          // Trim any whitespace and convert to lowercase first
          const cleanedTo = to.trim().toLowerCase();
          normalizedTo = ethers.getAddress(cleanedTo);
        } catch (error) {
          this.logger.error('Failed to normalize address', {
            to,
            toLength: to.length,
            toHex: Buffer.from(to).toString('hex'),
            error: error instanceof Error ? error.message : String(error),
          });
          // Fallback: use the address as-is if it's a valid format
          if (to.match(/^0x[a-fA-F0-9]{40}$/)) {
            this.logger.warn('Using address without checksum validation', {
              to,
            });
            normalizedTo = to;
          } else {
            throw error;
          }
        }

        const data = tokenContract.interface.encodeFunctionData('transfer', [
          normalizedTo,
          amount,
        ]);

        transaction = {
          to: tokenAddress,
          data,
          nonce,
          chainId: this.chainProvider.getChainId(),
        };
      } else {
        // Native MATIC transfer
        transaction = {
          to,
          value: amount,
          nonce,
          chainId: this.chainProvider.getChainId(),
        };
      }

      // Estimate gas
      const gasEstimate = await this.wallet.estimateGas(transaction);
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Get gas price (EIP-1559)
      const feeData = await this.wallet.provider!.getFeeData();
      let maxFeePerGas = feeData.maxFeePerGas;
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

      if (!maxFeePerGas || !maxPriorityFeePerGas) {
        // Fallback for Polygon
        maxFeePerGas = ethers.parseUnits('50', 'gwei');
        maxPriorityFeePerGas = ethers.parseUnits('30', 'gwei');
      }

      // Adjust gas price for Polygon (10% higher)
      maxFeePerGas = (maxFeePerGas * 110n) / 100n;
      maxPriorityFeePerGas = (maxPriorityFeePerGas * 110n) / 100n;

      // Complete transaction object
      transaction = {
        ...transaction,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };

      // Sign transaction
      const signedTx = await this.wallet.signTransaction(transaction);
      const parsedTx = ethers.Transaction.from(signedTx);

      // Mark nonce as pending
      this.nonceManager.markNoncePending(nonce);

      const result: SignedTransaction = {
        transactionId,
        hash: parsedTx.hash!,
        rawTransaction: signedTx,
        nonce: Number(nonce),
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      };

      this.logger.info('Transaction signed successfully', {
        transactionId,
        hash: result.hash,
        nonce: result.nonce,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to sign transaction', error, { transactionId });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // Clear sensitive data
    this.wallet = null;
  }
}
