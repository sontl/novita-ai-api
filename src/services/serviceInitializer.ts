/**
 * Service initialization module for Redis-backed services
 * Handles startup configuration and service creation based on configuration
 */

import { Config } from '../config/config';
import { logger } from '../utils/logger';
import { serviceRegistry } from './serviceRegistry';
import { RedisCacheManager, createRedisCacheManager } from './redisCacheManager';
import { RedisClient, IRedisClient } from '../utils/redisClient';
import { RedisConnectionManager } from '../utils/redisConnectionManager';
import { RedisSerializer } from '../utils/redisSerializer';
import { JobQueueService } from './jobQueueService';

export interface ServiceInitializationResult {
  redisClient: IRedisClient | undefined;
  cacheManager: RedisCacheManager;
  jobQueueService: JobQueueService;
  redisHealthy: boolean;
}

/**
 * Initialize Redis client with connection validation
 */
async function initializeRedisClient(config: Config): Promise<IRedisClient | undefined> {
  try {
    logger.info('Initializing Redis client', {
      url: config.redis.url ? 'configured' : 'not configured',
      token: config.redis.token ? 'configured' : 'not configured',
      connectionTimeoutMs: config.redis.connectionTimeoutMs,
      commandTimeoutMs: config.redis.commandTimeoutMs,
      retryAttempts: config.redis.retryAttempts,
      keyPrefix: config.redis.keyPrefix
    });

    // Validate Redis configuration
    if (!config.redis.url || !config.redis.token) {
      throw new Error('Redis URL and token are required');
    }

    // Create Redis connection manager
    const connectionManager = new RedisConnectionManager({
      url: config.redis.url,
      token: config.redis.token,
      connectionTimeoutMs: config.redis.connectionTimeoutMs,
      commandTimeoutMs: config.redis.commandTimeoutMs,
      retryAttempts: config.redis.retryAttempts,
      retryDelayMs: config.redis.retryDelayMs,
    });

    // Create Redis client with serializer
    const redisClient = new RedisClient({
      url: config.redis.url,
      token: config.redis.token,
      connectionTimeoutMs: config.redis.connectionTimeoutMs,
      commandTimeoutMs: config.redis.commandTimeoutMs,
      retryAttempts: config.redis.retryAttempts,
      retryDelayMs: config.redis.retryDelayMs,
    }, new RedisSerializer());

    // Test Redis connection
    await redisClient.connect();
    const pingResult = await redisClient.ping();
    
    logger.info('Redis client initialized successfully', {
      pingResult,
      keyPrefix: config.redis.keyPrefix
    });

    return redisClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (config.redis.enableFallback) {
      logger.warn('Redis initialization failed, fallback enabled', {
        error: errorMessage,
        fallbackEnabled: config.redis.enableFallback
      });
      return undefined;
    } else {
      logger.error('Redis initialization failed, no fallback configured', {
        error: errorMessage
      });
      throw new Error(`Redis initialization failed: ${errorMessage}`);
    }
  }
}

/**
 * Initialize cache manager with Redis or fallback configuration
 */
function initializeCacheManager(config: Config, redisClient?: IRedisClient): RedisCacheManager {
  const cacheManagerOptions: {
    defaultBackend: 'fallback' | 'redis';
    enableFallback: boolean;
    redisClient?: IRedisClient;
  } = {
    defaultBackend: config.redis.enableFallback ? 'fallback' : 'redis',
    enableFallback: config.redis.enableFallback,
    ...(redisClient && { redisClient })
  };

  const cacheManager = new RedisCacheManager(cacheManagerOptions);

  logger.info('Cache manager initialized', {
    defaultBackend: cacheManagerOptions.defaultBackend,
    enableFallback: cacheManagerOptions.enableFallback,
    redisAvailable: !!redisClient
  });

  return cacheManager;
}

/**
 * Initialize job queue service (currently in-memory, Redis implementation pending)
 */
function initializeJobQueueService(config: Config, redisClient?: IRedisClient): JobQueueService {
  // For now, use the existing in-memory job queue service
  // TODO: Implement Redis-backed job queue service in task 4.2
  const jobQueueService = new JobQueueService(
    1000, // processingIntervalMs
    config.defaults.maxRetryAttempts * 60000 // maxRetryDelay
  );

  logger.info('Job queue service initialized', {
    type: 'in-memory', // Will be 'redis' when task 4.2 is implemented
    redisAvailable: !!redisClient,
    processingIntervalMs: 1000,
    maxRetryDelayMs: config.defaults.maxRetryAttempts * 60000
  });

  return jobQueueService;
}

