import { ethers } from 'ethers';
import {
  logger,
  getChainConfig,
  getChainRpcUrl,
  getRequiredConfirmations,
} from '@asset-withdrawal/shared';
import { ChainConfig } from '../types';

export class ChainService {
  private providers: Map<
    string,
    ethers.JsonRpcProvider | ethers.WebSocketProvider
  >;
  private chainConfigs: Map<string, ChainConfig>;

  constructor() {
    this.providers = new Map();
    this.chainConfigs = new Map();
    this.loadConfigurations();
  }

  private loadConfigurations(): void {
    const chains = ['polygon', 'ethereum', 'bsc', 'localhost'];
    const networks = ['mainnet', 'testnet'];

    for (const chain of chains) {
      for (const network of networks) {
        try {
          const rpcUrl = getChainRpcUrl(chain, network);
          if (rpcUrl) {
            const key = `${chain}-${network}`;
            const config = getChainConfig(chain)?.[network];
            if (config) {
              this.chainConfigs.set(key, config);
              logger.info(`[ChainService] Loaded config for ${key}`);
            }
          }
        } catch (error) {
          // Some combinations may not exist (e.g., localhost-mainnet)
          continue;
        }
      }
    }
  }

  async getProvider(
    chain: string,
    network: string
  ): Promise<ethers.JsonRpcProvider> {
    const key = `${chain}-${network}`;

    // Return existing provider if available
    const existingProvider = this.providers.get(key);
    if (
      existingProvider &&
      existingProvider instanceof ethers.JsonRpcProvider
    ) {
      return existingProvider;
    }

    // Get chain config
    const config = this.chainConfigs.get(key);
    if (!config) {
      throw new Error(`No configuration found for ${chain}-${network}`);
    }

    // Create new JSON-RPC provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.providers.set(key, provider);

    logger.info(`[ChainService] Created JSON-RPC provider for ${key}`);
    return provider;
  }

  async getWebSocketProvider(
    chain: string,
    network: string
  ): Promise<ethers.WebSocketProvider | null> {
    const key = `${chain}-${network}-ws`;

    // Return existing WebSocket provider if available
    const existingProvider = this.providers.get(key);
    if (
      existingProvider &&
      existingProvider instanceof ethers.WebSocketProvider
    ) {
      return existingProvider;
    }

    // Get chain config
    const config = this.chainConfigs.get(`${chain}-${network}`);
    if (!config || !config.wsUrl) {
      logger.warn(
        `[ChainService] No WebSocket URL configured for ${chain}-${network}`
      );
      return null;
    }

    try {
      // Create new WebSocket provider
      const provider = new ethers.WebSocketProvider(config.wsUrl);

      // Set up reconnection logic (skip type checking for ethers WebSocket)
      (provider.websocket as any).on('close', () => {
        logger.warn(
          `[ChainService] WebSocket connection closed for ${chain}-${network}, will reconnect...`
        );
        this.providers.delete(key);
      });

      (provider.websocket as any).on('error', (error: any) => {
        logger.error(
          `[ChainService] WebSocket error for ${chain}-${network}:`,
          error
        );
      });

      this.providers.set(key, provider);
      logger.info(
        `[ChainService] Created WebSocket provider for ${chain}-${network}`
      );

      return provider;
    } catch (error) {
      logger.error(
        `[ChainService] Failed to create WebSocket provider for ${chain}-${network}:`,
        error
      );
      return null;
    }
  }

  async getRequiredConfirmations(
    chain: string,
    network: string
  ): Promise<number> {
    const key = `${chain}-${network}`;
    const config = this.chainConfigs.get(key);

    if (!config || !config.requiredConfirmations) {
      // Default confirmations based on chain
      const defaults: Record<string, number> = {
        polygon: 30,
        ethereum: 12,
        bsc: 15,
        localhost: 1,
      };

      return defaults[chain] || 6;
    }

    return config.requiredConfirmations;
  }

  getBlockTime(chain: string, network: string): number {
    const key = `${chain}-${network}`;
    const config = this.chainConfigs.get(key);

    if (!config || !config.blockTime) {
      // Default block times in seconds
      const defaults: Record<string, number> = {
        polygon: 2,
        ethereum: 12,
        bsc: 3,
        localhost: 1,
      };

      return defaults[chain] || 10;
    }

    return config.blockTime;
  }

  async getCurrentBlockNumber(chain: string, network: string): Promise<number> {
    const provider = await this.getProvider(chain, network);
    return await provider.getBlockNumber();
  }

  async getTransaction(
    chain: string,
    network: string,
    txHash: string
  ): Promise<ethers.TransactionResponse | null> {
    const provider = await this.getProvider(chain, network);
    return await provider.getTransaction(txHash);
  }

  async getTransactionReceipt(
    chain: string,
    network: string,
    txHash: string
  ): Promise<ethers.TransactionReceipt | null> {
    const provider = await this.getProvider(chain, network);
    return await provider.getTransactionReceipt(txHash);
  }

  async waitForTransaction(
    chain: string,
    network: string,
    txHash: string,
    confirmations?: number
  ): Promise<ethers.TransactionReceipt | null> {
    const provider = await this.getProvider(chain, network);
    const requiredConfirmations =
      confirmations || (await this.getRequiredConfirmations(chain, network));

    return await provider.waitForTransaction(txHash, requiredConfirmations);
  }

  disconnectAll(): void {
    for (const [key, provider] of this.providers.entries()) {
      if (provider instanceof ethers.WebSocketProvider) {
        provider.destroy();
        logger.info(
          `[ChainService] Disconnected WebSocket provider for ${key}`
        );
      }
      // JSON-RPC providers don't need explicit disconnection
    }

    this.providers.clear();
    logger.info('[ChainService] All providers disconnected');
  }
}
