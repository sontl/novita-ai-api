import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { cacheManager } from '../services/cacheService';
import { instanceService } from '../services/instanceService';
import { productService } from '../services/productService';
import { templateService } from '../services/templateService';

const router = Router();

/**
 * GET /api/cache/stats
 * Get comprehensive cache statistics for monitoring
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const allCacheStats = cacheManager.getAllStats();
    const allCacheMetrics = cacheManager.getAllMetrics();
    
    // Get service-specific cache stats
    const instanceStats = instanceService.getCacheStats();
    const productStats = productService.getCacheStats();
    const templateStats = templateService.getCacheStats();
    
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
router.post('/clear', (req: Request, res: Response) => {
  try {
    const { cacheName } = req.body;

    if (cacheName && typeof cacheName === 'string') {
      // Clear specific cache
      const cache = cacheManager.getCache(cacheName);
      cache.clear();
      
      logger.info('Specific cache cleared', { cacheName });
      
      res.json({
        message: `Cache '${cacheName}' cleared successfully`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Clear all caches
      cacheManager.clearAll();
      
      // Also clear service-specific caches
      instanceService.clearCache();
      productService.clearCache();
      templateService.clearCache();
      
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
router.post('/cleanup', (req: Request, res: Response) => {
  try {
    const totalCleaned = cacheManager.cleanupAllExpired();
    
    // Also cleanup service-specific caches
    instanceService.clearExpiredCache();
    productService.clearExpiredCache();
    templateService.clearExpiredCache();
    
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
 * GET /api/cache/:cacheName/stats
 * Get statistics for a specific cache
 */
router.get('/:cacheName/stats', (req: Request, res: Response) => {
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
    
    const cache = cacheManager.getCache(cacheName);
    const stats = cache.getStats();
    const metrics = cache.getMetrics();
    
    const response = {
      cacheName,
      timestamp: new Date().toISOString(),
      size: cache.size(),
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
router.delete('/:cacheName/:key', (req: Request, res: Response) => {
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
    
    const cache = cacheManager.getCache(cacheName);
    const deleted = cache.delete(key);
    
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