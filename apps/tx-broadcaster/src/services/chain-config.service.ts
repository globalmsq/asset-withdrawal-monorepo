import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

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
  multicall3Address: string;
}

export interface ChainsConfig {
  [network: string]: {
    mainnet?: ChainConfig;
    testnet?: ChainConfig;
  };
}

export class ChainConfigService {
  private chainsConfig: ChainsConfig = {};
  private providerCache: Map<number, ethers.JsonRpcProvider> = new Map();

  constructor() {
    this.loadChainsConfig();
  }

  private loadChainsConfig(): void {
    try {
      // chains.config.json 파일 경로 (shared package에서 로드)
      const configPath = path.join(
        __dirname,
        '../../../../../packages/shared/src/config/chains.config.json'
      );
      
      if (!fs.existsSync(configPath)) {
        console.error(`[tx-broadcaster] Chain config file not found at: ${configPath}`);
        throw new Error(`Chain config file not found at: ${configPath}`);
      }

      const configData = fs.readFileSync(configPath, 'utf-8');
      this.chainsConfig = JSON.parse(configData);
      
      // 설정 유효성 검증
      this.validateChainsConfig();
      
      console.log('[tx-broadcaster] Chain configuration loaded successfully');
      console.log(`[tx-broadcaster] Loaded ${this.getSupportedChainIds().length} supported chains`);
    } catch (error) {
      console.error('[tx-broadcaster] Failed to load chain configuration:', error);
      throw new Error(`Chain configuration initialization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private validateChainsConfig(): void {
    let totalChains = 0;
    
    for (const [networkName, environments] of Object.entries(this.chainsConfig)) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config) {
          // 필수 필드 검증
          if (!config.chainId || !config.name || !config.rpcUrl) {
            throw new Error(`Invalid chain config for ${networkName}/${envName}: missing required fields`);
          }
          
          // Chain ID 중복 검증
          const existingChain = this.findChainByChainId(config.chainId, networkName, envName);
          if (existingChain) {
            throw new Error(`Duplicate chain ID ${config.chainId} found in ${networkName}/${envName} and ${existingChain}`);
          }
          
          totalChains++;
        }
      }
    }
    
    if (totalChains === 0) {
      throw new Error('No valid chain configurations found');
    }
    
    console.log(`[tx-broadcaster] Validated ${totalChains} chain configurations`);
  }

  private findChainByChainId(targetChainId: number, excludeNetwork?: string, excludeEnv?: string): string | null {
    for (const [networkName, environments] of Object.entries(this.chainsConfig)) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config && 
            config.chainId === targetChainId && 
            !(networkName === excludeNetwork && envName === excludeEnv)) {
          return `${networkName}/${envName}`;
        }
      }
    }
    return null;
  }

  /**
   * 체인 ID에 해당하는 체인 설정을 가져옵니다
   * 환경변수가 설정되어 있으면 오버라이드합니다
   */
  getChainConfig(chainId: number): ChainConfig | null {
    // 모든 네트워크와 환경에서 해당 chainId 찾기
    for (const [networkName, environments] of Object.entries(this.chainsConfig)) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config && config.chainId === chainId) {
          const chainConfig = { ...config };
          
          // 환경변수로 오버라이드
          const envRpcUrl = process.env.RPC_URL;
          const envChainId = process.env.CHAIN_ID;
          
          if (envRpcUrl) {
            console.log(`[tx-broadcaster] Overriding RPC URL for chain ${chainId}: ${envRpcUrl}`);
            chainConfig.rpcUrl = envRpcUrl;
          }
          
          if (envChainId && parseInt(envChainId) === chainId) {
            console.log(`[tx-broadcaster] Environment chain ID ${envChainId} matches message chain ID ${chainId}`);
          }
          
          return chainConfig;
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
      const cachedProvider = this.providerCache.get(chainId)!;
      console.log(`[tx-broadcaster] Using cached provider for chain ${chainId}`);
      return cachedProvider;
    }

    const chainConfig = this.getChainConfig(chainId);
    if (!chainConfig) {
      console.error(`[tx-broadcaster] Unsupported chain ID: ${chainId}. Supported chains: ${this.getSupportedChainIds().join(', ')}`);
      return null;
    }

    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providerCache.set(chainId, provider);
      
      console.log(`[tx-broadcaster] Created provider for chain ${chainId} (${chainConfig.name}): ${chainConfig.rpcUrl}`);
      return provider;
    } catch (error) {
      console.error(`[tx-broadcaster] Failed to create provider for chain ${chainId} (${chainConfig.name}):`, error);
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
    console.log('[tx-broadcaster] Provider cache cleared');
  }

  /**
   * 체인 설정 정보를 로깅합니다
   */
  logSupportedChains(): void {
    console.log('[tx-broadcaster] Supported chains:');
    
    for (const [networkName, environments] of Object.entries(this.chainsConfig)) {
      for (const [envName, config] of Object.entries(environments)) {
        if (config) {
          const envOverride = process.env.CHAIN_ID && parseInt(process.env.CHAIN_ID) === config.chainId 
            ? ' [ENV OVERRIDE]' : '';
          console.log(`  - ${config.name} (${networkName}/${envName}): Chain ID ${config.chainId}${envOverride}`);
        }
      }
    }
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