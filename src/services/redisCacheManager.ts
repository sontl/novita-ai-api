import { RedisCacheService, CacheServiceOptions, CacheMetrics, CacheStats } from './redisCacheService';
import { IRedisClient, RedisClient } from '../utils/redisClient';
import { RedisConnectionManager } from '../utils/redisConnectionManager';
import { RedisSerializer } from '../utils/redisSerializer';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('redis-cache-manager');
import { getConfig } from '../config/config';

// Re-export types for external consumers
export type { CacheMetrics, CacheStats };

export interface CacheManagerOptions extends CacheServiceOptions {
  // Redis-only options - no backend selection needed
}

/**
 * Cache service interface for Redis-only implementations
 */
export interface ICacheService<T = any> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
  getMetrics(): CacheMetrics;
  getHitRatio(): number;
  cleanupExpired(): Promise<number>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
  setTtl(key: string, ttl: number): Promise<boolean>;
  getTtl(key: string): Promise<number | undefined>;
  resetMetrics(): void;
  stopPeriodicCleanup(): void;
  destroy(): Promise<void>;
}

/**
 * Redis-only cache manager that creates Redis-backed cache instances
 */
export class RedisCacheManager {
  private caches: Map<string, ICacheService> = new Map();
  private redisClient?: IRedisClient | undefined;

  constructor(options: { 
    redisClient?: IRedisClient;
  } = {}) {
    this.redisClient = options.redisClient;
  }

  /**
   * Initialize Redis client if not provided
   */
  private async initializeRedisClient(): Promise<IRedisClient> {
    if (!this.redisClient) {
      const config = getConfig();
      const connectionManager = new RedisConnectionManager({
        url: config.redis.url,
        host: config.redis.host,
        port: config.redis.port,
        username: config.redis.username,
        password: config.redis.password,
        connectionTimeoutMs: config.redis.connectionTimeoutMs,
        commandTimeoutMs: config.redis.commandTimeoutMs,
        retryAttempts: config.redis.retryAttempts,
        retryDelayMs: config.redis.retryDelayMs,
      });

      this.redisClient = new RedisClient({
        url: config.redis.url,
        host: config.redis.host,
        port: config.redis.port,
        username: config.redis.username,
        password: config.redis.password,
        connectionTimeoutMs: config.redis.connectionTimeoutMs,
        commandTimeoutMs: config.redis.commandTimeoutMs,
        retryAttempts: config.redis.retryAttempts,
        retryDelayMs: config.redis.retryDelayMs,
      }, new RedisSerializer());

      if ('connect' in this.redisClient) {
        await (this.redisClient as any).connect();
      }
      logger.info('Redis client initialized for cache manager');
    }
    return this.redisClient;
  }

  /**
   * Create Redis cache service
   */
  private async createCacheService<T>(
    name: string, 
    options: CacheServiceOptions
  ): Promise<ICacheService<T>> {
    const redisClient = await this.initializeRedisClient();
    return new RedisCacheService<T>(name, redisClient, options);
  }

  /**
   * Create or get Redis cache instance
   */
  async getCache<T = any>(
    name: string, 
    options: CacheManagerOptions = {}
  ): Promise<ICacheService<T>> {
    let cache = this.caches.get(name);
    
    if (!cache) {
      cache = await this.createCacheService<T>(name, options);
      this.caches.set(name, cache);
      
      logger.info('Created new Redis cache instance', { 
        name, 
        options
      });
    }
    
    return cache as ICacheService<T>;
  }

  /**
   * Create Redis cache instance
   */
  async createCache<T = any>(
    name: string,
    options: CacheServiceOptions = {}
  ): Promise<ICacheService<T>> {
    if (this.caches.has(name)) {
      throw new Error(`Cache with name '${name}' already exists`);
    }

    const cache = await this.createCacheService<T>(name, options);
    this.caches.set(name, cache);
    
    logger.info('Created Redis cache instance', { name, options });
    return cache;
  }

  /**
   * Get cache instance if it exists
   */
  getCacheIfExists<T = any>(name: string): ICacheService<T> | undefined {
    return this.caches.get(name) as ICacheService<T> | undefined;
  }

  /**
   * Check if cache exists
   */
  hasCache(name: string): boolean {
    return this.caches.has(name);
  }

