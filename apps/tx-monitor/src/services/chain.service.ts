import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';

export class ChainService {
  private providers: Map<string, ethers.WebSocketProvider>;
  private chainConfigs: Map<string, any>;

  constructor() {
    this.providers = new Map();
    this.chainConfigs = new Map();
    this.loadChainConfigurations();
  }

  private loadChainConfigurations(): void {
    // Load localhost configuration (Hardhat)
    const localhostConfig = {
      chainId: 31337,
      name: 'localhost',
      network: 'testnet',
      rpcUrl: process.env.RPC_URL || 'ws://localhost:8545',
      confirmations: 3,
      gasLimit: '3000000',
      maxFeePerGas: '2000000000', // 2 Gwei
      maxPriorityFeePerGas: '1000000000', // 1 Gwei
    };

    this.chainConfigs.set('localhost-testnet', localhostConfig);
    logger.info('[ChainService] Loaded localhost chain configuration');
  }

  getLoadedConfigurations(): Map<string, any> {
    return new Map(this.chainConfigs);
  }

  async getProvider(
    chain: string,
    network: string
  ): Promise<ethers.WebSocketProvider | null> {
    const key = `${chain}-${network}`;

    // Return existing WebSocket provider if available and connected
    const existingProvider = this.providers.get(key);
    if (existingProvider) {
      const websocket = (existingProvider as any).websocket;
      if (websocket && websocket.readyState === websocket.OPEN) {
        return existingProvider;
      } else {
        // WebSocket is closed, remove it
        logger.info(
          `[ChainService] Removing closed WebSocket provider for ${chain}-${network}`
        );
        this.providers.delete(key);
      }
    }

    // Create new WebSocket provider
    const config = this.chainConfigs.get(key);
    if (!config || !config.rpcUrl) {
      logger.error(
        `[ChainService] No configuration found for ${chain}-${network}`
      );
      return null;
    }

    try {
      logger.info(
        `[ChainService] Creating WebSocket provider for ${chain}-${network}`
      );
      const provider = new ethers.WebSocketProvider(config.rpcUrl);

      // Wait for connection to be established
      await provider._waitUntilReady();

      this.providers.set(key, provider);
      logger.info(
        `[ChainService] WebSocket provider ready for ${chain}-${network}`
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

  // Alias for getProvider to maintain compatibility with WebSocketService
  async getWebSocketProvider(
    chain: string,
    network: string
  ): Promise<ethers.WebSocketProvider | null> {
    return this.getProvider(chain, network);
  }

  removeProvider(chain: string, network: string): void {
    const key = `${chain}-${network}`;
    const provider = this.providers.get(key);

    if (provider) {
      try {
        provider.destroy();
      } catch (error) {
        logger.debug(
          `[ChainService] Error destroying provider for ${chain}-${network}`
        );
      }
      this.providers.delete(key);
      logger.info(
        `[ChainService] Removed WebSocket provider for ${chain}-${network}`
      );
    }
  }

  getChainConfig(chain: string, network: string): any {
    return this.chainConfigs.get(`${chain}-${network}`);
  }

  getRequiredConfirmations(chain: string, network: string): number {
    const config = this.chainConfigs.get(`${chain}-${network}`);
    return config?.confirmations || 3;
  }

  async getTransactionReceipt(
    chain: string,
    network: string,
    txHash: string
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      const provider = await this.getProvider(chain, network);
      if (!provider) {
        logger.error(
          `[ChainService] No provider available for ${chain}-${network}`
        );
        return null;
      }

      const receipt = await provider.getTransactionReceipt(txHash);
      return receipt;
    } catch (error) {
      logger.error(
        `[ChainService] Error getting transaction receipt for ${txHash} on ${chain}-${network}:`,
        error
      );
      return null;
    }
  }

  async getBlockNumber(chain: string, network: string): Promise<number | null> {
    try {
      const provider = await this.getProvider(chain, network);
      if (!provider) {
        return null;
      }

      const blockNumber = await provider.getBlockNumber();
      return blockNumber;
    } catch (error) {
      logger.error(
        `[ChainService] Error getting block number for ${chain}-${network}:`,
        error
      );
      return null;
    }
  }

  async getBalance(
    chain: string,
    network: string,
    address: string
  ): Promise<string | null> {
    try {
      const provider = await this.getProvider(chain, network);
      if (!provider) {
        return null;
      }

      const balance = await provider.getBalance(address);
      return balance.toString();
    } catch (error) {
      logger.error(
        `[ChainService] Error getting balance for ${address} on ${chain}-${network}:`,
        error
      );
      return null;
    }
  }

  disconnectAll(): void {
    for (const [key, provider] of this.providers) {
      try {
        provider.destroy();
      } catch (error) {
        logger.debug(`[ChainService] Error disconnecting provider ${key}`);
      }
    }
    this.providers.clear();
    logger.info('[ChainService] All providers disconnected');
  }
}
