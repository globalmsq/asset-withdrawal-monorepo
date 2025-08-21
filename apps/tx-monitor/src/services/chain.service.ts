import { ethers } from 'ethers';
import {
  logger,
  getChainConfig,
  getChainRpcUrl,
  getRequiredConfirmations,
  loadChainConfig,
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
    // Load all chains from config file dynamically
    const chainsConfig = loadChainConfig();

    if (!chainsConfig || typeof chainsConfig !== 'object') {
      logger.error('[ChainService] Failed to load chains configuration');
      return;
    }

    // Iterate through all chains and networks in the config
    for (const [chainName, networks] of Object.entries(chainsConfig)) {
      if (!networks || typeof networks !== 'object') {
        continue;
      }

      for (const [networkName, config] of Object.entries(networks)) {
        if (!config || typeof config !== 'object') {
          continue;
        }

        // Skip disabled chains
        if ((config as any).enabled === false) {
          logger.info(
            `[ChainService] Skipping disabled chain: ${chainName}-${networkName}`
          );
          continue;
        }

        const key = `${chainName}-${networkName}`;
        this.chainConfigs.set(key, config as ChainConfig);
        logger.info(
          `[ChainService] Loaded config for ${key} (enabled: ${(config as any).enabled !== false})`
        );
      }
    }

    logger.info(
      `[ChainService] Total loaded configurations: ${this.chainConfigs.size}`
    );
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

    // Support RPC_URL environment variable override (for Docker environments)
    const rpcUrl = process.env.RPC_URL || config.rpcUrl;
    const chainId = process.env.CHAIN_ID
      ? parseInt(process.env.CHAIN_ID)
      : config.chainId;

    // Create new JSON-RPC provider with explicit chainId to prevent auto-detection issues
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    this.providers.set(key, provider);

    logger.info(`[ChainService] Created JSON-RPC provider for ${key}`, {
      metadata: {
        rpcUrl: rpcUrl.substring(0, 20) + '...',
        chainId,
        envOverride: {
          rpcUrl: !!process.env.RPC_URL,
          chainId: !!process.env.CHAIN_ID,
        },
      },
    });
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

    // Check for WebSocket URL (environment variable overrides config)
    const wsUrl = process.env.WS_URL || config?.wsUrl;

    if (!wsUrl) {
      logger.warn(
        `[ChainService] No WebSocket URL configured for ${chain}-${network}`
      );
      return null;
    }

    try {
      // Get chainId from environment or config
      const chainId = process.env.CHAIN_ID
        ? parseInt(process.env.CHAIN_ID)
        : config?.chainId;

      // Log WebSocket provider creation with environment override info
      logger.info(
        `[ChainService] Creating WebSocket provider for ${chain}-${network}`,
        {
          metadata: {
            wsUrl: wsUrl.substring(0, 20) + '...',
            chainId,
            envOverride: {
              wsUrl: !!process.env.WS_URL,
              chainId: !!process.env.CHAIN_ID,
            },
          },
        }
      );

      // Create new WebSocket provider with explicit chainId
      const provider = new ethers.WebSocketProvider(wsUrl, chainId);

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

  // Helper method to get all loaded configurations
  getLoadedConfigurations(): Map<string, ChainConfig> {
    return this.chainConfigs;
  }
}
