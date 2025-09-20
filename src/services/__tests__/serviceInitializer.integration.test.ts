/**
 * Integration tests for service initialization with Redis configuration
 */

import { initializeServices, shutdownServices, getServiceHealthStatus } from '../serviceInitializer';
import { serviceRegistry } from '../serviceRegistry';
import { Config } from '../../config/config';
import { logger } from '../../utils/logger';

// Mock Redis client for testing
jest.mock('../../utils/redisClient', () => ({
  RedisClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    isHealthy: jest.fn().mockReturnValue(true),
    getConnectionStats: jest.fn().mockReturnValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../../utils/redisConnectionManager', () => ({
  RedisConnectionManager: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockReturnValue(true),
    getClient: jest.fn().mockReturnValue({})
  }))
}));

jest.mock('../../utils/redisSerializer', () => ({
  RedisSerializer: jest.fn().mockImplementation(() => ({
    serialize: jest.fn().mockImplementation((value) => JSON.stringify(value)),
    deserialize: jest.fn().mockImplementation((value) => JSON.parse(value))
  }))
}));

describe('Service Initializer Integration Tests', () => {
  let testConfig: Config;

  beforeEach(() => {
    // Reset service registry before each test
    serviceRegistry.reset();

    // Create test configuration (mutable for testing)
    testConfig = {
      nodeEnv: 'test',
      port: 3000,
      logLevel: 'error',
      novita: {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.novita.ai',
      },
      webhook: {},
      defaults: {
        region: 'CN-HK-01',
        pollInterval: 30,
        maxRetryAttempts: 3,
        requestTimeout: 30000,
        webhookTimeout: 10000,
        cacheTimeout: 300,
        maxConcurrentJobs: 10,
      },
      security: {
        enableCors: true,
        enableHelmet: true,
        rateLimitWindowMs: 900000,
        rateLimitMaxRequests: 100,
      },
      instanceListing: {
        enableComprehensiveListing: true,
        defaultIncludeNovitaOnly: true,
        defaultSyncLocalState: false,
        comprehensiveCacheTtl: 30,
        novitaApiCacheTtl: 60,
        enableFallbackToLocal: true,
        novitaApiTimeout: 15000,
      },
      healthCheck: {
        defaultTimeoutMs: 10000,
        defaultRetryAttempts: 3,
        defaultRetryDelayMs: 2000,
        defaultMaxWaitTimeMs: 300000,
      },
      migration: {
        enabled: true,
        scheduleIntervalMs: 15 * 60 * 1000,
        jobTimeoutMs: 600000,
        maxConcurrentMigrations: 5,
        dryRunMode: false,
        retryFailedMigrations: true,
        logLevel: 'info',
      },
      instanceStartup: {
        defaultMaxWaitTime: 600000,
        defaultHealthCheckConfig: {
          timeoutMs: 10000,
          retryAttempts: 3,
          retryDelayMs: 2000,
          maxWaitTimeMs: 300000,
        },
        enableNameBasedLookup: true,
        operationTimeoutMs: 900000,
      },
      redis: {
        url: 'https://test-redis.upstash.io',
        token: 'test-redis-token',
        connectionTimeoutMs: 10000,
        commandTimeoutMs: 5000,
        retryAttempts: 3,
        retryDelayMs: 1000,
        keyPrefix: 'novita_api_test',
        enableFallback: true,
      },
    };
  });

  afterEach(async () => {
    // Clean up services after each test
    await shutdownServices(5000);
    serviceRegistry.reset();
  });

  describe('Redis Configuration Tests', () => {
    it('should initialize services with Redis configuration', async () => {
      const result = await initializeServices(testConfig);

      expect(result).toBeDefined();
      expect(result.cacheManager).toBeDefined();
      expect(result.jobQueueService).toBeDefined();
      expect(result.redisClient).toBeDefined();

      // Verify services are registered
      expect(serviceRegistry.getCacheManager()).toBe(result.cacheManager);
      expect(serviceRegistry.getJobQueueService()).toBe(result.jobQueueService);
      expect(serviceRegistry.getRedisClient()).toBe(result.redisClient);
    });

    it('should initialize services with fallback when Redis fails', async () => {
      // Mock Redis initialization failure
      const mockRedisClient = require('../../utils/redisClient');
      mockRedisClient.RedisClient.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      const result = await initializeServices(testConfig);

      expect(result).toBeDefined();
      expect(result.cacheManager).toBeDefined();
      expect(result.jobQueueService).toBeDefined();
      expect(result.redisClient).toBeUndefined();
      expect(result.redisHealthy).toBe(false);

      // Verify cache manager is configured for fallback
      const cacheManagerConfig = result.cacheManager.getConfiguration();
      expect(cacheManagerConfig.enableFallback).toBe(true);
    });

    it('should fail initialization when Redis is required but unavailable', async () => {
      // Disable fallback
      const configWithoutFallback = {
        ...testConfig,
        redis: {
          ...testConfig.redis,
          enableFallback: false
        }
      };

      // Mock Redis initialization failure
      const mockRedisClient = require('../../utils/redisClient');
      mockRedisClient.RedisClient.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      await expect(initializeServices(configWithoutFallback)).rejects.toThrow('Redis initialization failed');
    });

    it('should initialize services without Redis when not configured', async () => {
      // Remove Redis configuration
      const configWithoutRedis = {
        ...testConfig,
        redis: {
          ...testConfig.redis,
          url: '',
          token: ''
        }
      };

      const result = await initializeServices(configWithoutRedis);

      expect(result).toBeDefined();
      expect(result.cacheManager).toBeDefined();
      expect(result.jobQueueService).toBeDefined();
      expect(result.redisClient).toBeUndefined();
      expect(result.redisHealthy).toBe(false);
    });
  });

  describe('Service Registry Integration', () => {
    it('should register all services in the service registry', async () => {
      const result = await initializeServices(testConfig);

      expect(serviceRegistry.getCacheManager()).toBe(result.cacheManager);
      expect(serviceRegistry.getJobQueueService()).toBe(result.jobQueueService);
      expect(serviceRegistry.getRedisClient()).toBe(result.redisClient);
    });

    it('should provide service health status', async () => {
      await initializeServices(testConfig);

      const healthStatus = getServiceHealthStatus();

      expect(healthStatus).toBeDefined();
      expect(healthStatus.redis).toBeDefined();
      expect(healthStatus.cacheManager).toBeDefined();
      expect(healthStatus.jobQueue).toBeDefined();

      expect(typeof healthStatus.redis.available).toBe('boolean');
      expect(typeof healthStatus.redis.healthy).toBe('boolean');
      expect(typeof healthStatus.cacheManager.available).toBe('boolean');
      expect(typeof healthStatus.jobQueue.available).toBe('boolean');
    });
  });

  describe('Service Shutdown', () => {
    it('should gracefully shutdown all services', async () => {
      const result = await initializeServices(testConfig);

      // Mock shutdown methods
      const mockCacheManagerDestroy = jest.spyOn(result.cacheManager, 'destroyAll').mockResolvedValue();
      const mockJobQueueShutdown = jest.spyOn(result.jobQueueService, 'shutdown').mockResolvedValue();
      const mockRedisDisconnect = result.redisClient ? jest.spyOn(result.redisClient, 'disconnect').mockResolvedValue() : null;

      await shutdownServices(5000);

      expect(mockCacheManagerDestroy).toHaveBeenCalled();
      expect(mockJobQueueShutdown).toHaveBeenCalled();
      if (mockRedisDisconnect) {
        expect(mockRedisDisconnect).toHaveBeenCalled();
      }

      // Verify service registry is reset
      expect(serviceRegistry.getCacheManager()).toBeUndefined();
      expect(serviceRegistry.getJobQueueService()).toBeUndefined();
      expect(serviceRegistry.getRedisClient()).toBeUndefined();
    });

    it('should handle shutdown errors gracefully', async () => {
      const result = await initializeServices(testConfig);

      // Mock shutdown methods to throw errors
      jest.spyOn(result.cacheManager, 'destroyAll').mockRejectedValue(new Error('Cache shutdown failed'));
      jest.spyOn(result.jobQueueService, 'shutdown').mockRejectedValue(new Error('Job queue shutdown failed'));
      if (result.redisClient) {
        jest.spyOn(result.redisClient, 'disconnect').mockRejectedValue(new Error('Redis disconnect failed'));
      }

      // Should not throw despite errors
      await expect(shutdownServices(5000)).resolves.toBeUndefined();

      // Verify service registry is still reset
      expect(serviceRegistry.getCacheManager()).toBeUndefined();
      expect(serviceRegistry.getJobQueueService()).toBeUndefined();
      expect(serviceRegistry.getRedisClient()).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate Redis connection during startup', async () => {
      // Mock successful Redis connection
      const mockRedisClient = require('../../utils/redisClient');
      const mockPing = jest.fn().mockResolvedValue('PONG');
      const mockIsHealthy = jest.fn().mockReturnValue(true);
      const mockGetConnectionStats = jest.fn().mockReturnValue({ connected: true });

      mockRedisClient.RedisClient.mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        ping: mockPing,
        isHealthy: mockIsHealthy,
        getConnectionStats: mockGetConnectionStats,
        disconnect: jest.fn().mockResolvedValue(undefined)
      }));

      const result = await initializeServices(testConfig);

      expect(result.redisHealthy).toBe(true);
      expect(mockPing).toHaveBeenCalled();
      expect(mockIsHealthy).toHaveBeenCalled();
    });

    it('should handle Redis connection validation failure', async () => {
      // Mock Redis connection that fails validation
      const mockRedisClient = require('../../utils/redisClient');
      const mockPing = jest.fn().mockRejectedValue(new Error('Ping failed'));
      const mockIsHealthy = jest.fn().mockReturnValue(false);

      mockRedisClient.RedisClient.mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        ping: mockPing,
        isHealthy: mockIsHealthy,
        getConnectionStats: jest.fn().mockReturnValue({ connected: false }),
        disconnect: jest.fn().mockResolvedValue(undefined)
      }));

      const result = await initializeServices(testConfig);

      expect(result.redisHealthy).toBe(false);
      expect(mockPing).toHaveBeenCalled();
    });
  });

  describe('Cache Manager Configuration', () => {
    it('should configure cache manager with Redis backend when available', async () => {
      const result = await initializeServices(testConfig);

      const cacheManagerConfig = result.cacheManager.getConfiguration();
      expect(cacheManagerConfig.defaultBackend).toBe('fallback');
      expect(cacheManagerConfig.enableFallback).toBe(true);
    });

    it('should configure cache manager with memory backend when Redis unavailable', async () => {
      // Remove Redis configuration
      const configWithoutRedis = {
        ...testConfig,
        redis: {
          ...testConfig.redis,
          url: '',
          token: ''
        }
      };

      const result = await initializeServices(configWithoutRedis);

      const cacheManagerConfig = result.cacheManager.getConfiguration();
      expect(cacheManagerConfig.enableFallback).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should log appropriate messages during initialization', async () => {
      const loggerSpy = jest.spyOn(logger, 'info');

      await initializeServices(testConfig);

      expect(loggerSpy).toHaveBeenCalledWith('Starting service initialization', expect.any(Object));
      expect(loggerSpy).toHaveBeenCalledWith('Service initialization completed', expect.any(Object));
    });

    it('should log errors when Redis initialization fails', async () => {
      const loggerSpy = jest.spyOn(logger, 'warn');

      // Mock Redis initialization failure
      const mockRedisClient = require('../../utils/redisClient');
      mockRedisClient.RedisClient.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      await initializeServices(testConfig);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Redis initialization failed, fallback enabled',
        expect.objectContaining({
          error: 'Redis connection failed',
          fallbackEnabled: true
        })
      );
    });
  });
});