/**
 * Validate Redis connection during startup
 */
async function validateRedisConnection(redisClient: IRedisClient): Promise<boolean> {
  try {
    const pingResult = await redisClient.ping();
    const isHealthy = (redisClient as any).isHealthy?.() ?? true;
    
    logger.info('Redis connection validation completed', {
      pingResult,
      isHealthy,
      connectionStats: (redisClient as any).getConnectionStats?.() ?? {}
    });

    return isHealthy;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Redis connection validation failed', {
      error: errorMessage
    });
    return false;
  }
}

/**
 * Initialize all Redis-backed services based on configuration
 */
export async function initializeServices(config: Config): Promise<ServiceInitializationResult> {
  logger.info('Starting service initialization', {
    redisEnabled: !!(config.redis.url && config.redis.token),
    fallbackEnabled: config.redis.enableFallback
  });

  let redisClient: IRedisClient | undefined;
  let redisHealthy = false;

  // Initialize Redis client if configured
  if (config.redis.url && config.redis.token) {
    try {
      redisClient = await initializeRedisClient(config);
      
      if (redisClient) {
        redisHealthy = await validateRedisConnection(redisClient);
        serviceRegistry.registerRedisClient(redisClient);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize Redis client', { error: errorMessage });
      
      if (!config.redis.enableFallback) {
        throw error;
      }
    }
  } else {
    logger.info('Redis not configured, using in-memory services only');
  }

  // Initialize cache manager
  const cacheManager = initializeCacheManager(config, redisClient);
  serviceRegistry.registerCacheManager(cacheManager);

  // Initialize job queue service
  const jobQueueService = initializeJobQueueService(config, redisClient);
  serviceRegistry.registerJobQueueService(jobQueueService);

  const result: ServiceInitializationResult = {
    redisClient,
    cacheManager,
    jobQueueService,
    redisHealthy
  };

  logger.info('Service initialization completed', {
    redisAvailable: !!redisClient,
    redisHealthy,
    cacheManagerType: cacheManager.getConfiguration().defaultBackend,
    jobQueueType: 'in-memory' // Will be dynamic when Redis job queue is implemented
  });

  return result;
}

/**
 * Graceful shutdown of all services
 */
export async function shutdownServices(timeoutMs: number = 30000): Promise<void> {
  logger.info('Starting service shutdown');

  const services = serviceRegistry.getAllServices();
  const shutdownPromises: Promise<void>[] = [];

  // Shutdown migration scheduler
  if (services.migrationScheduler) {
    shutdownPromises.push(
      services.migrationScheduler.shutdown(timeoutMs).catch(error => {
        logger.error('Migration scheduler shutdown failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  // Shutdown job queue service
  if (services.jobQueueService) {
    shutdownPromises.push(
      services.jobQueueService.shutdown(timeoutMs).catch(error => {
        logger.error('Job queue service shutdown failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  // Shutdown cache manager
  if (services.cacheManager) {
    shutdownPromises.push(
      services.cacheManager.destroyAll().catch(error => {
        logger.error('Cache manager shutdown failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  // Disconnect Redis client
  if (services.redisClient) {
    shutdownPromises.push(
      services.redisClient.disconnect().catch(error => {
        logger.error('Redis client disconnect failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  // Wait for all shutdowns to complete
  await Promise.allSettled(shutdownPromises);

  // Reset service registry
  serviceRegistry.reset();

  logger.info('Service shutdown completed');
}

/**
 * Get service health status for monitoring
 */
export function getServiceHealthStatus(): {
  redis: { available: boolean; healthy: boolean };
  cacheManager: { available: boolean; configuration: any };
  jobQueue: { available: boolean };
} {
  const services = serviceRegistry.getAllServices();

  return {
    redis: {
      available: !!services.redisClient,
      healthy: (services.redisClient as any)?.isHealthy?.() ?? false
    },
    cacheManager: {
      available: !!services.cacheManager,
      configuration: services.cacheManager?.getConfiguration() ?? null
    },
    jobQueue: {
      available: !!services.jobQueueService
    }
  };
}