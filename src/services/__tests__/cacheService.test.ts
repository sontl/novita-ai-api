// Set required environment variables for testing
process.env.NODE_ENV = 'test';
process.env.NOVITA_API_KEY = 'test-api-key';
process.env.LOG_LEVEL = 'error';

import { CacheService, CacheManager, cacheManager } from '../cacheService';

describe('CacheService', () => {
  let cache: CacheService<string>;

  beforeEach(() => {
    cache = new CacheService<string>('test-cache', {
      maxSize: 3,
      defaultTtl: 1000, // 1 second for testing
      cleanupIntervalMs: 0 // Disable automatic cleanup for tests
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should return cache size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    it('should return all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys.length).toBe(2);
    });
  });

  describe('TTL functionality', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      expect(cache.get('key1')).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', 'value1');
      const ttl = cache.getTtl('key1');
      expect(ttl).toBeLessThanOrEqual(1000);
      expect(ttl).toBeGreaterThan(900);
    });

    it('should update TTL for existing entries', () => {
      cache.set('key1', 'value1', 1000);
      expect(cache.setTtl('key1', 2000)).toBe(true);
      const ttl = cache.getTtl('key1');
      expect(ttl).toBeLessThanOrEqual(2000);
      expect(ttl).toBeGreaterThan(1900);
    });

    it('should return false when setting TTL for non-existent key', () => {
      expect(cache.setTtl('nonexistent', 1000)).toBe(false);
    });

    it('should return undefined TTL for non-existent key', () => {
      expect(cache.getTtl('nonexistent')).toBeUndefined();
    });

    it('should clean up expired entries', async () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 1000);
      
      // Wait for first entry to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const cleaned = cache.cleanupExpired();
      expect(cleaned).toBe(1);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when max size reached', () => {
      // Fill cache to max size
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key1 to make it more recently used
      cache.get('key1');
      
      // Add new entry, should evict key2 (least recently used)
      cache.set('key4', 'value4');
      
      expect(cache.get('key1')).toBe('value1'); // Still exists
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3'); // Still exists
      expect(cache.get('key4')).toBe('value4'); // New entry
    });

    it('should not evict when updating existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Update existing key, should not trigger eviction
      cache.set('key1', 'updated');
      
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBe('updated');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('metrics tracking', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', 'value1');
      
      // Hit
      cache.get('key1');
      // Miss
      cache.get('nonexistent');
      
      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
    });

    it('should track sets and deletes', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.delete('key1');
      
      const metrics = cache.getMetrics();
      expect(metrics.sets).toBe(2);
      expect(metrics.deletes).toBe(1);
    });

    it('should track evictions', () => {
      // Fill cache beyond max size to trigger eviction
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should trigger eviction
      
      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBe(1);
    });

    it('should calculate hit ratio correctly', () => {
      cache.set('key1', 'value1');
      
      // 2 hits, 1 miss = 2/3 = 0.667
      cache.get('key1');
      cache.get('key1');
      cache.get('nonexistent');
      
      const hitRatio = cache.getHitRatio();
      expect(hitRatio).toBeCloseTo(0.667, 3);
    });

    it('should return 0 hit ratio when no operations', () => {
      expect(cache.getHitRatio()).toBe(0);
    });

    it('should reset metrics', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('nonexistent');
      
      cache.resetMetrics();
      
      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.sets).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should provide detailed statistics', () => {
      cache.set('key1', 'value1', 1000);
      cache.get('key1'); // Increment access count
      
      const stats = cache.getStats();
      
      expect(stats.metrics.sets).toBe(1);
      expect(stats.metrics.hits).toBe(1);
      expect(stats.entries['key1']).toBeDefined();
      expect(stats.entries['key1']?.accessCount).toBe(1);
      expect(stats.entries['key1']?.ttl).toBe(1000);
    });
  });

  describe('periodic cleanup', () => {
    it('should start and stop periodic cleanup', () => {
      const cacheWithCleanup = new CacheService('test-cleanup', {
        cleanupIntervalMs: 100
      });
      
      // Should not throw
      cacheWithCleanup.stopPeriodicCleanup();
      cacheWithCleanup.destroy();
    });
  });
});

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  afterEach(() => {
    manager.destroyAll();
  });

  describe('cache management', () => {
    it('should create and retrieve cache instances', () => {
      const cache1 = manager.getCache('cache1');
      const cache2 = manager.getCache('cache2');
      const cache1Again = manager.getCache('cache1');
      
      expect(cache1).toBeDefined();
      expect(cache2).toBeDefined();
      expect(cache1).toBe(cache1Again); // Should return same instance
      expect(cache1).not.toBe(cache2);
    });

    it('should list cache names', () => {
      manager.getCache('cache1');
      manager.getCache('cache2');
      
      const names = manager.getCacheNames();
      expect(names).toContain('cache1');
      expect(names).toContain('cache2');
      expect(names.length).toBe(2);
    });

    it('should get all statistics', () => {
      const cache1 = manager.getCache('cache1');
      const cache2 = manager.getCache('cache2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      const allStats = manager.getAllStats();
      expect(allStats['cache1']).toBeDefined();
      expect(allStats['cache2']).toBeDefined();
      expect(allStats['cache1']?.metrics.sets).toBe(1);
      expect(allStats['cache2']?.metrics.sets).toBe(1);
    });

    it('should get all metrics', () => {
      const cache1 = manager.getCache('cache1');
      cache1.set('key1', 'value1');
      cache1.get('key1');
      
      const allMetrics = manager.getAllMetrics();
      expect(allMetrics['cache1']).toBeDefined();
      expect(allMetrics['cache1']?.hits).toBe(1);
      expect(allMetrics['cache1']?.sets).toBe(1);
    });

    it('should clear all caches', () => {
      const cache1 = manager.getCache('cache1');
      const cache2 = manager.getCache('cache2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      manager.clearAll();
      
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });

    it('should cleanup expired entries in all caches', async () => {
      const cache1 = manager.getCache('cache1');
      const cache2 = manager.getCache('cache2');
      
      cache1.set('key1', 'value1', 100);
      cache2.set('key2', 'value2', 100);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const cleaned = manager.cleanupAllExpired();
      expect(cleaned).toBe(2);
    });

    it('should destroy all caches', () => {
      manager.getCache('cache1');
      manager.getCache('cache2');
      
      expect(manager.getCacheNames().length).toBe(2);
      
      manager.destroyAll();
      
      expect(manager.getCacheNames().length).toBe(0);
    });
  });
});

describe('Global Cache Manager', () => {
  afterEach(() => {
    // Clean up global cache manager
    cacheManager.destroyAll();
  });

  it('should provide global cache manager instance', () => {
    expect(cacheManager).toBeDefined();
    expect(cacheManager).toBeInstanceOf(CacheManager);
  });

  it('should work with global cache manager', () => {
    const cache = cacheManager.getCache('global-test');
    cache.set('key1', 'value1');
    
    expect(cache.get('key1')).toBe('value1');
    expect(cacheManager.getCacheNames()).toContain('global-test');
  });
});