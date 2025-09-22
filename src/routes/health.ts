import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { novitaApiService } from '../services/novitaApiService';
import { serviceRegistry } from '../services/serviceRegistry';
import { instanceService } from '../services/instanceService';
import { metricsService } from '../services/metricsService';
import { HealthCheckResponse, EnhancedHealthCheckResponse } from '../types/api';
import { getServiceHealthStatus } from '../services/serviceInitializer';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] || `health_${Date.now()}`;

  try {
    logger.debug('Health check requested', { requestId });

    // Check service dependencies with detailed information
    const [services, dependencyDetails, migrationServiceDetails, failedMigrationServiceDetails, redisServiceDetails] = await Promise.all([
      checkServiceHealth(),
      checkDependencyDetails(),
      checkMigrationServiceDetails(),
      checkFailedMigrationServiceDetails(),
      checkRedisServiceDetails()
    ]);

    // Get performance metrics
    const healthMetrics = metricsService.getHealthMetrics();
    const systemMetrics = metricsService.getSystemMetrics();

    // Determine overall health status
    const isHealthy = Object.values(services).every(status => status === 'up') &&
      healthMetrics.memoryUsageMB < 1024 && // Less than 1GB memory usage
      (process.env.NODE_ENV === 'test' || healthMetrics.cpuUsagePercent < 90); // Skip CPU check in test

    const healthCheck: EnhancedHealthCheckResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services,
      uptime: process.uptime(),
      performance: {
        requestsPerMinute: Math.round(healthMetrics.requestsPerMinute * 100) / 100,
        averageResponseTime: Math.round(healthMetrics.averageResponseTime),
        errorRate: Math.round(healthMetrics.errorRate * 100) / 100,
        jobProcessingRate: Math.round(healthMetrics.jobProcessingRate * 100) / 100
      },
      system: {
        memory: {
          usedMB: Math.round(systemMetrics.memory.heapUsed / 1024 / 1024),
          totalMB: Math.round(systemMetrics.memory.heapTotal / 1024 / 1024),
          externalMB: Math.round(systemMetrics.memory.external / 1024 / 1024),
          rss: Math.round(systemMetrics.memory.rss / 1024 / 1024)
        },
        cpu: {
          usage: Math.round(systemMetrics.cpu.usage * 100) / 100,
          loadAverage: systemMetrics.cpu.loadAverage.map(load => Math.round(load * 100) / 100)
        }
      },
      dependencies: dependencyDetails,
      migrationService: migrationServiceDetails,
      failedMigrationService: failedMigrationServiceDetails,
      redis: redisServiceDetails
    };

    // Add additional debug information in development
    if (process.env.NODE_ENV === 'development') {
      (healthCheck as any).debug = {
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        cacheStats: instanceService.getCacheStats(),
        jobQueueStats: serviceRegistry.getJobQueueService()?.getStats() || {}
      };
    }

    logger.debug('Health check completed', {
      requestId,
      status: healthCheck.status,
      services: healthCheck.services,
      memoryUsageMB: healthCheck.system.memory.usedMB,
      cpuUsage: healthCheck.system.cpu.usage
    });

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Health check failed', {
      requestId,
      error: (error as Error).message
    });

    const errorHealthCheck: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        novitaApi: 'down',
        jobQueue: 'down',
        cache: 'down',
        migrationService: 'down',
        failedMigrationService: 'down',
        redis: 'down'
      },
      uptime: process.uptime()
    };

    res.status(503).json(errorHealthCheck);
  }
});

/**
 * Check the health of service dependencies
 */
async function checkServiceHealth(): Promise<HealthCheckResponse['services']> {
  const checks = await Promise.allSettled([
    checkNovitaApiHealth(),
    checkJobQueueHealth(),
    checkCacheHealth(),
    checkMigrationServiceHealth(),
    checkFailedMigrationServiceHealth(),
    checkRedisHealth()
  ]);

  return {
    novitaApi: checks[0].status === 'fulfilled' && checks[0].value ? 'up' : 'down',
    jobQueue: checks[1].status === 'fulfilled' && checks[1].value ? 'up' : 'down',
    cache: checks[2].status === 'fulfilled' && checks[2].value ? 'up' : 'down',
    migrationService: checks[3].status === 'fulfilled' && checks[3].value ? 'up' : 'down',
    failedMigrationService: checks[4].status === 'fulfilled' && checks[4].value ? 'up' : 'down',
    redis: checks[5].status === 'fulfilled' && checks[5].value ? 'up' : 'down'
  };
}

/**
 * Check detailed dependency information
 */
