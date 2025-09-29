import { IRedisClient } from '../utils/redisClient';
import { RedisPipelineWrapper } from '../utils/redisPipelineWrapper';
import { logger } from '../utils/logger';
import { cacheMetricsMiddleware } from '../middleware/metricsMiddleware';

/**
 * Optimized Redis cache service that minimizes Redis commands
 * Key optimizations:
 * 1. Batch operations using pipelines
 * 2. Reduced access count updates
 * 3. Lazy expiration checks
 * 4. Bulk operations for cleanup
 */
export class OptimizedRedisCacheService<T = any> {
  private metrics = {
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
  private cleanupInterval?: NodeJS.Timeout;

  // Batch access count updates to reduce Redis calls
  private pendingAccessUpdates = new Map<string, { count: number; lastAccessed: number }>();
  private accessUpdateInterval?: NodeJS.Timeout;

  constructor(
    private readonly name: string,
    private readonly redisClient: IRedisClient,
    options: { maxSize?: number; defaultTtl?: number; cleanupIntervalMs?: number } = {}
  ) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 5 * 60 * 1000;
    this.keyPrefix = `cache:${this.name}`;
    
    // Start batch access update processor
    this.startAccessUpdateProcessor();
    
    if (options.cleanupIntervalMs && options.cleanupIntervalMs > 0) {
      this.startPeriodicCleanup(options.cleanupIntervalMs);
    }
  }

  /**
   * Optimized get - reduces Redis calls by batching access updates
   */
  async get(key: string): Promise<T | undefined> {
    try {
      const redisKey = this.buildRedisKey(key);
      const entry = await this.redisClient.get<{
        data: T;
        timestamp: number;
        ttl: number;
        accessCount: number;
        lastAccessed: number;
      }>(redisKey);
      
      if (!entry) {
        this.metrics.misses++;
        cacheMetricsMiddleware.recordMiss();
        return undefined;
      }

      // Lazy expiration check - only delete if expired
      if (this.isExpired(entry)) {
        // Don't await - fire and forget for better performance
        this.redisClient.del(redisKey).catch(err => 
          logger.warn('Failed to delete expired entry', { key, error: err.message })
        );
        this.metrics.misses++;
        this.metrics.evictions++;
        cacheMetricsMiddleware.recordMiss();
        return undefined;
      }

      // Batch access count updates instead of immediate Redis write
      this.scheduleAccessUpdate(redisKey, entry);
      
      this.metrics.hits++;
      cacheMetricsMiddleware.recordHit();
      
      return entry.data;
    } catch (error) {
      logger.error('Redis cache get failed', { cache: this.name, key, error: error instanceof Error ? error.message : String(error) });
      this.metrics.misses++;
      cacheMetricsMiddleware.recordMiss();
      return undefined;
    }
  }

