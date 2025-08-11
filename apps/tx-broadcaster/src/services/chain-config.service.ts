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
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providerCache.set(chainId, provider);

      // Provider created successfully
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
