import { ethers } from 'ethers';
import { TransactionBroadcaster } from '../../services/broadcaster';
import {
  ChainConfigService,
  getChainConfigService,
} from '../../services/chain-config.service';
import { TransactionService } from '../../services/transaction.service';
import { LoggerService } from '@asset-withdrawal/shared';

// We'll mock ethers Transaction in the beforeEach block instead

// Mock dependencies
jest.mock('../../config', () => ({
  loadConfig: jest.fn().mockReturnValue({
    CHAINS_CONFIG_PATH: './test-chains.json',
    POLYGON_RPC_URL: 'https://polygon-rpc.com',
    MUMBAI_RPC_URL: 'https://mumbai-rpc.com',
  }),
}));

jest.mock('../../services/chain-config.service', () => ({
  ChainConfigService: jest.fn(),
  getChainConfigService: jest.fn(),
}));

jest.mock('../../services/transaction.service');

jest.mock('@asset-withdrawal/shared', () => ({
  LoggerService: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  ERROR_MESSAGES: {
    TRANSACTION: {
      UNSUPPORTED_CHAIN: (chainId: number, supported: number[]) =>
        `Chain ${chainId} not supported. Supported: ${supported}`,
      BROADCAST_FAILED: (txHash: string, error: string) =>
        `Broadcast failed for ${txHash}: ${error}`,
    },
  },
}));

