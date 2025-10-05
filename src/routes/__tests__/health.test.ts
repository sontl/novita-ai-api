import request from 'supertest';
import { metricsService } from '../../services/metricsService';
import { novitaApiService } from '../../services/novitaApiService';
import { serviceRegistry } from '../../services/serviceRegistry';
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
jest.mock('../../services/serviceRegistry');
jest.mock('../../services/instanceService');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockServiceRegistry = serviceRegistry as jest.Mocked<typeof serviceRegistry>;
const mockInstanceService = instanceService as jest.Mocked<typeof instanceService>;

describe('Enhanced Health Check Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metricsService.resetMetrics();
    
    // Setup default mock responses
    mockNovitaApiService.getProducts.mockResolvedValue([]);
    
    const mockJobQueueService = {
      getStats: jest.fn().mockResolvedValue({
        totalJobs: 6,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 5,
        failedJobs: 1,
        jobsByType: {
          [JobType.CREATE_INSTANCE]: 3,
          [JobType.MONITOR_INSTANCE]: 2,
          [JobType.SEND_WEBHOOK]: 1,
          [JobType.MIGRATE_SPOT_INSTANCES]: 0
        }
      })
    };
    
    const mockCacheManager = {
      getAllStats: jest.fn().mockResolvedValue({}),
      getCacheNames: jest.fn().mockReturnValue(['test-cache'])
    };
    
    mockServiceRegistry.getJobQueueService.mockReturnValue(mockJobQueueService as any);
    mockServiceRegistry.getCacheManager.mockReturnValue(mockCacheManager as any);
    mockServiceRegistry.getMigrationScheduler.mockReturnValue(undefined);
    mockServiceRegistry.getFailedMigrationScheduler.mockReturnValue(undefined);
    mockServiceRegistry.getRedisClient.mockReturnValue(undefined);
    mockServiceRegistry.getInstanceCache.mockReturnValue(undefined);
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
        uptime: expect.any(Number)
      });
    });

    it('should return unhealthy status when Novita API is down', async () => {
      mockNovitaApiService.getProducts.mockRejectedValue(new Error('API unavailable'));

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.novitaApi).toBe('down');
    });

    it('should return unhealthy status when job queue is down', async () => {
      const mockJobQueueService = {
        getStats: jest.fn().mockImplementation(() => {
          throw new Error('Job queue unavailable');
        })
      };
      
      mockServiceRegistry.getJobQueueService.mockReturnValue(mockJobQueueService as any);

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.jobQueue).toBe('down');
    });

    it('should return unhealthy status when cache is down', async () => {
      mockServiceRegistry.getCacheManager.mockReturnValue(undefined);
      
      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.cache).toBe('down');
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

    it('should handle complete health check failure gracefully', async () => {
      // Mock all services failing
      mockNovitaApiService.getProducts.mockRejectedValue(new Error('API down'));
      
      const mockJobQueueService = {
        getStats: jest.fn().mockImplementation(() => {
          throw new Error('Queue down');
        })
      };
      
      mockServiceRegistry.getJobQueueService.mockReturnValue(mockJobQueueService as any);
      mockServiceRegistry.getCacheManager.mockReturnValue(undefined);

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
});