/**
 * Cache service module - Redis-only implementation
 * 
 * This module provides the main cache manager instance for the application.
 * All caching is now backed by Redis for persistence and scalability.
 */

import { createRedisCacheManager } from './redisCacheManager';

// Export types from Redis cache manager
export type { 
  ICacheService, 
  CacheManagerOptions,
  CacheMetrics,
  CacheStats 
} from './redisCacheManager';

export type { CacheServiceOptions } from './redisCacheService';

// Create and export singleton Redis cache manager instance
export const cacheManager = createRedisCacheManager();

// Export the class for direct instantiation if needed
export { RedisCacheManager } from './redisCacheManager';