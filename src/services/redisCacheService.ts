import { IRedisClient } from '../utils/redisClient';
import { logger } from '../utils/logger';
import { cacheMetricsMiddleware } from '../middleware/metricsMiddleware';

/**
 * Cache entry structure
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache metrics interface
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  totalSize: number;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  metrics: CacheMetrics;
  entries: { [key: string]: {
    size: number;
    ttl: number;
    age: number;
    accessCount: number;
    lastAccessed: number;
  } };
}

export interface CacheServiceOptions {
  maxSize?: number;
  defaultTtl?: number;
  cleanupIntervalMs?: number;
}

/**
 * Redis-backed cache entry structure
 */
interface RedisCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Redis-backed cache service that maintains API compatibility with CacheService
 */
export class RedisCacheService<T = any> {
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    totalSize: 0
  };
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private readonly keyPrefix: string;
  private cleanupInterval?: NodeJS.Timeout | undefined;

  constructor(
    private readonly name: string,
    private readonly redisClient: IRedisClient,
    options: CacheServiceOptions = {}
  ) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 5 * 60 * 1000; // 5 minutes default
    this.keyPrefix = `cache:${this.name}`;
    
    // Start periodic cleanup if interval specified
    if (options.cleanupIntervalMs && options.cleanupIntervalMs > 0) {
      this.startPeriodicCleanup(options.cleanupIntervalMs);
    }
  }

  /**
   * Get value from Redis cache
   */
  async get(key: string): Promise<T | undefined> {
    try {
      const redisKey = this.buildRedisKey(key);
      const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
      
      if (!entry) {
        this.metrics.misses++;
        cacheMetricsMiddleware.recordMiss();
        logger.debug('Cache miss', { cache: this.name, key });
        return undefined;
      }

      // Check if entry is expired
      if (this.isExpired(entry)) {
        await this.redisClient.del(redisKey);
        this.metrics.misses++;
        this.metrics.evictions++;
        cacheMetricsMiddleware.recordMiss();
        logger.debug('Cache miss (expired)', { cache: this.name, key });
        return undefined;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      this.metrics.hits++;
      
      // Update entry in Redis with new access stats
      await this.redisClient.set(redisKey, entry, this.getRemainingTtl(entry));
      
      // Record global cache hit
      cacheMetricsMiddleware.recordHit();
      
      logger.debug('Cache hit', { 
        cache: this.name, 
        key, 
        accessCount: entry.accessCount 
      });
      
      return entry.data;
    } catch (error) {
      logger.error('Redis cache get operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      this.metrics.misses++;
      cacheMetricsMiddleware.recordMiss();
      return undefined;
    }
  }

  /**
   * Set value in Redis cache
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const now = Date.now();
      const entryTtl = ttl || this.defaultTtl;
      const redisKey = this.buildRedisKey(key);

      // Check if we need to evict entries to make space
      const currentSize = await this.getCurrentSize();
      if (currentSize >= this.maxSize && !(await this.redisClient.exists(redisKey))) {
        await this.evictLeastRecentlyUsed();
      }

      const entry: RedisCacheEntry<T> = {
        data: value,
        timestamp: now,
        ttl: entryTtl,
        accessCount: 0,
        lastAccessed: now - 1000 // Set initial access time slightly in the past
      };

      await this.redisClient.set(redisKey, entry, entryTtl);
      this.metrics.sets++;
      await this.updateTotalSize();
      
      // Update global cache size
      const newSize = await this.getCurrentSize();
      cacheMetricsMiddleware.updateSize(newSize);

      logger.debug('Cache set', { 
        cache: this.name, 
        key, 
        ttl: entryTtl,
        size: newSize 
      });
    } catch (error) {
      logger.error('Redis cache set operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to set cache entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete value from Redis cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const redisKey = this.buildRedisKey(key);
      const deleted = await this.redisClient.del(redisKey);
      if (deleted) {
        this.metrics.deletes++;
        await this.updateTotalSize();
        logger.debug('Cache delete', { cache: this.name, key });
      }
      return deleted;
    } catch (error) {
      logger.error('Redis cache delete operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if key exists and is not expired
   */
  async has(key: string): Promise<boolean> {
    try {
      const redisKey = this.buildRedisKey(key);
      const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
      
      if (!entry) {
        return false;
      }

      if (this.isExpired(entry)) {
        await this.redisClient.del(redisKey);
        this.metrics.evictions++;
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Redis cache has operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        // Delete keys in batches to avoid overwhelming Redis
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await Promise.all(batch.map(key => this.redisClient.del(key)));
        }
      }
      
      await this.updateTotalSize();
      logger.info('Cache cleared', { cache: this.name, clearedEntries: keys.length });
    } catch (error) {
      logger.error('Redis cache clear operation failed', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const entries: CacheStats['entries'] = {};
      const now = Date.now();
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);

      for (const redisKey of keys) {
        const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
        if (entry && !this.isExpired(entry)) {
          const originalKey = this.extractOriginalKey(redisKey);
          entries[originalKey] = {
            size: this.estimateEntrySize(entry),
            ttl: entry.ttl,
            age: now - entry.timestamp,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed
          };
        }
      }

      return {
        metrics: { ...this.metrics },
        entries
      };
    } catch (error) {
      logger.error('Redis cache getStats operation failed', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        metrics: { ...this.metrics },
        entries: {}
      };
    }
  }

  /**
   * Get cache metrics only
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? this.metrics.hits / total : 0;
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired(): Promise<number> {
    try {
      let cleanedCount = 0;
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);

      for (const redisKey of keys) {
        const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
        if (entry && this.isExpired(entry)) {
          await this.redisClient.del(redisKey);
          this.metrics.evictions++;
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        await this.updateTotalSize();
        logger.debug('Cleaned up expired cache entries', { 
          cache: this.name, 
          count: cleanedCount 
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Redis cache cleanup operation failed', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Get all keys in cache
   */
  async keys(): Promise<string[]> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const redisKeys = await this.redisClient.keys(pattern);
      return redisKeys.map(key => this.extractOriginalKey(key));
    } catch (error) {
      logger.error('Redis cache keys operation failed', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Get cache size
   */
  async size(): Promise<number> {
    return await this.getCurrentSize();
  }

  /**
   * Set TTL for existing entry
   */
  async setTtl(key: string, ttl: number): Promise<boolean> {
    try {
      const redisKey = this.buildRedisKey(key);
      const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
      
      if (!entry || this.isExpired(entry)) {
        return false;
      }

      entry.ttl = ttl;
      entry.timestamp = Date.now(); // Reset timestamp for new TTL
      
      await this.redisClient.set(redisKey, entry, ttl);
      
      logger.debug('Cache TTL updated', { cache: this.name, key, ttl });
      return true;
    } catch (error) {
      logger.error('Redis cache setTtl operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get remaining TTL for entry
   */
  async getTtl(key: string): Promise<number | undefined> {
    try {
      const redisKey = this.buildRedisKey(key);
      const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
      
      if (!entry || this.isExpired(entry)) {
        return undefined;
      }

      return this.getRemainingTtl(entry);
    } catch (error) {
      logger.error('Redis cache getTtl operation failed', {
        cache: this.name,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      totalSize: 0
    };
    logger.debug('Cache metrics reset', { cache: this.name });
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpired();
    }, intervalMs);

    logger.debug('Started periodic cache cleanup', { 
      cache: this.name, 
      intervalMs 
    });
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      logger.debug('Stopped periodic cache cleanup', { cache: this.name });
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  async destroy(): Promise<void> {
    this.stopPeriodicCleanup();
    await this.clear();
    logger.info('Cache destroyed', { cache: this.name });
  }

  /**
   * Build Redis key with prefix
   */
  private buildRedisKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * Extract original key from Redis key
   */
  private extractOriginalKey(redisKey: string): string {
    const prefix = `${this.keyPrefix}:`;
    return redisKey.startsWith(prefix) ? redisKey.slice(prefix.length) : redisKey;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: RedisCacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Get remaining TTL for entry
   */
  private getRemainingTtl(entry: RedisCacheEntry<T>): number {
    const elapsed = Date.now() - entry.timestamp;
    return Math.max(0, entry.ttl - elapsed);
  }

  /**
   * Get current cache size
   */
  private async getCurrentSize(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);
      return keys.length;
    } catch (error) {
      logger.error('Failed to get current cache size', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Update total size metric
   */
  private async updateTotalSize(): Promise<void> {
    this.metrics.totalSize = await this.getCurrentSize();
  }

  /**
   * Evict least recently used entry
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length === 0) {
        return;
      }

      let lruKey: string | undefined;
      let lruTime = Infinity;

      for (const redisKey of keys) {
        const entry = await this.redisClient.get<RedisCacheEntry<T>>(redisKey);
        if (entry && entry.lastAccessed < lruTime) {
          lruTime = entry.lastAccessed;
          lruKey = redisKey;
        }
      }

      if (lruKey) {
        await this.redisClient.del(lruKey);
        this.metrics.evictions++;
        await this.updateTotalSize();
        
        const originalKey = this.extractOriginalKey(lruKey);
        logger.debug('Evicted LRU cache entry', { 
          cache: this.name, 
          key: originalKey 
        });
      }
    } catch (error) {
      logger.error('Failed to evict LRU entry', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Estimate memory size of cache entry (rough approximation)
   */
  private estimateEntrySize(entry: RedisCacheEntry<T>): number {
    try {
      // Rough estimation: JSON string length as proxy for memory usage
      return JSON.stringify(entry.data).length + 100; // +100 for metadata
    } catch {
      // Fallback for non-serializable data
      return 100;
    }
  }
}