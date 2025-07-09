import { ethers } from 'ethers';
import { Logger } from '../../utils/logger';
import { config } from '../../config';

export interface PolygonConfig {
  network: 'amoy' | 'mainnet';
  rpcUrl: string;
  chainId: number;
  confirmations: number;
}

export class PolygonProvider {
  private provider: ethers.JsonRpcProvider;
  private logger = new Logger('PolygonProvider');
  private config: PolygonConfig;

  constructor(customConfig?: Partial<PolygonConfig>) {
    this.config = {
      network: (customConfig?.network || config.polygon.network) as 'amoy' | 'mainnet',
      rpcUrl: customConfig?.rpcUrl || config.polygon.rpcUrl,
      chainId: customConfig?.chainId || config.polygon.chainId,
      confirmations: customConfig?.confirmations || config.polygon.confirmations,
    };

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, {
      name: this.config.network,
      chainId: this.config.chainId,
    });

    this.logger.info(`Initialized Polygon provider for ${this.config.network} network`);
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      this.logger.error('Failed to get block number', error);
      throw error;
    }
  }

  async getGasPrice(): Promise<bigint> {
    try {
      const gasPrice = await this.provider.getFeeData();
      
      // For Polygon, we typically want to use a slightly higher gas price for faster confirmation
      const baseGasPrice = gasPrice.gasPrice || ethers.parseUnits('30', 'gwei');
      const adjustedGasPrice = baseGasPrice * 110n / 100n; // 10% higher
      
      this.logger.debug(`Gas price: ${ethers.formatUnits(adjustedGasPrice, 'gwei')} Gwei`);
      return adjustedGasPrice;
    } catch (error) {
      this.logger.error('Failed to get gas price', error);
      // Fallback gas price for Polygon
      return ethers.parseUnits('50', 'gwei');
    }
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      return await this.provider.getBalance(address);
    } catch (error) {
      this.logger.error(`Failed to get balance for ${address}`, error);
      throw error;
    }
  }

  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      this.logger.error(`Failed to get transaction receipt for ${txHash}`, error);
      throw error;
    }
  }

  async waitForTransaction(
    txHash: string,
    confirmations?: number
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      const receipt = await this.provider.waitForTransaction(
        txHash,
        confirmations || this.config.confirmations
      );
      return receipt;
    } catch (error) {
      this.logger.error(`Failed to wait for transaction ${txHash}`, error);
      throw error;
    }
  }

  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    try {
      const estimated = await this.provider.estimateGas(transaction);
      // Add 20% buffer for safety
      return estimated * 120n / 100n;
    } catch (error) {
      this.logger.error('Failed to estimate gas', error);
      throw error;
    }
  }

  async getTransactionCount(address: string, blockTag?: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address, blockTag);
    } catch (error) {
      this.logger.error(`Failed to get transaction count for ${address}`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.provider._network !== null;
  }

  getChainId(): number {
    return this.config.chainId;
  }

  getNetwork(): string {
    return this.config.network;
  }
}