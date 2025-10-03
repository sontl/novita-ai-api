/**
 * Service initialization module for Redis-backed services
 * Handles startup configuration and service creation based on configuration
 */

import { Config } from '../config/config';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('service-initializer');
import { serviceRegistry } from './serviceRegistry';
import { RedisCacheManager, createRedisCacheManager } from './redisCacheManager';
import { RedisClient, IRedisClient } from '../utils/redisClient';
import { RedisConnectionManager } from '../utils/redisConnectionManager';
import { RedisSerializer } from '../utils/redisSerializer';
import { RedisJobQueueService } from './redisJobQueueService';
import { StartupSyncService } from './startupSyncService';
import { NovitaApiService } from './novitaApiService';
import { RedisCacheService } from './redisCacheService';
import { InstanceResponse } from '../types/api';

export interface ServiceInitializationResult {
  redisClient: IRedisClient | undefined;
  cacheManager: RedisCacheManager;
  jobQueueService: RedisJobQueueService;
  redisHealthy: boolean;
  syncResult?: {
    novitaInstances: number;
    redisInstances: number;
    synchronized: number;
    deleted: number;
    errors: string[];
  } | undefined;
}

/**
 * Initialize Redis client with connection validation
 */
async function initializeRedisClient(config: Config): Promise<IRedisClient | undefined> {
  try {
    logger.info('Initializing Redis client', {
      host: config.redis.host,
      port: config.redis.port,
      username: config.redis.username ? 'configured' : 'not configured',
      password: config.redis.password ? 'configured' : 'not configured',
      connectionTimeoutMs: config.redis.connectionTimeoutMs,
      commandTimeoutMs: config.redis.commandTimeoutMs,
      retryAttempts: config.redis.retryAttempts,
      keyPrefix: config.redis.keyPrefix
    });

    // Validate Redis configuration
    if (!config.redis.url || !config.redis.host || !config.redis.password) {
      throw new Error('Redis URL, host, and password are required');
    }

    // Create Redis connection manager
    const connectionManager = new RedisConnectionManager({
      url: config.redis.url,
      host: config.redis.host,
      port: config.redis.port,
      username: config.redis.username,
      password: config.redis.password,
      connectionTimeoutMs: config.redis.connectionTimeoutMs,
      commandTimeoutMs: config.redis.commandTimeoutMs,
      retryAttempts: config.redis.retryAttempts,
      retryDelayMs: config.redis.retryDelayMs,
    });

    // Create Redis client with serializer
    const redisClient = new RedisClient({
      url: config.redis.url,
      host: config.redis.host,
      port: config.redis.port,
      username: config.redis.username,
      password: config.redis.password,
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

    logger.error('Redis initialization failed, no fallback configured', {
      error: errorMessage
    });
    throw new Error(`Redis initialization failed: ${errorMessage}`);
  }
}

/**
 * Initialize Redis-only cache manager
 */
function initializeCacheManager(config: Config, redisClient: IRedisClient): RedisCacheManager {
  if (!redisClient) {
    throw new Error('Redis client is required for cache manager');
  }

  const cacheManagerOptions = {
    defaultBackend: 'redis' as const,
    enableFallback: config.instanceListing.enableFallbackToLocal, // Use correct property
    redisClient
  };

  const cacheManager = new RedisCacheManager(cacheManagerOptions);

  logger.info('Redis-only cache manager initialized', {
    defaultBackend: cacheManagerOptions.defaultBackend,
    enableFallback: cacheManagerOptions.enableFallback,
    redisAvailable: !!redisClient
  });

  return cacheManager;
}

/**
 * Initialize Redis-backed job queue service
 */
function initializeJobQueueService(config: Config, redisClient: IRedisClient): RedisJobQueueService {
  if (!redisClient) {
    throw new Error('Redis client is required for job queue service');
  }

  // Create Redis job queue service
  const jobQueueService = new RedisJobQueueService(
    redisClient,
    1000, // processingIntervalMs
    config.defaults.maxRetryAttempts * 60000, // maxRetryDelay
    {
      cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
      // maxJobAge property removed as it doesn't exist in RedisJobQueueOptions
    }
  );

  logger.info('Redis job queue service initialized', {
    type: 'redis',
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
    redisEnabled: !!(config.redis.url && config.redis.host && config.redis.password),
    fallbackEnabled: config.instanceListing.enableFallbackToLocal // Use correct property
  });

  let redisClient: IRedisClient | undefined;
  let redisHealthy = false;

  // Initialize Redis client if configured
  if (config.redis.url && config.redis.host && config.redis.password) {
    try {
      redisClient = await initializeRedisClient(config);

      if (redisClient) {
        redisHealthy = await validateRedisConnection(redisClient);
        serviceRegistry.registerRedisClient(redisClient);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize Redis client', { error: errorMessage });
      throw error;
    }
  } else {
    logger.info('Redis not configured, using in-memory services only');
  }

  // Initialize cache manager (requires Redis)
  if (!redisClient || !redisHealthy) {
    throw new Error('Redis client is required and must be healthy for cache manager');
  }
  const cacheManager = initializeCacheManager(config, redisClient);
  serviceRegistry.registerCacheManager(cacheManager);

  // Initialize job queue service (requires Redis)
  if (!redisClient || !redisHealthy) {
    throw new Error('Redis client is required and must be healthy for job queue service');
  }
  const jobQueueService = initializeJobQueueService(config, redisClient);
  serviceRegistry.registerJobQueueService(jobQueueService);

  // Perform startup synchronization if Redis is available
  let syncResult;
  if (redisClient && redisHealthy) {
    try {
      logger.info('Starting instance synchronization with Novita.ai');

      // Create instance cache service
      const instanceCache = new RedisCacheService<InstanceResponse>(
        'instances',
        redisClient,
        {
          maxSize: 10000,
          defaultTtl: 30 * 60 * 1000, // 30 minutes
          cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
        }
      );

      // Create Novita API service
      const novitaApiService = new NovitaApiService();

      // Create and run startup sync service
      const startupSyncService = new StartupSyncService(
        novitaApiService,
        redisClient,
        instanceCache
      );

      syncResult = await startupSyncService.synchronizeInstances();

      logger.info('Startup synchronization completed', {
        novitaInstances: syncResult.novitaInstances,
        redisInstances: syncResult.redisInstances,
        synchronized: syncResult.synchronized,
        deleted: syncResult.deleted,
        errors: syncResult.errors.length
      });

      // Register the instance cache in service registry for later use
      serviceRegistry.registerInstanceCache(instanceCache);

    } catch (error) {
      logger.error('Startup synchronization failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail the entire startup for sync issues
      syncResult = {
        novitaInstances: 0,
        redisInstances: 0,
        synchronized: 0,
        deleted: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  } else {
    logger.warn('Skipping startup synchronization - Redis not available or unhealthy');
  }

  const result: ServiceInitializationResult = {
    redisClient,
    cacheManager,
    jobQueueService,
    redisHealthy,
    syncResult
  };

  logger.info('Service initialization completed', {
    redisAvailable: !!redisClient,
    redisHealthy,
    cacheManagerType: 'redis',
    jobQueueType: 'redis',
    syncCompleted: !!syncResult
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

  // Shutdown failed migration scheduler
  if (services.failedMigrationScheduler) {
    shutdownPromises.push(
      services.failedMigrationScheduler.shutdown(timeoutMs).catch(error => {
        logger.error('Failed migration scheduler shutdown failed', {
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