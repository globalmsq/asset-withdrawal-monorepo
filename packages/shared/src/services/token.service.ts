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

  public getTokenByAddress(address: string, network: string): TokenInfo | null {
    const normalizedAddress = address.toLowerCase();
    // Default to polygon since it's the only supported blockchain
    const blockchainConfig = this.tokenConfig['polygon'];

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
          chainId: this.getChainId('polygon', network),
        };
      }
    }

    return null;
  }

  public getTokenBySymbol(symbol: string, network: string): TokenInfo | null {
    const token = this.tokenConfig['polygon']?.[network]?.[symbol];

    if (!token) {
      return null;
    }

    return {
      ...token,
      network,
      chainId: this.getChainId('polygon', network),
    };
  }

  public isTokenSupported(address: string, network: string): boolean {
    return this.getTokenByAddress(address, network) !== null;
  }

  public getSupportedTokens(network: string): Token[] {
    const networkConfig = this.tokenConfig['polygon']?.[network];

    if (!networkConfig) {
      return [];
    }

    return Object.values(networkConfig);
  }

  public getSupportedNetworks(): string[] {
    return Object.keys(this.tokenConfig['polygon'] || {});
  }

  public getSupportedBlockchains(): string[] {
    return Object.keys(this.tokenConfig);
  }

  private getChainId(blockchain: string, network: string): number {
    const chainIds: { [key: string]: { [key: string]: number } } = {
      polygon: {
        mainnet: 137,
        amoy: 80002,
      },
      bsc: {
        mainnet: 56,
        testnet: 97,
      },
    };

    return chainIds[blockchain]?.[network] || 0;
  }
}

export const tokenService = TokenService.getInstance();
