import { Token, TokenConfig, TokenInfo } from '../types/token.types';
import tokenConfig from '../config/tokens.config.json';
import chainConfig from '../config/chains.config.json';

export class TokenService {
  private static instance: TokenService;
  private tokenConfig: TokenConfig;

  private constructor() {
    this.tokenConfig = tokenConfig;
  }

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  public getTokenByAddress(address: string, network: string, chain: string = 'polygon'): TokenInfo | null {
    const normalizedAddress = address.toLowerCase();
    const blockchainConfig = this.tokenConfig[chain];

    if (!blockchainConfig) {
      return null;
    }

    const networkConfig = blockchainConfig[network];

    if (!networkConfig) {
      return null;
    }

    for (const [symbol, token] of Object.entries(networkConfig)) {
      if (token.address.toLowerCase() === normalizedAddress) {
        return {
          ...token,
          network,
          chainId: this.getChainId(chain, network),
        };
      }
    }

    return null;
  }

  public getTokenBySymbol(symbol: string, network: string, chain: string = 'polygon'): TokenInfo | null {
    const token = this.tokenConfig[chain]?.[network]?.[symbol];

    if (!token) {
      return null;
    }

    return {
      ...token,
      network,
      chainId: this.getChainId(chain, network),
    };
  }

  public isTokenSupported(address: string, network: string, chain: string = 'polygon'): boolean {
    return this.getTokenByAddress(address, network, chain) !== null;
  }

  public getSupportedTokens(network: string, chain: string = 'polygon'): Token[] {
    const networkConfig = this.tokenConfig[chain]?.[network];

    if (!networkConfig) {
      return [];
    }

    return Object.values(networkConfig);
  }

  public getSupportedNetworks(chain: string = 'polygon'): string[] {
    return Object.keys(this.tokenConfig[chain] || {});
  }

  public getSupportedBlockchains(): string[] {
    return Object.keys(this.tokenConfig);
  }

  private getChainId(blockchain: string, network: string): number {
    return (chainConfig as any)[blockchain]?.[network]?.chainId || 0;
  }
}

export const tokenService = TokenService.getInstance();
