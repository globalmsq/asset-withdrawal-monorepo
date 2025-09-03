// Mock ChainProvider globally to prevent WebSocket connections during tests
jest.mock('@asset-withdrawal/shared', () => {
  const originalModule = jest.requireActual('@asset-withdrawal/shared');

  // Create a mock ChainProvider that doesn't create WebSocket connections
  const MockChainProvider = jest.fn().mockImplementation(options => {
    return {
      chain: options.chain,
      network: options.network,
      config: {
        chainId: options.chain === 'localhost' ? 31337 : 137,
        name: `${options.chain} ${options.network}`,
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        blockExplorerUrl: 'https://example.com',
        rpcUrl: 'ws://localhost:8545',
        multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      },
      getProvider: jest.fn().mockReturnValue({
        getBlockNumber: jest.fn().mockResolvedValue(100),
        getBalance: jest.fn().mockResolvedValue(BigInt(1000000000000000000)),
        getTransactionReceipt: jest.fn().mockResolvedValue({}),
        estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
        getTransactionCount: jest.fn().mockResolvedValue(42),
        waitForTransaction: jest.fn().mockResolvedValue({}),
        getFeeData: jest.fn().mockResolvedValue({
          gasPrice: BigInt(20000000000),
          maxFeePerGas: BigInt(30000000000),
          maxPriorityFeePerGas: BigInt(2000000000),
        }),
        broadcastTransaction: jest.fn().mockResolvedValue({ hash: '0x123' }),
        send: jest.fn().mockResolvedValue('0x7C9D'), // 31337 in hex for localhost
        websocket: { readyState: 1 }, // Mock WebSocket as connected
      }),
      isConnected: jest.fn().mockReturnValue(true),
      getChainId: jest
        .fn()
        .mockReturnValue(options.chain === 'localhost' ? 31337 : 137),
      getChainName: jest
        .fn()
        .mockReturnValue(`${options.chain} ${options.network}`),
      getNativeCurrency: jest
        .fn()
        .mockReturnValue({ name: 'MATIC', symbol: 'MATIC', decimals: 18 }),
      getBlockExplorerUrl: jest.fn().mockReturnValue('https://example.com'),
      getTxUrl: jest.fn().mockReturnValue('https://example.com/tx/'),
      getAddressUrl: jest.fn().mockReturnValue('https://example.com/address/'),
      getMulticall3Address: jest
        .fn()
        .mockReturnValue('0xcA11bde05977b3631167028862bE2a173976CA11'),
      getBlockNumber: jest.fn().mockResolvedValue(100),
      getBalance: jest.fn().mockResolvedValue(BigInt(1000000000000000000)),
      getTransactionReceipt: jest.fn().mockResolvedValue({}),
      estimateGas: jest.fn().mockResolvedValue(BigInt(100000)),
      getTransactionCount: jest.fn().mockResolvedValue(42),
      waitForTransaction: jest.fn().mockResolvedValue({}),
      getFeeData: jest.fn().mockResolvedValue({
        gasPrice: BigInt(20000000000),
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(2000000000),
      }),
      getGasPrice: jest.fn().mockResolvedValue(BigInt(20000000000)),
      sendTransaction: jest.fn().mockResolvedValue({ hash: '0x123' }),
      getContract: jest.fn().mockReturnValue({}),
      isPolygon: jest.fn().mockReturnValue(options.chain === 'polygon'),
      isEthereum: jest.fn().mockReturnValue(options.chain === 'ethereum'),
      isBsc: jest.fn().mockReturnValue(options.chain === 'bsc'),
      isMainnet: jest.fn().mockReturnValue(options.network === 'mainnet'),
      isTestnet: jest.fn().mockReturnValue(options.network === 'testnet'),
      isLocalhost: jest.fn().mockReturnValue(options.chain === 'localhost'),
    };
  });

  return {
    ...originalModule,
    ChainProvider: MockChainProvider,
  };
});
