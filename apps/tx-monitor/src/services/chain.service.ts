import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  logger,
  getChainConfig,
  getChainRpcUrl,
  getRequiredConfirmations,
  loadChainConfig,
} from '@asset-withdrawal/shared';
import { ChainConfig } from '../types';
import { config } from '../config';

// Circuit Breaker states
type CircuitState = 'closed' | 'open' | 'half-open';

export class ChainService extends EventEmitter {
  private providers: Map<
    string,
    ethers.JsonRpcProvider | ethers.WebSocketProvider
  >;
  private chainConfigs: Map<string, ChainConfig>;
  private reconnectTimers: Map<string, NodeJS.Timeout>;
  private reconnectAttempts: Map<string, number>;
  private lastBlockNumbers: Map<string, number>;

  // Long-term reconnection and circuit breaker
  private longTermReconnectTimers: Map<string, NodeJS.Timeout>;
  private circuitState: Map<string, CircuitState>;
  private circuitOpenTime: Map<string, number>;
  private reconnectStats: Map<string, { success: number; failure: number }>;

  constructor() {
    super();
    this.providers = new Map();
    this.chainConfigs = new Map();
    this.reconnectTimers = new Map();
    this.reconnectAttempts = new Map();
    this.lastBlockNumbers = new Map();

    // Initialize long-term reconnection and circuit breaker
    this.longTermReconnectTimers = new Map();
    this.circuitState = new Map();
    this.circuitOpenTime = new Map();
    this.reconnectStats = new Map();

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

        // Trigger immediate polling when WebSocket disconnects
        this.emit('websocket-disconnected', { chain, network });

        // Start reconnection process
        this.scheduleReconnect(chain, network);
      });

      (provider.websocket as any).on('error', (error: any) => {
        logger.error(
          `[ChainService] WebSocket error for ${chain}-${network}:`,
          error
        );
      });

      // Track block numbers for missed block detection
      provider.on('block', (blockNumber: number) => {
        this.lastBlockNumbers.set(key, blockNumber);
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

  // Helper method to get all loaded configurations
  getLoadedConfigurations(): Map<string, ChainConfig> {
    return this.chainConfigs;
  }

  // Schedule WebSocket reconnection with exponential backoff
  private scheduleReconnect(chain: string, network: string): void {
    const key = `${chain}-${network}`;

    // Clear any existing reconnect timer
    const existingTimer = this.reconnectTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Get current attempt count
    const attempts = this.reconnectAttempts.get(key) || 0;

    // Check if we've reached max short-term attempts
    if (attempts >= config.reconnection.maxAttempts) {
      logger.warn(
        `[ChainService] Max short-term reconnection attempts reached for ${chain}-${network}, switching to long-term reconnection`
      );

      // Open circuit breaker
      if (config.reconnection.enableCircuitBreaker) {
        this.circuitState.set(key, 'open');
        this.circuitOpenTime.set(key, Date.now());
      }

      // Update stats
      const stats = this.reconnectStats.get(key) || { success: 0, failure: 0 };
      stats.failure++;
      this.reconnectStats.set(key, stats);

      // Switch to long-term reconnection
      this.scheduleLongTermReconnect(chain, network);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      config.reconnection.initialDelay *
        Math.pow(config.reconnection.backoffMultiplier, attempts),
      config.reconnection.maxBackoffDelay
    );

    logger.info(
      `[ChainService] Scheduling reconnection for ${chain}-${network} in ${delay}ms (attempt ${attempts + 1}/${config.reconnection.maxAttempts})`
    );

    const timer = setTimeout(async () => {
      await this.attemptReconnect(chain, network);
    }, delay);

    this.reconnectTimers.set(key, timer);
    this.reconnectAttempts.set(key, attempts + 1);
  }

  // Attempt to reconnect WebSocket
  private async attemptReconnect(
    chain: string,
    network: string,
    isLongTerm: boolean = false
  ): Promise<void> {
    const key = `${chain}-${network}`;

    try {
      // Check circuit breaker state
      const circuitState = this.circuitState.get(key);
      if (circuitState === 'open' && !isLongTerm) {
        const openTime = this.circuitOpenTime.get(key) || 0;
        const elapsed = Date.now() - openTime;

        if (elapsed < config.reconnection.circuitBreakerResetTime) {
          logger.debug(
            `[ChainService] Circuit breaker is open for ${chain}-${network}, skipping reconnection`
          );
          return;
        }

        // Transition to half-open state
        this.circuitState.set(key, 'half-open');
        logger.info(
          `[ChainService] Circuit breaker transitioning to half-open for ${chain}-${network}`
        );
      }

      logger.info(
        `[ChainService] Attempting ${isLongTerm ? 'long-term' : 'short-term'} reconnection for ${chain}-${network}`
      );

      // Try to create new WebSocket provider
      const provider = await this.getWebSocketProvider(chain, network);

      if (provider) {
        logger.info(
          `[ChainService] Successfully reconnected WebSocket for ${chain}-${network}`
        );

        // Clear all reconnection state
        this.reconnectTimers.delete(key);
        this.reconnectAttempts.delete(key);
        this.clearLongTermReconnect(key);

        // Reset circuit breaker
        this.circuitState.set(key, 'closed');
        this.circuitOpenTime.delete(key);

        // Update stats
        const stats = this.reconnectStats.get(key) || {
          success: 0,
          failure: 0,
        };
        stats.success++;
        this.reconnectStats.set(key, stats);

        // Check for missed blocks
        const lastBlock = this.lastBlockNumbers.get(`${key}-ws`);
        if (lastBlock) {
          const currentBlock = await provider.getBlockNumber();
          const missedBlocks = currentBlock - lastBlock;

          if (missedBlocks > 1) {
            logger.warn(
              `[ChainService] Detected ${missedBlocks} missed blocks for ${chain}-${network} (${lastBlock + 1} to ${currentBlock})`
            );
          }
        }

        // Emit reconnection event
        this.emit('websocket-reconnected', {
          chain,
          network,
          lastBlock: lastBlock || 0,
          currentBlock: await provider.getBlockNumber(),
        });
      } else {
        // Failed to reconnect
        if (!isLongTerm) {
          // Schedule another short-term attempt
          this.scheduleReconnect(chain, network);
        } else {
          // Long-term reconnection failed, will retry on next interval
          logger.warn(
            `[ChainService] Long-term reconnection failed for ${chain}-${network}, will retry in ${config.reconnection.longTermInterval / 1000}s`
          );
        }
      }
    } catch (error) {
      logger.error(
        `[ChainService] Failed to reconnect WebSocket for ${chain}-${network}:`,
        error
      );

      // Update stats
      const stats = this.reconnectStats.get(key) || { success: 0, failure: 0 };
      stats.failure++;
      this.reconnectStats.set(key, stats);

      if (!isLongTerm) {
        // Schedule another reconnection attempt
        this.scheduleReconnect(chain, network);
      }
    }
  }

  // Schedule long-term reconnection (after short-term attempts failed)
  private scheduleLongTermReconnect(chain: string, network: string): void {
    const key = `${chain}-${network}`;

    // Clear any existing long-term timer
    this.clearLongTermReconnect(key);

    // Check if we've exceeded max long-term attempts (if configured)
    const maxLongTermAttempts = config.reconnection.maxLongTermAttempts;
    if (maxLongTermAttempts > 0) {
      const stats = this.reconnectStats.get(key) || { success: 0, failure: 0 };
      if (stats.failure >= maxLongTermAttempts) {
        logger.error(
          `[ChainService] Max long-term reconnection attempts (${maxLongTermAttempts}) exceeded for ${chain}-${network}. Manual intervention required.`
        );
        return;
      }
    }

    logger.info(
      `[ChainService] Scheduling long-term reconnection for ${chain}-${network} every ${config.reconnection.longTermInterval / 1000}s`
    );

    // Set up periodic reconnection attempts
    const timer = setInterval(async () => {
      logger.info(
        `[ChainService] Long-term reconnection attempt for ${chain}-${network}`
      );

      // Reset short-term attempt counter for new round of attempts
      this.reconnectAttempts.set(key, 0);

      // Attempt reconnection
      await this.attemptReconnect(chain, network, true);
    }, config.reconnection.longTermInterval);

    this.longTermReconnectTimers.set(key, timer);
  }

  // Clear long-term reconnection timer
  private clearLongTermReconnect(key: string): void {
    const timer = this.longTermReconnectTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.longTermReconnectTimers.delete(key);
    }
  }

  // Get reconnection statistics
  getReconnectionStats(
    chain: string,
    network: string
  ): { success: number; failure: number; circuitState: CircuitState } | null {
    const key = `${chain}-${network}`;
    const stats = this.reconnectStats.get(key);
    const state = this.circuitState.get(key) || 'closed';

    if (!stats) {
      return null;
    }

    return { ...stats, circuitState: state };
  }

  // Get last known block number for a chain
  getLastBlockNumber(chain: string, network: string): number | undefined {
    const key = `${chain}-${network}`;
    return this.lastBlockNumbers.get(key);
  }

  // Cleanup method to clear all timers
  disconnectAll(): void {
    // Clear all short-term reconnection timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Clear all long-term reconnection timers
    for (const timer of this.longTermReconnectTimers.values()) {
      clearInterval(timer);
    }
    this.longTermReconnectTimers.clear();

    // Disconnect all WebSocket providers
    for (const [key, provider] of this.providers.entries()) {
      if (provider instanceof ethers.WebSocketProvider) {
        provider.destroy();
        logger.info(
          `[ChainService] Disconnected WebSocket provider for ${key}`
        );
      }
    }

    // Clear all providers
    this.providers.clear();

    // Clear tracking data
    this.reconnectAttempts.clear();
    this.lastBlockNumbers.clear();
    this.circuitState.clear();
    this.circuitOpenTime.clear();
    this.reconnectStats.clear();

    logger.info('[ChainService] All providers and timers disconnected');
  }
}
