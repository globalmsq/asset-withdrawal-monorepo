import { ethers } from 'ethers';
import { Logger } from '../utils/logger';

export class PolygonProvider {
  private provider: ethers.JsonRpcProvider;
  public readonly network: 'amoy' | 'mainnet';
  public readonly chainId: number;
  
  constructor(
    rpcUrl: string,
    chainId: number,
    private logger?: Logger
  ) {
    this.chainId = chainId;
    this.network = chainId === 80002 ? 'amoy' : 'mainnet';
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl, {
      name: this.network,
      chainId: this.chainId,
    });
    
    this.logger?.info(`Initialized Polygon provider for ${this.network} network`);
  }
  
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }
  
  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      this.logger?.error('Failed to get block number', error);
      throw error;
    }
  }
  
  async getBalance(address: string): Promise<bigint> {
    try {
      return await this.provider.getBalance(address);
    } catch (error) {
      this.logger?.error(`Failed to get balance for ${address}`, error);
      throw error;
    }
  }
  
  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      this.logger?.error(`Failed to get transaction receipt for ${txHash}`, error);
      throw error;
    }
  }
  
  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    try {
      const estimated = await this.provider.estimateGas(transaction);
      // Add 20% buffer for safety
      return estimated * 120n / 100n;
    } catch (error) {
      this.logger?.error('Failed to estimate gas', error);
      throw error;
    }
  }
  
  async getTransactionCount(address: string, blockTag?: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address, blockTag);
    } catch (error) {
      this.logger?.error(`Failed to get transaction count for ${address}`, error);
      throw error;
    }
  }
}