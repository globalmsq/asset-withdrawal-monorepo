import { ethers } from 'ethers';
import { ChainProvider } from '../../providers/chain.provider';
import { ChainProviderFactory } from '../../providers/chain-provider.factory';

// Mock ethers
jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation((url, config) => ({
      getBlockNumber: jest.fn().mockResolvedValue(12345678),
      getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
      getTransactionReceipt: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 12345678,
      }),
      estimateGas: jest.fn().mockResolvedValue(BigInt(21000)),
      getTransactionCount: jest.fn().mockResolvedValue(5),
      waitForTransaction: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 12345678,
      }),
      getFeeData: jest.fn().mockResolvedValue({
        maxFeePerGas: BigInt('50000000000'),
        maxPriorityFeePerGas: BigInt('30000000000'),
      }),
      getGasPrice: jest.fn().mockResolvedValue(BigInt('40000000000')),
      broadcastTransaction: jest.fn().mockResolvedValue({
        hash: '0x123',
        wait: jest.fn(),
      }),
    })),
    Contract: jest.fn(),
  },
}));

describe('ChainProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a provider for Polygon mainnet', () => {
      const provider = new ChainProvider({
        chain: 'polygon',
        network: 'mainnet',
      });

      expect(provider.chain).toBe('polygon');
      expect(provider.network).toBe('mainnet');
      expect(provider.getChainId()).toBe(137);
      expect(provider.getChainName()).toBe('Polygon Mainnet');
    });

    it('should create a provider for Polygon testnet (Amoy)', () => {
      const provider = new ChainProvider({
        chain: 'polygon',
        network: 'testnet',
      });

      expect(provider.chain).toBe('polygon');
      expect(provider.network).toBe('testnet');
      expect(provider.getChainId()).toBe(80002);
      expect(provider.getChainName()).toBe('Polygon Amoy');
    });

    it('should create a provider for Ethereum mainnet', () => {
      const provider = new ChainProvider({
        chain: 'ethereum',
        network: 'mainnet',
      });

      expect(provider.chain).toBe('ethereum');
      expect(provider.network).toBe('mainnet');
      expect(provider.getChainId()).toBe(1);
      expect(provider.getChainName()).toBe('Ethereum Mainnet');
    });

    it('should create a provider for BSC testnet', () => {
      const provider = new ChainProvider({
        chain: 'bsc',
        network: 'testnet',
      });

      expect(provider.chain).toBe('bsc');
      expect(provider.network).toBe('testnet');
      expect(provider.getChainId()).toBe(97);
      expect(provider.getChainName()).toBe('BSC Testnet');
    });

    it('should use custom RPC URL if provided', () => {
      const customRpcUrl = 'https://custom-rpc.example.com';
      const provider = new ChainProvider({
        chain: 'polygon',
        network: 'mainnet',
        rpcUrl: customRpcUrl,
      });

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(customRpcUrl, {
        name: 'Polygon Mainnet',
        chainId: 137,
      });
    });

    it('should throw error for unsupported chain', () => {
      expect(() => {
        new ChainProvider({
          chain: 'unsupported' as any,
          network: 'mainnet',
        });
      }).toThrow('Unsupported chain: unsupported');
    });

    it('should throw error for unsupported network', () => {
      expect(() => {
        new ChainProvider({
          chain: 'polygon',
          network: 'unsupported' as any,
        });
      }).toThrow('Unsupported network: unsupported for chain: polygon');
    });
  });

  describe('methods', () => {
    let provider: ChainProvider;

    beforeEach(() => {
      provider = new ChainProvider({
        chain: 'polygon',
        network: 'mainnet',
      });
    });

    it('should get native currency info', () => {
      const currency = provider.getNativeCurrency();
      expect(currency).toEqual({
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
      });
    });

    it('should get block explorer URL', () => {
      const url = provider.getBlockExplorerUrl();
      expect(url).toBe('https://polygonscan.com');
    });

    it('should get transaction URL', () => {
      const txHash = '0x123abc';
      const url = provider.getTxUrl(txHash);
      expect(url).toBe('https://polygonscan.com/tx/0x123abc');
    });

    it('should get address URL', () => {
      const address = '0x456def';
      const url = provider.getAddressUrl(address);
      expect(url).toBe('https://polygonscan.com/address/0x456def');
    });

    it('should get block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBe(12345678);
    });

    it('should get balance', async () => {
      const balance = await provider.getBalance('0x123');
      expect(balance).toBe(BigInt('1000000000000000000'));
    });

    it('should estimate gas with 20% buffer', async () => {
      const transaction = { to: '0x123', value: '1000' };
      const gasEstimate = await provider.estimateGas(transaction);
      expect(gasEstimate).toBe(BigInt(25200)); // 21000 * 1.2
    });

    it('should check chain type methods', () => {
      expect(provider.isPolygon()).toBe(true);
      expect(provider.isEthereum()).toBe(false);
      expect(provider.isBsc()).toBe(false);
      expect(provider.isMainnet()).toBe(true);
      expect(provider.isTestnet()).toBe(false);
    });

    it('should get Multicall3 address for Polygon', () => {
      const address = provider.getMulticall3Address();
      expect(address).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
    });

    it('should get Multicall3 address for different chains', () => {
      const polygonProvider = new ChainProvider({
        chain: 'polygon',
        network: 'testnet',
      });
      expect(polygonProvider.getMulticall3Address()).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');

      const ethereumProvider = new ChainProvider({
        chain: 'ethereum',
        network: 'mainnet',
      });
      expect(ethereumProvider.getMulticall3Address()).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');

      const bscProvider = new ChainProvider({
        chain: 'bsc',
        network: 'mainnet',
      });
      expect(bscProvider.getMulticall3Address()).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
    });
  });
});