  /**
   * Remove cache instance
   */
  async removeCache(name: string): Promise<boolean> {
    const cache = this.caches.get(name);
    if (cache) {
      try {
        await cache.destroy();
      } catch (error) {
        logger.warn('Error destroying cache during removal', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      this.caches.delete(name);
      logger.info('Removed cache instance', { name });
      return true;
    }
    return false;
  }

  /**
   * Get all cache names
   */
  getCacheNames(): string[] {
    return Array.from(this.caches.keys());
  }

  /**
   * Get combined statistics for all caches
   */
  async getAllStats(): Promise<{ [cacheName: string]: CacheStats }> {
    const stats: { [cacheName: string]: CacheStats } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        const cacheStats = await cache.getStats();
        stats[name] = cacheStats;
      } catch (error) {
        logger.error('Failed to get stats for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
        // Provide empty stats as fallback
        stats[name] = {
          metrics: { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, totalSize: 0 },
          entries: {}
        };
      }
    }
    
    return stats;
  }

  /**
   * Get combined metrics for all caches
   */
  getAllMetrics(): { [cacheName: string]: CacheMetrics } {
    const metrics: { [cacheName: string]: CacheMetrics } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        metrics[name] = cache.getMetrics();
      } catch (error) {
        logger.error('Failed to get metrics for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
        // Provide empty metrics as fallback
        metrics[name] = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, totalSize: 0 };
      }
    }
    
    return metrics;
  }

  /**
   * Get combined hit ratios for all caches
   */
  getAllHitRatios(): { [cacheName: string]: number } {
    const ratios: { [cacheName: string]: number } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        ratios[name] = cache.getHitRatio();
      } catch (error) {
        logger.error('Failed to get hit ratio for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
        ratios[name] = 0;
      }
    }
    
    return ratios;
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    const errors: Error[] = [];
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        await cache.clear();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        logger.error('Failed to clear cache', {
          name,
          error: err.message
        });
      }
    }
    
    if (errors.length === 0) {
      logger.info('All caches cleared');
    } else {
      logger.warn('Some caches failed to clear', {
        errorCount: errors.length,
        totalCaches: this.caches.size
      });
    }
    
    if (errors.length > 0 && errors.length === this.caches.size) {
      throw new Error(`Failed to clear all caches: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * Cleanup expired entries in all caches
   */
  async cleanupAllExpired(): Promise<number> {
    let totalCleaned = 0;
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        const cleaned = await cache.cleanupExpired();
        totalCleaned += cleaned;
      } catch (error) {
        logger.error('Failed to cleanup expired entries for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return totalCleaned;
  }

  /**
   * Get cache sizes
   */
  async getAllSizes(): Promise<{ [cacheName: string]: number }> {
    const sizes: { [cacheName: string]: number } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        sizes[name] = await cache.size();
      } catch (error) {
        logger.error('Failed to get size for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
        sizes[name] = 0;
      }
    }
    
    return sizes;
  }

  /**
   * Reset metrics for all caches
   */
  resetAllMetrics(): void {
    for (const [name, cache] of this.caches.entries()) {
      try {
        cache.resetMetrics();
      } catch (error) {
        logger.error('Failed to reset metrics for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    logger.info('Reset metrics for all caches');
  }

  /**
   * Stop periodic cleanup for all caches
   */
  stopAllPeriodicCleanup(): void {
    for (const [name, cache] of this.caches.entries()) {
      try {
        cache.stopPeriodicCleanup();
      } catch (error) {
        logger.error('Failed to stop periodic cleanup for cache', {
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    logger.info('Stopped periodic cleanup for all caches');
  }

  /**
   * Destroy all caches and cleanup resources
   */
  async destroyAll(): Promise<void> {
    const errors: Error[] = [];
    
    for (const [name, cache] of this.caches.entries()) {
      try {
        await cache.destroy();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        logger.error('Failed to destroy cache', {
          name,
          error: err.message
        });
      }
    }
    
    this.caches.clear();
    
    // Cleanup Redis client if we created it
    if (this.redisClient) {
      try {
        await this.redisClient.disconnect();
        this.redisClient = undefined;
      } catch (error) {
        logger.error('Failed to disconnect Redis client', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    if (errors.length === 0) {
      logger.info('All caches destroyed');
    } else {
      logger.warn('Some caches failed to destroy properly', {
        errorCount: errors.length
      });
    }
  }

  /**
   * Get Redis client health status (if using Redis)
   */
  getRedisHealthStatus(): { connected: boolean; clientExists: boolean } {
    return {
      connected: (this.redisClient as any)?.isHealthy?.() ?? false,
      clientExists: !!this.redisClient
    };
  }

  /**
   * Get cache manager configuration
   */
  getConfiguration(): {
    cacheCount: number;
    redisConnected: boolean;
  } {
    return {
      cacheCount: this.caches.size,
      redisConnected: (this.redisClient as any)?.isHealthy?.() ?? false
    };
  }
}

// Create and export singleton Redis cache manager factory
export function createRedisCacheManager(): RedisCacheManager {
  return new RedisCacheManager();
}