describe('TransactionBroadcaster', () => {
  let broadcaster: TransactionBroadcaster;
  let mockChainConfigService: jest.Mocked<ChainConfigService>;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockProvider: jest.Mocked<ethers.Provider>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ethers.Transaction.from to bypass parsing issues
    jest.spyOn(ethers.Transaction, 'from').mockImplementation(
      () =>
        ({
          chainId: 137n,
          from: '0x1234567890123456789012345678901234567890',
          to: '0x742d35cc6634c0532925a3b844bc9e7595f09928',
          data: '0xa9059cbb',
          nonce: 0,
          gasLimit: 21000n,
          maxFeePerGas: 100000000n,
          maxPriorityFeePerGas: 100000000n,
        }) as any
    );

    // Setup mock provider
    mockProvider = {
      sendTransaction: jest.fn(),
      broadcastTransaction: jest.fn(), // Add this method that broadcaster actually uses
      waitForTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getNetwork: jest.fn(),
      getBlockNumber: jest.fn(),
      getFeeData: jest.fn(),
    } as any;

    // Setup mock ChainConfigService
    mockChainConfigService = {
      loadChainsConfig: jest.fn(),
      getChainConfig: jest.fn(),
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getSupportedChainIds: jest.fn().mockReturnValue([137, 80002]),
      isChainSupported: jest.fn().mockReturnValue(true),
      logSupportedChains: jest.fn(),
    } as any;

    (getChainConfigService as jest.Mock).mockReturnValue(
      mockChainConfigService
    );

    // Setup mock TransactionService
    mockTransactionService = {
      updateToBroadcasting: jest.fn(),
      updateToBroadcasted: jest.fn(),
      updateToFailed: jest.fn(),
      markAsPermanentlyFailed: jest.fn(),
    } as any;

    (TransactionService as jest.Mock).mockReturnValue(mockTransactionService);

    // Create broadcaster instance
    broadcaster = new TransactionBroadcaster();
    mockLogger = (broadcaster as any).logger;
  });

  describe('broadcastTransaction', () => {
    // This is a valid EIP-1559 transaction for Polygon (chainId 137)
    // Created with ethers.js v6 format
    const validSignedTx =
      '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

    it('트랜잭션을 성공적으로 브로드캐스트해야 함', async () => {
      const txResponse = {
        hash: '0xabc123',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 1000,
        }),
      };

      mockProvider.broadcastTransaction.mockResolvedValue(txResponse as any);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe('0xabc123');
      expect(mockProvider.broadcastTransaction).toHaveBeenCalledWith(
        validSignedTx
      );
    });

    it('지원하지 않는 체인에 대해 에러를 반환해야 함', async () => {
      mockChainConfigService.isChainSupported.mockReturnValue(false);
      mockChainConfigService.getProvider.mockReturnValue(null);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Chain 999 not supported');
      expect(mockProvider.broadcastTransaction).not.toHaveBeenCalled();
    });

    it('NONCE_TOO_HIGH 에러를 올바르게 처리해야 함', async () => {
      const nonceError = new Error('nonce too high');
      (nonceError as any).code = 'NONCE_TOO_HIGH';
      mockProvider.broadcastTransaction.mockRejectedValue(nonceError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonce too high');
      expect(result.errorCode).toBe('NONCE_TOO_HIGH');
      expect(result.retryable).toBe(true);
    });

    it('NONCE_TOO_LOW 에러를 올바르게 처리해야 함', async () => {
      const nonceError = new Error('nonce too low');
      (nonceError as any).code = 'NONCE_TOO_LOW';
      mockProvider.broadcastTransaction.mockRejectedValue(nonceError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonce too low');
      expect(result.errorCode).toBe('NONCE_TOO_LOW');
      expect(result.retryable).toBe(false); // NONCE_TOO_LOW는 재시도 불가
    });

    it('INSUFFICIENT_FUNDS 에러를 올바르게 처리해야 함', async () => {
      const fundsError = new Error('insufficient funds');
      (fundsError as any).code = 'INSUFFICIENT_FUNDS';
      mockProvider.broadcastTransaction.mockRejectedValue(fundsError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toBe('insufficient funds');
      expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
      expect(result.retryable).toBe(false);
    });

    it('REPLACEMENT_UNDERPRICED 에러를 올바르게 처리해야 함', async () => {
      const gasError = new Error('replacement transaction underpriced');
      (gasError as any).code = 'REPLACEMENT_UNDERPRICED';
      mockProvider.broadcastTransaction.mockRejectedValue(gasError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toBe('replacement transaction underpriced');
      expect(result.errorCode).toBe('REPLACEMENT_UNDERPRICED');
      expect(result.retryable).toBe(false);
    });

    it('네트워크 에러는 재시도 가능해야 함', async () => {
      const networkError = new Error('network error');
      (networkError as any).code = 'NETWORK_ERROR';
      mockProvider.broadcastTransaction.mockRejectedValue(networkError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toBe('network error');
      expect(result.errorCode).toBe('NETWORK_ERROR');
      expect(result.retryable).toBe(true);
    });

    it('타임아웃 에러는 재시도 가능해야 함', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'TIMEOUT';
      mockProvider.broadcastTransaction.mockRejectedValue(timeoutError);

      const result = await broadcaster.broadcastTransaction(validSignedTx, 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.retryable).toBe(true);
    });
  });

  describe('waitForConfirmation', () => {
    it('트랜잭션 컨펌을 기다려야 함', async () => {
      const receipt = {
        status: 1,
        blockNumber: 1000,
        transactionHash: '0xabc123',
        gasUsed: 21000n,
      };

      mockProvider.waitForTransaction.mockResolvedValue(receipt as any);

      const result = await broadcaster.waitForConfirmation('0xabc123', 137, 2);

      expect(result.success).toBe(true);
      expect(result.receipt).toEqual(receipt);
      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith(
        '0xabc123',
        2,
        300000
      );
    });

    it('실패한 트랜잭션을 감지해야 함', async () => {
      const receipt = {
        status: 0, // Failed transaction
        blockNumber: 1000,
        transactionHash: '0xabc123',
      };

      mockProvider.waitForTransaction.mockResolvedValue(receipt as any);

      const result = await broadcaster.waitForConfirmation('0xabc123', 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction failed on-chain');
    });

    it('타임아웃 시 에러를 반환해야 함', async () => {
      mockProvider.waitForTransaction.mockRejectedValue(
        new Error('timeout waiting for transaction')
      );

      const result = await broadcaster.waitForConfirmation('0xabc123', 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('Receipt이 없을 때 에러를 반환해야 함', async () => {
      mockProvider.waitForTransaction.mockResolvedValue(null);

      const result = await broadcaster.waitForConfirmation('0xabc123', 137);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction receipt not found');
    });
  });

  describe('validateTransaction', () => {
    it('유효한 트랜잭션을 검증해야 함', async () => {
      const validTx =
        '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

      // Mock ethers.Transaction.from to return a valid parsed transaction
      jest.spyOn(ethers.Transaction, 'from').mockReturnValueOnce({
        chainId: 137n,
        from: '0x1234567890123456789012345678901234567890',
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0992880',
        value: 0n,
        gasLimit: 21000n,
        gasPrice: 100000000n,
        nonce: 0,
        data: '0xa9059cbb',
        signature: { r: '0x', s: '0x', v: 27 },
        hash: '0xhash123',
      } as any);

      const result = await broadcaster.validateTransaction(validTx, 137);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('빈 트랜잭션을 거부해야 함', async () => {
      const result = await broadcaster.validateTransaction('');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid signed transaction');
    });

    it('0x 접두사가 없는 트랜잭션을 거부해야 함', async () => {
      const result = await broadcaster.validateTransaction('abcd1234');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must start with 0x');
    });

    it('잘못된 체인 ID를 감지해야 함', async () => {
      const validTx =
        '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

      const result = await broadcaster.validateTransaction(validTx, 999);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match expected');
    });

    it('잘못된 형식의 트랜잭션을 거부해야 함', async () => {
      const invalidTx = '0xinvalid';

      const result = await broadcaster.validateTransaction(invalidTx);

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getNetworkStatus', () => {
    it('네트워크 상태를 반환해야 함', async () => {
      mockProvider.getNetwork.mockResolvedValue({
        chainId: 137n,
        name: 'polygon',
      } as any);
      mockProvider.getBlockNumber.mockResolvedValue(1000);
      mockProvider.getFeeData.mockResolvedValue({
        gasPrice: 100000000n,
      } as any);

      const result = await broadcaster.getNetworkStatus(137);

      expect(result.connected).toBe(true);
      expect(result.chainId).toBe(137);
      expect(result.blockNumber).toBe(1000);
    });

    it('연결 실패 시 false를 반환해야 함', async () => {
      mockProvider.getNetwork.mockRejectedValue(new Error('connection failed'));

      const result = await broadcaster.getNetworkStatus(137);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('connection failed');
    });

    it('지원하지 않는 체인에 대해 에러를 반환해야 함', async () => {
      mockChainConfigService.getProvider.mockReturnValue(null);

      const result = await broadcaster.getNetworkStatus(999);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('No provider available');
    });
  });

  describe('transactionExists', () => {
    it('존재하는 트랜잭션을 확인해야 함', async () => {
      mockProvider.getTransaction.mockResolvedValue({
        hash: '0xabc123',
        from: '0x1234',
        to: '0x5678',
      } as any);

      const result = await broadcaster.transactionExists('0xabc123', 137);

      expect(result).toBe(true);
      expect(mockProvider.getTransaction).toHaveBeenCalledWith('0xabc123');
    });

    it('존재하지 않는 트랜잭션을 확인해야 함', async () => {
      mockProvider.getTransaction.mockResolvedValue(null);

      const result = await broadcaster.transactionExists('0xnonexistent', 137);

      expect(result).toBe(false);
    });

    it('에러 발생 시 false를 반환해야 함', async () => {
      mockProvider.getTransaction.mockRejectedValue(new Error('network error'));

      const result = await broadcaster.transactionExists('0xabc123', 137);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('다중 체인 지원', () => {
    it('Polygon Mainnet을 지원해야 함', async () => {
      const polygonTx =
        '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

      mockProvider.broadcastTransaction.mockResolvedValue({
        hash: '0xpolygon123',
        wait: jest.fn(),
      } as any);

      const result = await broadcaster.broadcastTransaction(polygonTx, 137);

      expect(result.success).toBe(true);
      expect(mockChainConfigService.getProvider).toHaveBeenCalledWith(137);
    });

    it('Mumbai Testnet을 지원해야 함', async () => {
      const mumbaiTx =
        '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

      mockProvider.broadcastTransaction.mockResolvedValue({
        hash: '0xmumbai123',
        wait: jest.fn(),
      } as any);

      const result = await broadcaster.broadcastTransaction(mumbaiTx, 80002);

      expect(result.success).toBe(true);
      expect(mockChainConfigService.getProvider).toHaveBeenCalledWith(80002);
    });

    it('Localhost 체인을 지원해야 함', async () => {
      mockChainConfigService.getSupportedChainIds.mockReturnValue([
        137, 80002, 31337,
      ]);
      mockChainConfigService.isChainSupported.mockReturnValue(true);

      const localTx =
        '0x02f872820089808405f5e1008405f5e10082520894742d35cc6634c0532925a3b844bc9e7595f0992880a4a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000ac080a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000a0b1a2bc2ec50000000000000000000000000000000000000000000000000000000';

      mockProvider.broadcastTransaction.mockResolvedValue({
        hash: '0xlocal123',
        wait: jest.fn(),
      } as any);

      const result = await broadcaster.broadcastTransaction(localTx, 31337);

      expect(result.success).toBe(true);
      expect(mockChainConfigService.getProvider).toHaveBeenCalledWith(31337);
    });
  });
});