describe('ChainProviderFactory', () => {
  beforeEach(() => {
    ChainProviderFactory.clearProviders();
  });

  it('should create and cache Polygon provider', () => {
    const provider1 = ChainProviderFactory.createPolygonProvider('mainnet');
    const provider2 = ChainProviderFactory.createPolygonProvider('mainnet');

    expect(provider1).toBe(provider2); // Should return cached instance
    expect(provider1.chain).toBe('polygon');
    expect(provider1.network).toBe('mainnet');
  });

  it('should create and cache Ethereum provider', () => {
    const provider1 = ChainProviderFactory.createEthereumProvider('testnet');
    const provider2 = ChainProviderFactory.createEthereumProvider('testnet');

    expect(provider1).toBe(provider2); // Should return cached instance
    expect(provider1.chain).toBe('ethereum');
    expect(provider1.network).toBe('testnet');
  });

  it('should create and cache BSC provider', () => {
    const provider1 = ChainProviderFactory.createBscProvider('mainnet');
    const provider2 = ChainProviderFactory.createBscProvider('mainnet');

    expect(provider1).toBe(provider2); // Should return cached instance
    expect(provider1.chain).toBe('bsc');
    expect(provider1.network).toBe('mainnet');
  });

  it('should create different instances for different networks', () => {
    const mainnetProvider = ChainProviderFactory.createPolygonProvider('mainnet');
    const testnetProvider = ChainProviderFactory.createPolygonProvider('testnet');

    expect(mainnetProvider).not.toBe(testnetProvider);
    expect(mainnetProvider.getChainId()).toBe(137);
    expect(testnetProvider.getChainId()).toBe(80002);
  });

  it('should create different instances for custom RPC URLs', () => {
    const defaultProvider = ChainProviderFactory.createPolygonProvider('mainnet');
    const customProvider = ChainProviderFactory.createPolygonProvider('mainnet', 'https://custom-rpc.com');

    expect(defaultProvider).not.toBe(customProvider);
  });

  it('should clear all cached providers', () => {
    const provider1 = ChainProviderFactory.createPolygonProvider('mainnet');
    ChainProviderFactory.clearProviders();
    const provider2 = ChainProviderFactory.createPolygonProvider('mainnet');

    expect(provider1).not.toBe(provider2); // Should be different instances after clear
  });
});
