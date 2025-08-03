import { Token, TokenInfo } from '../types/token.types';
export declare class TokenService {
    private static instance;
    private tokenConfig;
    private constructor();
    static getInstance(): TokenService;
    getTokenByAddress(address: string, network: string, chain?: string): TokenInfo | null;
    getTokenBySymbol(symbol: string, network: string, chain?: string): TokenInfo | null;
    isTokenSupported(address: string, network: string, chain?: string): boolean;
    getSupportedTokens(network: string, chain?: string): Token[];
    getSupportedNetworks(chain?: string): string[];
    getSupportedBlockchains(): string[];
    private getChainId;
}
export declare const tokenService: TokenService;
