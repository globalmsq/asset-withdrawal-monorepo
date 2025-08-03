import { ChainProvider } from './chain.provider';
import { ChainName, ChainNetwork } from '../types/chain.types';
export declare class ChainProviderFactory {
    private static providers;
    static getProvider(chain: ChainName, network: ChainNetwork, rpcUrl?: string): ChainProvider;
    static clearProviders(): void;
}
