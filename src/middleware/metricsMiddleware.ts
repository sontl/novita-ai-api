import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../services/metricsService';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('metrics-middleware');

interface MetricsRequest extends Request {
  startTime?: number;
  requestId?: string;
}

/**
 * Middleware to collect request metrics
 */
export const metricsMiddleware = (
  req: MetricsRequest,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  req.startTime = startTime;

  // Capture response finish to record metrics
  res.on('finish', () => {
    try {
      const duration = Date.now() - startTime;
      const method = req.method;
      const endpoint = normalizeEndpoint(req.route?.path || req.path);
      const statusCode = res.statusCode;

      // Record the request metric
      metricsService.recordRequest(method, endpoint, statusCode, duration);

      // Log performance warning for slow requests
      if (duration > 5000) {
        logger.warn('Slow request detected', {
          method,
          endpoint,
          duration,
          statusCode,
          requestId: req.requestId,
          category: 'performance'
        });
      }
    } catch (error) {
      logger.error('Error recording request metrics', {
        error: (error as Error).message,
        requestId: req.requestId,
        category: 'metrics-error'
      });
    }
  });

  next();
};

/**
 * Normalize endpoint paths to group similar routes
 * e.g., /api/instances/123 -> /api/instances/:id
 */
function normalizeEndpoint(path: string): string {
  if (!path) return 'unknown';

  // Replace UUIDs and numeric IDs with parameter placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id'); // Long alphanumeric strings
}

/**
 * Middleware to track cache metrics
 */
export const cacheMetricsMiddleware = {
  recordHit: () => {
    metricsService.recordCacheHit();
  },
  
  recordMiss: () => {
    metricsService.recordCacheMiss();
  },
  
  updateSize: (size: number) => {
    metricsService.updateCacheSize(size);
  }
};

/**
 * Job metrics recording helper
 */
export const recordJobMetrics = (
  jobType: string,
  processingTime: number,
  success: boolean,
  queueSize: number
): void => {
  try {
    metricsService.recordJob(jobType, processingTime, success, queueSize);
  } catch (error) {
    logger.error('Error recording job metrics', {
      error: (error as Error).message,
      jobType,
      category: 'metrics-error'
    });
  }
};