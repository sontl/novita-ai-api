// Set required environment variables for testing BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.NOVITA_API_KEY = 'test-api-key';
process.env.LOG_LEVEL = 'error';

import { cacheManager } from '../../services/cacheService';

describe('Cache Service Integration', () => {
  beforeEach(() => {
    // Clear all caches before each test
    cacheManager.clearAll();
  });

  afterAll(() => {
    // Clean up after tests
    cacheManager.destroyAll();
  });

  describe('Cache Manager Integration', () => {
    it('should manage multiple cache instances', () => {
      const cache1 = cacheManager.getCache('test-cache-1');
      const cache2 = cacheManager.getCache('test-cache-2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      expect(cache1.get('key1')).toBe('value1');
      expect(cache2.get('key2')).toBe('value2');
      expect(cache1.get('key2')).toBeUndefined();
      expect(cache2.get('key1')).toBeUndefined();
    });

    it('should provide comprehensive statistics', () => {
      const cache1 = cacheManager.getCache('stats-test-cache-1');
      const cache2 = cacheManager.getCache('stats-test-cache-2');
      
      cache1.set('key1', 'value1');
      cache1.get('key1'); // Hit
      cache1.get('nonexistent'); // Miss
      
      cache2.set('key2', 'value2');
      cache2.get('key2'); // Hit
      
      const allStats = cacheManager.getAllStats();
      const allMetrics = cacheManager.getAllMetrics();
      
      expect(allStats['stats-test-cache-1']).toBeDefined();
      expect(allStats['stats-test-cache-2']).toBeDefined();
      expect(allMetrics['stats-test-cache-1']?.hits).toBe(1);
      expect(allMetrics['stats-test-cache-1']?.misses).toBe(1);
      expect(allMetrics['stats-test-cache-2']?.hits).toBe(1);
      expect(allMetrics['stats-test-cache-2']?.misses).toBe(0);
    });

    it('should cleanup expired entries across all caches', async () => {
      const cache1 = cacheManager.getCache('test-cache-1');
      const cache2 = cacheManager.getCache('test-cache-2');
      
      // Add entries with short TTL
      cache1.set('key1', 'value1', 100);
      cache2.set('key2', 'value2', 100);
      
      expect(cache1.size()).toBe(1);
      expect(cache2.size()).toBe(1);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const cleaned = cacheManager.cleanupAllExpired();
      expect(cleaned).toBe(2);
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });

    it('should clear all caches', () => {
      const cache1 = cacheManager.getCache('test-cache-1');
      const cache2 = cacheManager.getCache('test-cache-2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      expect(cache1.size()).toBe(1);
      expect(cache2.size()).toBe(1);
      
      cacheManager.clearAll();
      
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });
  });

  describe('Cache Performance and Metrics', () => {
    it('should track hit ratios accurately', () => {
      const cache = cacheManager.getCache('performance-test');
      
      // Set up test data
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Generate hits and misses
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Hit
      cache.get('nonexistent1'); // Miss
      cache.get('nonexistent2'); // Miss
      
      const hitRatio = cache.getHitRatio();
      expect(hitRatio).toBeCloseTo(0.6, 1); // 3 hits out of 5 total = 0.6
      
      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(3);
      expect(metrics.misses).toBe(2);
    });

    it('should handle cache invalidation strategies', () => {
      const cache = cacheManager.getCache('invalidation-test');
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      expect(cache.size()).toBe(3);
      
      // Delete specific key
      cache.delete('key2');
      expect(cache.size()).toBe(2);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      
      // Clear all
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should support TTL management', () => {
      const cache = cacheManager.getCache('ttl-test');
      
      cache.set('key1', 'value1', 5000); // 5 seconds
      
      const initialTtl = cache.getTtl('key1');
      expect(initialTtl).toBeLessThanOrEqual(5000);
      expect(initialTtl).toBeGreaterThan(4000);
      
      // Update TTL
      cache.setTtl('key1', 10000);
      const updatedTtl = cache.getTtl('key1');
      expect(updatedTtl).toBeLessThanOrEqual(10000);
      expect(updatedTtl).toBeGreaterThan(9000);
    });
  });
});