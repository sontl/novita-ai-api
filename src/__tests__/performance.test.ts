/**
 * Performance and Load Testing
 * 
 * These tests verify system performance under various load conditions
 * and ensure the system meets performance requirements.
 */

import request from 'supertest';
import { app } from '../index';
import { jobQueueService } from '../services/jobQueueService';
import { jobWorkerService } from '../services/jobWorkerService';
import { instanceService } from '../services/instanceService';
import { productService } from '../services/productService';
import { templateService } from '../services/templateService';
import { metricsService } from '../services/metricsService';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../clients/webhookClient');

describe('Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobQueueService.clearAllJobs();
    metricsService.reset();
  });

  describe('API Response Times', () => {
    it('should respond to health check within 100ms', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100);
    });

    it('should handle instance creation requests within 500ms', async () => {
      const startTime = Date.now();
      
      await request(app)
        .post('/api/instances')
        .send({
          name: 'perf-test-instance',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
    });

    it('should handle instance status requests within 200ms', async () => {
      // First create an instance
      const createResponse = await request(app)
        .post('/api/instances')
        .send({
          name: 'status-perf-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);

      const instanceId = createResponse.body.instanceId;
      
      const startTime = Date.now();
      
      await request(app)
        .get(`/api/instances/${instanceId}`)
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(200);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent health checks', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health').expect(200)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      expect(responses).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle 20 concurrent instance creation requests', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/instances')
          .send({
            name: `concurrent-${i}`,
            productName: 'RTX 4090 24GB',
            templateId: 'template-1'
          })
          .expect(201)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      expect(responses).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify all instances were queued
      const queueStats = jobQueueService.getStats();
      expect(queueStats.totalJobs).toBe(concurrentRequests);
    });
  });

  describe('Job Processing Performance', () => {
    it('should process jobs within acceptable time limits', async () => {
      const jobCount = 10;
      
      // Create multiple jobs
      for (let i = 0; i < jobCount; i++) {
        await request(app)
          .post('/api/instances')
          .send({
            name: `job-perf-${i}`,
            productName: 'RTX 4090 24GB',
            templateId: 'template-1'
          })
          .expect(201);
      }
      
      const startTime = Date.now();
      
      // Process all jobs
      for (let i = 0; i < jobCount; i++) {
        await jobWorkerService.processNextJob();
      }
      
      const processingTime = Date.now() - startTime;
      const avgTimePerJob = processingTime / jobCount;
      
      expect(avgTimePerJob).toBeLessThan(1000); // Average 1 second per job
      expect(processingTime).toBeLessThan(8000); // Total under 8 seconds
    });

    it('should maintain job queue performance under load', async () => {
      const jobCount = 100;
      const startTime = Date.now();
      
      // Add many jobs quickly
      for (let i = 0; i < jobCount; i++) {
        jobQueueService.addJob('create_instance', {
          instanceId: `perf-test-${i}`,
          name: `perf-instance-${i}`,
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        });
      }
      
      const queueTime = Date.now() - startTime;
      
      expect(queueTime).toBeLessThan(1000); // Should queue 100 jobs in under 1 second
      
      const stats = jobQueueService.getStats();
      expect(stats.totalJobs).toBe(jobCount);
      expect(stats.pendingJobs).toBe(jobCount);
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate cache performance benefits', async () => {
      const templateId = 'cache-perf-test';
      
      // First call - cache miss
      const startTime1 = Date.now();
      await templateService.getTemplate(templateId);
      const firstCallTime = Date.now() - startTime1;
      
      // Second call - cache hit
      const startTime2 = Date.now();
      await templateService.getTemplate(templateId);
      const secondCallTime = Date.now() - startTime2;
      
      // Cache hit should be significantly faster
      expect(secondCallTime).toBeLessThan(firstCallTime * 0.5);
      expect(secondCallTime).toBeLessThan(50); // Cache hit under 50ms
    });

    it('should handle cache operations efficiently', async () => {
      const cacheOperations = 1000;
      const startTime = Date.now();
      
      // Perform many cache operations
      for (let i = 0; i < cacheOperations; i++) {
        const stats = templateService.getCacheStats();
        expect(stats).toBeDefined();
      }
      
      const totalTime = Date.now() - startTime;
      const avgTimePerOperation = totalTime / cacheOperations;
      
      expect(avgTimePerOperation).toBeLessThan(1); // Under 1ms per operation
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during normal operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/instances')
          .send({
            name: `memory-test-${i}`,
            productName: 'RTX 4090 24GB',
            templateId: 'template-1'
          })
          .expect(201);
        
        // Process job
        await jobWorkerService.processNextJob();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle cache size limits properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Fill caches with many entries
      for (let i = 0; i < 1000; i++) {
        await templateService.getTemplate(`template-${i}`);
        await productService.getOptimalProduct(`product-${i}`, 'CN-HK-01');
      }
      
      const cacheMemory = process.memoryUsage().heapUsed;
      const cacheIncrease = cacheMemory - initialMemory;
      
      // Cache should not consume excessive memory (less than 100MB)
      expect(cacheIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Metrics Collection Performance', () => {
    it('should collect metrics without significant overhead', async () => {
      const requestCount = 100;
      
      // Test without metrics
      metricsService.disable();
      const startTimeWithoutMetrics = Date.now();
      
      for (let i = 0; i < requestCount; i++) {
        await request(app).get('/health').expect(200);
      }
      
      const timeWithoutMetrics = Date.now() - startTimeWithoutMetrics;
      
      // Reset and test with metrics
      metricsService.enable();
      metricsService.reset();
      const startTimeWithMetrics = Date.now();
      
      for (let i = 0; i < requestCount; i++) {
        await request(app).get('/health').expect(200);
      }
      
      const timeWithMetrics = Date.now() - startTimeWithMetrics;
      
      // Metrics overhead should be minimal (less than 20% increase)
      const overhead = (timeWithMetrics - timeWithoutMetrics) / timeWithoutMetrics;
      expect(overhead).toBeLessThan(0.2);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors efficiently without performance degradation', async () => {
      const errorRequestCount = 50;
      const startTime = Date.now();
      
      // Make requests that will result in errors
      const promises = Array.from({ length: errorRequestCount }, () =>
        request(app)
          .post('/api/instances')
          .send({
            name: '', // Invalid name
            productName: 'Invalid Product',
            templateId: 'invalid-template'
          })
          .expect(400)
      );
      
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // Error handling should be fast
      expect(totalTime).toBeLessThan(3000); // Under 3 seconds for 50 error requests
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources properly after operations', async () => {
      const initialStats = jobQueueService.getStats();
      
      // Perform operations
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/instances')
          .send({
            name: `cleanup-test-${i}`,
            productName: 'RTX 4090 24GB',
            templateId: 'template-1'
          })
          .expect(201);
        
        await jobWorkerService.processNextJob();
      }
      
      // Verify jobs are processed and cleaned up
      const finalStats = jobQueueService.getStats();
      expect(finalStats.completedJobs).toBe(10);
      expect(finalStats.pendingJobs).toBe(0);
    });
  });
});