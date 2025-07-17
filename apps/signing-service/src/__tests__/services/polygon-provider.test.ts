import { PolygonProvider } from '../../services/polygon-provider';
import { Logger } from '../../utils/logger';
import { ethers } from 'ethers';

jest.mock('ethers');

describe('PolygonProvider', () => {
  let polygonProvider: PolygonProvider;
  let mockLogger: jest.Mocked<Logger>;
  let mockProvider: jest.Mocked<ethers.JsonRpcProvider>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockProvider = {
      getNetwork: jest.fn(),
      getBlockNumber: jest.fn(),
      getBalance: jest.fn(),
      getFeeData: jest.fn(),
      estimateGas: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getTransactionCount: jest.fn(),
      waitForTransaction: jest.fn(),
    } as any;

    (ethers.JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => mockProvider);
  });

  describe('constructor', () => {
    it('should initialize with amoy network', () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://rpc-amoy.polygon.technology',
        {
          chainId: 80002,
          name: 'amoy',
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initialized Polygon provider for amoy network'
      );
    });

    it('should initialize with mainnet network', () => {
      polygonProvider = new PolygonProvider(
        'https://polygon-rpc.com',
        137,
        mockLogger
      );

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://polygon-rpc.com',
        {
          chainId: 137,
          name: 'mainnet',
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initialized Polygon provider for mainnet network'
      );
    });

    it('should initialize with mainnet network for unknown chainId', () => {
      polygonProvider = new PolygonProvider(
        'https://custom-rpc.com',
        999,
        mockLogger
      );

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        'https://custom-rpc.com',
        {
          chainId: 999,
          name: 'mainnet',
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initialized Polygon provider for mainnet network'
      );
    });
  });

  describe('getProvider', () => {
    it('should return the provider instance', () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      const provider = polygonProvider.getProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe('getBlockNumber', () => {
    it('should return block number', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      mockProvider.getBlockNumber.mockResolvedValue(1000);

      const blockNumber = await polygonProvider.getBlockNumber();
      expect(blockNumber).toBe(1000);
    });

    it('should handle error when getting block number', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      mockProvider.getBlockNumber.mockRejectedValue(new Error('Connection failed'));

      await expect(polygonProvider.getBlockNumber()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get block number',
        expect.any(Error)
      );
    });
  });

  describe('getBalance', () => {
    it('should return balance for address', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      const address = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
      mockProvider.getBalance.mockResolvedValue(BigInt(1000000000000000000));

      const balance = await polygonProvider.getBalance(address);
      expect(balance).toBe(BigInt(1000000000000000000));
    });
  });

  describe('estimateGas', () => {
    it('should estimate gas with 20% buffer', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      const transaction = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        value: BigInt(0),
        data: '0x',
      };

      mockProvider.estimateGas.mockResolvedValue(BigInt(100000));

      const gasEstimate = await polygonProvider.estimateGas(transaction);
      expect(gasEstimate).toBe(BigInt(120000)); // 100000 * 1.2
      expect(mockProvider.estimateGas).toHaveBeenCalledWith(transaction);
    });
  });

  describe('getTransactionReceipt', () => {
    it('should return transaction receipt', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      const txHash = '0xabc123...';
      const mockReceipt = {
        status: 1,
        blockNumber: 1000,
        confirmations: 12,
      };

      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt as any);

      const receipt = await polygonProvider.getTransactionReceipt(txHash);
      expect(receipt).toEqual(mockReceipt);
    });
  });

  describe('getTransactionCount', () => {
    it('should return transaction count', async () => {
      polygonProvider = new PolygonProvider(
        'https://rpc-amoy.polygon.technology',
        80002,
        mockLogger
      );

      const address = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
      mockProvider.getTransactionCount.mockResolvedValue(10);

      const count = await polygonProvider.getTransactionCount(address, 'pending');
      expect(count).toBe(10);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(address, 'pending');
    });
  });
});
