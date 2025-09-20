import { CacheService, CacheMetrics, CacheStats } from './cacheService';
import { RedisCacheService } from './redisCacheService';
import { logger } from '../utils/logger';

/**
 * Fallback cache service that wraps Redis and in-memory services
 * Provides graceful degradation when Redis is unavailable
 */
export class FallbackCacheService<T = any> {
  private isRedisHealthy: boolean = true;
  private lastHealthCheck: number = 0;
  private readonly healthCheckInterval: number = 30000; // 30 seconds

  constructor(
    private readonly primaryService: RedisCacheService<T>,
    private readonly fallbackService: CacheService<T>,
    private readonly name: string
  ) {}

  /**
   * Get value from cache with fallback
   */
  async get(key: string): Promise<T | undefined> {
    if (await this.isPrimaryHealthy()) {
      try {
        const result = await this.primaryService.get(key);
        this.markRedisHealthy();
        return result;
      } catch (error) {
        this.handleRedisError('get', key, error);
        return this.fallbackService.get(key);
      }
    } else {
      logger.debug('Using fallback cache for get operation', { 
        cache: this.name, 
        key,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.get(key);
    }
  }

  /**
   * Set value in cache with fallback
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    if (await this.isPrimaryHealthy()) {
      try {
        await this.primaryService.set(key, value, ttl);
        this.markRedisHealthy();
        
        // Also set in fallback for consistency during Redis recovery
        this.fallbackService.set(key, value, ttl);
      } catch (error) {
        this.handleRedisError('set', key, error);
        this.fallbackService.set(key, value, ttl);
      }
    } else {
      logger.debug('Using fallback cache for set operation', { 
        cache: this.name, 
        key,
        reason: 'Redis unhealthy'
      });
      this.fallbackService.set(key, value, ttl);
    }
  }

  /**
   * Delete value from cache with fallback
   */
  async delete(key: string): Promise<boolean> {
    let redisResult = false;
    let fallbackResult = false;

    if (await this.isPrimaryHealthy()) {
      try {
        redisResult = await this.primaryService.delete(key);
        this.markRedisHealthy();
      } catch (error) {
        this.handleRedisError('delete', key, error);
      }
    }

    // Always try to delete from fallback to maintain consistency
    fallbackResult = this.fallbackService.delete(key);

    return redisResult || fallbackResult;
  }

  /**
   * Check if key exists with fallback
   */
  async has(key: string): Promise<boolean> {
    if (await this.isPrimaryHealthy()) {
      try {
        const result = await this.primaryService.has(key);
        this.markRedisHealthy();
        return result;
      } catch (error) {
        this.handleRedisError('has', key, error);
        return this.fallbackService.has(key);
      }
    } else {
      logger.debug('Using fallback cache for has operation', { 
        cache: this.name, 
        key,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.has(key);
    }
  }

  /**
   * Clear all cache entries with fallback
   */
  async clear(): Promise<void> {
    const errors: Error[] = [];

    if (await this.isPrimaryHealthy()) {
      try {
        await this.primaryService.clear();
        this.markRedisHealthy();
      } catch (error) {
        this.handleRedisError('clear', 'all', error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Always clear fallback cache
    try {
      this.fallbackService.clear();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Only throw if fallback also failed (both services failed)
    if (errors.length > 1) {
      throw new Error(`Failed to clear cache: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * Get cache statistics with fallback
   */
  async getStats(): Promise<CacheStats> {
    if (await this.isPrimaryHealthy()) {
      try {
        const stats = await this.primaryService.getStats();
        this.markRedisHealthy();
        return stats;
      } catch (error) {
        this.handleRedisError('getStats', 'all', error);
        return this.fallbackService.getStats();
      }
    } else {
      logger.debug('Using fallback cache for getStats operation', { 
        cache: this.name,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.getStats();
    }
  }

  /**
   * Get cache metrics with fallback
   */
  getMetrics(): CacheMetrics {
    // Combine metrics from both services
    const primaryMetrics = this.primaryService.getMetrics();
    const fallbackMetrics = this.fallbackService.getMetrics();

    return {
      hits: primaryMetrics.hits + fallbackMetrics.hits,
      misses: primaryMetrics.misses + fallbackMetrics.misses,
      sets: primaryMetrics.sets + fallbackMetrics.sets,
      deletes: primaryMetrics.deletes + fallbackMetrics.deletes,
      evictions: primaryMetrics.evictions + fallbackMetrics.evictions,
      totalSize: Math.max(primaryMetrics.totalSize, fallbackMetrics.totalSize)
    };
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const metrics = this.getMetrics();
    const total = metrics.hits + metrics.misses;
    return total > 0 ? metrics.hits / total : 0;
  }

  /**
   * Clean up expired entries with fallback
   */
  async cleanupExpired(): Promise<number> {
    let totalCleaned = 0;

    if (await this.isPrimaryHealthy()) {
      try {
        totalCleaned += await this.primaryService.cleanupExpired();
        this.markRedisHealthy();
      } catch (error) {
        this.handleRedisError('cleanupExpired', 'all', error);
      }
    }

    // Always cleanup fallback cache
    totalCleaned += this.fallbackService.cleanupExpired();

    return totalCleaned;
  }

  /**
   * Get all keys with fallback
   */
  async keys(): Promise<string[]> {
    if (await this.isPrimaryHealthy()) {
      try {
        const keys = await this.primaryService.keys();
        this.markRedisHealthy();
        return keys;
      } catch (error) {
        this.handleRedisError('keys', 'all', error);
        return this.fallbackService.keys();
      }
    } else {
      logger.debug('Using fallback cache for keys operation', { 
        cache: this.name,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.keys();
    }
  }

  /**
   * Get cache size with fallback
   */
  async size(): Promise<number> {
    if (await this.isPrimaryHealthy()) {
      try {
        const size = await this.primaryService.size();
        this.markRedisHealthy();
        return size;
      } catch (error) {
        this.handleRedisError('size', 'all', error);
        return this.fallbackService.size();
      }
    } else {
      logger.debug('Using fallback cache for size operation', { 
        cache: this.name,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.size();
    }
  }

  /**
   * Set TTL for existing entry with fallback
   */
  async setTtl(key: string, ttl: number): Promise<boolean> {
    let redisResult = false;
    let fallbackResult = false;

    if (await this.isPrimaryHealthy()) {
      try {
        redisResult = await this.primaryService.setTtl(key, ttl);
        this.markRedisHealthy();
      } catch (error) {
        this.handleRedisError('setTtl', key, error);
      }
    }

    // Also try to set TTL in fallback
    fallbackResult = this.fallbackService.setTtl(key, ttl);

    return redisResult || fallbackResult;
  }

  /**
   * Get remaining TTL for entry with fallback
   */
  async getTtl(key: string): Promise<number | undefined> {
    if (await this.isPrimaryHealthy()) {
      try {
        const ttl = await this.primaryService.getTtl(key);
        this.markRedisHealthy();
        return ttl;
      } catch (error) {
        this.handleRedisError('getTtl', key, error);
        return this.fallbackService.getTtl(key);
      }
    } else {
      logger.debug('Using fallback cache for getTtl operation', { 
        cache: this.name, 
        key,
        reason: 'Redis unhealthy'
      });
      return this.fallbackService.getTtl(key);
    }
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.primaryService.resetMetrics();
    this.fallbackService.resetMetrics();
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    this.primaryService.stopPeriodicCleanup();
    this.fallbackService.stopPeriodicCleanup();
  }

  /**
   * Destroy cache and cleanup resources
   */
  async destroy(): Promise<void> {
    const errors: Error[] = [];

    try {
      await this.primaryService.destroy();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      this.fallbackService.destroy();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (errors.length > 0) {
      logger.warn('Some errors occurred during cache destruction', {
        cache: this.name,
        errors: errors.map(e => e.message)
      });
    }

    logger.info('Fallback cache destroyed', { cache: this.name });
  }

  /**
   * Get Redis health status
   */
  getRedisHealthStatus(): { isHealthy: boolean; lastCheck: number } {
    return {
      isHealthy: this.isRedisHealthy,
      lastCheck: this.lastHealthCheck
    };
  }

  /**
   * Force Redis health check
   */
  async forceHealthCheck(): Promise<boolean> {
    return await this.checkRedisHealth();
  }

  /**
   * Check if primary Redis service is healthy
   */
  private async isPrimaryHealthy(): Promise<boolean> {
    const now = Date.now();
    
    // Only check health periodically to avoid overhead
    if (now - this.lastHealthCheck > this.healthCheckInterval) {
      await this.checkRedisHealth();
    }
    
    return this.isRedisHealthy;
  }

  /**
   * Check Redis health by attempting a simple operation
   */
  private async checkRedisHealth(): Promise<boolean> {
    try {
      // Try a simple operation to check Redis health
      await this.primaryService.has('__health_check__');
      this.markRedisHealthy();
      return true;
    } catch (error) {
      this.markRedisUnhealthy();
      logger.debug('Redis health check failed', {
        cache: this.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Mark Redis as healthy
   */
  private markRedisHealthy(): void {
    if (!this.isRedisHealthy) {
      logger.info('Redis cache service recovered', { cache: this.name });
    }
    this.isRedisHealthy = true;
    this.lastHealthCheck = Date.now();
  }

  /**
   * Mark Redis as unhealthy
   */
  private markRedisUnhealthy(): void {
    if (this.isRedisHealthy) {
      logger.warn('Redis cache service marked as unhealthy, falling back to in-memory cache', { 
        cache: this.name 
      });
    }
    this.isRedisHealthy = false;
    this.lastHealthCheck = Date.now();
  }

  /**
   * Handle Redis errors and log appropriately
   */
  private handleRedisError(operation: string, key: string, error: any): void {
    this.markRedisUnhealthy();
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.warn('Redis cache operation failed, using fallback', {
      cache: this.name,
      operation,
      key,
      error: errorMessage
    });
  }
}