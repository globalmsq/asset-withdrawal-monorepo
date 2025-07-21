import { ethers } from 'ethers';
import * as chainsConfig from '../config/chains.config.json';
import { ChainName, ChainNetwork, ChainConfig, ChainProviderOptions } from '../types/chain.types';

export class ChainProvider {
  private provider: ethers.JsonRpcProvider;
  public readonly chain: ChainName;
  public readonly network: ChainNetwork;
  public readonly config: ChainConfig;

  constructor(options: ChainProviderOptions) {
    this.chain = options.chain;
    this.network = options.network;

    const chainConfigs = chainsConfig[options.chain];
    if (!chainConfigs) {
      throw new Error(`Unsupported chain: ${options.chain}`);
    }

    this.config = chainConfigs[options.network];
    if (!this.config) {
      throw new Error(`Unsupported network: ${options.network} for chain: ${options.chain}`);
    }

    const rpcUrl = options.rpcUrl || this.config.rpcUrl;

    this.provider = new ethers.JsonRpcProvider(rpcUrl, {
      name: this.config.name,
      chainId: this.config.chainId,
    });
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getChainId(): number {
    return this.config.chainId;
  }

  getChainName(): string {
    return this.config.name;
  }

  getNativeCurrency(): { name: string; symbol: string; decimals: number } {
    return this.config.nativeCurrency;
  }

  getBlockExplorerUrl(): string {
    return this.config.blockExplorerUrl;
  }

  getTxUrl(txHash: string): string {
    return `${this.config.blockExplorerUrl}/tx/${txHash}`;
  }

  getAddressUrl(address: string): string {
    return `${this.config.blockExplorerUrl}/address/${address}`;
  }

  getMulticall3Address(): string {
    // Universal Multicall3 address for most EVM chains
    const UNIVERSAL_MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
    return this.config.multicall3Address || UNIVERSAL_MULTICALL3_ADDRESS;
  }

  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      throw new Error(`Failed to get block number: ${error}`);
    }
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      return await this.provider.getBalance(address);
    } catch (error) {
      throw new Error(`Failed to get balance for ${address}: ${error}`);
    }
  }

  async getTransactionReceipt(
    txHash: string
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      throw new Error(`Failed to get transaction receipt for ${txHash}: ${error}`);
    }
  }

  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    try {
      const estimated = await this.provider.estimateGas(transaction);
      // Add 20% buffer for safety
      return (estimated * 120n) / 100n;
    } catch (error) {
      throw new Error(`Failed to estimate gas: ${error}`);
    }
  }

  async getTransactionCount(
    address: string,
    blockTag?: string
  ): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address, blockTag);
    } catch (error) {
      throw new Error(`Failed to get transaction count for ${address}: ${error}`);
    }
  }

  async waitForTransaction(
    txHash: string,
    confirmations?: number,
    timeout?: number
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      return await this.provider.waitForTransaction(txHash, confirmations, timeout);
    } catch (error) {
      throw new Error(`Failed to wait for transaction ${txHash}: ${error}`);
    }
  }

  async getFeeData(): Promise<ethers.FeeData> {
    try {
      return await this.provider.getFeeData();
    } catch (error) {
      throw new Error(`Failed to get fee data: ${error}`);
    }
  }

  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice || BigInt(0);
    } catch (error) {
      throw new Error(`Failed to get gas price: ${error}`);
    }
  }

  async sendTransaction(
    signedTransaction: string
  ): Promise<ethers.TransactionResponse> {
    try {
      return await this.provider.broadcastTransaction(signedTransaction);
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error}`);
    }
  }

  async getContract(
    address: string,
    abi: any[]
  ): Promise<ethers.Contract> {
    return new ethers.Contract(address, abi, this.provider);
  }

  isPolygon(): boolean {
    return this.chain === 'polygon';
  }

  isEthereum(): boolean {
    return this.chain === 'ethereum';
  }

  isBsc(): boolean {
    return this.chain === 'bsc';
  }

  isMainnet(): boolean {
    return this.network === 'mainnet';
  }

  isTestnet(): boolean {
    return this.network === 'testnet';
  }
}
