export interface Token {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    maxTransferAmount?: string;
}
export interface TokenConfig {
    [network: string]: {
        [chainName: string]: {
            [symbol: string]: Token;
        };
    };
}
export interface TokenInfo extends Token {
    network: string;
    chainId: number;
}
