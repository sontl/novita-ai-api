import { FallbackCacheService } from '../fallbackCacheService';
import { RedisCacheService } from '../redisCacheService';
import { CacheService } from '../cacheService';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');

describe('FallbackCacheService', () => {
  let mockRedisService: jest.Mocked<RedisCacheService<string>>;
  let mockFallbackService: jest.Mocked<CacheService<string>>;
  let fallbackCacheService: FallbackCacheService<string>;

  beforeEach(() => {
    // Create mock Redis cache service
    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn(),
      getMetrics: jest.fn(),
      getHitRatio: jest.fn(),
      cleanupExpired: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      setTtl: jest.fn(),
      getTtl: jest.fn(),
      resetMetrics: jest.fn(),
      stopPeriodicCleanup: jest.fn(),
      destroy: jest.fn(),
    } as any;

    // Create mock fallback cache service
    mockFallbackService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn(),
      getMetrics: jest.fn(),
      getHitRatio: jest.fn(),
      cleanupExpired: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      setTtl: jest.fn(),
      getTtl: jest.fn(),
      resetMetrics: jest.fn(),
      stopPeriodicCleanup: jest.fn(),
      destroy: jest.fn(),
    } as any;

    // Create fallback cache service instance
    fallbackCacheService = new FallbackCacheService(
      mockRedisService,
      mockFallbackService,
      'test-cache'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should use Redis service when healthy', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.get.mockResolvedValue('redis-value');

      const result = await fallbackCacheService.get('test-key');

      expect(result).toBe('redis-value');
      expect(mockRedisService.get).toHaveBeenCalledWith('test-key');
      expect(mockFallbackService.get).not.toHaveBeenCalled();
    });

    it('should fallback to in-memory service when Redis fails', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.get.mockRejectedValue(new Error('Redis connection failed'));
      mockFallbackService.get.mockReturnValue('fallback-value');

      const result = await fallbackCacheService.get('test-key');

      expect(result).toBe('fallback-value');
      expect(mockRedisService.get).toHaveBeenCalledWith('test-key');
      expect(mockFallbackService.get).toHaveBeenCalledWith('test-key');
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis cache operation failed, using fallback',
        expect.objectContaining({
          cache: 'test-cache',
          operation: 'get',
          key: 'test-key'
        })
      );
    });

    it('should use fallback service when Redis is unhealthy', async () => {
      mockRedisService.has.mockRejectedValue(new Error('Redis unhealthy'));
      mockFallbackService.get.mockReturnValue('fallback-value');

      const result = await fallbackCacheService.get('test-key');

      expect(result).toBe('fallback-value');
      expect(mockFallbackService.get).toHaveBeenCalledWith('test-key');
      expect(mockRedisService.get).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should set in both services when Redis is healthy', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.set.mockResolvedValue();
      mockFallbackService.set.mockReturnValue();

      await fallbackCacheService.set('test-key', 'test-value', 60000);

      expect(mockRedisService.set).toHaveBeenCalledWith('test-key', 'test-value', 60000);
      expect(mockFallbackService.set).toHaveBeenCalledWith('test-key', 'test-value', 60000);
    });

    it('should fallback when Redis set fails', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.set.mockRejectedValue(new Error('Redis connection failed'));
      mockFallbackService.set.mockReturnValue();

      await fallbackCacheService.set('test-key', 'test-value');

      expect(mockRedisService.set).toHaveBeenCalledWith('test-key', 'test-value', undefined);
      expect(mockFallbackService.set).toHaveBeenCalledWith('test-key', 'test-value', undefined);
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis cache operation failed, using fallback',
        expect.objectContaining({
          cache: 'test-cache',
          operation: 'set',
          key: 'test-key'
        })
      );
    });

    it('should use only fallback service when Redis is unhealthy', async () => {
      mockRedisService.has.mockRejectedValue(new Error('Redis unhealthy'));
      mockFallbackService.set.mockReturnValue();

      await fallbackCacheService.set('test-key', 'test-value');

      expect(mockFallbackService.set).toHaveBeenCalledWith('test-key', 'test-value', undefined);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete from both services when Redis is healthy', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.delete.mockResolvedValue(true);
      mockFallbackService.delete.mockReturnValue(true);

      const result = await fallbackCacheService.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedisService.delete).toHaveBeenCalledWith('test-key');
      expect(mockFallbackService.delete).toHaveBeenCalledWith('test-key');
    });

    it('should still delete from fallback when Redis fails', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.delete.mockRejectedValue(new Error('Redis connection failed'));
      mockFallbackService.delete.mockReturnValue(true);

      const result = await fallbackCacheService.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedisService.delete).toHaveBeenCalledWith('test-key');
      expect(mockFallbackService.delete).toHaveBeenCalledWith('test-key');
    });

    it('should return true if either service succeeds', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.delete.mockResolvedValue(false);
      mockFallbackService.delete.mockReturnValue(true);

      const result = await fallbackCacheService.delete('test-key');

      expect(result).toBe(true);
    });
  });

  describe('has', () => {
    it('should use Redis service when healthy', async () => {
      mockRedisService.has.mockResolvedValueOnce(true); // Health check
      mockRedisService.has.mockResolvedValueOnce(true); // Actual call

      const result = await fallbackCacheService.has('test-key');

      expect(result).toBe(true);
      expect(mockRedisService.has).toHaveBeenCalledTimes(2); // Health check + actual call
      expect(mockFallbackService.has).not.toHaveBeenCalled();
    });

    it('should fallback when Redis fails', async () => {
      mockRedisService.has.mockResolvedValueOnce(true); // Health check passes
      mockRedisService.has.mockRejectedValueOnce(new Error('Redis connection failed')); // Actual call fails
      mockFallbackService.has.mockReturnValue(true);

      const result = await fallbackCacheService.has('test-key');

      expect(result).toBe(true);
      expect(mockFallbackService.has).toHaveBeenCalledWith('test-key');
    });
  });

  describe('clear', () => {
    it('should clear both services when Redis is healthy', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.clear.mockResolvedValue();
      mockFallbackService.clear.mockReturnValue();

      await fallbackCacheService.clear();

      expect(mockRedisService.clear).toHaveBeenCalled();
      expect(mockFallbackService.clear).toHaveBeenCalled();
    });

    it('should still clear fallback when Redis fails', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.clear.mockRejectedValue(new Error('Redis connection failed'));
      mockFallbackService.clear.mockReturnValue();

      await fallbackCacheService.clear();

      expect(mockRedisService.clear).toHaveBeenCalled();
      expect(mockFallbackService.clear).toHaveBeenCalled();
    });

    it('should throw error when both services fail', async () => {
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.clear.mockRejectedValue(new Error('Redis clear failed'));
      mockFallbackService.clear.mockImplementation(() => {
        throw new Error('Fallback clear failed');
      });

      await expect(fallbackCacheService.clear()).rejects.toThrow('Failed to clear cache');
    });
  });

  describe('getStats', () => {
    it('should return Redis stats when healthy', async () => {
      const mockStats = {
        metrics: { hits: 10, misses: 2, sets: 5, deletes: 1, evictions: 0, totalSize: 5 },
        entries: {}
      };
      
      mockRedisService.has.mockResolvedValue(true); // Health check
      mockRedisService.getStats.mockResolvedValue(mockStats);

      const result = await fallbackCacheService.getStats();

      expect(result).toEqual(mockStats);
      expect(mockRedisService.getStats).toHaveBeenCalled();
      expect(mockFallbackService.getStats).not.toHaveBeenCalled();
    });

    it('should fallback when Redis fails', async () => {
      const mockStats = {
        metrics: { hits: 5, misses: 1, sets: 3, deletes: 0, evictions: 0, totalSize: 3 },
        entries: {}
      };
      
      mockRedisService.has.mockResolvedValue(true); // Health check passes
      mockRedisService.getStats.mockRejectedValue(new Error('Redis connection failed'));
      mockFallbackService.getStats.mockReturnValue(mockStats);

      const result = await fallbackCacheService.getStats();

      expect(result).toEqual(mockStats);
      expect(mockFallbackService.getStats).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should combine metrics from both services', () => {
      const redisMetrics = { hits: 10, misses: 2, sets: 5, deletes: 1, evictions: 0, totalSize: 5 };
      const fallbackMetrics = { hits: 5, misses: 1, sets: 3, deletes: 0, evictions: 1, totalSize: 3 };
      
      mockRedisService.getMetrics.mockReturnValue(redisMetrics);
      mockFallbackService.getMetrics.mockReturnValue(fallbackMetrics);

      const result = fallbackCacheService.getMetrics();

      expect(result).toEqual({
        hits: 15,
        misses: 3,
        sets: 8,
        deletes: 1,
        evictions: 1,
        totalSize: 5 // Max of both
      });
    });
  });

  describe('getHitRatio', () => {
    it('should calculate hit ratio from combined metrics', () => {
      const redisMetrics = { hits: 8, misses: 2, sets: 5, deletes: 1, evictions: 0, totalSize: 5 };
      const fallbackMetrics = { hits: 2, misses: 0, sets: 3, deletes: 0, evictions: 0, totalSize: 3 };
      
      mockRedisService.getMetrics.mockReturnValue(redisMetrics);
      mockFallbackService.getMetrics.mockReturnValue(fallbackMetrics);

      const hitRatio = fallbackCacheService.getHitRatio();

      expect(hitRatio).toBe(0.8333333333333334); // 10 hits / 12 total
    });
  });

  describe('health management', () => {
    it('should track Redis health status', async () => {
      // Initially healthy
      mockRedisService.has.mockResolvedValue(true);
      await fallbackCacheService.get('test-key');
      
      let healthStatus = fallbackCacheService.getRedisHealthStatus();
      expect(healthStatus.isHealthy).toBe(true);

      // Force a health check that fails
      mockRedisService.has.mockRejectedValue(new Error('Redis failed'));
      await fallbackCacheService.forceHealthCheck();
      
      healthStatus = fallbackCacheService.getRedisHealthStatus();
      expect(healthStatus.isHealthy).toBe(false);
    });

    it('should force health check', async () => {
      mockRedisService.has.mockResolvedValue(true);

      const isHealthy = await fallbackCacheService.forceHealthCheck();

      expect(isHealthy).toBe(true);
      expect(mockRedisService.has).toHaveBeenCalledWith('__health_check__');
    });

    it('should log Redis recovery', async () => {
      // Start with Redis failing - force health check to mark as unhealthy
      mockRedisService.has.mockRejectedValue(new Error('Redis failed'));
      await fallbackCacheService.forceHealthCheck();

      // Clear the mock call history
      jest.clearAllMocks();

      // Redis recovers - force another health check to trigger recovery
      mockRedisService.has.mockResolvedValue(true);
      await fallbackCacheService.forceHealthCheck();

      expect(logger.info).toHaveBeenCalledWith(
        'Redis cache service recovered',
        { cache: 'test-cache' }
      );
    });
  });

  describe('cleanup and destroy', () => {
    it('should cleanup both services', async () => {
      mockRedisService.has.mockResolvedValue(true);
      mockRedisService.cleanupExpired.mockResolvedValue(3);
      mockFallbackService.cleanupExpired.mockReturnValue(2);

      const totalCleaned = await fallbackCacheService.cleanupExpired();

      expect(totalCleaned).toBe(5);
      expect(mockRedisService.cleanupExpired).toHaveBeenCalled();
      expect(mockFallbackService.cleanupExpired).toHaveBeenCalled();
    });

    it('should stop periodic cleanup on both services', () => {
      fallbackCacheService.stopPeriodicCleanup();

      expect(mockRedisService.stopPeriodicCleanup).toHaveBeenCalled();
      expect(mockFallbackService.stopPeriodicCleanup).toHaveBeenCalled();
    });

    it('should destroy both services', async () => {
      mockRedisService.destroy.mockResolvedValue();
      mockFallbackService.destroy.mockReturnValue();

      await fallbackCacheService.destroy();

      expect(mockRedisService.destroy).toHaveBeenCalled();
      expect(mockFallbackService.destroy).toHaveBeenCalled();
    });

    it('should handle errors during destroy gracefully', async () => {
      mockRedisService.destroy.mockRejectedValue(new Error('Redis destroy failed'));
      mockFallbackService.destroy.mockImplementation(() => {
        throw new Error('Fallback destroy failed');
      });

      await fallbackCacheService.destroy();

      expect(logger.warn).toHaveBeenCalledWith(
        'Some errors occurred during cache destruction',
        expect.objectContaining({
          cache: 'test-cache',
          errors: ['Redis destroy failed', 'Fallback destroy failed']
        })
      );
    });

    it('should reset metrics on both services', () => {
      fallbackCacheService.resetMetrics();

      expect(mockRedisService.resetMetrics).toHaveBeenCalled();
      expect(mockFallbackService.resetMetrics).toHaveBeenCalled();
    });
  });

  describe('TTL operations', () => {
    it('should set TTL on both services when Redis is healthy', async () => {
      mockRedisService.has.mockResolvedValue(true);
      mockRedisService.setTtl.mockResolvedValue(true);
      mockFallbackService.setTtl.mockReturnValue(true);

      const result = await fallbackCacheService.setTtl('test-key', 60000);

      expect(result).toBe(true);
      expect(mockRedisService.setTtl).toHaveBeenCalledWith('test-key', 60000);
      expect(mockFallbackService.setTtl).toHaveBeenCalledWith('test-key', 60000);
    });

    it('should get TTL from Redis when healthy', async () => {
      mockRedisService.has.mockResolvedValue(true);
      mockRedisService.getTtl.mockResolvedValue(30000);

      const result = await fallbackCacheService.getTtl('test-key');

      expect(result).toBe(30000);
      expect(mockRedisService.getTtl).toHaveBeenCalledWith('test-key');
      expect(mockFallbackService.getTtl).not.toHaveBeenCalled();
    });

    it('should fallback for TTL operations when Redis fails', async () => {
      mockRedisService.has.mockResolvedValue(true);
      mockRedisService.getTtl.mockRejectedValue(new Error('Redis failed'));
      mockFallbackService.getTtl.mockReturnValue(15000);

      const result = await fallbackCacheService.getTtl('test-key');

      expect(result).toBe(15000);
      expect(mockFallbackService.getTtl).toHaveBeenCalledWith('test-key');
    });
  });
});