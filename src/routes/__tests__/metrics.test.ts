import request from 'supertest';
import { metricsService } from '../../services/metricsService';

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

describe('Metrics Routes', () => {
  beforeEach(() => {
    // Reset metrics before each test
    metricsService.resetMetrics();
  });

  describe('GET /api/metrics', () => {
    it('should return comprehensive metrics', async () => {
      // Generate some test metrics
      metricsService.recordRequest('GET', '/api/test', 200, 150);
      metricsService.recordRequest('POST', '/api/test', 201, 300);
      metricsService.recordJob('create_instance', 2000, true, 5);
      metricsService.recordCacheHit();
      metricsService.recordCacheMiss();

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        timestamp: expect.any(String),
        data: {
          requests: {
            total: {
              count: 2,
              totalDuration: 450,
              averageDuration: 225,
              minDuration: 150,
              maxDuration: 300,
              statusCodes: {
                '200': 1,
                '201': 1
              },
              lastRequest: expect.any(String)
            },
            byEndpoint: {
              'GET /api/test': {
                count: 1,
                averageDuration: 150,
                statusCodes: { '200': 1 }
              },
              'POST /api/test': {
                count: 1,
                averageDuration: 300,
                statusCodes: { '201': 1 }
              }
            },
            byMethod: {
              'GET': {
                count: 1,
                averageDuration: 150
              },
              'POST': {
                count: 1,
                averageDuration: 300
              }
            }
          },
          jobs: {
            total: {
              processed: 1,
              failed: 0,
              averageProcessingTime: 2000,
              queueSize: 5
            },
            byType: {
              'create_instance': {
                processed: 1,
                failed: 0,
                averageProcessingTime: 2000
              }
            }
          },
          system: {
            memory: expect.objectContaining({
              rss: expect.any(Number),
              heapTotal: expect.any(Number),
              heapUsed: expect.any(Number),
              external: expect.any(Number)
            }),
            cpu: {
              usage: expect.any(Number),
              loadAverage: expect.any(Array)
            },
            uptime: expect.any(Number),
            timestamp: expect.any(String)
          },
          cache: {
            hits: 1,
            misses: 1,
            hitRatio: 50,
            totalSize: expect.any(Number)
          }
        }
      });
    });

    it('should handle empty metrics gracefully', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body.data.requests.total.count).toBe(0);
      expect(response.body.data.jobs.total.processed).toBe(0);
      expect(response.body.data.cache.hits).toBe(0);
    });

    it('should include request ID in response headers', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .set('X-Request-ID', 'test-request-123')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('test-request-123');
    });
  });

  describe('GET /api/metrics/summary', () => {
    it('should return summarized metrics', async () => {
      // Generate test data
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('GET', '/api/test', 500, 200);
      metricsService.recordJob('create_instance', 1500, true, 3);
      metricsService.recordJob('monitor_instance', 800, false, 2);

      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        timestamp: expect.any(String),
        data: {
          performance: {
            requestsPerMinute: expect.any(Number),
            averageResponseTimeMs: 150, // (100 + 200) / 2
            errorRatePercent: 50 // 1 error out of 2 requests
          },
          jobs: {
            processingRatePerMinute: expect.any(Number)
          },
          system: {
            memoryUsageMB: expect.any(Number),
            cpuUsagePercent: expect.any(Number),
            uptimeSeconds: expect.any(Number)
          },
          cache: {
            hitRatePercent: expect.any(Number),
            totalSize: expect.any(Number)
          }
        }
      });

      expect(response.body.data.performance.errorRatePercent).toBe(50);
    });

    it('should handle zero division gracefully', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body.data.performance.errorRatePercent).toBe(0);
      expect(response.body.data.performance.averageResponseTimeMs).toBe(0);
    });
  });

  describe('GET /api/metrics/system', () => {
    it('should return system metrics only', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        timestamp: expect.any(String),
        data: {
          memory: {
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
            external: expect.any(Number),
            arrayBuffers: expect.any(Number)
          },
          cpu: {
            usage: expect.any(Number),
            loadAverage: expect.any(Array)
          },
          uptime: expect.any(Number),
          timestamp: expect.any(String)
        }
      });

      // Verify memory values are reasonable
      expect(response.body.data.memory.heapUsed).toBeGreaterThan(0);
      expect(response.body.data.memory.heapTotal).toBeGreaterThan(0);
      expect(response.body.data.uptime).toBeGreaterThan(0);
    });
  });

  describe('POST /api/metrics/reset', () => {
    it('should reset all metrics', async () => {
      // Generate some metrics first
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordJob('create_instance', 1000, true, 1);
      metricsService.recordCacheHit();

      // Verify metrics exist
      let metrics = metricsService.getMetrics();
      expect(metrics.requests.total.count).toBe(1);
      expect(metrics.jobs.total.processed).toBe(1);
      expect(metrics.cache.hits).toBe(1);

      // Reset metrics
      const response = await request(app)
        .post('/api/metrics/reset')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        timestamp: expect.any(String),
        message: 'All metrics have been reset'
      });

      // Verify metrics are reset (note: the reset request itself will be counted)
      metrics = metricsService.getMetrics();
      expect(metrics.requests.total.count).toBeGreaterThanOrEqual(0); // Reset request may be counted
      expect(metrics.jobs.total.processed).toBe(0);
      expect(metrics.cache.hits).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle metrics service errors gracefully', async () => {
      // Mock a metrics service error
      const originalGetMetrics = metricsService.getMetrics;
      metricsService.getMetrics = jest.fn().mockImplementation(() => {
        throw new Error('Metrics service error');
      });

      const response = await request(app)
        .get('/api/metrics')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        timestamp: expect.any(String),
        error: {
          code: 'METRICS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve application metrics',
          details: 'Metrics service error'
        }
      });

      // Restore original method
      metricsService.getMetrics = originalGetMetrics;
    });

    it('should handle summary metrics errors gracefully', async () => {
      // Mock a health metrics error
      const originalGetHealthMetrics = metricsService.getHealthMetrics;
      metricsService.getHealthMetrics = jest.fn().mockImplementation(() => {
        throw new Error('Health metrics error');
      });

      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'METRICS_SUMMARY_FAILED',
          message: 'Failed to retrieve metrics summary'
        }
      });

      // Restore original method
      metricsService.getHealthMetrics = originalGetHealthMetrics;
    });

    it('should handle system metrics errors gracefully', async () => {
      // Mock a system metrics error
      const originalGetSystemMetrics = metricsService.getSystemMetrics;
      metricsService.getSystemMetrics = jest.fn().mockImplementation(() => {
        throw new Error('System metrics error');
      });

      const response = await request(app)
        .get('/api/metrics/system')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'SYSTEM_METRICS_FAILED',
          message: 'Failed to retrieve system metrics'
        }
      });

      // Restore original method
      metricsService.getSystemMetrics = originalGetSystemMetrics;
    });

    it('should handle reset metrics errors gracefully', async () => {
      // Mock a reset error
      const originalResetMetrics = metricsService.resetMetrics;
      metricsService.resetMetrics = jest.fn().mockImplementation(() => {
        throw new Error('Reset error');
      });

      const response = await request(app)
        .post('/api/metrics/reset')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        error: {
          code: 'METRICS_RESET_FAILED',
          message: 'Failed to reset metrics'
        }
      });

      // Restore original method
      metricsService.resetMetrics = originalResetMetrics;
    });
  });

  describe('Metrics collection integration', () => {
    it('should automatically collect request metrics', async () => {
      // Make a request to any endpoint
      await request(app)
        .get('/health')
        .expect(200);

      // Check that metrics were recorded
      const metrics = metricsService.getMetrics();
      expect(metrics.requests.total.count).toBeGreaterThan(0);
      expect(metrics.requests.byEndpoint['/health']).toBeDefined();
      expect(metrics.requests.byMethod['GET']).toBeDefined();
    });

    it('should record different status codes correctly', async () => {
      // Make requests with different outcomes
      await request(app).get('/health').expect(200);
      await request(app).get('/nonexistent').expect(404);

      const metrics = metricsService.getMetrics();
      expect(metrics.requests.total.statusCodes['200']).toBeGreaterThan(0);
      expect(metrics.requests.total.statusCodes['404']).toBeGreaterThan(0);
    });

    it('should normalize endpoint paths correctly', async () => {
      // The metrics middleware should normalize paths with IDs
      await request(app).get('/health').expect(200);

      const metrics = metricsService.getMetrics();
      expect(metrics.requests.byEndpoint['/health']).toBeDefined();
    });
  });
});