import { ethers } from 'ethers';
import { Logger } from '../../utils/logger';
import { PolygonProvider } from './polygon-provider';
import { NonceManager } from './nonce-manager';
import { SignedTransaction } from '../../types';

export interface TransactionRequest {
  to: string;
  value: string;
  data?: string;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export class TransactionSigner {
  private logger = new Logger('TransactionSigner');
  private wallet?: ethers.Wallet;
  private nonceManager: NonceManager;

  constructor(
    private provider: PolygonProvider,
    privateKey?: string
  ) {
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, provider.getProvider());
      this.nonceManager = new NonceManager(provider, this.wallet.address);
    } else {
      // Will be set later via setPrivateKey
      this.nonceManager = new NonceManager(provider, '');
    }
  }

  async setPrivateKey(privateKey: string): Promise<void> {
    this.wallet = new ethers.Wallet(privateKey, this.provider.getProvider());
    this.nonceManager.setAddress(this.wallet.address);
    this.logger.info(`Wallet initialized with address: ${this.wallet.address}`);
  }

  getAddress(): string | undefined {
    return this.wallet?.address;
  }

  async signTransaction(
    request: TransactionRequest,
    withdrawalId: string
  ): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Set private key first.');
    }

    try {
      // Get nonce
      const nonce = request.nonce ?? await this.nonceManager.getNextNonce();

      // Get gas price if not provided
      const gasPrice = request.gasPrice ?? await this.provider.getGasPrice();

      // Prepare transaction
      const tx: ethers.TransactionRequest = {
        to: request.to,
        value: ethers.parseEther(request.value),
        data: request.data || '0x',
        nonce,
        gasPrice,
        chainId: this.provider.getChainId(),
      };

      // Estimate gas if not provided
      if (!request.gasLimit) {
        tx.gasLimit = await this.provider.estimateGas({
          ...tx,
          from: this.wallet.address,
        });
      } else {
        tx.gasLimit = request.gasLimit;
      }

      this.logger.debug(`Signing transaction for withdrawal ${withdrawalId}`, {
        to: tx.to,
        value: ethers.formatEther(tx.value!),
        gasPrice: ethers.formatUnits(tx.gasPrice!, 'gwei'),
        gasLimit: tx.gasLimit!.toString(),
        nonce: tx.nonce,
      });

      // Sign transaction
      const signedTx = await this.wallet.signTransaction(tx);

      // Parse signed transaction to get details
      const parsedTx = ethers.Transaction.from(signedTx);

      return {
        withdrawalId,
        signedTx,
        from: this.wallet.address,
        to: request.to,
        value: request.value,
        gasPrice: gasPrice.toString(),
        gasLimit: tx.gasLimit!.toString(),
        nonce,
        chainId: this.provider.getChainId(),
      };
    } catch (error) {
      this.logger.error(`Failed to sign transaction for withdrawal ${withdrawalId}`, error);
      // If nonce was allocated but signing failed, release it
      if (request.nonce === undefined) {
        await this.nonceManager.releaseNonce();
      }
      throw error;
    }
  }

  async signERC20Transfer(
    tokenAddress: string,
    recipientAddress: string,
    amount: string,
    decimals: number,
    withdrawalId: string
  ): Promise<SignedTransaction> {
    // ERC20 transfer function signature
    const transferFunctionSignature = 'transfer(address,uint256)';
    const transferInterface = new ethers.Interface([
      `function ${transferFunctionSignature}`,
    ]);

    // Encode the transfer data
    const transferData = transferInterface.encodeFunctionData('transfer', [
      recipientAddress,
      ethers.parseUnits(amount, decimals),
    ]);

    // Sign transaction with encoded data
    return this.signTransaction(
      {
        to: tokenAddress,
        value: '0', // ERC20 transfers don't send native currency
        data: transferData,
      },
      withdrawalId
    );
  }

  async broadcastTransaction(signedTx: string): Promise<string> {
    try {
      const txResponse = await this.provider.getProvider().broadcastTransaction(signedTx);
      this.logger.info(`Transaction broadcasted: ${txResponse.hash}`);
      return txResponse.hash;
    } catch (error) {
      this.logger.error('Failed to broadcast transaction', error);
      throw error;
    }
  }
}
