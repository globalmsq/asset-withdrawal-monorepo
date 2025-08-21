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
 * Get configuration for a specific chain and network
 * @param chain Chain name (e.g., 'polygon', 'ethereum')
 * @param network Network type (e.g., 'mainnet', 'testnet')
 * @returns Chain and network specific configuration or undefined
 */
export function getChainConfig(
  chain: string,
  network: string
): ChainConfig | undefined {
  const config = loadChainConfig();
  const chainData = config[chain];
  if (!chainData) return undefined;

  return chainData[network as keyof typeof chainData];
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
  const chainConfig = getChainConfig(chain, network);
  return chainConfig?.rpcUrl;
}

/**
 * Get required confirmations for a chain
 * @param chain Chain name
 * @param network Network type (default: 'mainnet')
 * @returns Number of required confirmations
 */
export function getRequiredConfirmations(
  chain: string,
  network: string = 'mainnet'
): number {
  const chainConfig = getChainConfig(chain, network);
  return chainConfig?.requiredConfirmations || 12; // Default to 12 if not specified
}

/**
 * Get chain ID for a specific chain and network
 * @param chain Chain name
 * @param network Network type
 * @returns Chain ID or undefined
 */
export function getChainId(chain: string, network: string): number | undefined {
  const chainConfig = getChainConfig(chain, network);
  return chainConfig?.chainId;
}
