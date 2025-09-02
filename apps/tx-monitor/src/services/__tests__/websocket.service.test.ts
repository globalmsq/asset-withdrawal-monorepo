import { WebSocketService } from '../websocket.service';
import { MonitorService } from '../monitor.service';
import { ChainService } from '../chain.service';
import { ethers } from 'ethers';

// Mock dependencies
jest.mock('../chain.service');
jest.mock('../monitor.service');
jest.mock('@asset-withdrawal/shared', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('WebSocketService', () => {
  let webSocketService: WebSocketService;
  let mockChainService: jest.Mocked<ChainService>;
  let mockMonitorService: jest.Mocked<MonitorService>;
  let mockProvider: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      on: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      once: jest.fn(),
      getBlock: jest.fn(),
      getBlockNumber: jest.fn(),
      websocket: {
        on: jest.fn(),
      },
    };

    // Setup mock services
    mockChainService = new ChainService() as jest.Mocked<ChainService>;
    mockMonitorService = new MonitorService() as jest.Mocked<MonitorService>;

    // Mock ChainService methods
    mockChainService.getProvider = jest.fn().mockResolvedValue(mockProvider);
    mockChainService.getLoadedConfigurations = jest.fn().mockReturnValue(
      new Map([
        ['polygon-mainnet', { url: 'wss://test' }],
        ['ethereum-mainnet', { url: 'wss://test2' }],
      ])
    );
    mockChainService.removeProvider = jest.fn();

    // Mock MonitorService methods
    mockMonitorService.getActiveTransactions = jest
      .fn()
      .mockReturnValue(new Map());
    mockMonitorService.checkTransaction = jest.fn();

    // Create service instance
    webSocketService = new WebSocketService(
      mockChainService,
      mockMonitorService
    );
  });

  describe('Conditional Block Subscription', () => {
    it('should not subscribe to block events when no active transactions', async () => {
      // No active transactions
      mockMonitorService.getActiveTransactions.mockReturnValue(new Map());

      await webSocketService.startListening();

      // Should connect to WebSocket
      expect(mockChainService.getWebSocketProvider).toHaveBeenCalled();

      // Should NOT subscribe to block events
      expect(mockProvider.on).not.toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );
    });

    it('should subscribe to block events when transactions are added', async () => {
      // Start with no transactions
      mockMonitorService.getActiveTransactions.mockReturnValue(new Map());

      await webSocketService.startListening();

      // Initially no block subscription
      expect(mockProvider.on).not.toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );

      // Add a transaction to watch
      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([
          [
            '0x123',
            {
              txHash: '0x123',
              chain: 'polygon',
              network: 'mainnet',
              status: 'SENT',
              lastChecked: new Date(),
              confirmations: 0,
              retryCount: 0,
              nonce: 1,
            },
          ],
        ])
      );

      // Add transaction to watch
      await webSocketService.addTransactionToWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Now should subscribe to blocks
      expect(mockProvider.removeAllListeners).toHaveBeenCalledWith('block');
      expect(mockProvider.on).toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );
    });

    it('should unsubscribe from block events when all transactions complete', async () => {
      // Start with active transactions
      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([
          [
            '0x123',
            {
              txHash: '0x123',
              chain: 'polygon',
              network: 'mainnet',
              status: 'SENT',
              lastChecked: new Date(),
              confirmations: 0,
              retryCount: 0,
              nonce: 1,
            },
          ],
        ])
      );

      await webSocketService.startListening();
      await webSocketService.addTransactionToWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Should be subscribed
      expect(mockProvider.on).toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );

      // Clear the mock
      mockProvider.removeListener.mockClear();

      // Remove the transaction
      mockMonitorService.getActiveTransactions.mockReturnValue(new Map());
      await webSocketService.removeTransactionFromWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Should unsubscribe from blocks
      expect(mockProvider.removeListener).toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );
    });

    it('should handle multiple chains independently', async () => {
      await webSocketService.startListening();

      // Add transaction for polygon
      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([
          [
            '0x123',
            {
              txHash: '0x123',
              chain: 'polygon',
              network: 'mainnet',
              status: 'SENT',
              lastChecked: new Date(),
              confirmations: 0,
              retryCount: 0,
              nonce: 1,
            },
          ],
        ])
      );

      await webSocketService.addTransactionToWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Should subscribe for polygon
      expect(mockProvider.on).toHaveBeenCalledWith(
        'block',
        expect.any(Function)
      );

      // Ethereum should still not be subscribed (no transactions)
      const polygonCalls = mockProvider.on.mock.calls.filter(
        call => call[0] === 'block'
      ).length;
      expect(polygonCalls).toBe(1); // Only one subscription for polygon
    });

    it('should only check relevant transactions on block events', async () => {
      // Setup active transactions
      const polygonTx = {
        txHash: '0x123',
        chain: 'polygon',
        network: 'mainnet',
        status: 'SENT' as const,
        lastChecked: new Date(),
        confirmations: 0,
        retryCount: 0,
        nonce: 1,
      };

      const ethereumTx = {
        txHash: '0x456',
        chain: 'ethereum',
        network: 'mainnet',
        status: 'SENT' as const,
        lastChecked: new Date(),
        confirmations: 0,
        retryCount: 0,
        nonce: 2,
      };

      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([
          ['0x123', polygonTx],
          ['0x456', ethereumTx],
        ])
      );

      // Mock block with transaction
      mockProvider.getBlock.mockResolvedValue({
        number: 100,
        transactions: ['0x123'], // Only polygon tx in this block
      });

      await webSocketService.startListening();
      await webSocketService.addTransactionToWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Get the block listener and trigger it
      const blockListener = mockProvider.on.mock.calls.find(
        call => call[0] === 'block'
      )?.[1];

      if (blockListener) {
        await blockListener(100);
      }

      // Should only check the polygon transaction, not ethereum
      expect(mockMonitorService.checkTransaction).toHaveBeenCalledWith('0x123');
      expect(mockMonitorService.checkTransaction).not.toHaveBeenCalledWith(
        '0x456'
      );
    });

    it('should handle CONFIRMING transactions differently from SENT', async () => {
      // Setup with CONFIRMING transaction
      const confirmingTx = {
        txHash: '0x789',
        chain: 'polygon',
        network: 'mainnet',
        status: 'CONFIRMING' as const,
        blockNumber: 95,
        lastChecked: new Date(),
        confirmations: 2,
        retryCount: 0,
        nonce: 3,
      };

      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([['0x789', confirmingTx]])
      );

      mockProvider.getBlock.mockResolvedValue({
        number: 100,
        transactions: ['0xabc'], // Different transaction in block
      });

      await webSocketService.startListening();
      await webSocketService.addTransactionToWatch(
        '0x789',
        'polygon',
        'mainnet'
      );

      // Trigger block event
      const blockListener = mockProvider.on.mock.calls.find(
        call => call[0] === 'block'
      )?.[1];

      if (blockListener) {
        await blockListener(100);
      }

      // Should check CONFIRMING transaction even though it's not in the new block
      expect(mockMonitorService.checkTransaction).toHaveBeenCalledWith('0x789');
    });
  });

  describe('Reconnection Handling', () => {
    it('should attempt reconnection on disconnection', async () => {
      jest.useFakeTimers();

      await webSocketService.startListening();

      // Get initial call count (2 chains = 2 calls)
      const initialCallCount =
        mockChainService.getWebSocketProvider.mock.calls.length;

      // Simulate WebSocket close event for polygon
      const closeHandler = mockProvider.websocket.on.mock.calls.find(
        call => call[0] === 'close'
      )?.[1];

      if (closeHandler) {
        closeHandler();
      }

      // Fast-forward time for reconnection attempt
      jest.advanceTimersByTime(5000);

      // Should have one additional call for reconnection
      expect(mockChainService.getWebSocketProvider).toHaveBeenCalledTimes(
        initialCallCount + 1
      );

      jest.useRealTimers();
    });
  });

  describe('Cleanup', () => {
    it('should clean up all listeners on shutdown', async () => {
      // Setup with active transaction
      mockMonitorService.getActiveTransactions.mockReturnValue(
        new Map([
          [
            '0x123',
            {
              txHash: '0x123',
              chain: 'polygon',
              network: 'mainnet',
              status: 'SENT',
              lastChecked: new Date(),
              confirmations: 0,
              retryCount: 0,
              nonce: 1,
            },
          ],
        ])
      );

      await webSocketService.startListening();
      await webSocketService.addTransactionToWatch(
        '0x123',
        'polygon',
        'mainnet'
      );

      // Shutdown
      await webSocketService.stopListening();

      // Should remove all listeners
      expect(mockProvider.removeListener).toHaveBeenCalled();
    });
  });
});
