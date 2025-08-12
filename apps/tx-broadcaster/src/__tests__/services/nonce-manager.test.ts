import { NonceManager, QueuedTransaction } from '../../services/nonce-manager';
import { LoggerService } from '@asset-withdrawal/shared';

// Mock LoggerService
jest.mock('@asset-withdrawal/shared', () => ({
  LoggerService: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Create mock functions that we can control from tests
const mockNonceRedisService = {
  getPendingTransactions: jest.fn(),
  setPendingTransactions: jest.fn(),
  getLastBroadcastedNonce: jest.fn(),
  setLastBroadcastedNonce: jest.fn(),
  isProcessing: jest.fn(),
  setProcessingLock: jest.fn(),
  removeProcessingLock: jest.fn(),
  setProcessingStartTime: jest.fn(),
  getProcessingStartTime: jest.fn(),
  getLastProcessedTime: jest.fn(),
  setLastProcessedTime: jest.fn(),
  getAddressesWithPendingTransactions: jest.fn(),
  getProcessingAddresses: jest.fn(),
  clearAll: jest.fn(),
  releaseTimedOutLocks: jest.fn(),
};

// Mock Redis client import with proper mock definitions
jest.mock('../../services/redis-client', () => {
  const mockRedis = {
    lrange: jest.fn(),
    lpush: jest.fn(),
    del: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn(() => ({
      del: jest.fn(),
      lpush: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    exec: jest.fn().mockResolvedValue([]),
  };

  return {
    getRedisClient: jest.fn().mockResolvedValue(mockRedis),
    NonceRedisService: jest
      .fn()
      .mockImplementation(() => mockNonceRedisService),
  };
});

describe('NonceManager', () => {
  let nonceManager: NonceManager;
  let mockLogger: jest.Mocked<LoggerService>;

  // In-memory simulation of Redis data for tests
  const mockTransactionQueues = new Map<string, QueuedTransaction[]>();
  const mockLastBroadcastedNonces = new Map<string, number>();
  const mockProcessingLocks = new Map<string, boolean>();
  const mockProcessingStartTimes = new Map<string, number>();
  const mockLastProcessedTimes = new Map<string, number>();

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clear mock data
    mockTransactionQueues.clear();
    mockLastBroadcastedNonces.clear();
    mockProcessingLocks.clear();
    mockProcessingStartTimes.clear();
    mockLastProcessedTimes.clear();

    // Setup mock implementations
    mockNonceRedisService.getPendingTransactions.mockImplementation(
      async (address: string) => {
        return mockTransactionQueues.get(address) || [];
      }
    );

    mockNonceRedisService.setPendingTransactions.mockImplementation(
      async (address: string, transactions: QueuedTransaction[]) => {
        if (transactions.length === 0) {
          mockTransactionQueues.delete(address);
        } else {
          mockTransactionQueues.set(address, transactions);
        }
      }
    );

    mockNonceRedisService.getLastBroadcastedNonce.mockImplementation(
      async (address: string) => {
        return mockLastBroadcastedNonces.get(address) ?? null;
      }
    );

    mockNonceRedisService.setLastBroadcastedNonce.mockImplementation(
      async (address: string, nonce: number) => {
        mockLastBroadcastedNonces.set(address, nonce);
      }
    );

    mockNonceRedisService.isProcessing.mockImplementation(
      async (address: string) => {
        return mockProcessingLocks.get(address) ?? false;
      }
    );

    mockNonceRedisService.setProcessingLock.mockImplementation(
      async (address: string) => {
        if (mockProcessingLocks.get(address)) {
          return false; // Lock already exists
        }
        mockProcessingLocks.set(address, true);
        return true;
      }
    );

    mockNonceRedisService.removeProcessingLock.mockImplementation(
      async (address: string) => {
        mockProcessingLocks.delete(address);
        mockProcessingStartTimes.delete(address);
      }
    );

    mockNonceRedisService.setProcessingStartTime.mockImplementation(
      async (address: string) => {
        mockProcessingStartTimes.set(address, Date.now());
      }
    );

    mockNonceRedisService.getProcessingStartTime.mockImplementation(
      async (address: string) => {
        return mockProcessingStartTimes.get(address) ?? null;
      }
    );

    mockNonceRedisService.getLastProcessedTime.mockImplementation(
      async (address: string) => {
        return mockLastProcessedTimes.get(address) ?? null;
      }
    );

    mockNonceRedisService.setLastProcessedTime.mockImplementation(
      async (address: string) => {
        mockLastProcessedTimes.set(address, Date.now());
      }
    );

    mockNonceRedisService.getAddressesWithPendingTransactions.mockImplementation(
      async () => {
        return Array.from(mockTransactionQueues.keys());
      }
    );

    mockNonceRedisService.getProcessingAddresses.mockImplementation(
      async () => {
        return Array.from(mockProcessingLocks.keys());
      }
    );

    mockNonceRedisService.clearAll.mockImplementation(async () => {
      mockTransactionQueues.clear();
      mockLastBroadcastedNonces.clear();
      mockProcessingLocks.clear();
      mockProcessingStartTimes.clear();
      mockLastProcessedTimes.clear();
    });

    mockNonceRedisService.releaseTimedOutLocks.mockImplementation(
      async (timeoutMs: number) => {
        const now = Date.now();
        const timedOutAddresses: string[] = [];

        for (const [address, startTime] of mockProcessingStartTimes.entries()) {
          if (now - startTime > timeoutMs) {
            mockProcessingLocks.delete(address);
            mockProcessingStartTimes.delete(address);
            timedOutAddresses.push(address);
          }
        }

        return timedOutAddresses;
      }
    );

    nonceManager = new NonceManager();
    await new Promise(resolve => setTimeout(resolve, 50)); // Wait for async initialization
    mockLogger = (nonceManager as any).logger;
  });

  describe('Nonce 순서 정렬 처리', () => {
    it('순서가 바뀐 트랜잭션을 자동으로 정렬해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Nonce 5, 3, 4 순서로 추가
      await nonceManager.addTransaction({
        txHash: 'hash5',
        nonce: 5,
        signedTx: 'tx5',
        requestId: 'req5',
        fromAddress: address,
        timestamp: new Date(),
      });

      await nonceManager.addTransaction({
        txHash: 'hash3',
        nonce: 3,
        signedTx: 'tx3',
        requestId: 'req3',
        fromAddress: address,
        timestamp: new Date(),
      });

      await nonceManager.addTransaction({
        txHash: 'hash4',
        nonce: 4,
        signedTx: 'tx4',
        requestId: 'req4',
        fromAddress: address,
        timestamp: new Date(),
      });

      // 큐 상태 확인
      const status = await nonceManager.getQueueStatus();
      expect(status).toHaveLength(1);
      expect(status[0].pendingCount).toBe(3);

      // 내부 큐 확인 (정렬되어 있어야 함)
      const queue = await nonceManager.getPendingTransactions(address);
      expect(queue[0].nonce).toBe(3);
      expect(queue[1].nonce).toBe(4);
      expect(queue[2].nonce).toBe(5);
    });

    it('큰 Nonce가 먼저 도착해도 작은 Nonce를 기다려야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Nonce 10 먼저 추가
      await nonceManager.addTransaction({
        txHash: 'hash10',
        nonce: 10,
        signedTx: 'tx10',
        requestId: 'req10',
        fromAddress: address,
        timestamp: new Date(),
      });

      // 첫 번째 트랜잭션이므로 처리 가능
      let tx = await nonceManager.getNextTransaction();
      expect(tx).not.toBeNull();
      expect(tx?.nonce).toBe(10);

      // 트랜잭션 처리 시작
      await nonceManager.startProcessing(address);
      // 트랜잭션 처리 완료
      await nonceManager.completeTransaction(address, 10, true);

      // Nonce 15 추가
      await nonceManager.addTransaction({
        txHash: 'hash15',
        nonce: 15,
        signedTx: 'tx15',
        requestId: 'req15',
        fromAddress: address,
        timestamp: new Date(),
      });

      // Nonce Gap (11-14) 때문에 null 반환
      tx = await nonceManager.getNextTransaction();
      expect(tx).toBeNull();

      // Gap 정보 확인
      const gapInfo = await nonceManager.getNonceGapInfo(address);
      expect(gapInfo?.hasGap).toBe(true);
      expect(gapInfo?.expectedNonce).toBe(11);
      expect(gapInfo?.actualNonce).toBe(15);
      expect(gapInfo?.gapSize).toBe(4);
      expect(gapInfo?.missingNonces).toEqual([11, 12, 13, 14]);
    });

    it('동일 Nonce는 우선순위로 정렬해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // 같은 Nonce, 다른 우선순위
      await nonceManager.addTransaction({
        txHash: 'hash1_low',
        nonce: 1,
        signedTx: 'tx1_low',
        requestId: 'req1_low',
        fromAddress: address,
        timestamp: new Date(),
        priority: 1,
      });

      await nonceManager.addTransaction({
        txHash: 'hash1_high',
        nonce: 1,
        signedTx: 'tx1_high',
        requestId: 'req1_high',
        fromAddress: address,
        timestamp: new Date(),
        priority: 10,
      });

      // 동일 Nonce는 교체되므로 큐에는 1개만 있어야 함
      const status = await nonceManager.getQueueStatus();
      expect(status[0].pendingCount).toBe(1);

      // 마지막으로 추가된 트랜잭션이 사용됨
      const tx = await nonceManager.getNextTransaction();
      expect(tx?.txHash).toBe('hash1_high');
    });

    it('여러 Nonce가 뒤섞여 들어와도 정렬되어야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const nonces = [7, 2, 9, 1, 5, 3, 8, 4, 6];

      // 무작위 순서로 트랜잭션 추가
      for (const nonce of nonces) {
        await nonceManager.addTransaction({
          txHash: `hash${nonce}`,
          nonce,
          signedTx: `tx${nonce}`,
          requestId: `req${nonce}`,
          fromAddress: address,
          timestamp: new Date(),
        });
      }

      // 큐가 정렬되어 있는지 확인
      const queue = await nonceManager.getPendingTransactions(address);
      for (let i = 0; i < queue.length - 1; i++) {
        expect(queue[i].nonce).toBeLessThan(queue[i + 1].nonce);
      }

      // 순서대로 1부터 9까지 나와야 함
      for (let expectedNonce = 1; expectedNonce <= 9; expectedNonce++) {
        const tx = await nonceManager.getNextTransaction();
        expect(tx?.nonce).toBe(expectedNonce);
        await nonceManager.startProcessing(address);
        await nonceManager.completeTransaction(address, expectedNonce, true);
      }
    });
  });

  describe('기본 트랜잭션 관리', () => {
    it('트랜잭션을 추가하고 가져올 수 있어야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const transaction: QueuedTransaction = {
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'signedTx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      };

      await nonceManager.addTransaction(transaction);

      const nextTx = await nonceManager.getNextTransaction();
      expect(nextTx).toMatchObject({
        txHash: 'hash1',
        nonce: 1,
        requestId: 'req1',
      });
    });

    it('트랜잭션 완료 처리가 정상 동작해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      const tx = await nonceManager.getNextTransaction();
      expect(tx).not.toBeNull();

      await nonceManager.startProcessing(address);
      await nonceManager.completeTransaction(address, 1, true);

      const status = await nonceManager.getQueueStatus();
      expect(status).toHaveLength(0);
    });

    it('에러 발생 시 트랜잭션이 큐에 남아있어야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      const tx = await nonceManager.getNextTransaction();
      await nonceManager.startProcessing(address);

      // 실패로 처리 (processing flag만 해제됨)
      await nonceManager.completeTransaction(address, 1, false);

      // 트랜잭션이 큐에 여전히 남아있어야 함 (재시도 가능)
      const status = await nonceManager.getQueueStatus();
      expect(status).toHaveLength(1);
      expect(status[0].pendingCount).toBe(1);
      expect(status[0].isProcessing).toBe(false);
    });

    it('트랜잭션을 수동으로 제거할 수 있어야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      // 트랜잭션 제거
      await nonceManager.removeTransaction(address, 1);

      // 트랜잭션이 큐에서 제거되어야 함
      const status = await nonceManager.getQueueStatus();
      expect(status).toHaveLength(0);
    });
  });

  describe('여러 주소 처리 (Round-robin)', () => {
    it('여러 주소의 트랜잭션을 공평하게 처리해야 함', async () => {
      const address1 = '0x1111111111111111111111111111111111111111';
      const address2 = '0x2222222222222222222222222222222222222222';

      // 각 주소에 2개씩 트랜잭션 추가
      await nonceManager.addTransaction({
        txHash: 'hash1_1',
        nonce: 1,
        signedTx: 'tx1_1',
        requestId: 'req1_1',
        fromAddress: address1,
        timestamp: new Date(),
      });

      await nonceManager.addTransaction({
        txHash: 'hash1_2',
        nonce: 2,
        signedTx: 'tx1_2',
        requestId: 'req1_2',
        fromAddress: address1,
        timestamp: new Date(),
      });

      await nonceManager.addTransaction({
        txHash: 'hash2_1',
        nonce: 1,
        signedTx: 'tx2_1',
        requestId: 'req2_1',
        fromAddress: address2,
        timestamp: new Date(),
      });

      await nonceManager.addTransaction({
        txHash: 'hash2_2',
        nonce: 2,
        signedTx: 'tx2_2',
        requestId: 'req2_2',
        fromAddress: address2,
        timestamp: new Date(),
      });

      // 각 주소에서 하나씩 가져와야 함
      const tx1 = await nonceManager.getNextTransaction();
      const tx2 = await nonceManager.getNextTransaction();

      // 다른 주소여야 함
      expect(tx1?.fromAddress).not.toBe(tx2?.fromAddress);
    });

    it('긴 큐를 가진 주소가 우선순위를 가져야 함', async () => {
      const address1 = '0x1111111111111111111111111111111111111111';
      const address2 = '0x2222222222222222222222222222222222222222';

      // address1에 1개, address2에 5개 추가
      await nonceManager.addTransaction({
        txHash: 'hash1_1',
        nonce: 1,
        signedTx: 'tx1_1',
        requestId: 'req1_1',
        fromAddress: address1,
        timestamp: new Date(),
      });

      for (let i = 1; i <= 5; i++) {
        await nonceManager.addTransaction({
          txHash: `hash2_${i}`,
          nonce: i,
          signedTx: `tx2_${i}`,
          requestId: `req2_${i}`,
          fromAddress: address2,
          timestamp: new Date(),
        });
      }

      // 더 긴 큐를 가진 address2가 먼저 처리되어야 함
      const tx = await nonceManager.getNextTransaction();
      expect(tx?.fromAddress).toBe(address2);
    });
  });

  describe('Nonce Gap 정보 제공', () => {
    it('Nonce Gap이 없을 때 올바른 정보를 반환해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // 트랜잭션이 없을 때
      let gapInfo = await nonceManager.getNonceGapInfo(address);
      expect(gapInfo).toBeNull();

      // 트랜잭션 추가
      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      // 첫 트랜잭션이므로 Gap 없음
      gapInfo = await nonceManager.getNonceGapInfo(address);
      expect(gapInfo?.hasGap).toBe(false);
    });

    it('Nonce Gap이 있을 때 상세 정보를 제공해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Nonce 1 처리 완료
      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      const tx1 = await nonceManager.getNextTransaction();
      await nonceManager.startProcessing(address);
      await nonceManager.completeTransaction(address, 1, true);

      // Nonce 5 추가 (2, 3, 4 누락)
      await nonceManager.addTransaction({
        txHash: 'hash5',
        nonce: 5,
        signedTx: 'tx5',
        requestId: 'req5',
        fromAddress: address,
        timestamp: new Date(),
      });

      const gapInfo = await nonceManager.getNonceGapInfo(address);
      expect(gapInfo).toEqual({
        hasGap: true,
        expectedNonce: 2,
        actualNonce: 5,
        gapSize: 3,
        missingNonces: [2, 3, 4],
      });
    });
  });

  describe('타임아웃 처리', () => {
    it('타임아웃된 트랜잭션을 해제해야 함', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await nonceManager.addTransaction({
        txHash: 'hash1',
        nonce: 1,
        signedTx: 'tx1',
        requestId: 'req1',
        fromAddress: address,
        timestamp: new Date(),
      });

      // 트랜잭션 가져오기 (처리 중 상태로 변경)
      const tx = await nonceManager.getNextTransaction();
      expect(tx).not.toBeNull();

      // 처리 시작
      await nonceManager.startProcessing(address);

      // 수동으로 타임아웃 시간 설정 (테스트용) - Mock 데이터 직접 수정
      mockProcessingStartTimes.set(address, Date.now() - 70000); // 70초 전

      // 타임아웃 체크 및 해제는 getNextTransaction 내부에서 자동으로 수행됨
      // 다시 가져올 수 있어야 함
      const nextTx = await nonceManager.getNextTransaction();
      expect(nextTx).not.toBeNull();
      expect(nextTx?.txHash).toBe('hash1');
    });
  });
});
