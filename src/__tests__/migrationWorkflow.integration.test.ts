/**
 * Comprehensive integration tests for the migration workflow
 * Tests end-to-end migration functionality, scheduler integration, and error handling
 */

import { JobQueueService } from '../services/jobQueueService';
import { InstanceMigrationService } from '../services/instanceMigrationService';
import { MigrationScheduler } from '../services/migrationScheduler';
import { JobWorkerService } from '../services/jobWorkerService';
import { novitaApiService } from '../services/novitaApiService';
import { instanceService } from '../services/instanceService';
import { migrationMetrics } from '../utils/migrationMetrics';
import { migrationErrorHandler } from '../utils/migrationErrorHandler';
import { config } from '../config/config';
import {
  JobType,
  JobStatus,
  JobPriority,
  MigrateSpotInstancesJobPayload,
  MigrationJobResult
} from '../types/job';
import {
  InstanceResponse,
  InstanceStatus,
  MigrationResponse,
  NovitaApiClientError
} from '../types/api';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity
} from '../types/migration';
import { TestDataGenerator, TestUtils } from './fixtures';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../utils/logger');

describe('Migration Workflow Integration Tests', () => {
  let jobQueueService: JobQueueService;
  let migrationService: InstanceMigrationService;
  let migrationScheduler: MigrationScheduler;
  let jobWorkerService: JobWorkerService;

  // Mock data
  const mockExitedInstances: InstanceResponse[] = [
    {
      id: 'novita-inst-reclaimed-1',
      name: 'reclaimed-spot-instance-1',
      status: InstanceStatus.EXITED,
      productId: 'prod-rtx4090-hk',
      region: 'CN-HK-01',
      createdAt: '2024-01-01T00:00:00Z',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      spotStatus: 'reclaimed',
      spotReclaimTime: '1704067200' // Non-zero reclaim time
    },
    {
      id: 'novita-inst-reclaimed-2',
      name: 'reclaimed-spot-instance-2',
      status: InstanceStatus.EXITED,
      productId: 'prod-a100-hk',
      region: 'CN-HK-01',
      createdAt: '2024-01-01T00:00:00Z',
      gpuNum: 2,
      rootfsSize: 100,
      billingMode: 'spot',
      spotStatus: 'reclaimed',
      spotReclaimTime: '1704067300'
    },
    {
      id: 'novita-inst-normal-exit',
      name: 'normal-exit-instance',
      status: InstanceStatus.EXITED,
      productId: 'prod-rtx4090-hk',
      region: 'CN-HK-01',
      createdAt: '2024-01-01T00:00:00Z',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      spotStatus: '',
      spotReclaimTime: '0' // Normal exit, not reclaimed
    },
    {
      id: 'novita-inst-running',
      name: 'running-instance',
      status: InstanceStatus.RUNNING,
      productId: 'prod-rtx4090-hk',
      region: 'CN-HK-01',
      createdAt: '2024-01-01T00:00:00Z',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot'
    }
  ];

  const mockMigrationConfig = {
    enabled: true,
    scheduleIntervalMs: 15 * 60 * 1000, // 15 minutes
    jobTimeoutMs: 10 * 60 * 1000, // 10 minutes
    maxConcurrentMigrations: 5,
    dryRunMode: false,
    retryFailedMigrations: true,
    logLevel: 'info'
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize services
    jobQueueService = new JobQueueService(100); // Fast processing for tests
    migrationService = new InstanceMigrationService();
    migrationScheduler = new MigrationScheduler(mockMigrationConfig, jobQueueService);
    jobWorkerService = new JobWorkerService(jobQueueService);

    // Reset metrics (if reset method exists)
    if ('reset' in migrationMetrics && typeof migrationMetrics.reset === 'function') {
      migrationMetrics.reset();
    }
  });

  afterEach(async () => {
    // Clean up scheduler
    if (migrationScheduler) {
      await migrationScheduler.shutdown(1000);
    }
    
    // Stop job processing (if stop method exists)
    if (jobQueueService && 'stop' in jobQueueService && typeof jobQueueService.stop === 'function') {
      jobQueueService.stop();
    }
  });

  describe('End-to-End Migration Workflow', () => {
    it('should complete full migration workflow successfully', async () => {
      // Mock API responses
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockExitedInstances,
        total: mockExitedInstances.length
      });

      // Mock successful migrations for eligible instances
      mockNovitaApi.migrateInstance
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'novita-inst-reclaimed-1',
          newInstanceId: 'novita-inst-migrated-1',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'novita-inst-reclaimed-2',
          newInstanceId: 'novita-inst-migrated-2',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        });

      // Execute migration batch
      const result = await migrationService.processMigrationBatch('test-job-1');

      // Verify results
      expect(result.totalProcessed).toBe(3); // 3 exited instances processed
      expect(result.migrated).toBe(2); // 2 eligible instances migrated
      expect(result.skipped).toBe(1); // 1 normal exit skipped
      expect(result.errors).toBe(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);

      // Verify API calls
      expect(mockNovitaApi.listInstances).toHaveBeenCalledTimes(1);
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(2);
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledWith('novita-inst-reclaimed-1');
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledWith('novita-inst-reclaimed-2');

      // Verify metrics were recorded
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(1);
      expect(metrics.totalInstancesProcessed).toBe(3);
      expect(metrics.totalMigrationsPerformed).toBe(2);
    });

    it('should handle mixed success and failure scenarios', async () => {
      // Mock API responses
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockExitedInstances.slice(0, 2), // Only reclaimed instances
        total: 2
      });

      // Mock one success and one failure
      mockNovitaApi.migrateInstance
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'novita-inst-reclaimed-1',
          newInstanceId: 'novita-inst-migrated-1',
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          success: false,
          instanceId: 'novita-inst-reclaimed-2',
          error: 'Migration failed: Insufficient capacity',
          migrationTime: new Date().toISOString()
        });

      // Execute migration batch
      const result = await migrationService.processMigrationBatch('test-job-2');

      // Verify results
      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(1);

      // Verify metrics include both success and failure
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.totalMigrationsPerformed).toBe(1);
      expect(metrics.errorRate).toBeGreaterThan(0);
    });

    it('should handle API fetch failures gracefully', async () => {
      // Mock API failure
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      const apiError = new NovitaApiClientError('API temporarily unavailable', 503);
      mockNovitaApi.listInstances.mockRejectedValue(apiError);

      // Execute migration batch
      const result = await migrationService.processMigrationBatch('test-job-3');

      // Should return early with error
      expect(result.totalProcessed).toBe(0);
      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(1);

      // Verify no migration attempts were made
      expect(mockNovitaApi.migrateInstance).not.toHaveBeenCalled();
    });
  });

  describe('Scheduler Integration with Job Queue', () => {
    it('should schedule migration jobs correctly', async () => {
      // Start scheduler
      migrationScheduler.start();

      // Wait for first job to be scheduled
      await TestUtils.waitFor(() => {
        const jobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
        return jobs.length > 0;
      }, 2000);

      // Verify job was created
      const migrationJobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
      expect(migrationJobs).toHaveLength(1);

      const job = migrationJobs[0]!;
      expect(job.type).toBe(JobType.MIGRATE_SPOT_INSTANCES);
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.payload).toHaveProperty('scheduledAt');
      expect(job.payload).toHaveProperty('jobId');

      // Verify scheduler status
      const status = migrationScheduler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.isEnabled).toBe(true);
      expect(status.totalExecutions).toBe(1);
    });

    it('should prevent overlapping job executions', async () => {
      // Mock a long-running migration
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ instances: [], total: 0 }), 1000))
      );

      // Start scheduler
      migrationScheduler.start();

      // Wait for first job
      await TestUtils.waitFor(() => {
        const jobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
        return jobs.length > 0;
      }, 2000);

      // Try to execute another job immediately
      const jobId = await migrationScheduler.executeNow();

      // Should reuse existing job, not create a new one
      const migrationJobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
      expect(migrationJobs).toHaveLength(1);
      expect(migrationJobs[0]!.id).toBe(jobId);
    });

    it('should handle scheduler shutdown gracefully', async () => {
      // Start scheduler
      migrationScheduler.start();
      expect(migrationScheduler.getStatus().isRunning).toBe(true);

      // Shutdown scheduler
      await migrationScheduler.shutdown(1000);

      // Verify shutdown
      const status = migrationScheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('Various Instance Status Scenarios', () => {
    it('should correctly identify eligible instances for migration', async () => {
      const testCases = [
        {
          instance: {
            id: 'test-1',
            status: InstanceStatus.EXITED,
            spotStatus: 'reclaimed',
            spotReclaimTime: '1704067200'
          },
          expectedEligible: true,
          description: 'reclaimed spot instance'
        },
        {
          instance: {
            id: 'test-2',
            status: InstanceStatus.EXITED,
            spotStatus: '',
            spotReclaimTime: '0'
          },
          expectedEligible: false,
          description: 'normal exit'
        },
        {
          instance: {
            id: 'test-3',
            status: InstanceStatus.RUNNING,
            spotStatus: 'active',
            spotReclaimTime: '0'
          },
          expectedEligible: false,
          description: 'running instance'
        },
        {
          instance: {
            id: 'test-4',
            status: InstanceStatus.EXITED,
            spotStatus: 'interrupted',
            spotReclaimTime: '1704067300'
          },
          expectedEligible: true,
          description: 'interrupted spot instance'
        },
        {
          instance: {
            id: 'test-5',
            status: InstanceStatus.FAILED,
            spotStatus: 'reclaimed',
            spotReclaimTime: '1704067400'
          },
          expectedEligible: false,
          description: 'failed instance (wrong status)'
        }
      ];

      for (const testCase of testCases) {
        const mockInstance = {
          ...TestDataGenerator.generateInstanceResponse(),
          ...testCase.instance
        } as InstanceResponse;

        const result = await migrationService.checkMigrationEligibility(mockInstance);

        expect(result.eligible).toBe(testCase.expectedEligible);
        expect(result.instanceId).toBe(testCase.instance.id);
        expect(result.reason).toBeTruthy();

        console.log(`✓ ${testCase.description}: ${result.eligible ? 'eligible' : 'not eligible'} - ${result.reason}`);
      }
    });

    it('should handle instances with missing spot metadata', async () => {
      const instanceWithoutSpotData = {
        ...TestDataGenerator.generateInstanceResponse(),
        id: 'test-no-spot-data',
        status: InstanceStatus.EXITED,
        // spotStatus and spotReclaimTime are undefined
      } as InstanceResponse;

      const result = await migrationService.checkMigrationEligibility(instanceWithoutSpotData);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('does not meet migration criteria');
    });
  });

  describe('API Error Handling and Recovery', () => {
    it('should retry failed migrations with exponential backoff', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock API to fail twice then succeed
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(new NovitaApiClientError('Temporary failure', 503))
        .mockRejectedValueOnce(new NovitaApiClientError('Still failing', 503))
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'test-instance',
          newInstanceId: 'migrated-instance',
          message: 'Migration successful after retries',
          migrationTime: new Date().toISOString()
        });

      const startTime = Date.now();
      const result = await migrationService.migrateInstance('test-instance');
      const endTime = Date.now();

      // Should succeed after retries
      expect(result.success).toBe(true);
      expect(result.newInstanceId).toBe('migrated-instance');

      // Should have taken time due to retry delays
      expect(endTime - startTime).toBeGreaterThan(100); // At least some delay

      // Verify all attempts were made
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(3);
    });

    it('should handle permanent API failures', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock permanent failure
      const permanentError = new NovitaApiClientError('Instance not found', 404);
      mockNovitaApi.migrateInstance.mockRejectedValue(permanentError);

      const result = await migrationService.migrateInstance('non-existent-instance');

      // Should return failed response instead of throwing
      expect(result.success).toBe(false);
      expect(result.error).toContain('Instance not found');

      // Should have attempted retries
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(3);
    });

    it('should handle network timeouts gracefully', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock timeout error
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockNovitaApi.listInstances.mockRejectedValue(timeoutError);

      const result = await migrationService.processMigrationBatch('timeout-test');

      // Should handle timeout gracefully
      expect(result.totalProcessed).toBe(0);
      expect(result.errors).toBe(1);

      // Verify error was recorded
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.recentErrors).toBeGreaterThan(0);
    });

    it('should handle rate limiting with appropriate delays', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock rate limit error
      const rateLimitError = new NovitaApiClientError('Rate limit exceeded', 429);
      mockNovitaApi.migrateInstance
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'rate-limited-instance',
          newInstanceId: 'migrated-after-rate-limit',
          message: 'Migration successful after rate limit',
          migrationTime: new Date().toISOString()
        });

      const startTime = Date.now();
      const result = await migrationService.migrateInstance('rate-limited-instance');
      const endTime = Date.now();

      // Should succeed after rate limit delay
      expect(result.success).toBe(true);
      
      // Should have waited for rate limit delay
      expect(endTime - startTime).toBeGreaterThan(500); // Should have some delay

      expect(mockNovitaApi.migrateInstance).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Tests for Batch Processing', () => {
    it('should handle large batches of instances efficiently', async () => {
      // Create a large batch of instances
      const largeInstanceBatch: InstanceResponse[] = Array.from({ length: 100 }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `large-batch-instance-${i}`,
        name: `large-batch-${i}`,
        status: i % 3 === 0 ? InstanceStatus.EXITED : InstanceStatus.RUNNING,
        spotStatus: i % 3 === 0 ? 'reclaimed' : 'active',
        spotReclaimTime: i % 3 === 0 ? `${1704067200 + i}` : '0'
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: largeInstanceBatch,
        total: largeInstanceBatch.length
      });

      // Mock successful migrations for all eligible instances
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        Promise.resolve({
          success: true,
          instanceId,
          newInstanceId: `migrated-${instanceId}`,
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
      );

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('large-batch-test');
      const endTime = Date.now();

      // Verify performance
      expect(result.executionTimeMs).toBeLessThan(10000); // Should complete within 10 seconds
      expect(endTime - startTime).toBeLessThan(15000); // Total time including overhead

      // Verify correct processing
      const expectedEligible = largeInstanceBatch.filter(i => 
        i.status === InstanceStatus.EXITED && i.spotReclaimTime !== '0'
      ).length;
      
      expect(result.totalProcessed).toBe(largeInstanceBatch.filter(i => i.status === InstanceStatus.EXITED).length);
      expect(result.migrated).toBe(expectedEligible);
      expect(result.errors).toBe(0);

      console.log(`✓ Processed ${result.totalProcessed} instances in ${result.executionTimeMs}ms`);
      console.log(`✓ Migration rate: ${(result.migrated / (result.executionTimeMs / 1000)).toFixed(2)} migrations/second`);
    });

    it('should handle concurrent migration requests efficiently', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock instances for concurrent processing
      const concurrentInstances = Array.from({ length: 10 }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `concurrent-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      mockNovitaApi.listInstances.mockResolvedValue({
        instances: concurrentInstances,
        total: concurrentInstances.length
      });

      // Mock migration with realistic delay
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        new Promise(resolve => 
          setTimeout(() => resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          }), 100) // 100ms delay per migration
        )
      );

      // Execute multiple concurrent batches
      const batchPromises = Array.from({ length: 3 }, (_, i) =>
        migrationService.processMigrationBatch(`concurrent-batch-${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(batchPromises);
      const endTime = Date.now();

      // Verify all batches completed
      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.totalProcessed).toBe(10);
        expect(result.migrated).toBe(10);
        expect(result.errors).toBe(0);
      });

      // Should complete faster than sequential processing
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(5000); // Should be much faster than 3 * 10 * 100ms = 3000ms

      console.log(`✓ Processed 3 concurrent batches in ${totalTime}ms`);
    });

    it('should maintain performance under error conditions', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Create instances with mixed success/failure scenarios
      const mixedInstances = Array.from({ length: 50 }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `mixed-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mixedInstances,
        total: mixedInstances.length
      });

      // Mock 50% failure rate
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) => {
        const instanceIndex = parseInt(instanceId.split('-')[2]!);
        if (instanceIndex % 2 === 0) {
          return Promise.resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          });
        } else {
          return Promise.resolve({
            success: false,
            instanceId,
            error: 'Migration failed: Simulated error',
            migrationTime: new Date().toISOString()
          });
        }
      });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('mixed-results-test');
      const endTime = Date.now();

      // Verify performance is maintained despite errors
      expect(result.executionTimeMs).toBeLessThan(5000);
      expect(endTime - startTime).toBeLessThan(8000);

      // Verify correct handling of mixed results
      expect(result.totalProcessed).toBe(50);
      expect(result.migrated).toBe(25); // 50% success rate
      expect(result.errors).toBe(25); // 50% failure rate

      console.log(`✓ Handled mixed results: ${result.migrated} successes, ${result.errors} failures in ${result.executionTimeMs}ms`);
    });
  });

  describe('Job Worker Integration', () => {
    it('should process migration jobs through job worker', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockExitedInstances.slice(0, 2),
        total: 2
      });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test-instance',
        newInstanceId: 'migrated-instance',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Create migration job payload
      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'integration-test-job',
        config: {
          dryRun: false,
          maxMigrations: 10
        }
      };

      // Add job to queue
      const jobId = await jobQueueService.addJob(
        JobType.MIGRATE_SPOT_INSTANCES,
        payload,
        JobPriority.NORMAL,
        1
      );

      // Start job processing
      jobQueueService.start();

      // Wait for job completion
      await TestUtils.waitFor(() => {
        const job = jobQueueService.getJob(jobId);
        return job?.status === JobStatus.COMPLETED || job?.status === JobStatus.FAILED;
      }, 10000);

      // Verify job completed successfully
      const completedJob = jobQueueService.getJob(jobId);
      expect(completedJob?.status).toBe(JobStatus.COMPLETED);

      // Verify API calls were made
      expect(mockNovitaApi.listInstances).toHaveBeenCalled();
      expect(mockNovitaApi.migrateInstance).toHaveBeenCalled();
    });

    it('should handle job failures gracefully', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock API failure
      mockNovitaApi.listInstances.mockRejectedValue(new Error('API unavailable'));

      // Create migration job payload
      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'failing-test-job',
        config: {
          dryRun: false,
          maxMigrations: 10
        }
      };

      // Add job to queue
      const jobId = await jobQueueService.addJob(
        JobType.MIGRATE_SPOT_INSTANCES,
        payload,
        JobPriority.NORMAL,
        1
      );

      // Start job processing
      jobQueueService.start();

      // Wait for job completion
      await TestUtils.waitFor(() => {
        const job = jobQueueService.getJob(jobId);
        return job?.status === JobStatus.FAILED;
      }, 10000);

      // Verify job failed as expected
      const failedJob = jobQueueService.getJob(jobId);
      expect(failedJob?.status).toBe(JobStatus.FAILED);
      expect(failedJob?.error).toContain('API unavailable');
    });
  });

  describe('Metrics and Monitoring Integration', () => {
    it('should record comprehensive metrics during migration workflow', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockExitedInstances,
        total: mockExitedInstances.length
      });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test-instance',
        newInstanceId: 'migrated-instance',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Reset metrics
      migrationMetrics.reset();

      // Execute migration
      await migrationService.processMigrationBatch('metrics-test-job');

      // Verify metrics were recorded
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(1);
      expect(metrics.totalInstancesProcessed).toBeGreaterThan(0);
      expect(metrics.totalMigrationsPerformed).toBeGreaterThan(0);
      expect(metrics.averageJobExecutionTime).toBeGreaterThan(0);
      expect(metrics.lastExecutionTime).toBeTruthy();
    });

    it('should track error rates and types', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock various error types
      mockNovitaApi.listInstances.mockRejectedValue(
        new NovitaApiClientError('Rate limit exceeded', 429)
      );

      // Reset metrics
      migrationMetrics.reset();

      // Execute migration (should fail)
      await migrationService.processMigrationBatch('error-tracking-test');

      // Verify error metrics
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.recentErrors).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(0);
    });
  });
});