import { Router, Request, Response } from 'express';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('cache-route');
import { cacheManager } from '../services/cacheService';
import { instanceService } from '../services/instanceService';
import { productService } from '../services/productService';
import { templateService } from '../services/templateService';
import { serviceRegistry } from '../services/serviceRegistry';

const router = Router();

/**
 * GET /api/cache/stats
 * Get comprehensive cache statistics for monitoring
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const allCacheStats = await cacheManager.getAllStats();
    const allCacheMetrics = cacheManager.getAllMetrics();
    
    // Get service-specific cache stats
    const instanceStats = await instanceService.getCacheStats();
    const productStats = await productService.getCacheStats();
    const templateStats = await templateService.getCacheStats();
    
    const response = {
      timestamp: new Date().toISOString(),
      cacheManager: {
        cacheNames: cacheManager.getCacheNames(),
        stats: allCacheStats,
        metrics: allCacheMetrics
      },
      services: {
        instance: instanceStats,
        product: productStats,
        template: templateStats
      },
      summary: {
        totalCaches: cacheManager.getCacheNames().length,
        totalEntries: Object.values(allCacheMetrics).reduce((sum, metrics) => sum + metrics.totalSize, 0),
        totalHits: Object.values(allCacheMetrics).reduce((sum, metrics) => sum + metrics.hits, 0),
        totalMisses: Object.values(allCacheMetrics).reduce((sum, metrics) => sum + metrics.misses, 0),
        overallHitRatio: (() => {
          const totalHits = Object.values(allCacheMetrics).reduce((sum, metrics) => sum + metrics.hits, 0);
          const totalMisses = Object.values(allCacheMetrics).reduce((sum, metrics) => sum + metrics.misses, 0);
          const total = totalHits + totalMisses;
          return total > 0 ? totalHits / total : 0;
        })()
      }
    };

    logger.debug('Cache statistics requested', {
      totalCaches: response.summary.totalCaches,
      totalEntries: response.summary.totalEntries,
      overallHitRatio: response.summary.overallHitRatio
    });

    res.json(response);
  } catch (error) {
    logger.error('Failed to get cache statistics', {
      error: (error as Error).message
    });
    res.status(500).json({
      error: {
        code: 'CACHE_STATS_ERROR',
        message: 'Failed to retrieve cache statistics',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear all caches or specific cache by name
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    const { cacheName } = req.body;

    if (cacheName && typeof cacheName === 'string') {
      // Clear specific cache
      const cache = await cacheManager.getCache(cacheName);
      await cache.clear();
      
      logger.info('Specific cache cleared', { cacheName });
      
      res.json({
        message: `Cache '${cacheName}' cleared successfully`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Clear all caches
      await cacheManager.clearAll();
      
      // Also clear service-specific caches
      await instanceService.clearCache();
      await productService.clearCache();
      await templateService.clearCache();
      
      logger.info('All caches cleared');
      
      res.json({
        message: 'All caches cleared successfully',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Failed to clear cache', {
      error: (error as Error).message,
      cacheName: req.body.cacheName
    });
    res.status(500).json({
      error: {
        code: 'CACHE_CLEAR_ERROR',
        message: 'Failed to clear cache',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/cache/cleanup
 * Clean up expired entries from all caches
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const totalCleaned = await cacheManager.cleanupAllExpired();
    
    // Also cleanup service-specific caches
    await instanceService.clearExpiredCache();
    await productService.clearExpiredCache();
    await templateService.clearExpiredCache();
    
    logger.info('Cache cleanup completed', { totalCleaned });
    
    res.json({
      message: 'Cache cleanup completed successfully',
      entriesRemoved: totalCleaned,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to cleanup cache', {
      error: (error as Error).message
    });
    res.status(500).json({
      error: {
        code: 'CACHE_CLEANUP_ERROR',
        message: 'Failed to cleanup cache',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/cache/hard-reset
 * Delete all data from Redis database (DANGEROUS OPERATION)
 */
router.post('/hard-reset', async (req: Request, res: Response) => {
  try {
    // Get the Redis client instance from the service registry
    const redisClient = serviceRegistry.getRedisClient();
    
    if (!redisClient) {
      return res.status(500).json({
        error: {
          code: 'REDIS_NOT_AVAILABLE',
          message: 'Redis client is not available',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Get the underlying Redis connection to execute flushall
    const client = (redisClient as any).connectionManager.getClient();
    
    // Flush all data from Redis
    await client.flushall();
    
    logger.warn('Hard reset executed - ALL Redis data deleted');
    
    return res.json({
      message: 'Hard reset completed successfully. All Redis data has been deleted.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Hard reset failed', {
      error: (error as Error).message
    });
    return res.status(500).json({
      error: {
        code: 'HARD_RESET_ERROR',
        message: 'Failed to execute hard reset',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/cache/:cacheName/stats
 * Get statistics for a specific cache
 */
router.get('/:cacheName/stats', async (req: Request, res: Response) => {
  try {
    const { cacheName } = req.params;
    
    if (!cacheName || typeof cacheName !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_CACHE_NAME',
          message: 'Cache name is required',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    const cache = await cacheManager.getCache(cacheName);
    const stats = await cache.getStats();
    const metrics = cache.getMetrics();
    
    const response = {
      cacheName,
      timestamp: new Date().toISOString(),
      size: await cache.size(),
      hitRatio: cache.getHitRatio(),
      stats,
      metrics
    };

    logger.debug('Specific cache statistics requested', { cacheName });

    return res.json(response);
  } catch (error) {
    logger.error('Failed to get specific cache statistics', {
      error: (error as Error).message,
      cacheName: req.params.cacheName
    });
    return res.status(500).json({
      error: {
        code: 'CACHE_STATS_ERROR',
        message: `Failed to retrieve statistics for cache '${req.params.cacheName}'`,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * DELETE /api/cache/:cacheName/:key
 * Delete specific key from cache
 */
router.delete('/:cacheName/:key', async (req: Request, res: Response) => {
  try {
    const { cacheName, key } = req.params;
    
    if (!cacheName || typeof cacheName !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_CACHE_NAME',
          message: 'Cache name is required',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_KEY',
          message: 'Key is required',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    const cache = await cacheManager.getCache(cacheName);
    const deleted = await cache.delete(key);
    
    if (deleted) {
      logger.debug('Cache key deleted', { cacheName, key });
      return res.json({
        message: `Key '${key}' deleted from cache '${cacheName}'`,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(404).json({
        error: {
          code: 'CACHE_KEY_NOT_FOUND',
          message: `Key '${key}' not found in cache '${cacheName}'`,
          timestamp: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    logger.error('Failed to delete cache key', {
      error: (error as Error).message,
      cacheName: req.params.cacheName,
      key: req.params.key
    });
    return res.status(500).json({
      error: {
        code: 'CACHE_DELETE_ERROR',
        message: 'Failed to delete cache key',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;