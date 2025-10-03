import { Router, Request, Response } from 'express';
import { metricsService } from '../services/metricsService';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('metrics-route');

const router = Router();

/**
 * GET /metrics - Get comprehensive application metrics
 */
router.get('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] || `metrics_${Date.now()}`;
  
  try {
    logger.debug('Metrics requested', { requestId });

    const metrics = metricsService.getMetrics();
    
    logger.debug('Metrics retrieved successfully', { 
      requestId,
      requestCount: metrics.requests.total.count,
      jobCount: metrics.jobs.total.processed,
      memoryUsageMB: Math.round(metrics.system.memory.heapUsed / 1024 / 1024)
    });

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      data: metrics
    });

  } catch (error) {
    logger.error('Failed to retrieve metrics', {
      requestId,
      error: (error as Error).message
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: 'METRICS_RETRIEVAL_FAILED',
        message: 'Failed to retrieve application metrics',
        details: (error as Error).message
      }
    });
  }
});

/**
 * GET /metrics/summary - Get summarized metrics for monitoring
 */
router.get('/summary', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] || `metrics_summary_${Date.now()}`;
  
  try {
    logger.debug('Metrics summary requested', { requestId });

    const healthMetrics = metricsService.getHealthMetrics();
    const systemMetrics = metricsService.getSystemMetrics();
    
    const summary = {
      performance: {
        requestsPerMinute: Math.round(healthMetrics.requestsPerMinute * 100) / 100,
        averageResponseTimeMs: Math.round(healthMetrics.averageResponseTime),
        errorRatePercent: Math.round(healthMetrics.errorRate * 100) / 100
      },
      jobs: {
        processingRatePerMinute: Math.round(healthMetrics.jobProcessingRate * 100) / 100
      },
      system: {
        memoryUsageMB: healthMetrics.memoryUsageMB,
        cpuUsagePercent: Math.round(healthMetrics.cpuUsagePercent * 100) / 100,
        uptimeSeconds: Math.round(systemMetrics.uptime)
      },
      cache: {
        hitRatePercent: Math.round(metricsService.getMetrics().cache.hitRatio * 100) / 100,
        totalSize: metricsService.getMetrics().cache.totalSize
      }
    };

    logger.debug('Metrics summary retrieved', { 
      requestId,
      ...summary
    });

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      data: summary
    });

  } catch (error) {
    logger.error('Failed to retrieve metrics summary', {
      requestId,
      error: (error as Error).message
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: 'METRICS_SUMMARY_FAILED',
        message: 'Failed to retrieve metrics summary',
        details: (error as Error).message
      }
    });
  }
});

/**
 * GET /metrics/system - Get system-level metrics only
 */
router.get('/system', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] || `system_metrics_${Date.now()}`;
  
  try {
    logger.debug('System metrics requested', { requestId });

    const systemMetrics = metricsService.getSystemMetrics();
    
    logger.debug('System metrics retrieved', { 
      requestId,
      memoryUsageMB: Math.round(systemMetrics.memory.heapUsed / 1024 / 1024),
      cpuUsage: systemMetrics.cpu.usage
    });

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      data: systemMetrics
    });

  } catch (error) {
    logger.error('Failed to retrieve system metrics', {
      requestId,
      error: (error as Error).message
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: 'SYSTEM_METRICS_FAILED',
        message: 'Failed to retrieve system metrics',
        details: (error as Error).message
      }
    });
  }
});

/**
 * POST /metrics/reset - Reset all metrics (for testing/debugging)
 */
router.post('/reset', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] || `reset_metrics_${Date.now()}`;
  
  try {
    logger.info('Metrics reset requested', { requestId });

    metricsService.resetMetrics();
    
    logger.info('Metrics reset successfully', { requestId });

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      message: 'All metrics have been reset'
    });

  } catch (error) {
    logger.error('Failed to reset metrics', {
      requestId,
      error: (error as Error).message
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: 'METRICS_RESET_FAILED',
        message: 'Failed to reset metrics',
        details: (error as Error).message
      }
    });
  }
});

export { router as metricsRouter };