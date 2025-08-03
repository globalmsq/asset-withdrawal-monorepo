import { NonceCacheService } from './nonce-cache.service';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  incr: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  on: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('NonceCacheService', () => {
  let service: NonceCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NonceCacheService();
    (service as any).connected = true;
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('connect', () => {
    it('should connect to Redis', async () => {
      (service as any).connected = false;
      await service.connect();
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should not connect if already connected', async () => {
      await service.connect();
      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should use network nonce if no cached value', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      await service.initialize('0x123', 5, 'polygon', 'mainnet');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123',
        '5',
        { EX: 86400 }
      );
    });

    it('should use cached nonce if higher than network', async () => {
      mockRedisClient.get.mockResolvedValue('10');
      await service.initialize('0x123', 5, 'polygon', 'mainnet');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123',
        '10',
        { EX: 86400 }
      );
    });

    it('should use network nonce if higher than cached', async () => {
      mockRedisClient.get.mockResolvedValue('3');
      await service.initialize('0x123', 5, 'polygon', 'mainnet');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123',
        '5',
        { EX: 86400 }
      );
    });
  });

  describe('getAndIncrement', () => {
    it('should increment and return previous value', async () => {
      mockRedisClient.incr.mockResolvedValue(6);
      const nonce = await service.getAndIncrement(
        '0x123',
        'polygon',
        'mainnet'
      );

      expect(nonce).toBe(5);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123'
      );
    });

    it('should set TTL on first increment', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      await service.getAndIncrement('0x123', 'polygon', 'mainnet');

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123',
        86400
      );
    });

    it('should lowercase address for key', async () => {
      mockRedisClient.incr.mockResolvedValue(2);
      await service.getAndIncrement('0xABC', 'polygon', 'mainnet');

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0xabc'
      );
    });
  });

  describe('set', () => {
    it('should set nonce with TTL', async () => {
      await service.set('0x123', 42, 'polygon', 'mainnet');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123',
        '42',
        { EX: 86400 }
      );
    });
  });

  describe('get', () => {
    it('should return parsed nonce', async () => {
      mockRedisClient.get.mockResolvedValue('42');
      const nonce = await service.get('0x123', 'polygon', 'mainnet');

      expect(nonce).toBe(42);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123'
      );
    });

    it('should return null if no value', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const nonce = await service.get('0x123', 'polygon', 'mainnet');

      expect(nonce).toBeNull();
    });
  });

  describe('clear', () => {
    it('should delete the key', async () => {
      await service.clear('0x123', 'polygon', 'mainnet');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'nonce:polygon:mainnet:0x123'
      );
    });
  });
});
