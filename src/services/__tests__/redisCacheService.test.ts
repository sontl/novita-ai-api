import { RedisCacheService } from '../redisCacheService';
import { IRedisClient } from '../../utils/redisClient';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');

describe('RedisCacheService', () => {
  let mockRedisClient: jest.Mocked<IRedisClient>;
  let cacheService: RedisCacheService<string>;

  beforeEach(() => {
    // Create mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      keys: jest.fn(),
      ttl: jest.fn(),
      expire: jest.fn(),
      ping: jest.fn(),
      disconnect: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      hgetall: jest.fn(),
      lpush: jest.fn(),
      rpop: jest.fn(),
      lrange: jest.fn(),
      llen: jest.fn(),
    };

    // Create cache service instance
    cacheService = new RedisCacheService('test-cache', mockRedisClient, {
      maxSize: 100,
      defaultTtl: 60000, // 1 minute
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    cacheService.stopPeriodicCleanup();
  });

  describe('get', () => {
    it('should return undefined for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.get('non-existent');

      expect(result).toBeUndefined();
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test-cache:non-existent');
    });

    it('should return data for valid key', async () => {
      const now = Date.now();
      const entry = {
        data: 'test-value',
        timestamp: now,
        ttl: 60000,
        accessCount: 0,
        lastAccessed: now - 1000
      };

      mockRedisClient.get.mockResolvedValue(entry);
      mockRedisClient.set.mockResolvedValue();

      const result = await cacheService.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test-cache:test-key');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'cache:test-cache:test-key',
        expect.objectContaining({
          data: 'test-value',
          accessCount: 1
        }),
        expect.any(Number)
      );
    });

    it('should return undefined for expired entry and delete it', async () => {
      const now = Date.now();
      const expiredEntry = {
        data: 'test-value',
        timestamp: now - 120000, // 2 minutes ago
        ttl: 60000, // 1 minute TTL
        accessCount: 1,
        lastAccessed: now - 120000
      };

      mockRedisClient.get.mockResolvedValue(expiredEntry);
      mockRedisClient.del.mockResolvedValue(true);

      const result = await cacheService.get('expired-key');

      expect(result).toBeUndefined();
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-cache:expired-key');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheService.get('test-key');

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Redis cache get operation failed',
        expect.objectContaining({
          cache: 'test-cache',
          key: 'test-key',
          error: 'Redis connection failed'
        })
      );
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      mockRedisClient.keys.mockResolvedValue([]);
      mockRedisClient.exists.mockResolvedValue(false);
      mockRedisClient.set.mockResolvedValue();

      await cacheService.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'cache:test-cache:test-key',
        expect.objectContaining({
          data: 'test-value',
          ttl: 60000,
          accessCount: 0
        }),
        60000
      );
    });

    it('should set value with custom TTL', async () => {
      mockRedisClient.keys.mockResolvedValue([]);
      mockRedisClient.exists.mockResolvedValue(false);
      mockRedisClient.set.mockResolvedValue();

      await cacheService.set('test-key', 'test-value', 30000);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'cache:test-cache:test-key',
        expect.objectContaining({
          data: 'test-value',
          ttl: 30000
        }),
        30000
      );
    });

    it('should evict LRU entry when cache is full', async () => {
      // Mock cache being at max size
      const existingKeys = Array.from({ length: 100 }, (_, i) => `cache:test-cache:key${i}`);
      mockRedisClient.keys.mockResolvedValue(existingKeys);
      mockRedisClient.exists.mockResolvedValue(false);

      // Mock LRU entry
      const oldEntry = {
        data: 'old-value',
        timestamp: Date.now() - 60000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: Date.now() - 60000
      };

      mockRedisClient.get.mockResolvedValue(oldEntry);
      mockRedisClient.del.mockResolvedValue(true);
      mockRedisClient.set.mockResolvedValue();

      await cacheService.set('new-key', 'new-value');

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'cache:test-cache:new-key',
        expect.objectContaining({
          data: 'new-value'
        }),
        60000
      );
    });

    it('should handle Redis errors', async () => {
      mockRedisClient.keys.mockResolvedValue([]);
      mockRedisClient.exists.mockResolvedValue(false);
      mockRedisClient.set.mockRejectedValue(new Error('Redis connection failed'));

      await expect(cacheService.set('test-key', 'test-value')).rejects.toThrow(
        'Failed to set cache entry: Redis connection failed'
      );
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      mockRedisClient.del.mockResolvedValue(true);
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await cacheService.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-cache:test-key');
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.del.mockResolvedValue(false);

      const result = await cacheService.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheService.delete('test-key');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Redis cache delete operation failed',
        expect.objectContaining({
          cache: 'test-cache',
          key: 'test-key',
          error: 'Redis connection failed'
        })
      );
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired key', async () => {
      const now = Date.now();
      const entry = {
        data: 'test-value',
        timestamp: now,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now
      };

      mockRedisClient.get.mockResolvedValue(entry);

      const result = await cacheService.has('test-key');

      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.has('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for expired key and delete it', async () => {
      const now = Date.now();
      const expiredEntry = {
        data: 'test-value',
        timestamp: now - 120000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now - 120000
      };

      mockRedisClient.get.mockResolvedValue(expiredEntry);
      mockRedisClient.del.mockResolvedValue(true);

      const result = await cacheService.has('expired-key');

      expect(result).toBe(false);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-cache:expired-key');
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      const keys = ['cache:test-cache:key1', 'cache:test-cache:key2'];
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(true);

      await cacheService.clear();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:test-cache:*');
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should handle empty cache', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await cacheService.clear();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle Redis errors', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis connection failed'));

      await expect(cacheService.clear()).rejects.toThrow(
        'Failed to clear cache: Redis connection failed'
      );
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const now = Date.now();
      const keys = ['cache:test-cache:key1', 'cache:test-cache:key2'];
      const entry1 = {
        data: 'value1',
        timestamp: now,
        ttl: 60000,
        accessCount: 5,
        lastAccessed: now
      };
      const entry2 = {
        data: 'value2',
        timestamp: now - 30000,
        ttl: 60000,
        accessCount: 2,
        lastAccessed: now - 10000
      };

      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.get
        .mockResolvedValueOnce(entry1)
        .mockResolvedValueOnce(entry2);

      const stats = await cacheService.getStats();

      expect(stats.entries).toHaveProperty('key1');
      expect(stats.entries).toHaveProperty('key2');
      expect(stats.entries.key1?.accessCount).toBe(5);
      expect(stats.entries.key2?.accessCount).toBe(2);
      expect(stats.metrics).toEqual(expect.objectContaining({
        hits: expect.any(Number),
        misses: expect.any(Number),
        sets: expect.any(Number),
        deletes: expect.any(Number),
        evictions: expect.any(Number),
        totalSize: expect.any(Number)
      }));
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis connection failed'));

      const stats = await cacheService.getStats();

      expect(stats.entries).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        'Redis cache getStats operation failed',
        expect.objectContaining({
          cache: 'test-cache',
          error: 'Redis connection failed'
        })
      );
    });
  });

  describe('cleanupExpired', () => {
    it('should clean up expired entries', async () => {
      const now = Date.now();
      const keys = ['cache:test-cache:key1', 'cache:test-cache:key2'];
      const validEntry = {
        data: 'value1',
        timestamp: now,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now
      };
      const expiredEntry = {
        data: 'value2',
        timestamp: now - 120000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now - 120000
      };

      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.get
        .mockResolvedValueOnce(validEntry)
        .mockResolvedValueOnce(expiredEntry);
      mockRedisClient.del.mockResolvedValue(true);

      const cleanedCount = await cacheService.cleanupExpired();

      expect(cleanedCount).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-cache:key2');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis connection failed'));

      const cleanedCount = await cacheService.cleanupExpired();

      expect(cleanedCount).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Redis cache cleanup operation failed',
        expect.objectContaining({
          cache: 'test-cache',
          error: 'Redis connection failed'
        })
      );
    });
  });

  describe('setTtl', () => {
    it('should update TTL for existing entry', async () => {
      const now = Date.now();
      const entry = {
        data: 'test-value',
        timestamp: now - 30000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now - 30000
      };

      mockRedisClient.get.mockResolvedValue(entry);
      mockRedisClient.set.mockResolvedValue();

      const result = await cacheService.setTtl('test-key', 120000);

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'cache:test-cache:test-key',
        expect.objectContaining({
          ttl: 120000,
          timestamp: expect.any(Number)
        }),
        120000
      );
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.setTtl('non-existent', 120000);

      expect(result).toBe(false);
    });

    it('should return false for expired key', async () => {
      const now = Date.now();
      const expiredEntry = {
        data: 'test-value',
        timestamp: now - 120000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now - 120000
      };

      mockRedisClient.get.mockResolvedValue(expiredEntry);

      const result = await cacheService.setTtl('expired-key', 120000);

      expect(result).toBe(false);
    });
  });

  describe('getTtl', () => {
    it('should return remaining TTL for valid entry', async () => {
      const now = Date.now();
      const entry = {
        data: 'test-value',
        timestamp: now - 30000, // 30 seconds ago
        ttl: 60000, // 1 minute TTL
        accessCount: 1,
        lastAccessed: now - 30000
      };

      mockRedisClient.get.mockResolvedValue(entry);

      const ttl = await cacheService.getTtl('test-key');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30000); // Should be around 30 seconds remaining
    });

    it('should return undefined for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const ttl = await cacheService.getTtl('non-existent');

      expect(ttl).toBeUndefined();
    });

    it('should return undefined for expired key', async () => {
      const now = Date.now();
      const expiredEntry = {
        data: 'test-value',
        timestamp: now - 120000,
        ttl: 60000,
        accessCount: 1,
        lastAccessed: now - 120000
      };

      mockRedisClient.get.mockResolvedValue(expiredEntry);

      const ttl = await cacheService.getTtl('expired-key');

      expect(ttl).toBeUndefined();
    });
  });

  describe('keys', () => {
    it('should return all cache keys', async () => {
      const redisKeys = ['cache:test-cache:key1', 'cache:test-cache:key2'];
      mockRedisClient.keys.mockResolvedValue(redisKeys);

      const keys = await cacheService.keys();

      expect(keys).toEqual(['key1', 'key2']);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis connection failed'));

      const keys = await cacheService.keys();

      expect(keys).toEqual([]);
    });
  });

  describe('size', () => {
    it('should return cache size', async () => {
      const keys = ['cache:test-cache:key1', 'cache:test-cache:key2'];
      mockRedisClient.keys.mockResolvedValue(keys);

      const size = await cacheService.size();

      expect(size).toBe(2);
    });
  });

  describe('metrics', () => {
    it('should track hit ratio correctly', () => {
      // Access the private metrics property to simulate hits and misses
      const metrics = cacheService.getMetrics();
      (cacheService as any).metrics.hits = 7;
      (cacheService as any).metrics.misses = 3;

      const hitRatio = cacheService.getHitRatio();

      expect(hitRatio).toBe(0.7);
    });

    it('should return 0 hit ratio when no operations', () => {
      const hitRatio = cacheService.getHitRatio();

      expect(hitRatio).toBe(0);
    });

    it('should reset metrics', () => {
      // Set some metrics
      (cacheService as any).metrics.hits = 10;
      (cacheService as any).metrics.misses = 5;

      cacheService.resetMetrics();

      const metrics = cacheService.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources and clear cache', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await cacheService.destroy();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:test-cache:*');
    });
  });
});