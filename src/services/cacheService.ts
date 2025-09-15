import { logger } from '../utils/logger';
import { cacheMetricsMiddleware } from '../middleware/metricsMiddleware';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  totalSize: number;
}

export interface CacheStats {
  metrics: CacheMetrics;
  entries: {
    [key: string]: {
      size: number;
      ttl: number;
      age: number;
      accessCount: number;
      lastAccessed: number;
    };
  };
}

export class CacheService<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
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
  private cleanupInterval?: NodeJS.Timeout | undefined;

  constructor(
    private readonly name: string,
    options: {
      maxSize?: number;
      defaultTtl?: number;
      cleanupIntervalMs?: number;
    } = {}
  ) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 5 * 60 * 1000; // 5 minutes default
    
    // Start periodic cleanup if interval specified
    if (options.cleanupIntervalMs && options.cleanupIntervalMs > 0) {
      this.startPeriodicCleanup(options.cleanupIntervalMs);
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.metrics.misses++;
      cacheMetricsMiddleware.recordMiss();
      logger.debug('Cache miss', { cache: this.name, key });
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
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
    
    // Record global cache hit
    cacheMetricsMiddleware.recordHit();
    
    logger.debug('Cache hit', { 
      cache: this.name, 
      key, 
      accessCount: entry.accessCount 
    });
    
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl || this.defaultTtl;

    // Check if we need to evict entries to make space
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: now,
      ttl: entryTtl,
      accessCount: 0,
      lastAccessed: now - 1000 // Set initial access time slightly in the past
    };

    this.cache.set(key, entry);
    this.metrics.sets++;
    this.updateTotalSize();
    
    // Update global cache size
    cacheMetricsMiddleware.updateSize(this.cache.size);

    logger.debug('Cache set', { 
      cache: this.name, 
      key, 
      ttl: entryTtl,
      size: this.cache.size 
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.metrics.deletes++;
      this.updateTotalSize();
      logger.debug('Cache delete', { cache: this.name, key });
    }
    return deleted;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.metrics.evictions++;
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.updateTotalSize();
    logger.info('Cache cleared', { cache: this.name, clearedEntries: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries: CacheStats['entries'] = {};
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      entries[key] = {
        size: this.estimateEntrySize(entry),
        ttl: entry.ttl,
        age: now - entry.timestamp,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed
      };
    }

    return {
      metrics: { ...this.metrics },
      entries
    };
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
  cleanupExpired(): number {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.metrics.evictions++;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.updateTotalSize();
      logger.debug('Cleaned up expired cache entries', { 
        cache: this.name, 
        count: cleanedCount 
      });
    }

    return cleanedCount;
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Set TTL for existing entry
   */
  setTtl(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      return false;
    }

    entry.ttl = ttl;
    entry.timestamp = Date.now(); // Reset timestamp for new TTL
    
    logger.debug('Cache TTL updated', { cache: this.name, key, ttl });
    return true;
  }

  /**
   * Get remaining TTL for entry
   */
  getTtl(key: string): number | undefined {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      return undefined;
    }

    const elapsed = Date.now() - entry.timestamp;
    return Math.max(0, entry.ttl - elapsed);
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
      totalSize: this.cache.size
    };
    logger.debug('Cache metrics reset', { cache: this.name });
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
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
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) {
      return;
    }

    let lruKey: string | undefined;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.metrics.evictions++;
      this.updateTotalSize();
      logger.debug('Evicted LRU cache entry', { 
        cache: this.name, 
        key: lruKey 
      });
    }
  }

  /**
   * Update total size metric
   */
  private updateTotalSize(): void {
    this.metrics.totalSize = this.cache.size;
  }

  /**
   * Estimate memory size of cache entry (rough approximation)
   */
  private estimateEntrySize(entry: CacheEntry<T>): number {
    try {
      // Rough estimation: JSON string length as proxy for memory usage
      return JSON.stringify(entry.data).length + 100; // +100 for metadata
    } catch {
      // Fallback for non-serializable data
      return 100;
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.stopPeriodicCleanup();
    this.clear();
    logger.info('Cache destroyed', { cache: this.name });
  }
}

/**
 * Cache manager for managing multiple cache instances
 */
export class CacheManager {
  private caches: Map<string, CacheService> = new Map();

  /**
   * Create or get cache instance
   */
  getCache<T = any>(
    name: string, 
    options?: {
      maxSize?: number;
      defaultTtl?: number;
      cleanupIntervalMs?: number;
    }
  ): CacheService<T> {
    let cache = this.caches.get(name);
    
    if (!cache) {
      cache = new CacheService<T>(name, options);
      this.caches.set(name, cache);
      logger.info('Created new cache instance', { name, options });
    }
    
    return cache as CacheService<T>;
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
  getAllStats(): { [cacheName: string]: CacheStats } {
    const stats: { [cacheName: string]: CacheStats } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    
    return stats;
  }

  /**
   * Get combined metrics for all caches
   */
  getAllMetrics(): { [cacheName: string]: CacheMetrics } {
    const metrics: { [cacheName: string]: CacheMetrics } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      metrics[name] = cache.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    logger.info('All caches cleared');
  }

  /**
   * Cleanup expired entries in all caches
   */
  cleanupAllExpired(): number {
    let totalCleaned = 0;
    
    for (const cache of this.caches.values()) {
      totalCleaned += cache.cleanupExpired();
    }
    
    return totalCleaned;
  }

  /**
   * Destroy all caches
   */
  destroyAll(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
    logger.info('All caches destroyed');
  }
}

// Export singleton cache manager
export const cacheManager = new CacheManager();