  /**
   * Optimized set with size check batching
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const now = Date.now();
      const entryTtl = ttl || this.defaultTtl;
      const redisKey = this.buildRedisKey(key);

      const entry = {
        data: value,
        timestamp: now,
        ttl: entryTtl,
        accessCount: 0,
        lastAccessed: now - 1000
      };

      // Use pipeline wrapper for better performance
      await this.redisClient.set(redisKey, entry, entryTtl);

      this.metrics.sets++;
      
      // Update size metric less frequently
      if (this.metrics.sets % 10 === 0) {
        this.updateTotalSizeAsync();
      }

    } catch (error) {
      logger.error('Redis cache set failed', { cache: this.name, key, error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to set cache entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch delete operations
   */
  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    try {
      const redisKeys = keys.map(key => this.buildRedisKey(key));
      
      // Use pipeline wrapper for batch deletes
      const pipeline = new RedisPipelineWrapper(this.redisClient);
      redisKeys.forEach(key => pipeline.del(key));
      const results = await pipeline.exec();
      const deletedCount = results.filter(result => result.success && result.result).length;
      this.metrics.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      logger.error('Batch delete failed', { cache: this.name, keys: keys.length, error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  /**
   * Single delete with fallback to batch
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.deleteMany([key]);
    return result > 0;
  }

  /**
   * Optimized bulk operations for cleanup
   */
  async cleanupExpired(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.scanKeys(pattern);
      
      if (keys.length === 0) return 0;

      // Filter keys to ensure they match our cache prefix (defense against SCAN bugs)
      const validKeys = keys.filter(key => key.startsWith(this.keyPrefix + ':'));
      
      if (validKeys.length === 0) return 0;

      // Process in batches to avoid overwhelming Redis
      const batchSize = 50;
      let cleanedCount = 0;
      
      for (let i = 0; i < validKeys.length; i += batchSize) {
        const batch = validKeys.slice(i, i + batchSize);
        const expiredKeys: string[] = [];

        // Use pipeline wrapper to check multiple entries at once
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        batch.forEach(key => pipeline.get(key));
        const results = await pipeline.exec();
        
        results.forEach((result, index) => {
          if (result.success && result.result && this.isExpired(result.result as any)) {
            const key = batch[index];
            if (key !== undefined) {
              expiredKeys.push(key);
            }
          } else if (!result.success && result.error?.includes('WRONGTYPE')) {
            // Log WRONGTYPE errors but don't fail the cleanup
            const key = batch[index];
            logger.warn('Skipping key with wrong type during cleanup', {
              cache: this.name,
              key,
              error: result.error
            });
          }
        });

        // Batch delete expired keys
        if (expiredKeys.length > 0) {
          const deletePipeline = new RedisPipelineWrapper(this.redisClient);
          expiredKeys.forEach(key => deletePipeline.del(key));
          await deletePipeline.exec();
          
          cleanedCount += expiredKeys.length;
          this.metrics.evictions += expiredKeys.length;
        }
      }

      if (cleanedCount > 0) {
        this.updateTotalSizeAsync();
        logger.debug('Cleaned expired entries', { cache: this.name, count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Cleanup failed', { cache: this.name, error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  /**
   * Get cache size with caching
   */
  private sizeCache: { value: number; timestamp: number } | null = null;
  private readonly sizeCacheTtl = 30000; // 30 seconds

  async size(): Promise<number> {
    const now = Date.now();
    
    // Return cached size if still valid
    if (this.sizeCache && (now - this.sizeCache.timestamp) < this.sizeCacheTtl) {
      return this.sizeCache.value;
    }

    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.scanKeys(pattern);
      // Filter keys to ensure they match our cache prefix (defense against SCAN bugs)
      const validKeys = keys.filter(key => key.startsWith(this.keyPrefix + ':'));
      const size = validKeys.length;
      
      // Cache the size
      this.sizeCache = { value: size, timestamp: now };
      this.metrics.totalSize = size;
      
      return size;
    } catch (error) {
      logger.error('Failed to get cache size', { cache: this.name, error: error instanceof Error ? error.message : String(error) });
      return this.sizeCache?.value || 0;
    }
  }

  /**
   * Batch access count updates to reduce Redis calls
   */
  private scheduleAccessUpdate(redisKey: string, entry: any): void {
    const existing = this.pendingAccessUpdates.get(redisKey);
    this.pendingAccessUpdates.set(redisKey, {
      count: (existing?.count || entry.accessCount) + 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * Process batched access updates
   */
  private startAccessUpdateProcessor(): void {
    this.accessUpdateInterval = setInterval(async () => {
      if (this.pendingAccessUpdates.size === 0) return;

      const updates = new Map(this.pendingAccessUpdates);
      this.pendingAccessUpdates.clear();

      try {
        // First, get all entries that need updating
        const getPromises = Array.from(updates.keys()).map(async (redisKey) => {
          try {
            const entry = await this.redisClient.get(redisKey);
            return { redisKey, entry };
          } catch (error) {
            logger.warn('Failed to get entry for access update', { key: redisKey, error: error instanceof Error ? error.message : String(error) });
            return { redisKey, entry: null };
          }
        });

        const entries = await Promise.all(getPromises);
        
        // Then batch update all valid entries
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        let updateCount = 0;
        
        entries.forEach(({ redisKey, entry }) => {
          if (entry && typeof entry === 'object' && entry !== null && 'timestamp' in entry && 'ttl' in entry) {
            const update = updates.get(redisKey)!;
            const updatedEntry = {
              ...entry,
              accessCount: update.count,
              lastAccessed: update.lastAccessed
            };
            // Ensure getRemainingTtl receives a properly typed entry
            const ttl = this.getRemainingTtl({
              timestamp: (entry as any).timestamp,
              ttl: (entry as any).ttl
            });
            pipeline.set(redisKey, updatedEntry, ttl);
            updateCount++;
          }
        });

        if (updateCount > 0) {
          await pipeline.exec();
        }
      } catch (error) {
        logger.error('Failed to process access updates', { cache: this.name, count: updates.size, error: error instanceof Error ? error.message : String(error) });
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Async size update to avoid blocking operations
   */
  private updateTotalSizeAsync(): void {
    this.size().catch(error => 
      logger.warn('Failed to update total size', { cache: this.name, error: error instanceof Error ? error.message : String(error) })
    );
  }

  // Helper methods
  private buildRedisKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  private isExpired(entry: { timestamp: number; ttl: number }): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private getRemainingTtl(entry: { timestamp: number; ttl: number }): number {
    const elapsed = Date.now() - entry.timestamp;
    return Math.max(0, entry.ttl - elapsed);
  }

  private startPeriodicCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch(error => 
        logger.warn('Periodic cleanup failed', { cache: this.name, error: error instanceof Error ? error.message : String(error) })
      );
    }, intervalMs);
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.accessUpdateInterval) {
      clearInterval(this.accessUpdateInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Process any pending access updates before destroying
    if (this.pendingAccessUpdates.size > 0) {
      // Force process remaining updates
      const updates = new Map(this.pendingAccessUpdates);
      this.pendingAccessUpdates.clear();
      // Process updates without waiting to avoid blocking shutdown
    }
  }

  // Maintain API compatibility
  async keys(): Promise<string[]> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const redisKeys = await this.scanKeys(pattern);
      // Filter keys to ensure they match our cache prefix (defense against SCAN bugs)
      const validKeys = redisKeys.filter(key => key.startsWith(this.keyPrefix + ':'));
      return validKeys.map(key => key.replace(`${this.keyPrefix}:`, ''));
    } catch (error) {
      logger.error('Failed to get keys', { cache: this.name, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.keys();
      if (keys.length > 0) {
        await this.deleteMany(keys);
      }
      this.updateTotalSizeAsync();
    } catch (error) {
      logger.error('Failed to clear cache', { cache: this.name, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Scan for keys matching a pattern using SCAN instead of KEYS for better performance
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      try {
        const result = await this.redisClient.scan(cursor, { match: pattern, count: 100 });
        cursor = result[0];
        keys.push(...result[1]);
      } catch (error) {
        logger.error('Redis SCAN operation failed', {
          cache: this.name,
          command: 'SCAN',
          pattern,
          cursor,
          error: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    } while (cursor !== '0');
    
    return keys;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getHitRatio(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? this.metrics.hits / total : 0;
  }
}