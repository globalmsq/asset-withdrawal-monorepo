import { ethers } from 'ethers';
import {
  chainsConfig,
  LoggerService,
  ChainConfig,
  ChainConfigs as ChainsConfig,
} from '@asset-withdrawal/shared';

export class ChainConfigService {
  private chainsConfig: ChainsConfig = {};
  private providerCache: Map<number, ethers.JsonRpcProvider> = new Map();
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService({
      service: 'tx-broadcaster:ChainConfigService',
    });
    this.loadChainsConfig();
  }

  private loadChainsConfig(): void {
    try {
      // shared package에서 chains config 로드
      this.chainsConfig = chainsConfig as ChainsConfig;

      // 설정 유효성 검증
      this.validateChainsConfig();

      // Chain configuration loaded successfully
    } catch (error) {
      this.logger.error('Failed to load chain configuration', error);
      throw new Error(
        `Chain configuration initialization failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private validateChainsConfig(): void {
    let totalChains = 0;

    for (const [networkName, environments] of Object.entries(
      this.chainsConfig
    )) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config) {
          // 필수 필드 검증
          if (!config.chainId || !config.name || !config.rpcUrl) {
            throw new Error(
              `Invalid chain config for ${networkName}/${envName}: missing required fields`
            );
          }

          // Chain ID 중복 검증
          const existingChain = this.findChainByChainId(
            config.chainId,
            networkName,
            envName
          );
          if (existingChain) {
            throw new Error(
              `Duplicate chain ID ${config.chainId} found in ${networkName}/${envName} and ${existingChain}`
            );
          }

          totalChains++;
        }
      }
    }

    if (totalChains === 0) {
      throw new Error('No valid chain configurations found');
    }

    // Validated chain configurations
  }

  private findChainByChainId(
    targetChainId: number,
    excludeNetwork?: string,
    excludeEnv?: string
  ): string | null {
    for (const [networkName, environments] of Object.entries(
      this.chainsConfig
    )) {
      for (const [envName, config] of Object.entries(environments)) {
        if (
          config &&
          config.chainId === targetChainId &&
          !(networkName === excludeNetwork && envName === excludeEnv)
        ) {
          return `${networkName}/${envName}`;
        }
      }
    }
    return null;
  }

  /**
   * 체인 ID에 해당하는 체인 설정을 가져옵니다
   * chains.config.json에서 직접 가져옵니다
   */
  getChainConfig(chainId: number): ChainConfig | null {
    // 모든 네트워크와 환경에서 해당 chainId 찾기
    for (const [networkName, environments] of Object.entries(
      this.chainsConfig
    )) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config && config.chainId === chainId) {
          return config;
        }
      }
    }

    return null;
  }

  /**
   * chain과 network로 체인 설정을 가져옵니다
   * chains.config.json 구조: { polygon: { mainnet: {...}, testnet: {...} } }
   */
  getChainConfigByChainAndNetwork(
    chain: string,
    network: string
  ): ChainConfig | null {
    const chainData = this.chainsConfig[chain];
    if (!chainData || !chainData[network as keyof typeof chainData]) {
      this.logger.error(`Chain config not found for ${chain}/${network}`);
      return null;
    }

    return chainData[network as keyof typeof chainData] || null;
  }

  /**
   * chain과 network로 ethers provider를 가져옵니다 (환경변수 오버라이드 지원)
   */
  getProviderByChainNetwork(
    chain: string,
    network: string
  ): { provider: ethers.JsonRpcProvider; chainId: number } | null {
    const chainConfig = this.getChainConfigByChainAndNetwork(chain, network);
    if (!chainConfig) {
      this.logger.error(`Chain config not found for ${chain}/${network}`);
      return null;
    }

    // 환경변수로 오버라이드 (다른 앱들과 통일성 유지)
    const rpcUrl = process.env.RPC_URL || chainConfig.rpcUrl;
    const chainId = process.env.CHAIN_ID
      ? parseInt(process.env.CHAIN_ID)
      : chainConfig.chainId;

    // 캐시 키는 실제 사용되는 rpcUrl + chainId 조합으로 생성
    const cacheKey = chainId;
    if (this.providerCache.has(cacheKey)) {
      return {
        provider: this.providerCache.get(cacheKey)!,
        chainId,
      };
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
      this.providerCache.set(cacheKey, provider);

      this.logger.info(`Provider created for ${chain}/${network}`, {
        metadata: {
          chainId,
          rpcUrl: rpcUrl.substring(0, 20) + '...', // 로깅용으로 축약
          envOverride: {
            rpcUrl: !!process.env.RPC_URL,
            chainId: !!process.env.CHAIN_ID,
          },
        },
      });

      return { provider, chainId };
    } catch (error) {
      this.logger.error(
        `Failed to create provider for ${chain}/${network} (chainId: ${chainId})`,
        error
      );
      return null;
    }
  }

  /**
   * 체인 ID에 해당하는 ethers provider를 가져옵니다 (캐싱 지원)
   */
  getProvider(chainId: number): ethers.JsonRpcProvider | null {
    // 캐시에서 확인
    if (this.providerCache.has(chainId)) {
      return this.providerCache.get(chainId)!;
    }

    const chainConfig = this.getChainConfig(chainId);
    if (!chainConfig) {
      this.logger.error(
        `Unsupported chain ID: ${chainId}. Supported chains: ${this.getSupportedChainIds().join(', ')}`
      );
      return null;
    }

    try {
      // 환경변수로 오버라이드 지원 (Docker 환경에서 중요)
      // localhost chain의 경우 Docker에서는 hardhat-node:8545를 사용해야 함
      const rpcUrl = process.env.RPC_URL || chainConfig.rpcUrl;
      const actualChainId = process.env.CHAIN_ID
        ? parseInt(process.env.CHAIN_ID)
        : chainId;

      // IMPORTANT: Always pass chainId explicitly to avoid auto-detection issues
      // This is especially important for localhost/hardhat chains
      const provider = new ethers.JsonRpcProvider(rpcUrl, actualChainId);
      this.providerCache.set(chainId, provider);

      this.logger.info(`Provider created for chain ${chainId}`, {
        metadata: {
          chainId: actualChainId,
          chainName: chainConfig.name,
          rpcUrl: rpcUrl.substring(0, 20) + '...', // 로깅용으로 축약
          envOverride: {
            rpcUrl: !!process.env.RPC_URL,
            chainId: !!process.env.CHAIN_ID,
          },
        },
      });

      return provider;
    } catch (error) {
      this.logger.error(
        `Failed to create provider for chain ${chainId} (${chainConfig.name})`,
        error
      );
      return null;
    }
  }

  /**
   * 지원되는 모든 체인 ID 목록을 반환합니다
   */
  getSupportedChainIds(): number[] {
    const chainIds: number[] = [];

    for (const environments of Object.values(this.chainsConfig)) {
      for (const config of Object.values(environments)) {
        if (config) {
          chainIds.push(config.chainId);
        }
      }
    }

    return chainIds;
  }

  /**
   * 체인 ID가 지원되는지 확인합니다
   */
  isChainSupported(chainId: number): boolean {
    return this.getSupportedChainIds().includes(chainId);
  }

  /**
   * 프로바이더 캐시를 정리합니다
   */
  clearProviderCache(): void {
    this.providerCache.clear();
    // Provider cache cleared
  }

  /**
   * 체인 설정 정보를 로깅합니다
   */
  logSupportedChains(): void {
    // Log supported chains for debugging
    const chains: string[] = [];
    for (const [networkName, environments] of Object.entries(
      this.chainsConfig
    )) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config) {
          chains.push(`${config.name} (${config.chainId})`);
        }
      }
    }
    this.logger.info(`Supported chains: ${chains.join(', ')}`);
  }
}

// 싱글톤 인스턴스
let chainConfigService: ChainConfigService | null = null;

export function getChainConfigService(): ChainConfigService {
  if (!chainConfigService) {
    chainConfigService = new ChainConfigService();
  }
  return chainConfigService;
}
