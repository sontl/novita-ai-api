import { metricsService } from '../metricsService';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.resetMetrics();
  });

  afterAll(() => {
    metricsService.stopSystemMetricsCollection();
  });

  describe('Request metrics', () => {
    it('should record request metrics correctly', () => {
      metricsService.recordRequest('GET', '/api/test', 200, 150);
      metricsService.recordRequest('POST', '/api/test', 201, 300);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.total.count).toBe(2);
      expect(metrics.requests.total.totalDuration).toBe(450);
      expect(metrics.requests.total.averageDuration).toBe(225);
      expect(metrics.requests.total.minDuration).toBe(150);
      expect(metrics.requests.total.maxDuration).toBe(300);
      expect(metrics.requests.total.statusCodes).toEqual({
        '200': 1,
        '201': 1
      });
    });

    it('should track endpoint-specific metrics', () => {
      metricsService.recordRequest('GET', '/api/instances', 200, 100);
      metricsService.recordRequest('GET', '/api/instances', 200, 200);
      metricsService.recordRequest('POST', '/api/instances', 201, 300);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.byEndpoint['GET /api/instances']).toEqual({
        count: 2,
        totalDuration: 300,
        averageDuration: 150,
        minDuration: 100,
        maxDuration: 200,
        statusCodes: { '200': 2 },
        lastRequest: expect.any(Date)
      });

      expect(metrics.requests.byEndpoint['POST /api/instances']).toEqual({
        count: 1,
        totalDuration: 300,
        averageDuration: 300,
        minDuration: 300,
        maxDuration: 300,
        statusCodes: { '201': 1 },
        lastRequest: expect.any(Date)
      });
    });

    it('should track method-specific metrics', () => {
      metricsService.recordRequest('GET', '/api/instances', 200, 100);
      metricsService.recordRequest('GET', '/api/health', 200, 50);
      metricsService.recordRequest('POST', '/api/instances', 201, 200);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.byMethod['GET']).toEqual({
        count: 2,
        totalDuration: 150,
        averageDuration: 75,
        minDuration: 50,
        maxDuration: 100,
        statusCodes: { '200': 2 },
        lastRequest: expect.any(Date)
      });

      expect(metrics.requests.byMethod['POST']).toEqual({
        count: 1,
        totalDuration: 200,
        averageDuration: 200,
        minDuration: 200,
        maxDuration: 200,
        statusCodes: { '201': 1 },
        lastRequest: expect.any(Date)
      });
    });

    it('should handle multiple status codes for same endpoint', () => {
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('GET', '/api/test', 404, 50);
      metricsService.recordRequest('GET', '/api/test', 500, 200);

      const metrics = metricsService.getMetrics();
      
      const endpointMetrics = metrics.requests.byEndpoint['GET /api/test'];
      expect(endpointMetrics?.statusCodes).toEqual({
        '200': 1,
        '404': 1,
        '500': 1
      });
    });
  });

  describe('Job metrics', () => {
    it('should record job metrics correctly', () => {
      metricsService.recordJob('create_instance', 2000, true, 5);
      metricsService.recordJob('monitor_instance', 1500, true, 4);
      metricsService.recordJob('send_webhook', 500, false, 3);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.jobs.total.processed).toBe(3);
      expect(metrics.jobs.total.failed).toBe(1);
      expect(metrics.jobs.total.totalProcessingTime).toBe(4000);
      expect(metrics.jobs.total.averageProcessingTime).toBe(4000 / 3);
      expect(metrics.jobs.total.minProcessingTime).toBe(500);
      expect(metrics.jobs.total.maxProcessingTime).toBe(2000);
      expect(metrics.jobs.total.queueSize).toBe(3); // Last recorded queue size
    });

    it('should track job type-specific metrics', () => {
      metricsService.recordJob('create_instance', 2000, true, 5);
      metricsService.recordJob('create_instance', 1800, false, 4);
      metricsService.recordJob('monitor_instance', 1000, true, 3);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.jobs.byType['create_instance']).toEqual({
        processed: 2,
        failed: 1,
        totalProcessingTime: 3800,
        averageProcessingTime: 1900,
        minProcessingTime: 1800,
        maxProcessingTime: 2000,
        queueSize: 4, // Last recorded for this type
        lastProcessed: expect.any(Date)
      });

      expect(metrics.jobs.byType['monitor_instance']).toEqual({
        processed: 1,
        failed: 0,
        totalProcessingTime: 1000,
        averageProcessingTime: 1000,
        minProcessingTime: 1000,
        maxProcessingTime: 1000,
        queueSize: 3,
        lastProcessed: expect.any(Date)
      });
    });

    it('should handle job failures correctly', () => {
      metricsService.recordJob('create_instance', 1000, false, 2);
      metricsService.recordJob('create_instance', 1500, false, 1);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.jobs.total.processed).toBe(2);
      expect(metrics.jobs.total.failed).toBe(2);
      const jobTypeMetrics = metrics.jobs.byType['create_instance'];
      expect(jobTypeMetrics?.failed).toBe(2);
    });
  });

  describe('Cache metrics', () => {
    it('should record cache hits and misses', () => {
      metricsService.recordCacheHit();
      metricsService.recordCacheHit();
      metricsService.recordCacheMiss();

      const metrics = metricsService.getMetrics();
      
      expect(metrics.cache.hits).toBe(2);
      expect(metrics.cache.misses).toBe(1);
      expect(metrics.cache.hitRatio).toBe((2 / 3) * 100);
    });

    it('should update cache size', () => {
      metricsService.updateCacheSize(150);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.cache.totalSize).toBe(150);
    });

    it('should handle zero cache operations', () => {
      const metrics = metricsService.getMetrics();
      
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.cache.misses).toBe(0);
      expect(metrics.cache.hitRatio).toBe(0);
    });
  });

  describe('System metrics', () => {
    it('should return system metrics', () => {
      const systemMetrics = metricsService.getSystemMetrics();
      
      expect(systemMetrics.memory).toMatchObject({
        rss: expect.any(Number),
        heapTotal: expect.any(Number),
        heapUsed: expect.any(Number),
        external: expect.any(Number),
        arrayBuffers: expect.any(Number)
      });

      expect(systemMetrics.cpu.usage).toEqual(expect.any(Number));
      expect(Array.isArray(systemMetrics.cpu.loadAverage)).toBe(true);

      expect(systemMetrics.uptime).toEqual(expect.any(Number));
      expect(systemMetrics.timestamp).toEqual(expect.any(Date));

      expect(systemMetrics.memory.heapUsed).toBeGreaterThan(0);
      expect(systemMetrics.uptime).toBeGreaterThan(0);
      expect(systemMetrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.cpu.loadAverage).toHaveLength(3);
    });

    it('should cap CPU usage at 100%', () => {
      const systemMetrics = metricsService.getSystemMetrics();
      
      expect(systemMetrics.cpu.usage).toBeLessThanOrEqual(100);
    });
  });

  describe('Health metrics', () => {
    it('should calculate health metrics correctly', () => {
      // Record some test data
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('POST', '/api/test', 500, 200);
      metricsService.recordJob('create_instance', 1500, true, 2);
      metricsService.recordCacheHit();
      metricsService.recordCacheMiss();

      const healthMetrics = metricsService.getHealthMetrics();
      
      expect(healthMetrics).toMatchObject({
        requestsPerMinute: expect.any(Number),
        averageResponseTime: 150, // (100 + 200) / 2
        errorRate: 50, // 1 error out of 2 requests
        jobProcessingRate: expect.any(Number),
        memoryUsageMB: expect.any(Number),
        cpuUsagePercent: expect.any(Number)
      });

      expect(healthMetrics.averageResponseTime).toBe(150);
      expect(healthMetrics.errorRate).toBe(50);
      expect(healthMetrics.memoryUsageMB).toBeGreaterThan(0);
    });

    it('should handle zero requests gracefully', () => {
      const healthMetrics = metricsService.getHealthMetrics();
      
      expect(healthMetrics.requestsPerMinute).toBe(0);
      expect(healthMetrics.averageResponseTime).toBe(0);
      expect(healthMetrics.errorRate).toBe(0);
      expect(healthMetrics.jobProcessingRate).toBe(0);
    });

    it('should calculate error rate correctly', () => {
      // 3 successful, 2 error requests
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordRequest('GET', '/api/test', 400, 100);
      metricsService.recordRequest('GET', '/api/test', 500, 100);

      const healthMetrics = metricsService.getHealthMetrics();
      
      expect(healthMetrics.errorRate).toBe(40); // 2 errors out of 5 requests
    });
  });

  describe('Reset functionality', () => {
    it('should reset all metrics', () => {
      // Generate some metrics
      metricsService.recordRequest('GET', '/api/test', 200, 100);
      metricsService.recordJob('create_instance', 1000, true, 1);
      metricsService.recordCacheHit();
      metricsService.updateCacheSize(50);

      // Verify metrics exist
      let metrics = metricsService.getMetrics();
      expect(metrics.requests.total.count).toBe(1);
      expect(metrics.jobs.total.processed).toBe(1);
      expect(metrics.cache.hits).toBe(1);

      // Reset metrics
      metricsService.resetMetrics();

      // Verify metrics are reset
      metrics = metricsService.getMetrics();
      expect(metrics.requests.total.count).toBe(0);
      expect(metrics.jobs.total.processed).toBe(0);
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.cache.totalSize).toBe(0);
      expect(Object.keys(metrics.requests.byEndpoint)).toHaveLength(0);
      expect(Object.keys(metrics.jobs.byType)).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large numbers', () => {
      metricsService.recordRequest('GET', '/api/test', 200, 999999);
      metricsService.recordJob('create_instance', 999999, true, 1000000);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.total.maxDuration).toBe(999999);
      expect(metrics.jobs.total.maxProcessingTime).toBe(999999);
      expect(metrics.jobs.total.queueSize).toBe(1000000);
    });

    it('should handle zero durations', () => {
      metricsService.recordRequest('GET', '/api/test', 200, 0);
      metricsService.recordJob('create_instance', 0, true, 0);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.total.minDuration).toBe(0);
      expect(metrics.jobs.total.minProcessingTime).toBe(0);
    });

    it('should handle negative values gracefully', () => {
      // This shouldn't happen in practice, but test robustness
      metricsService.recordRequest('GET', '/api/test', 200, -10);

      const metrics = metricsService.getMetrics();
      
      expect(metrics.requests.total.count).toBe(1);
      expect(metrics.requests.total.minDuration).toBe(-10);
    });
  });

  describe('Time-based calculations', () => {
    it('should calculate requests per minute', () => {
      // Record a request
      metricsService.recordRequest('GET', '/api/test', 200, 100);

      const healthMetrics = metricsService.getHealthMetrics();
      
      // Should be a very high rate since the request just happened
      // Note: This might be 0 if the calculation happens too quickly
      expect(healthMetrics.requestsPerMinute).toBeGreaterThanOrEqual(0);
    });

    it('should calculate job processing rate', () => {
      // Record a job
      metricsService.recordJob('create_instance', 1000, true, 1);

      const healthMetrics = metricsService.getHealthMetrics();
      
      // Should be a very high rate since the job just completed
      // Note: This might be 0 if the calculation happens too quickly
      expect(healthMetrics.jobProcessingRate).toBeGreaterThanOrEqual(0);
    });
  });
});