// Mock dependencies first
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../config/config', () => ({
  getConfig: () => ({
    logLevel: 'error',
    nodeEnv: 'test',
    redis: {
      url: 'https://test-redis.upstash.io',
      token: 'test-token',
      connectionTimeoutMs: 5000,
      commandTimeoutMs: 2000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      enableFallback: true
    }
  })
}));

import { RedisCacheManager, ICacheService } from '../redisCacheManager';
import { IRedisClient } from '../../utils/redisClient';
import { logger } from '../../utils/logger';

describe('RedisCacheManager Integration Tests', () => {
  let cacheManager: RedisCacheManager;
  let mockRedisClient: jest.Mocked<IRedisClient>;

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
      connect: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      hget: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      hgetall: jest.fn(),
      lpush: jest.fn(),
      rpop: jest.fn(),
      lrange: jest.fn(),
      llen: jest.fn(),
    } as any;

    // Create cache manager with mock Redis client
    cacheManager = new RedisCacheManager({
      defaultBackend: 'fallback',
      enableFallback: true,
      redisClient: mockRedisClient
    });
  });

  afterEach(async () => {
    await cacheManager.destroyAll();
    jest.clearAllMocks();
  });

  describe('cache creation and management', () => {
    it('should create memory cache', async () => {
      const cache = await cacheManager.getCache('test-memory', { backend: 'memory' });
      
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('test-memory')).toBe(true);
      expect(cacheManager.getCacheNames()).toContain('test-memory');
    });

    it('should create Redis cache with fallback', async () => {
      const cache = await cacheManager.getCache('test-redis', { backend: 'redis' });
      
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('test-redis')).toBe(true);
    });

    it('should create fallback cache explicitly', async () => {
      const cache = await cacheManager.getCache('test-fallback', { backend: 'fallback' });
      
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('test-fallback')).toBe(true);
    });

    it('should return existing cache instance', async () => {
      const cache1 = await cacheManager.getCache('test-cache');
      const cache2 = await cacheManager.getCache('test-cache');
      
      expect(cache1).toBe(cache2);
    });

    it('should create cache with specific backend using createCache', async () => {
      const cache = await cacheManager.createCache('specific-cache', 'memory', {
        maxSize: 50,
        defaultTtl: 30000
      });
      
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('specific-cache')).toBe(true);
    });

    it('should throw error when creating cache with existing name', async () => {
      await cacheManager.createCache('duplicate-cache', 'memory');
      
      await expect(
        cacheManager.createCache('duplicate-cache', 'memory')
      ).rejects.toThrow("Cache with name 'duplicate-cache' already exists");
    });

    it('should remove cache instance', async () => {
      await cacheManager.getCache('removable-cache');
      expect(cacheManager.hasCache('removable-cache')).toBe(true);
      
      const removed = await cacheManager.removeCache('removable-cache');
      expect(removed).toBe(true);
      expect(cacheManager.hasCache('removable-cache')).toBe(false);
    });

    it('should return false when removing non-existent cache', async () => {
      const removed = await cacheManager.removeCache('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('cache operations', () => {
    let cache: ICacheService<string>;

    beforeEach(async () => {
      cache = await cacheManager.getCache<string>('test-operations', { backend: 'memory' });
    });

    it('should perform basic cache operations', async () => {
      // Set value
      await cache.set('key1', 'value1');
      
      // Get value
      const value = await cache.get('key1');
      expect(value).toBe('value1');
      
      // Check existence
      const exists = await cache.has('key1');
      expect(exists).toBe(true);
      
      // Delete value
      const deleted = await cache.delete('key1');
      expect(deleted).toBe(true);
      
      // Verify deletion
      const valueAfterDelete = await cache.get('key1');
      expect(valueAfterDelete).toBeUndefined();
    });

    it('should handle TTL operations', async () => {
      await cache.set('ttl-key', 'ttl-value', 60000);
      
      const ttl = await cache.getTtl('ttl-key');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60000);
      
      const ttlSet = await cache.setTtl('ttl-key', 30000);
      expect(ttlSet).toBe(true);
      
      const newTtl = await cache.getTtl('ttl-key');
      expect(newTtl).toBeLessThanOrEqual(30000);
    });

    it('should get cache statistics', async () => {
      await cache.set('stats-key1', 'value1');
      await cache.set('stats-key2', 'value2');
      await cache.get('stats-key1');
      
      const stats = await cache.getStats();
      expect(stats.metrics.sets).toBeGreaterThan(0);
      expect(stats.metrics.hits).toBeGreaterThan(0);
      expect(Object.keys(stats.entries)).toContain('stats-key1');
    });
  });

  describe('manager-level operations', () => {
    beforeEach(async () => {
      await cacheManager.getCache('cache1', { backend: 'memory' });
      await cacheManager.getCache('cache2', { backend: 'memory' });
    });

    it('should get all cache statistics', async () => {
      const cache1 = await cacheManager.getCache('cache1');
      const cache2 = await cacheManager.getCache('cache2');
      
      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');
      
      const allStats = await cacheManager.getAllStats();
      expect(allStats).toHaveProperty('cache1');
      expect(allStats).toHaveProperty('cache2');
      expect(allStats.cache1?.metrics.sets).toBeGreaterThan(0);
      expect(allStats.cache2?.metrics.sets).toBeGreaterThan(0);
    });

    it('should get all cache metrics', () => {
      const allMetrics = cacheManager.getAllMetrics();
      expect(allMetrics).toHaveProperty('cache1');
      expect(allMetrics).toHaveProperty('cache2');
      expect(allMetrics.cache1).toHaveProperty('hits');
      expect(allMetrics.cache2).toHaveProperty('misses');
    });

    it('should get all hit ratios', () => {
      const hitRatios = cacheManager.getAllHitRatios();
      expect(hitRatios).toHaveProperty('cache1');
      expect(hitRatios).toHaveProperty('cache2');
      expect(typeof hitRatios.cache1).toBe('number');
      expect(typeof hitRatios.cache2).toBe('number');
    });

    it('should get all cache sizes', async () => {
      const cache1 = await cacheManager.getCache('cache1');
      await cache1.set('key1', 'value1');
      
      const sizes = await cacheManager.getAllSizes();
      expect(sizes).toHaveProperty('cache1');
      expect(sizes).toHaveProperty('cache2');
      expect(sizes.cache1).toBeGreaterThan(0);
    });

    it('should clear all caches', async () => {
      const cache1 = await cacheManager.getCache('cache1');
      const cache2 = await cacheManager.getCache('cache2');
      
      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');
      
      await cacheManager.clearAll();
      
      const value1 = await cache1.get('key1');
      const value2 = await cache2.get('key2');
      expect(value1).toBeUndefined();
      expect(value2).toBeUndefined();
    });

    it('should cleanup expired entries in all caches', async () => {
      const cache1 = await cacheManager.getCache('cache1');
      await cache1.set('expired-key', 'value', 1); // 1ms TTL
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleanedCount = await cacheManager.cleanupAllExpired();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should reset metrics for all caches', async () => {
      const cache1 = await cacheManager.getCache('cache1');
      await cache1.set('key1', 'value1');
      await cache1.get('key1');
      
      let metrics = cacheManager.getAllMetrics();
      expect(metrics.cache1?.hits).toBeGreaterThan(0);
      
      cacheManager.resetAllMetrics();
      
      metrics = cacheManager.getAllMetrics();
      expect(metrics.cache1?.hits).toBe(0);
    });

    it('should stop periodic cleanup for all caches', () => {
      cacheManager.stopAllPeriodicCleanup();
      // This test mainly ensures no errors are thrown
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle cache operation errors gracefully in getAllStats', async () => {
      const cache = await cacheManager.getCache('error-cache', { backend: 'memory' });
      
      // Mock getStats to throw an error
      jest.spyOn(cache, 'getStats').mockRejectedValue(new Error('Stats error'));
      
      const allStats = await cacheManager.getAllStats();
      expect(allStats).toHaveProperty('error-cache');
      expect(allStats['error-cache']?.metrics.hits).toBe(0); // Fallback stats
    });

    it('should handle cache operation errors gracefully in getAllMetrics', async () => {
      const cache = await cacheManager.getCache('error-cache2', { backend: 'memory' });
      
      // Mock getMetrics to throw an error
      jest.spyOn(cache, 'getMetrics').mockImplementation(() => {
        throw new Error('Metrics error');
      });
      
      const allMetrics = cacheManager.getAllMetrics();
      expect(allMetrics).toHaveProperty('error-cache2');
      expect(allMetrics['error-cache2']?.hits).toBe(0); // Fallback metrics
    });

    it('should handle partial failures in clearAll', async () => {
      const cache1 = await cacheManager.getCache('cache1', { backend: 'memory' });
      const cache2 = await cacheManager.getCache('cache2', { backend: 'memory' });
      
      // Mock one cache to fail
      const clearSpy = jest.spyOn(cache1, 'clear').mockImplementation(() => {
        return Promise.reject(new Error('Clear failed'));
      });
      
      // Should not throw, but should log warnings
      await cacheManager.clearAll();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to clear cache',
        expect.objectContaining({
          name: 'cache1',
          error: 'Clear failed'
        })
      );
      
      clearSpy.mockRestore();
    });
  });

  describe('configuration and status', () => {
    it('should return Redis health status', () => {
      const healthStatus = cacheManager.getRedisHealthStatus();
      expect(healthStatus).toHaveProperty('connected');
      expect(healthStatus).toHaveProperty('clientExists');
      expect(healthStatus.clientExists).toBe(true);
      expect(healthStatus.connected).toBe(true);
    });

    it('should return cache manager configuration', () => {
      const config = cacheManager.getConfiguration();
      expect(config).toHaveProperty('defaultBackend');
      expect(config).toHaveProperty('enableFallback');
      expect(config).toHaveProperty('cacheCount');
      expect(config).toHaveProperty('redisConnected');
      expect(config.defaultBackend).toBe('fallback');
      expect(config.enableFallback).toBe(true);
    });
  });

  describe('cleanup and destruction', () => {
    it('should destroy all caches and cleanup resources', async () => {
      await cacheManager.getCache('cache1', { backend: 'memory' });
      await cacheManager.getCache('cache2', { backend: 'memory' });
      
      expect(cacheManager.getCacheNames()).toHaveLength(2);
      
      await cacheManager.destroyAll();
      
      expect(cacheManager.getCacheNames()).toHaveLength(0);
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });

    it('should handle errors during cache destruction', async () => {
      const cache = await cacheManager.getCache('error-cache', { backend: 'memory' });
      
      // Mock destroy to throw an error
      jest.spyOn(cache, 'destroy').mockRejectedValue(new Error('Destroy failed'));
      
      await cacheManager.destroyAll();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to destroy cache',
        expect.objectContaining({
          name: 'error-cache',
          error: 'Destroy failed'
        })
      );
    });
  });
});