async function checkDependencyDetails(): Promise<Record<string, any>> {
  const [novitaCheck, jobQueueCheck, cacheCheck, redisCheck] = await Promise.allSettled([
    checkNovitaApiHealthDetailed(),
    checkJobQueueHealthDetailed(),
    checkCacheHealthDetailed(),
    checkRedisHealthDetailed()
  ]);

  return {
    novitaApi: novitaCheck.status === 'fulfilled' ? novitaCheck.value : {
      status: 'down',
      error: novitaCheck.reason?.message || 'Unknown error'
    },
    jobQueue: jobQueueCheck.status === 'fulfilled' ? jobQueueCheck.value : {
      status: 'down',
      error: jobQueueCheck.reason?.message || 'Unknown error'
    },
    cache: cacheCheck.status === 'fulfilled' ? cacheCheck.value : {
      status: 'down',
      error: cacheCheck.reason?.message || 'Unknown error'
    },
    redis: redisCheck.status === 'fulfilled' ? redisCheck.value : {
      status: 'down',
      error: redisCheck.reason?.message || 'Unknown error'
    }
  };
}

/**
 * Check Novita.ai API connectivity
 */
async function checkNovitaApiHealth(): Promise<boolean> {
  try {
    // Try to fetch products as a simple connectivity test
    // Use a timeout to avoid hanging the health check
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), 5000);
    });

    await Promise.race([
      novitaApiService.getProducts({ productName: 'test', region: 'CN-HK-01' }),
      timeoutPromise
    ]);

    return true;
  } catch (error) {
    logger.debug('Novita API health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Check job queue health
 */
async function checkJobQueueHealth(): Promise<boolean> {
  try {
    // Check if job queue service is responsive
    const jobQueueService = serviceRegistry.getJobQueueService();
    if (!jobQueueService) {
      return false;
    }
    const stats = jobQueueService.getStats();
    return typeof stats === 'object' && stats !== null;
  } catch (error) {
    logger.debug('Job queue health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Check cache health
 */
async function checkCacheHealth(): Promise<boolean> {
  try {
    // Check if instance service cache is accessible
    const stats = instanceService.getCacheStats();
    return typeof stats === 'object' && stats !== null;
  } catch (error) {
    logger.debug('Cache health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Detailed Novita.ai API health check
 */
async function checkNovitaApiHealthDetailed(): Promise<any> {
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), 5000);
    });

    await Promise.race([
      novitaApiService.getProducts({ productName: 'test', region: 'CN-HK-01' }),
      timeoutPromise
    ]);

    const responseTime = Date.now() - startTime;

    return {
      status: 'up',
      responseTime,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      status: 'down',
      responseTime,
      error: (error as Error).message,
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Detailed job queue health check
 */
async function checkJobQueueHealthDetailed(): Promise<any> {
  try {
    const jobQueueService = serviceRegistry.getJobQueueService();
    if (!jobQueueService) {
      return {
        status: 'down',
        error: 'Job queue service not available',
        lastChecked: new Date().toISOString()
      };
    }

    const stats = jobQueueService.getStats();

    return {
      status: 'up',
      queueSize: stats.pendingJobs || 0,
      processing: stats.processingJobs || 0,
      completed: stats.completedJobs || 0,
      failed: stats.failedJobs || 0,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'down',
      error: (error as Error).message,
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Detailed cache health check
 */
async function checkCacheHealthDetailed(): Promise<any> {
  try {
    const instanceStats = instanceService.getCacheStats();

    return {
      status: 'up',
      instanceCache: {
        size: instanceStats.instanceDetailsCache?.size || 0,
        hitRatio: Math.round((instanceStats.instanceDetailsCache?.hitRatio || 0) * 100)
      },
      instanceStatesCache: {
        size: instanceStats.instanceStatesCache?.size || 0,
        hitRatio: Math.round((instanceStats.instanceStatesCache?.hitRatio || 0) * 100)
      },
      totalStates: instanceStats.instanceStatesSize || 0,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'down',
      error: (error as Error).message,
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Check migration service health
 */
async function checkMigrationServiceHealth(): Promise<boolean> {
  try {
    const migrationScheduler = serviceRegistry.getMigrationScheduler();
    if (!migrationScheduler) {
      // Migration scheduler not registered
      return false;
    }

    return migrationScheduler.isHealthy();
  } catch (error) {
    logger.debug('Migration service health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Check detailed migration service information
 */
async function checkMigrationServiceDetails(): Promise<EnhancedHealthCheckResponse['migrationService']> {
  try {
    const migrationScheduler = serviceRegistry.getMigrationScheduler();

    if (!migrationScheduler) {
      // Migration scheduler not registered
      return {
        enabled: false,
        status: 'disabled',
        recentErrors: 0,
        totalExecutions: 0,
        uptime: 0
      };
    }

    const healthDetails = migrationScheduler.getHealthDetails();
    const status = healthDetails.status;

    const result: EnhancedHealthCheckResponse['migrationService'] = {
      enabled: status.isEnabled,
      status: healthDetails.healthy ? 'healthy' : 'unhealthy',
      recentErrors: status.failedExecutions,
      totalExecutions: status.totalExecutions,
      uptime: status.uptime
    };

    if (status.lastExecution) {
      result.lastExecution = status.lastExecution.toISOString();
    }

    if (status.nextExecution) {
      result.nextExecution = status.nextExecution.toISOString();
    }

    return result;
  } catch (error) {
    logger.debug('Migration service detailed health check failed', {
      error: (error as Error).message
    });

    return {
      enabled: false,
      status: 'unhealthy',
      recentErrors: 0,
      totalExecutions: 0,
      uptime: 0
    };
  }
}

/**
 * Check failed migration service health
 */
async function checkFailedMigrationServiceHealth(): Promise<boolean> {
  try {
    const failedMigrationScheduler = serviceRegistry.getFailedMigrationScheduler();
    if (!failedMigrationScheduler) {
      // Failed migration scheduler not registered
      return false;
    }

    return failedMigrationScheduler.isHealthy();
  } catch (error) {
    logger.debug('Failed migration service health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Check detailed failed migration service information
 */
async function checkFailedMigrationServiceDetails(): Promise<EnhancedHealthCheckResponse['failedMigrationService']> {
  try {
    const failedMigrationScheduler = serviceRegistry.getFailedMigrationScheduler();

    if (!failedMigrationScheduler) {
      // Failed migration scheduler not registered
      return {
        enabled: false,
        status: 'disabled',
        recentErrors: 0,
        totalExecutions: 0,
        uptime: 0
      };
    }

    const healthDetails = failedMigrationScheduler.getHealthDetails();
    const status = healthDetails.status;

    const result: EnhancedHealthCheckResponse['failedMigrationService'] = {
      enabled: status.isEnabled,
      status: healthDetails.healthy ? 'healthy' : 'unhealthy',
      recentErrors: status.failedExecutions,
      totalExecutions: status.totalExecutions,
      uptime: status.uptime
    };

    if (status.lastExecution) {
      result.lastExecution = status.lastExecution.toISOString();
    }

    if (status.nextExecution) {
      result.nextExecution = status.nextExecution.toISOString();
    }

    return result;
  } catch (error) {
    logger.debug('Failed migration service detailed health check failed', {
      error: (error as Error).message
    });

    return {
      enabled: false,
      status: 'unhealthy',
      recentErrors: 0,
      totalExecutions: 0,
      uptime: 0
    };
  }
}

/**
 * Check Redis service health
 */
async function checkRedisHealth(): Promise<boolean> {
  try {
    const redisClient = serviceRegistry.getRedisClient();
    if (!redisClient) {
      return false; // Redis not configured
    }

    return (redisClient as any).isHealthy?.() ?? false;
  } catch (error) {
    logger.debug('Redis health check failed', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Detailed Redis health check
 */
async function checkRedisHealthDetailed(): Promise<any> {
  const startTime = Date.now();

  try {
    const redisClient = serviceRegistry.getRedisClient();

    if (!redisClient) {
      return {
        status: 'not_configured',
        message: 'Redis client not initialized',
        lastChecked: new Date().toISOString()
      };
    }

    // Test Redis connectivity with ping
    const pingResult = await redisClient.ping();
    const responseTime = Date.now() - startTime;
    const connectionStats = (redisClient as any).getConnectionStats?.() ?? {};

    return {
      status: 'up',
      responseTime,
      pingResult,
      connectionStats,
      isHealthy: (redisClient as any).isHealthy?.() ?? false,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      status: 'down',
      responseTime,
      error: (error as Error).message,
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Check detailed Redis service information
 */
async function checkRedisServiceDetails(): Promise<any> {
  try {
    const serviceHealthStatus = getServiceHealthStatus();
    const cacheManager = serviceRegistry.getCacheManager();

    const result: any = {
      available: serviceHealthStatus.redis.available,
      healthy: serviceHealthStatus.redis.healthy,
      cacheManager: serviceHealthStatus.cacheManager
    };

    if (cacheManager) {
      result.cacheManagerConfig = cacheManager.getConfiguration();
      result.redisHealthStatus = cacheManager.getRedisHealthStatus();
    }

    return result;
  } catch (error) {
    return {
      available: false,
      healthy: false,
      error: (error as Error).message,
      lastChecked: new Date().toISOString()
    };
  }
}

export { router as healthRouter };