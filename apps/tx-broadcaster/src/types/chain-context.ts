import { ethers } from 'ethers';
import {
  getChainConfigService,
  ChainConfigService,
} from '../services/chain-config.service';

/**
 * ChainContext interface for managing chain/network information and provider access
 * This ensures chain/network are always used as primary identifiers
 */
export interface ChainContext {
  chain: string;
  network: string;
  chainId?: number;

  // Get provider for this chain/network combination
  getProvider(): ethers.JsonRpcProvider | null;

  // Get chainId from config if not already set
  getChainId(): number;

  // String representation for logging
  toString(): string;

  // Clone this context
  clone(): ChainContext;
}

/**
 * Implementation of ChainContext with lazy provider loading and caching
 */
export class ChainContextImpl implements ChainContext {
  private _provider?: ethers.JsonRpcProvider;
  private _chainConfigService: ChainConfigService;

  constructor(
    public chain: string,
    public network: string,
    public chainId?: number
  ) {
    this._chainConfigService = getChainConfigService();
  }

  /**
   * Get provider for this chain/network, with caching
   * Provider is created on first access and reused
   */
  getProvider(): ethers.JsonRpcProvider | null {
    if (!this._provider) {
      // Validate chain and network are provided
      if (!this.chain || !this.network) {
        throw new Error(
          `Invalid chain context: chain=${this.chain}, network=${this.network}`
        );
      }

      // Get provider using chain and network (NOT chainId)
      const result = this._chainConfigService.getProviderByChainNetwork(
        this.chain,
        this.network
      );

      if (result) {
        this._provider = result.provider;
        // Store chainId from config if not already set
        if (!this.chainId) {
          this.chainId = result.chainId;
        }
      }
    }

    return this._provider || null;
  }

  /**
   * Get chainId from config if not already set
   */
  getChainId(): number {
    if (!this.chainId) {
      const config = this._chainConfigService.getChainConfigByChainAndNetwork(
        this.chain,
        this.network
      );
      if (config) {
        this.chainId = config.chainId;
      } else {
        throw new Error(`No config found for ${this.chain}/${this.network}`);
      }
    }
    return this.chainId;
  }

  /**
   * Create a string representation for logging
   */
  toString(): string {
    return `${this.chain}/${this.network}${this.chainId ? ` (chainId: ${this.chainId})` : ''}`;
  }

  /**
   * Clone this context (useful for creating new instances)
   */
  clone(): ChainContext {
    return new ChainContextImpl(this.chain, this.network, this.chainId);
  }
}

/**
 * Helper function to create ChainContext from chain and network
 */
export function createChainContext(
  chain: string,
  network: string,
  chainId?: number
): ChainContext {
  return new ChainContextImpl(chain, network, chainId);
}
