export type ChainNetwork = 'mainnet' | 'testnet' | 'localhost';
export type ChainName = 'polygon' | 'ethereum' | 'bsc' | 'localhost';
export interface ChainConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    blockExplorerUrl: string;
    multicall3Address?: string;
}
export interface ChainConfigs {
    [key: string]: {
        mainnet?: ChainConfig;
        testnet?: ChainConfig;
        localhost?: ChainConfig;
    };
}
export interface ChainProviderOptions {
    chain: ChainName;
    network: ChainNetwork;
    rpcUrl?: string;
}
