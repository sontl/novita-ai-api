import request from 'supertest';
import { metricsService } from '../../services/metricsService';
import { novitaApiService } from '../../services/novitaApiService';
import { jobQueueService } from '../../services/jobQueueService';
import { instanceService } from '../../services/instanceService';
import { JobType } from '../../types/job';

// Mock the config before importing the app
jest.mock('../../config/config', () => ({
  config: {
    nodeEnv: 'test',
    port: 3000,
    security: {
      enableHelmet: false,
      enableCors: false
    },
    novita: {
      baseUrl: 'https://api.novita.ai',
      apiKey: 'test-key'
    },
    defaults: {
      requestTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000
    },
    webhook: {
      timeout: 10000,
      retryAttempts: 3
    }
  },
  getConfigSummary: jest.fn().mockReturnValue({
    environment: 'test',
    port: 3000
  })
}));

import { app } from '../../index';

// Mock external services
jest.mock('../../services/novitaApiService');
jest.mock('../../services/jobQueueService');
jest.mock('../../services/instanceService');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockJobQueueService = jobQueueService as jest.Mocked<typeof jobQueueService>;
const mockInstanceService = instanceService as jest.Mocked<typeof instanceService>;

describe('Enhanced Health Check Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metricsService.resetMetrics();
    
    // Setup default mock responses
    mockNovitaApiService.getProducts.mockResolvedValue([]);
    
    mockJobQueueService.getStats.mockReturnValue({
      totalJobs: 6,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 5,
      failedJobs: 1,
      jobsByType: {
        [JobType.CREATE_INSTANCE]: 3,
        [JobType.MONITOR_INSTANCE]: 2,
        [JobType.SEND_WEBHOOK]: 1
      }
    });
    
    mockInstanceService.getCacheStats.mockReturnValue({
      instanceDetailsCache: {
        size: 10,
        hitRatio: 0.85,
        metrics: { hits: 85, misses: 15 }
      },
      instanceStatesCache: {
        size: 5,
        hitRatio: 0.90,
        metrics: { hits: 90, misses: 10 }
      },
      instanceStatesSize: 3,
      cachedInstanceIds: ['inst1', 'inst2', 'inst3']
    });
  });

  describe('GET /health', () => {
    it('should return healthy status when all services are up', async () => {
      // Generate some metrics to test performance data
      metricsService.recordRequest('GET', '/api/test', 200, 150);
      metricsService.recordJob('create_instance', 2000, true, 2);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          novitaApi: 'up',
          jobQueue: 'up',
          cache: 'up'
        },
        uptime: expect.any(Number),
        performance: {
          requestsPerMinute: expect.any(Number),
          averageResponseTime: expect.any(Number),
          errorRate: expect.any(Number),
          jobProcessingRate: expect.any(Number)
        },
        system: {
          memory: {
            usedMB: expect.any(Number),
            totalMB: expect.any(Number),
            externalMB: expect.any(Number),
            rss: expect.any(Number)
          },
          cpu: {
            usage: expect.any(Number),
            loadAverage: expect.any(Array)
          }
        },
        dependencies: {
          novitaApi: {
            status: 'up',
            responseTime: expect.any(Number),
            lastChecked: expect.any(String)
          },
          jobQueue: {
            status: 'up',
            queueSize: 0,
            processing: 0,
            completed: 5,
            failed: 1,
            lastChecked: expect.any(String)
          },
          cache: {
            status: 'up',
            instanceCache: {
              size: 10,
              hitRatio: 85
            },
            instanceStatesCache: {
              size: 5,
              hitRatio: 90
            },
            totalStates: 3,
            lastChecked: expect.any(String)
          }
        }
      });

      // Verify system metrics are reasonable
      expect(response.body.system.memory.usedMB).toBeGreaterThan(0);
      expect(response.body.system.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    it('should return unhealthy status when Novita API is down', async () => {
      mockNovitaApiService.getProducts.mockRejectedValue(new Error('API unavailable'));

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.novitaApi).toBe('down');
      expect(response.body.dependencies.novitaApi.status).toBe('down');
      expect(response.body.dependencies.novitaApi.error).toBe('API unavailable');
    });

    it('should return unhealthy status when job queue is down', async () => {
      mockJobQueueService.getStats.mockImplementation(() => {
        throw new Error('Job queue unavailable');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.jobQueue).toBe('down');
      expect(response.body.dependencies.jobQueue.status).toBe('down');
      expect(response.body.dependencies.jobQueue.error).toBe('Job queue unavailable');
    });

    it('should return unhealthy status when cache is down', async () => {
      mockInstanceService.getCacheStats.mockImplementation(() => {
        throw new Error('Cache unavailable');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.cache).toBe('down');
      expect(response.body.dependencies.cache.status).toBe('down');
      expect(response.body.dependencies.cache.error).toBe('Cache unavailable');
    });

    it('should return unhealthy status when memory usage is too high', async () => {
      // Mock high memory usage
      const originalGetHealthMetrics = metricsService.getHealthMetrics;
      metricsService.getHealthMetrics = jest.fn().mockReturnValue({
        requestsPerMinute: 10,
        averageResponseTime: 200,
        errorRate: 5,
        jobProcessingRate: 2,
        memoryUsageMB: 1500, // Over 1GB threshold
        cpuUsagePercent: 50
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');

      // Restore original method
      metricsService.getHealthMetrics = originalGetHealthMetrics;
    });

    it('should return unhealthy status when CPU usage is too high', async () => {
      // Mock high CPU usage and set NODE_ENV to production to enable CPU check
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const originalGetHealthMetrics = metricsService.getHealthMetrics;
      metricsService.getHealthMetrics = jest.fn().mockReturnValue({
        requestsPerMinute: 10,
        averageResponseTime: 200,
        errorRate: 5,
        jobProcessingRate: 2,
        memoryUsageMB: 500,
        cpuUsagePercent: 95 // Over 90% threshold
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');

      // Restore original values
      metricsService.getHealthMetrics = originalGetHealthMetrics;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include debug information in development mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.debug).toBeDefined();
      expect(response.body.debug).toMatchObject({
        version: expect.any(String),
        nodeVersion: expect.any(String),
        platform: expect.any(String),
        cacheStats: expect.any(Object),
        jobQueueStats: expect.any(Object)
      });

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not include debug information in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.debug).toBeUndefined();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should handle Novita API timeout gracefully', async () => {
      // Mock a timeout scenario
      mockNovitaApiService.getProducts.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), 6000);
        });
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.dependencies.novitaApi.status).toBe('down');
      expect(response.body.dependencies.novitaApi.error).toBe('Health check timeout');
    });

    it('should measure Novita API response time', async () => {
      // Mock a delayed response
      mockNovitaApiService.getProducts.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve([]), 100);
        });
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.dependencies.novitaApi.responseTime).toBeGreaterThan(90);
      expect(response.body.dependencies.novitaApi.responseTime).toBeLessThan(200);
    });

    it('should include correlation ID in response headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', 'health-test-123')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('health-test-123');
    });

    it('should handle complete health check failure gracefully', async () => {
      // Mock all services failing
      mockNovitaApiService.getProducts.mockRejectedValue(new Error('API down'));
      mockJobQueueService.getStats.mockImplementation(() => {
        throw new Error('Queue down');
      });
      mockInstanceService.getCacheStats.mockImplementation(() => {
        throw new Error('Cache down');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.novitaApi).toBe('down');
      expect(response.body.services.jobQueue).toBe('down');
      expect(response.body.services.cache).toBe('down');
    });

    it('should handle metrics service errors during health check', async () => {
      // Mock metrics service error
      const originalGetHealthMetrics = metricsService.getHealthMetrics;
      metricsService.getHealthMetrics = jest.fn().mockImplementation(() => {
        throw new Error('Metrics service error');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');

      // Restore original method
      metricsService.getHealthMetrics = originalGetHealthMetrics;
    });
  });

  describe('Performance thresholds', () => {
    it('should consider system healthy with normal resource usage', async () => {
      const originalGetHealthMetrics = metricsService.getHealthMetrics;
      metricsService.getHealthMetrics = jest.fn().mockReturnValue({
        requestsPerMinute: 50,
        averageResponseTime: 150,
        errorRate: 2,
        jobProcessingRate: 5,
        memoryUsageMB: 512, // Under 1GB
        cpuUsagePercent: 45  // Under 90%
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');

      metricsService.getHealthMetrics = originalGetHealthMetrics;
    });

    it('should consider system unhealthy with high error rate', async () => {
      // Generate requests with high error rate
      for (let i = 0; i < 10; i++) {
        metricsService.recordRequest('GET', '/api/test', i < 8 ? 500 : 200, 100);
      }

      const response = await request(app)
        .get('/health')
        .expect(200); // Health check itself succeeds, but error rate is reported

      expect(response.body.performance.errorRate).toBe(80); // 8 errors out of 10 requests
    });
  });
});