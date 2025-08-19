import { ChainConfigs, ChainConfig } from '../types/chain.types';
import chainsConfig from '../config/chains.config.json';

/**
 * Load chain configuration from chains.config.json
 * @returns Chain configuration object
 */
export function loadChainConfig(): ChainConfigs {
  return chainsConfig as ChainConfigs;
}

/**
 * Get configuration for a specific chain
 * @param chain Chain name (e.g., 'polygon', 'ethereum')
 * @returns Chain-specific configuration or undefined
 */
export function getChainConfig(chain: string): any {
  const config = loadChainConfig();
  return config[chain];
}

/**
 * Get RPC URL for a specific chain and network
 * @param chain Chain name
 * @param network Network type (e.g., 'mainnet', 'testnet')
 * @returns RPC URL or undefined
 */
export function getChainRpcUrl(
  chain: string,
  network: string
): string | undefined {
  const chainConfig = getChainConfig(chain);
  if (!chainConfig) return undefined;

  // Handle different network formats
  if (chainConfig.networks?.[network]) {
    return chainConfig.networks[network].rpcUrl;
  }

  // Fallback to direct RPC URL if available
  return chainConfig.rpcUrl;
}

/**
 * Get required confirmations for a chain
 * @param chain Chain name
 * @returns Number of required confirmations
 */
export function getRequiredConfirmations(chain: string): number {
  const chainConfig = getChainConfig(chain);
  return chainConfig?.requiredConfirmations || 12; // Default to 12 if not specified
}

/**
 * Get chain ID for a specific chain and network
 * @param chain Chain name
 * @param network Network type
 * @returns Chain ID or undefined
 */
export function getChainId(chain: string, network: string): number | undefined {
  const chainConfig = getChainConfig(chain);
  if (!chainConfig) return undefined;

  // Handle different network formats
  if (chainConfig.networks?.[network]) {
    return chainConfig.networks[network].chainId;
  }

  // Fallback to direct chain ID if available
  return chainConfig.chainId;
}
