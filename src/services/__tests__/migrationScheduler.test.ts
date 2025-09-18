/**
 * Unit tests for MigrationScheduler
 */

import { MigrationScheduler, MigrationSchedulerConfig, createMigrationScheduler } from '../migrationScheduler';
import { JobQueueService } from '../jobQueueService';
import { JobType, JobStatus, JobPriority, MigrateSpotInstancesJobPayload } from '../../types/job';
import { Config } from '../../config/config';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('MigrationScheduler', () => {
  let scheduler: MigrationScheduler;
  let jobQueueService: JobQueueService;
  let mockConfig: MigrationSchedulerConfig;

  beforeEach(() => {
    // Create a fresh job queue service for each test
    jobQueueService = new JobQueueService(100); // Fast processing for tests
    
    mockConfig = {
      enabled: true,
      scheduleIntervalMs: 1000, // 1 second for fast tests
      jobTimeoutMs: 5000,
      maxConcurrentMigrations: 5,
      dryRunMode: false,
      retryFailedMigrations: true,
      logLevel: 'info'
    };

    scheduler = new MigrationScheduler(mockConfig, jobQueueService);
  });

  afterEach(async () => {
    // Clean up scheduler and job queue
    await scheduler.shutdown(1000);
    await jobQueueService.shutdown(1000);
    
    // Clear any remaining timers
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should create scheduler with provided configuration', () => {
      expect(scheduler).toBeInstanceOf(MigrationScheduler);
      
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isEnabled).toBe(true);
      expect(status.totalExecutions).toBe(0);
      expect(status.failedExecutions).toBe(0);
    });
  });

  describe('start()', () => {
    it('should start the scheduler when enabled', async () => {
      scheduler.start();
      
      // Wait a small amount to ensure uptime is calculated
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.uptime).toBeGreaterThan(0);
    });

    it('should not start when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledScheduler = new MigrationScheduler(disabledConfig, jobQueueService);
      
      disabledScheduler.start();
      
      const status = disabledScheduler.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isEnabled).toBe(false);
    });

    it('should not start if already running', () => {
      scheduler.start();
      const firstStatus = scheduler.getStatus();
      
      scheduler.start(); // Try to start again
      const secondStatus = scheduler.getStatus();
      
      expect(firstStatus.isRunning).toBe(true);
      expect(secondStatus.isRunning).toBe(true);
      expect(secondStatus.uptime).toBeGreaterThanOrEqual(firstStatus.uptime);
    });

    it('should not start during shutdown', async () => {
      scheduler.start();
      
      // Start shutdown but don't wait for completion
      const shutdownPromise = scheduler.shutdown(5000);
      
      // Try to start during shutdown
      scheduler.start();
      
      await shutdownPromise;
      
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should stop the scheduler', () => {
      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);
      
      scheduler.stop();
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it('should handle stop when not running', () => {
      expect(scheduler.getStatus().isRunning).toBe(false);
      
      scheduler.stop(); // Should not throw
      expect(scheduler.getStatus().isRunning).toBe(false);
    });
  });

  describe('executeNow()', () => {
    beforeEach(() => {
      // Start job queue processing
      jobQueueService.startProcessing();
    });

    it('should execute migration job immediately', async () => {
      const jobId = await scheduler.executeNow();
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      
      const job = jobQueueService.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.type).toBe(JobType.MIGRATE_SPOT_INSTANCES);
      
      const payload = job?.payload as MigrateSpotInstancesJobPayload;
      expect(payload.scheduledAt).toBeInstanceOf(Date);
      expect(payload.config?.dryRun).toBe(false);
      expect(payload.config?.maxMigrations).toBe(5);
    });

    it('should throw error when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledScheduler = new MigrationScheduler(disabledConfig, jobQueueService);
      
      await expect(disabledScheduler.executeNow()).rejects.toThrow('Migration scheduler is disabled');
    });

    it('should throw error during shutdown', async () => {
      scheduler.start();
      
      // Start shutdown
      const shutdownPromise = scheduler.shutdown(5000);
      
      // Try to execute during shutdown
      await expect(scheduler.executeNow()).rejects.toThrow('Cannot execute during shutdown');
      
      await shutdownPromise;
    });

    it('should use dry run mode when configured', async () => {
      const dryRunConfig = { ...mockConfig, dryRunMode: true };
      const dryRunScheduler = new MigrationScheduler(dryRunConfig, jobQueueService);
      
      const jobId = await dryRunScheduler.executeNow();
      const job = jobQueueService.getJob(jobId);
      const payload = job?.payload as MigrateSpotInstancesJobPayload;
      
      expect(payload.config?.dryRun).toBe(true);
    });
  });

  describe('job deduplication', () => {
    beforeEach(() => {
      jobQueueService.startProcessing();
    });

    it('should prevent overlapping executions', async () => {
      // Add a pending migration job manually
      const existingJobId = await jobQueueService.addJob(
        JobType.MIGRATE_SPOT_INSTANCES,
        {
          scheduledAt: new Date(),
          jobId: 'existing_job',
          config: { dryRun: false }
        } as MigrateSpotInstancesJobPayload,
        JobPriority.NORMAL
      );

      // Try to execute another job
      const newJobId = await scheduler.executeNow();
      
      // Should return the existing job ID instead of creating a new one
      expect(newJobId).toBe(existingJobId);
    });

    it('should allow execution when no active jobs exist', async () => {
      const jobId = await scheduler.executeNow();
      
      expect(jobId).toBeDefined();
      
      const job = jobQueueService.getJob(jobId);
      expect(job?.type).toBe(JobType.MIGRATE_SPOT_INSTANCES);
    });
  });

  describe('scheduled execution', () => {
    beforeEach(() => {
      jobQueueService.startProcessing();
    });

    it('should execute jobs at configured intervals', async () => {
      const fastConfig = { ...mockConfig, scheduleIntervalMs: 100 }; // 100ms for fast test
      const fastScheduler = new MigrationScheduler(fastConfig, jobQueueService);
      
      fastScheduler.start();
      
      // Wait for at least 2 executions
      await new Promise(resolve => setTimeout(resolve, 250));
      
      const status = fastScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(1);
      expect(status.lastExecution).toBeDefined();
      
      await fastScheduler.shutdown(1000);
    }, 10000);

    it('should update execution statistics', async () => {
      const initialStatus = scheduler.getStatus();
      expect(initialStatus.totalExecutions).toBe(0);
      
      await scheduler.executeNow();
      
      const updatedStatus = scheduler.getStatus();
      expect(updatedStatus.totalExecutions).toBe(1);
      expect(updatedStatus.lastExecution).toBeDefined();
    });
  });

  describe('graceful shutdown', () => {
    it('should shutdown gracefully', async () => {
      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);
      
      await scheduler.shutdown(1000);
      
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should wait for current job to complete', async () => {
      jobQueueService.startProcessing();
      
      // Register a slow job handler to simulate long-running job
      jobQueueService.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });
      
      scheduler.start();
      await scheduler.executeNow();
      
      const shutdownStart = Date.now();
      await scheduler.shutdown(2000);
      const shutdownDuration = Date.now() - shutdownStart;
      
      // Should wait for job completion
      expect(shutdownDuration).toBeGreaterThan(400);
      expect(shutdownDuration).toBeLessThan(2000);
    });

    it('should timeout if job takes too long', async () => {
      jobQueueService.startProcessing();
      
      // Register a very slow job handler
      jobQueueService.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });
      
      scheduler.start();
      await scheduler.executeNow();
      
      const shutdownStart = Date.now();
      await scheduler.shutdown(500); // Short timeout
      const shutdownDuration = Date.now() - shutdownStart;
      
      // Should timeout
      expect(shutdownDuration).toBeGreaterThan(400);
      expect(shutdownDuration).toBeLessThan(700);
    });
  });

  describe('health checks', () => {
    it('should be healthy when enabled and running', () => {
      scheduler.start();
      
      expect(scheduler.isHealthy()).toBe(true);
      
      const healthDetails = scheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(true);
      expect(healthDetails.issues).toHaveLength(0);
    });

    it('should be healthy when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledScheduler = new MigrationScheduler(disabledConfig, jobQueueService);
      
      expect(disabledScheduler.isHealthy()).toBe(true);
      
      const healthDetails = disabledScheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(true);
      expect(healthDetails.status.isEnabled).toBe(false);
    });

    it('should be unhealthy when enabled but not running', () => {
      // Scheduler is enabled but not started
      expect(scheduler.isHealthy()).toBe(false);
      
      const healthDetails = scheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(false);
      expect(healthDetails.issues).toContain('Scheduler should be running but is stopped');
    });

    it('should be unhealthy during shutdown', async () => {
      scheduler.start();
      
      // Start shutdown but don't wait
      const shutdownPromise = scheduler.shutdown(1000);
      
      expect(scheduler.isHealthy()).toBe(false);
      
      const healthDetails = scheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(false);
      expect(healthDetails.issues).toContain('Scheduler is shutting down');
      
      await shutdownPromise;
    });

    it('should be unhealthy with high failure rate', () => {
      // Simulate high failure rate
      scheduler.start();
      
      // Access private properties for testing (not ideal but necessary for this test)
      (scheduler as any).totalExecutions = 20;
      (scheduler as any).failedExecutions = 12; // 60% failure rate
      
      expect(scheduler.isHealthy()).toBe(false);
      
      const healthDetails = scheduler.getHealthDetails();
      expect(healthDetails.healthy).toBe(false);
      expect(healthDetails.issues.some(issue => issue.includes('High failure rate'))).toBe(true);
    });
  });

  describe('status reporting', () => {
    it('should provide accurate status information', () => {
      const status = scheduler.getStatus();
      
      expect(status).toMatchObject({
        isRunning: false,
        isEnabled: true,
        totalExecutions: 0,
        failedExecutions: 0,
        uptime: 0
      });
      expect(status.lastExecution).toBeUndefined();
      expect(status.nextExecution).toBeUndefined();
      expect(status.currentJobId).toBeUndefined();
    });

    it('should update status when running', async () => {
      scheduler.start();
      
      // Wait a small amount to ensure uptime is calculated
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.uptime).toBeGreaterThan(0);
    });

    it('should track execution statistics', async () => {
      jobQueueService.startProcessing();
      
      await scheduler.executeNow();
      
      const status = scheduler.getStatus();
      expect(status.totalExecutions).toBe(1);
      expect(status.lastExecution).toBeInstanceOf(Date);
    });
  });

  describe('createMigrationScheduler factory', () => {
    it('should create scheduler from config', () => {
      const mockFullConfig: Config = {
        nodeEnv: 'test',
        port: 3000,
        logLevel: 'info',
        novita: {
          apiKey: 'test-key',
          baseUrl: 'https://api.novita.ai'
        },
        webhook: {},
        defaults: {
          region: 'CN-HK-01',
          pollInterval: 30,
          maxRetryAttempts: 3,
          requestTimeout: 30000,
          webhookTimeout: 10000,
          cacheTimeout: 300,
          maxConcurrentJobs: 10
        },
        security: {
          enableCors: true,
          enableHelmet: true,
          rateLimitWindowMs: 900000,
          rateLimitMaxRequests: 100
        },
        instanceListing: {
          enableComprehensiveListing: true,
          defaultIncludeNovitaOnly: true,
          defaultSyncLocalState: false,
          comprehensiveCacheTtl: 30,
          novitaApiCacheTtl: 60,
          enableFallbackToLocal: true,
          novitaApiTimeout: 15000
        },
        healthCheck: {
          defaultTimeoutMs: 10000,
          defaultRetryAttempts: 3,
          defaultRetryDelayMs: 2000,
          defaultMaxWaitTimeMs: 300000
        },
        migration: mockConfig
      };

      const createdScheduler = createMigrationScheduler(mockFullConfig, jobQueueService);
      
      expect(createdScheduler).toBeInstanceOf(MigrationScheduler);
      expect(createdScheduler.getStatus().isEnabled).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle job execution errors gracefully', async () => {
      jobQueueService.startProcessing();
      
      // Register a failing job handler
      jobQueueService.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, async () => {
        throw new Error('Test job failure');
      });
      
      const fastConfig = { ...mockConfig, scheduleIntervalMs: 100 };
      const fastScheduler = new MigrationScheduler(fastConfig, jobQueueService);
      
      fastScheduler.start();
      
      // Wait for execution and error handling
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const status = fastScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThan(0);
      
      await fastScheduler.shutdown(1000);
    });

    it('should continue scheduling after job failures', async () => {
      jobQueueService.startProcessing();
      
      let callCount = 0;
      jobQueueService.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First call fails');
        }
        // Second call succeeds
      });
      
      const fastConfig = { ...mockConfig, scheduleIntervalMs: 100 };
      const fastScheduler = new MigrationScheduler(fastConfig, jobQueueService);
      
      fastScheduler.start();
      
      // Wait for multiple executions
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const status = fastScheduler.getStatus();
      expect(status.totalExecutions).toBeGreaterThanOrEqual(1);
      
      await fastScheduler.shutdown(1000);
    });
  });
});