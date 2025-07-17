import { ChainProvider } from './chain.provider';
import { ChainName, ChainNetwork } from '../types/chain.types';

export class ChainProviderFactory {
  private static providers: Map<string, ChainProvider> = new Map();

  static getProvider(
    chain: ChainName,
    network: ChainNetwork,
    rpcUrl?: string
  ): ChainProvider {
    const key = `${chain}-${network}${rpcUrl ? `-${rpcUrl}` : ''}`;

    if (!this.providers.has(key)) {
      const provider = new ChainProvider({ chain, network, rpcUrl });
      this.providers.set(key, provider);
    }

    return this.providers.get(key)!;
  }

  static createPolygonProvider(network: ChainNetwork, rpcUrl?: string): ChainProvider {
    return this.getProvider('polygon', network, rpcUrl);
  }

  static createEthereumProvider(network: ChainNetwork, rpcUrl?: string): ChainProvider {
    return this.getProvider('ethereum', network, rpcUrl);
  }

  static createBscProvider(network: ChainNetwork, rpcUrl?: string): ChainProvider {
    return this.getProvider('bsc', network, rpcUrl);
  }

  static clearProviders(): void {
    this.providers.clear();
  }
}
