import { Token, TokenConfig, TokenInfo } from '../types/token.types';
import tokenConfig from '../config/tokens.config.json';

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
  
  public getTokenByAddress(address: string, network: string, blockchain: string = 'polygon'): TokenInfo | null {
    const normalizedAddress = address.toLowerCase();
    const blockchainConfig = this.tokenConfig[blockchain];
    
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
          chainId: this.getChainId(blockchain, network)
        };
      }
    }
    
    return null;
  }
  
  public getTokenBySymbol(symbol: string, network: string, blockchain: string = 'polygon'): TokenInfo | null {
    const token = this.tokenConfig[blockchain]?.[network]?.[symbol];
    
    if (!token) {
      return null;
    }
    
    return {
      ...token,
      network,
      chainId: this.getChainId(blockchain, network)
    };
  }
  
  public isTokenSupported(address: string, network: string, blockchain: string = 'polygon'): boolean {
    return this.getTokenByAddress(address, network, blockchain) !== null;
  }
  
  public getSupportedTokens(network: string, blockchain: string = 'polygon'): Token[] {
    const networkConfig = this.tokenConfig[blockchain]?.[network];
    
    if (!networkConfig) {
      return [];
    }
    
    return Object.values(networkConfig);
  }
  
  public getSupportedNetworks(blockchain: string = 'polygon'): string[] {
    return Object.keys(this.tokenConfig[blockchain] || {});
  }
  
  public getSupportedBlockchains(): string[] {
    return Object.keys(this.tokenConfig);
  }
  
  private getChainId(blockchain: string, network: string): number {
    const chainIds: { [key: string]: { [key: string]: number } } = {
      polygon: {
        mainnet: 137,
        amoy: 80002
      },
      bsc: {
        mainnet: 56,
        testnet: 97
      }
    };
    
    return chainIds[blockchain]?.[network] || 0;
  }
}

export const tokenService = TokenService.getInstance();