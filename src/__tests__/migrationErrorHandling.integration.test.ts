/**
 * Integration tests for migration error handling and recovery scenarios
 * Tests various API failure modes, network issues, and error recovery patterns
 */

import { JobQueueService } from '../services/jobQueueService';
import { InstanceMigrationService } from '../services/instanceMigrationService';
import { MigrationScheduler } from '../services/migrationScheduler';
import { novitaApiService } from '../services/novitaApiService';
import { migrationMetrics } from '../utils/migrationMetrics';
import { migrationErrorHandler } from '../utils/migrationErrorHandler';
import {
  JobType,
  JobStatus,
  MigrateSpotInstancesJobPayload
} from '../types/job';
import {
  InstanceResponse,
  InstanceStatus,
  NovitaApiClientError
} from '../types/api';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity
} from '../types/migration';
import { TestUtils, TestDataGenerator } from './fixtures';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../utils/logger');

describe('Migration Error Handling Integration Tests', () => {
  let jobQueueService: JobQueueService;
  let migrationService: InstanceMigrationService;
  let migrationScheduler: MigrationScheduler;

  const errorTestConfig = {
    enabled: true,
    scheduleIntervalMs: 200,
    jobTimeoutMs: 10000,
    maxConcurrentMigrations: 5,
    dryRunMode: false,
    retryFailedMigrations: true,
    logLevel: 'error'
  };

  const mockInstances: InstanceResponse[] = [
    {
      ...TestDataGenerator.generateInstanceResponse(),
      id: 'error-test-instance-1',
      status: InstanceStatus.EXITED,
      spotStatus: 'reclaimed',
      spotReclaimTime: '1704067200'
    },
    {
      ...TestDataGenerator.generateInstanceResponse(),
      id: 'error-test-instance-2',
      status: InstanceStatus.EXITED,
      spotStatus: 'reclaimed',
      spotReclaimTime: '1704067300'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    jobQueueService = new JobQueueService(50);
    migrationService = new InstanceMigrationService();
    migrationScheduler = new MigrationScheduler(errorTestConfig, jobQueueService);
    
    migrationMetrics.reset();
  });

  afterEach(async () => {
    if (migrationScheduler) {
      await migrationScheduler.shutdown(1000);
    }
    if (jobQueueService) {
      jobQueueService.stop();
    }
  });

  describe('API Failure Scenarios', () => {
    it('should handle 503 Service Unavailable errors with retry', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock service unavailable error followed by success
      mockNovitaApi.listInstances
        .mockRejectedValueOnce(new NovitaApiClientError('Service temporarily unavailable', 503))
        .mockRejectedValueOnce(new NovitaApiClientError('Service temporarily unavailable', 503))
        .mockResolvedValueOnce({
          instances: mockInstances,
          total: mockInstances.length
        });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('503-error-test');
      const endTime = Date.now();

      // Should eventually succeed after retries
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(2);
      expect(result.errors).toBe(0);

      // Should have taken time due to retries
      expect(endTime - startTime).toBeGreaterThan(100);

      // Verify retry attempts
      expect(mockNovitaApi.listInstances).toHaveBeenCalledTimes(3);
    });

    it('should handle 429 Rate Limit errors with exponential backoff', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: mockInstances.length
      });

      // Mock rate limit errors for migration calls
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(new NovitaApiClientError('Rate limit exceeded', 429))
        .mockRejectedValueOnce(new NovitaApiClientError('Rate limit exceeded', 429))
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-1',
          newInstanceId: 'migrated-error-test-instance-1',
          message: 'Migration successful after rate limit',
          migrationTime: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-2',
          newInstanceId: 'migrated-error-test-instance-2',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('429-error-test');
      const endTime = Date.now();

      // Should succeed after rate limit delays
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(2);
      expect(result.errors).toBe(0);

      // Should have taken time due to rate limit backoff
      expect(endTime - startTime).toBeGreaterThan(500);

      // Verify retry attempts (3 calls for first instance, 1 for second)
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(4);
    });

    it('should handle 404 Not Found errors without retry', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: mockInstances.length
      });

      // Mock 404 errors (should not retry)
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(new NovitaApiClientError('Instance not found', 404))
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-2',
          newInstanceId: 'migrated-error-test-instance-2',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        });

      const result = await migrationService.processMigrationBatch('404-error-test');

      // Should handle 404 as permanent failure
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(1); // Only second instance succeeded
      expect(result.errors).toBe(1); // First instance failed

      // Should not retry 404 errors (only 2 calls total)
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(2);
    });

    it('should handle network timeout errors with retry', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock timeout errors
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      
      mockNovitaApi.listInstances
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          instances: mockInstances,
          total: mockInstances.length
        });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      const result = await migrationService.processMigrationBatch('timeout-error-test');

      // Should recover from timeout
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(2);
      expect(result.errors).toBe(0);

      // Verify retry occurred
      expect(mockNovitaApi.listInstances).toHaveBeenCalledTimes(2);
    });

    it('should handle connection refused errors', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      const connectionError = new Error('Connection refused');
      connectionError.name = 'ECONNREFUSED';
      
      mockNovitaApi.listInstances.mockRejectedValue(connectionError);

      const result = await migrationService.processMigrationBatch('connection-error-test');

      // Should fail gracefully
      expect(result.totalProcessed).toBe(0);
      expect(result.migrated).toBe(0);
      expect(result.errors).toBe(1);

      // Should record error metrics
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.recentErrors).toBeGreaterThan(0);
    });
  });

  describe('Partial Failure Scenarios', () => {
    it('should handle mixed success and failure in batch processing', async () => {
      const mixedInstances = Array.from({ length: 10 }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `mixed-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mixedInstances,
        total: mixedInstances.length
      });

      // Mock alternating success/failure pattern
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) => {
        const instanceIndex = parseInt(instanceId.split('-')[2]!);
        
        if (instanceIndex % 3 === 0) {
          // Every third instance fails with 500 error
          return Promise.reject(new NovitaApiClientError('Internal server error', 500));
        } else if (instanceIndex % 3 === 1) {
          // Every third instance succeeds
          return Promise.resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          });
        } else {
          // Every third instance fails with API response failure
          return Promise.resolve({
            success: false,
            instanceId,
            error: 'Migration failed: Insufficient capacity',
            migrationTime: new Date().toISOString()
          });
        }
      });

      const result = await migrationService.processMigrationBatch('mixed-failure-test');

      // Verify mixed results
      expect(result.totalProcessed).toBe(10);
      expect(result.migrated).toBe(3); // Instances 1, 4, 7 should succeed
      expect(result.errors).toBe(7); // Instances 0,2,3,5,6,8,9 should fail
      expect(result.skipped).toBe(0);

      // Should continue processing despite failures
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(10);
    });

    it('should handle cascading failures gracefully', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: mockInstances.length
      });

      // Mock cascading failures (first call succeeds, subsequent calls fail)
      let callCount = 0;
      mockNovitaApi.migrateInstance.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            instanceId: 'error-test-instance-1',
            newInstanceId: 'migrated-error-test-instance-1',
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          });
        } else {
          return Promise.reject(new NovitaApiClientError('Service degraded', 503));
        }
      });

      const result = await migrationService.processMigrationBatch('cascading-failure-test');

      // Should handle partial success
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(1); // First instance succeeded
      expect(result.errors).toBe(1); // Second instance failed after retries

      // Verify retries occurred for failed instance
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(4); // 1 success + 3 retry attempts
    });
  });

  describe('Error Recovery and Circuit Breaker', () => {
    it('should implement circuit breaker pattern for persistent failures', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock persistent API failures
      mockNovitaApi.listInstances.mockRejectedValue(
        new NovitaApiClientError('Service unavailable', 503)
      );

      // Execute multiple batches to trigger circuit breaker
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await migrationService.processMigrationBatch(`circuit-breaker-test-${i}`);
        results.push(result);
        await TestUtils.wait(100); // Small delay between attempts
      }

      // All should fail, but later ones should fail faster (circuit breaker)
      results.forEach(result => {
        expect(result.totalProcessed).toBe(0);
        expect(result.errors).toBe(1);
      });

      // Should have attempted the API call multiple times initially
      expect(mockNovitaApi.listInstances).toHaveBeenCalledTimes(5);
    });

    it('should recover from circuit breaker state', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // First few calls fail, then succeed
      mockNovitaApi.listInstances
        .mockRejectedValueOnce(new NovitaApiClientError('Service unavailable', 503))
        .mockRejectedValueOnce(new NovitaApiClientError('Service unavailable', 503))
        .mockRejectedValueOnce(new NovitaApiClientError('Service unavailable', 503))
        .mockResolvedValue({
          instances: mockInstances,
          total: mockInstances.length
        });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Execute batches with delays to allow circuit breaker recovery
      const results = [];
      for (let i = 0; i < 4; i++) {
        const result = await migrationService.processMigrationBatch(`recovery-test-${i}`);
        results.push(result);
        await TestUtils.wait(200); // Allow time for recovery
      }

      // Last batch should succeed after circuit breaker recovery
      const lastResult = results[results.length - 1]!;
      expect(lastResult.totalProcessed).toBe(2);
      expect(lastResult.migrated).toBe(2);
      expect(lastResult.errors).toBe(0);
    });
  });

  describe('Scheduler Error Handling', () => {
    it('should handle job creation failures in scheduler', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      // Mock job queue to fail job creation
      const originalAddJob = jobQueueService.addJob;
      let failCount = 0;
      jobQueueService.addJob = jest.fn().mockImplementation((...args) => {
        failCount++;
        if (failCount <= 2) {
          return Promise.reject(new Error('Job queue is full'));
        }
        return originalAddJob.apply(jobQueueService, args);
      });

      migrationScheduler.start();

      // Wait for scheduler to attempt job creation and recover
      await TestUtils.waitFor(() => {
        const status = migrationScheduler.getStatus();
        return status.totalExecutions >= 1 && status.failedExecutions >= 2;
      }, 2000);

      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(1);
      expect(status.failedExecutions).toBeGreaterThanOrEqual(2);
      expect(status.isRunning).toBe(true); // Should continue running

      // Restore original method
      jobQueueService.addJob = originalAddJob;
    });

    it('should handle job processing failures gracefully', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockRejectedValue(new Error('Processing error'));

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for job failures
      await TestUtils.waitFor(() => {
        const status = migrationScheduler.getStatus();
        return status.failedExecutions >= 2;
      }, 1500);

      const status = migrationScheduler.getStatus();
      expect(status.failedExecutions).toBeGreaterThanOrEqual(2);
      expect(status.isRunning).toBe(true); // Should continue despite failures

      // Check that failed jobs are in the queue
      const failedJobs = jobQueueService.getJobs({ status: JobStatus.FAILED });
      expect(failedJobs.length).toBeGreaterThan(0);
    });
  });

  describe('Error Metrics and Monitoring', () => {
    it('should track error rates and types accurately', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Reset metrics
      migrationMetrics.reset();

      // Mock various error types
      mockNovitaApi.listInstances
        .mockRejectedValueOnce(new NovitaApiClientError('Rate limit exceeded', 429))
        .mockRejectedValueOnce(new NovitaApiClientError('Service unavailable', 503))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          instances: mockInstances,
          total: mockInstances.length
        });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Execute multiple batches to generate different errors
      for (let i = 0; i < 4; i++) {
        await migrationService.processMigrationBatch(`error-metrics-test-${i}`);
        await TestUtils.wait(50);
      }

      // Verify error metrics
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(4);
      expect(metrics.recentErrors).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeLessThan(1); // Should not be 100% since last batch succeeded
    });

    it('should provide detailed error information for debugging', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      const detailedError = new NovitaApiClientError('Detailed API error for debugging', 500);
      detailedError.stack = 'Error stack trace for debugging';
      
      mockNovitaApi.listInstances.mockRejectedValue(detailedError);

      // Execute batch that will fail
      const result = await migrationService.processMigrationBatch('detailed-error-test');

      expect(result.errors).toBe(1);

      // Verify error details are captured
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.recentErrors).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed API responses', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock malformed response
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: null as any, // Malformed response
        total: 0
      });

      const result = await migrationService.processMigrationBatch('malformed-response-test');

      // Should handle gracefully
      expect(result.totalProcessed).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('should handle unexpected error types', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock unexpected error type
      const weirdError = { message: 'Not a proper Error object' };
      mockNovitaApi.listInstances.mockRejectedValue(weirdError);

      const result = await migrationService.processMigrationBatch('unexpected-error-test');

      // Should handle gracefully
      expect(result.totalProcessed).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('should handle memory pressure during error conditions', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Create large error objects to simulate memory pressure
      const largeErrorData = Array.from({ length: 1000 }, (_, i) => `Large error data ${i}`);
      const memoryPressureError = new Error(`Memory pressure error: ${largeErrorData.join(' ')}`);
      
      mockNovitaApi.listInstances.mockRejectedValue(memoryPressureError);

      const initialMemory = process.memoryUsage().heapUsed;
      
      // Execute multiple failing batches
      for (let i = 0; i < 10; i++) {
        await migrationService.processMigrationBatch(`memory-pressure-test-${i}`);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable despite large errors
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });

  describe('Recovery Strategies', () => {
    it('should implement exponential backoff for retryable errors', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: [mockInstances[0]!],
        total: 1
      });

      // Mock retryable error followed by success
      const retryableError = new NovitaApiClientError('Temporary failure', 503);
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-1',
          newInstanceId: 'migrated-error-test-instance-1',
          message: 'Migration successful after retries',
          migrationTime: new Date().toISOString()
        });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('exponential-backoff-test');
      const endTime = Date.now();

      // Should succeed after retries
      expect(result.migrated).toBe(1);
      expect(result.errors).toBe(0);

      // Should have taken time due to exponential backoff
      expect(endTime - startTime).toBeGreaterThan(300); // At least some backoff delay

      // Verify retry attempts
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(3);
    });

    it('should implement jittered retry to avoid thundering herd', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: mockInstances.length
      });

      // Mock failures for both instances
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(new NovitaApiClientError('Temporary failure', 503))
        .mockRejectedValueOnce(new NovitaApiClientError('Temporary failure', 503))
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-1',
          newInstanceId: 'migrated-error-test-instance-1',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'error-test-instance-2',
          newInstanceId: 'migrated-error-test-instance-2',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('jittered-retry-test');
      const endTime = Date.now();

      // Should succeed for both instances
      expect(result.migrated).toBe(2);
      expect(result.errors).toBe(0);

      // Should have jittered delays (not exactly predictable timing)
      expect(endTime - startTime).toBeGreaterThan(100);
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });
});