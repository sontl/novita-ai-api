/**
 * Integration tests for migration scheduler functionality
 * Tests scheduler behavior, timing, and integration with job queue
 */

import { JobQueueService } from '../services/jobQueueService';
import { MigrationScheduler } from '../services/migrationScheduler';
import { novitaApiService } from '../services/novitaApiService';
import { migrationMetrics } from '../utils/migrationMetrics';
import {
  JobType,
  JobStatus,
  MigrateSpotInstancesJobPayload
} from '../types/job';
import { InstanceResponse, InstanceStatus } from '../types/api';
import { TestUtils, TestDataGenerator } from './fixtures';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../utils/logger');

describe('Migration Scheduler Integration Tests', () => {
  let jobQueueService: JobQueueService;
  let migrationScheduler: MigrationScheduler;

  const mockSchedulerConfig = {
    enabled: true,
    scheduleIntervalMs: 500, // Fast interval for testing
    jobTimeoutMs: 5000,
    maxConcurrentMigrations: 3,
    dryRunMode: false,
    retryFailedMigrations: true,
    logLevel: 'info'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize services
    jobQueueService = new JobQueueService(50); // Very fast processing for tests
    migrationScheduler = new MigrationScheduler(mockSchedulerConfig, jobQueueService);
    
    // Reset metrics
    migrationMetrics.reset();
  });

  afterEach(async () => {
    // Clean up
    if (migrationScheduler) {
      await migrationScheduler.shutdown(1000);
    }
    if (jobQueueService) {
      jobQueueService.stop();
    }
  });

  describe('Scheduler Lifecycle Management', () => {
    it('should start and stop scheduler correctly', async () => {
      // Initially not running
      expect(migrationScheduler.getStatus().isRunning).toBe(false);

      // Start scheduler
      migrationScheduler.start();
      expect(migrationScheduler.getStatus().isRunning).toBe(true);

      // Wait for at least one execution
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions > 0;
      }, 2000);

      expect(migrationScheduler.getStatus().totalExecutions).toBeGreaterThan(0);

      // Stop scheduler
      migrationScheduler.stop();
      expect(migrationScheduler.getStatus().isRunning).toBe(false);
    });

    it('should handle multiple start/stop cycles', async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        // Start
        migrationScheduler.start();
        expect(migrationScheduler.getStatus().isRunning).toBe(true);

        // Wait briefly
        await TestUtils.wait(200);

        // Stop
        migrationScheduler.stop();
        expect(migrationScheduler.getStatus().isRunning).toBe(false);

        // Wait briefly before next cycle
        await TestUtils.wait(100);
      }

      // Should be stable after multiple cycles
      const finalStatus = migrationScheduler.getStatus();
      expect(finalStatus.isRunning).toBe(false);
      expect(finalStatus.totalExecutions).toBeGreaterThan(0);
    });

    it('should handle graceful shutdown with timeout', async () => {
      // Mock long-running migration
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockImplementation(() =>
        new Promise(resolve => 
          setTimeout(() => resolve({ instances: [], total: 0 }), 2000)
        )
      );

      // Start scheduler and wait for job to start
      migrationScheduler.start();
      jobQueueService.start();

      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().currentJobId !== undefined;
      }, 1000);

      // Initiate shutdown
      const shutdownStart = Date.now();
      await migrationScheduler.shutdown(3000);
      const shutdownTime = Date.now() - shutdownStart;

      // Should have waited for job completion
      expect(shutdownTime).toBeGreaterThan(1000);
      expect(shutdownTime).toBeLessThan(4000);

      // Should be stopped
      expect(migrationScheduler.getStatus().isRunning).toBe(false);
    });

    it('should timeout during shutdown if job takes too long', async () => {
      // Mock very long-running migration
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockImplementation(() =>
        new Promise(resolve => 
          setTimeout(() => resolve({ instances: [], total: 0 }), 5000)
        )
      );

      // Start scheduler and wait for job to start
      migrationScheduler.start();
      jobQueueService.start();

      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().currentJobId !== undefined;
      }, 1000);

      // Initiate shutdown with short timeout
      const shutdownStart = Date.now();
      await migrationScheduler.shutdown(1000);
      const shutdownTime = Date.now() - shutdownStart;

      // Should timeout and not wait for job completion
      expect(shutdownTime).toBeLessThan(1500);
      expect(migrationScheduler.getStatus().isRunning).toBe(false);
    });
  });

  describe('Job Scheduling and Deduplication', () => {
    it('should schedule jobs at regular intervals', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for multiple executions
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 3;
      }, 2000);

      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(3);
      expect(status.failedExecutions).toBe(0);

      // Verify jobs were created
      const migrationJobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
      expect(migrationJobs.length).toBeGreaterThanOrEqual(3);
    });

    it('should prevent overlapping job executions', async () => {
      // Mock slow migration to create overlap scenario
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockImplementation(() =>
        new Promise(resolve => 
          setTimeout(() => resolve({ instances: [], total: 0 }), 1000)
        )
      );

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for first job to start
      await TestUtils.waitFor(() => {
        const jobs = jobQueueService.getJobs({ 
          type: JobType.MIGRATE_SPOT_INSTANCES,
          status: JobStatus.PROCESSING 
        });
        return jobs.length > 0;
      }, 1000);

      // Wait a bit more to ensure scheduler tries to create another job
      await TestUtils.wait(600);

      // Should only have one job in processing state
      const processingJobs = jobQueueService.getJobs({ 
        type: JobType.MIGRATE_SPOT_INSTANCES,
        status: JobStatus.PROCESSING 
      });
      expect(processingJobs.length).toBe(1);

      // Total migration jobs should be limited (no excessive creation)
      const allMigrationJobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
      expect(allMigrationJobs.length).toBeLessThan(5); // Should not create many overlapping jobs
    });

    it('should handle job queue failures gracefully', async () => {
      // Mock job queue to fail
      const originalAddJob = jobQueueService.addJob;
      jobQueueService.addJob = jest.fn().mockRejectedValue(new Error('Queue is full'));

      migrationScheduler.start();

      // Wait for scheduler to attempt job creation
      await TestUtils.wait(600);

      // Should handle failure and continue running
      const status = migrationScheduler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.failedExecutions).toBeGreaterThan(0);

      // Restore original method
      jobQueueService.addJob = originalAddJob;
    });
  });

  describe('Manual Execution and Control', () => {
    it('should support manual execution', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      // Execute manually without starting scheduler
      const jobId = await migrationScheduler.executeNow();

      expect(jobId).toBeTruthy();

      // Verify job was created
      const job = jobQueueService.getJob(jobId);
      expect(job).toBeTruthy();
      expect(job!.type).toBe(JobType.MIGRATE_SPOT_INSTANCES);

      // Verify scheduler status updated
      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBe(1);
      expect(status.lastExecution).toBeTruthy();
    });

    it('should reject manual execution when disabled', async () => {
      const disabledScheduler = new MigrationScheduler(
        { ...mockSchedulerConfig, enabled: false },
        jobQueueService
      );

      await expect(disabledScheduler.executeNow()).rejects.toThrow('Migration scheduler is disabled');
    });

    it('should reject manual execution during shutdown', async () => {
      migrationScheduler.start();
      
      // Start shutdown process
      const shutdownPromise = migrationScheduler.shutdown(5000);

      // Try to execute manually during shutdown
      await expect(migrationScheduler.executeNow()).rejects.toThrow('Cannot execute during shutdown');

      await shutdownPromise;
    });
  });

  describe('Health Monitoring and Status', () => {
    it('should report healthy status under normal conditions', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for some successful executions
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 2;
      }, 1500);

      // Check health
      expect(migrationScheduler.isHealthy()).toBe(true);

      const healthDetails = migrationScheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(true);
      expect(healthDetails.issues).toHaveLength(0);
      expect(healthDetails.status.isRunning).toBe(true);
      expect(healthDetails.status.totalExecutions).toBeGreaterThanOrEqual(2);
    });

    it('should report unhealthy status with high failure rate', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockRejectedValue(new Error('Persistent API failure'));

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for multiple failures
      await TestUtils.waitFor(() => {
        const status = migrationScheduler.getStatus();
        return status.totalExecutions >= 10 && status.failedExecutions >= 5;
      }, 3000);

      // Should be unhealthy due to high failure rate
      expect(migrationScheduler.isHealthy()).toBe(false);

      const healthDetails = migrationScheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(false);
      expect(healthDetails.issues.length).toBeGreaterThan(0);
      expect(healthDetails.issues[0]).toContain('High failure rate');
    });

    it('should report healthy status when disabled', () => {
      const disabledScheduler = new MigrationScheduler(
        { ...mockSchedulerConfig, enabled: false },
        jobQueueService
      );

      expect(disabledScheduler.isHealthy()).toBe(true);

      const healthDetails = disabledScheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(true);
      expect(healthDetails.status.isEnabled).toBe(false);
      expect(healthDetails.status.isRunning).toBe(false);
    });

    it('should track execution timing and performance', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock varying execution times
      let callCount = 0;
      mockNovitaApi.listInstances.mockImplementation(() => {
        const delay = callCount % 2 === 0 ? 100 : 200;
        callCount++;
        return new Promise(resolve => 
          setTimeout(() => resolve({ instances: [], total: 0 }), delay)
        );
      });

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for multiple executions
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 4;
      }, 2000);

      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(4);
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.lastExecution).toBeTruthy();
      expect(status.nextExecution).toBeTruthy();
    });
  });

  describe('Configuration and Behavior', () => {
    it('should respect custom scheduling intervals', async () => {
      const customConfig = {
        ...mockSchedulerConfig,
        scheduleIntervalMs: 200 // Very fast for testing
      };

      const customScheduler = new MigrationScheduler(customConfig, jobQueueService);
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      customScheduler.start();
      jobQueueService.start();

      // Should execute more frequently
      await TestUtils.waitFor(() => {
        return customScheduler.getStatus().totalExecutions >= 5;
      }, 1500);

      const status = customScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(5);

      await customScheduler.shutdown(1000);
    });

    it('should handle dry run mode correctly', async () => {
      const dryRunConfig = {
        ...mockSchedulerConfig,
        dryRunMode: true
      };

      const dryRunScheduler = new MigrationScheduler(dryRunConfig, jobQueueService);
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      // Mock instances that would normally be migrated
      const mockInstances: InstanceResponse[] = [
        {
          ...TestDataGenerator.generateInstanceResponse(),
          id: 'dry-run-instance',
          status: InstanceStatus.EXITED,
          spotStatus: 'reclaimed',
          spotReclaimTime: '1704067200'
        }
      ];
      
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: mockInstances.length
      });

      dryRunScheduler.start();
      jobQueueService.start();

      // Wait for execution
      await TestUtils.waitFor(() => {
        return dryRunScheduler.getStatus().totalExecutions >= 1;
      }, 1000);

      // In dry run mode, migrateInstance should not be called
      expect(mockNovitaApi.migrateInstance).not.toHaveBeenCalled();

      await dryRunScheduler.shutdown(1000);
    });

    it('should handle retry configuration correctly', async () => {
      const noRetryConfig = {
        ...mockSchedulerConfig,
        retryFailedMigrations: false
      };

      const noRetryScheduler = new MigrationScheduler(noRetryConfig, jobQueueService);
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockRejectedValue(new Error('API failure'));

      noRetryScheduler.start();
      jobQueueService.start();

      // Wait for execution
      await TestUtils.waitFor(() => {
        return noRetryScheduler.getStatus().totalExecutions >= 1;
      }, 1000);

      // Verify job was created with maxAttempts = 1 (no retries)
      const migrationJobs = jobQueueService.getJobs({ type: JobType.MIGRATE_SPOT_INSTANCES });
      expect(migrationJobs.length).toBeGreaterThan(0);
      expect(migrationJobs[0]!.maxAttempts).toBe(1);

      await noRetryScheduler.shutdown(1000);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary failures', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      
      let callCount = 0;
      mockNovitaApi.listInstances.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ instances: [], total: 0 });
      });

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for recovery
      await TestUtils.waitFor(() => {
        const status = migrationScheduler.getStatus();
        return status.totalExecutions >= 3 && status.failedExecutions >= 2;
      }, 2000);

      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(3);
      expect(status.failedExecutions).toBeGreaterThanOrEqual(2);
      
      // Should still be running and healthy after recovery
      expect(status.isRunning).toBe(true);
    });

    it('should continue scheduling after job processing errors', async () => {
      // Mock job worker to fail processing
      const originalStart = jobQueueService.start;
      jobQueueService.start = jest.fn().mockImplementation(() => {
        // Simulate job processing failure
        setTimeout(() => {
          const jobs = jobQueueService.getJobs({ status: JobStatus.PENDING });
          jobs.forEach(job => {
            (job as any).status = JobStatus.FAILED;
            (job as any).error = 'Job processing failed';
          });
        }, 100);
      });

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for multiple scheduling attempts
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 3;
      }, 2000);

      // Should continue scheduling despite job failures
      const status = migrationScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(3);
      expect(status.isRunning).toBe(true);

      // Restore original method
      jobQueueService.start = originalStart;
    });
  });

  describe('Integration with Metrics System', () => {
    it('should integrate with metrics collection', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      // Reset metrics
      migrationMetrics.reset();

      migrationScheduler.start();
      jobQueueService.start();

      // Wait for executions
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 2;
      }, 1500);

      // Verify metrics were updated
      const metrics = migrationMetrics.getMetrics();
      expect(metrics.totalJobsExecuted).toBeGreaterThanOrEqual(2);
      expect(metrics.lastExecutionTime).toBeTruthy();
    });

    it('should track scheduler-specific metrics', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      migrationScheduler.start();
      jobQueueService.start();

      const startTime = Date.now();

      // Wait for multiple executions
      await TestUtils.waitFor(() => {
        return migrationScheduler.getStatus().totalExecutions >= 3;
      }, 2000);

      const status = migrationScheduler.getStatus();
      const uptime = status.uptime;

      expect(uptime).toBeGreaterThan(0);
      expect(uptime).toBeLessThan(Date.now() - startTime + 100); // Allow small margin
      expect(status.nextExecution).toBeTruthy();
      expect(status.lastExecution).toBeTruthy();
    });
  });
});