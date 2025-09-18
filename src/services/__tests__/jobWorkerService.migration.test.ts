/**
 * Unit tests for JobWorkerService migration job handler
 */

// Set required environment variables before any imports
process.env.NOVITA_API_KEY = 'test-api-key';

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { instanceMigrationService } from '../instanceMigrationService';
import {
  Job,
  JobType,
  JobStatus,
  JobPriority,
  MigrateSpotInstancesJobPayload,
  MigrationJobResult
} from '../../types/job';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock instanceMigrationService
jest.mock('../instanceMigrationService', () => ({
  instanceMigrationService: {
    processMigrationBatch: jest.fn()
  }
}));

const mockInstanceMigrationService = instanceMigrationService as jest.Mocked<typeof instanceMigrationService>;

describe('JobWorkerService - Migration Job Handler', () => {
  let jobQueue: JobQueueService;
  let jobWorker: JobWorkerService;

  beforeEach(() => {
    jobQueue = new JobQueueService(50); // Fast processing for tests
    jobWorker = new JobWorkerService(jobQueue);
    jobWorker.start(); // Start processing immediately
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jobWorker.stop();
    await new Promise(resolve => setTimeout(resolve, 50)); // Allow cleanup
  });

  describe('constructor', () => {
    it('should register migration job handler', () => {
      const registerHandlerSpy = jest.spyOn(jobQueue, 'registerHandler');
      
      new JobWorkerService(jobQueue);

      expect(registerHandlerSpy).toHaveBeenCalledWith(
        JobType.MIGRATE_SPOT_INSTANCES, 
        expect.any(Function)
      );
    });
  });

  describe('handleMigrateSpotInstances', () => {
    it('should process migration job successfully with migrations performed', async () => {
      const mockResult: MigrationJobResult = {
        totalProcessed: 5,
        migrated: 3,
        skipped: 2,
        errors: 0,
        executionTimeMs: 1500
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-1',
        config: {
          dryRun: false,
          maxMigrations: 10
        }
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should process migration job successfully with no instances to process', async () => {
      const mockResult: MigrationJobResult = {
        totalProcessed: 0,
        migrated: 0,
        skipped: 0,
        errors: 0,
        executionTimeMs: 500
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-2'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should process migration job successfully with some errors', async () => {
      const mockResult: MigrationJobResult = {
        totalProcessed: 4,
        migrated: 2,
        skipped: 1,
        errors: 1,
        executionTimeMs: 2000
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-3',
        config: {
          dryRun: true
        }
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle migration job failure', async () => {
      const migrationError = new Error('Migration service unavailable');
      mockInstanceMigrationService.processMigrationBatch.mockRejectedValue(migrationError);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-4'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toContain('Migration service unavailable');
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle migration job with unknown error', async () => {
      mockInstanceMigrationService.processMigrationBatch.mockRejectedValue('Unknown error string');

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-5'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toContain('Unknown error');
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should process migration job with minimal payload', async () => {
      const mockResult: MigrationJobResult = {
        totalProcessed: 1,
        migrated: 1,
        skipped: 0,
        errors: 0,
        executionTimeMs: 800
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-6'
        // No config provided
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle migration job with high priority', async () => {
      const mockResult: MigrationJobResult = {
        totalProcessed: 2,
        migrated: 2,
        skipped: 0,
        errors: 0,
        executionTimeMs: 1200
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-7',
        config: {
          dryRun: false,
          maxMigrations: 5
        }
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload, JobPriority.HIGH);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle migration job retry on failure', async () => {
      let attemptCount = 0;
      mockInstanceMigrationService.processMigrationBatch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error(`Attempt ${attemptCount} failed`));
        }
        // Success on third attempt
        return Promise.resolve({
          totalProcessed: 1,
          migrated: 1,
          skipped: 0,
          errors: 0,
          executionTimeMs: 1000
        });
      });

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'migration-job-8'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload, JobPriority.NORMAL, 3);

      // Wait for all attempts
      await new Promise(resolve => setTimeout(resolve, 1200));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.attempts).toBe(3);
      expect(attemptCount).toBe(3);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(3);
    });
  });

  describe('integration with other job types', () => {
    it('should process migration jobs alongside other job types', async () => {
      const processedJobs: Array<{ type: JobType; id: string }> = [];
      
      // Mock migration service
      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue({
        totalProcessed: 1,
        migrated: 1,
        skipped: 0,
        errors: 0,
        executionTimeMs: 500
      });

      // Override handlers to track processing order
      const originalMigrationHandler = jobWorker['handleMigrateSpotInstances'].bind(jobWorker);
      const originalWebhookHandler = jobWorker['handleSendWebhook'].bind(jobWorker);

      jobWorker['handleMigrateSpotInstances'] = async (job: Job) => {
        processedJobs.push({ type: job.type, id: job.id });
        return originalMigrationHandler(job);
      };

      jobWorker['handleSendWebhook'] = async (job: Job) => {
        processedJobs.push({ type: job.type, id: job.id });
        return originalWebhookHandler(job);
      };

      // Re-register handlers
      jobQueue.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, jobWorker['handleMigrateSpotInstances'].bind(jobWorker));
      jobQueue.registerHandler(JobType.SEND_WEBHOOK, jobWorker['handleSendWebhook'].bind(jobWorker));

      // Add jobs with different priorities
      const webhookJobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      }, JobPriority.LOW);

      const migrationJobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, {
        scheduledAt: new Date(),
        jobId: 'migration-integration-test'
      }, JobPriority.HIGH);

      // Wait for all jobs to process
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(processedJobs).toHaveLength(2);
      expect(processedJobs[0]?.id).toBe(migrationJobId); // High priority first
      expect(processedJobs[1]?.id).toBe(webhookJobId); // Low priority second
    });
  });

  describe('error handling patterns', () => {
    it('should follow existing error handling patterns', async () => {
      const migrationError = new Error('Test migration error');
      migrationError.name = 'MigrationServiceError';
      
      mockInstanceMigrationService.processMigrationBatch.mockRejectedValue(migrationError);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'error-handling-test'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toBe('Test migration error');
      expect(job?.attempts).toBe(1);
    });

    it('should handle timeout scenarios gracefully', async () => {
      // Mock a long-running migration that would timeout
      mockInstanceMigrationService.processMigrationBatch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              totalProcessed: 10,
              migrated: 5,
              skipped: 3,
              errors: 2,
              executionTimeMs: 30000 // 30 seconds
            });
          }, 100); // Resolve quickly for test
        });
      });

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'timeout-test'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(mockInstanceMigrationService.processMigrationBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging and metrics', () => {
    it('should log comprehensive metrics for successful migration', async () => {
      const { logger } = require('../../utils/logger');
      
      const mockResult: MigrationJobResult = {
        totalProcessed: 8,
        migrated: 5,
        skipped: 2,
        errors: 1,
        executionTimeMs: 2500
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'metrics-test'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);

      // Verify logging calls
      expect(logger.info).toHaveBeenCalledWith(
        'Processing migrate spot instances job',
        expect.objectContaining({
          jobId: job?.id,
          scheduledAt: payload.scheduledAt
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Spot instance migration job completed successfully',
        expect.objectContaining({
          jobId: job?.id,
          totalProcessed: 8,
          migrated: 5,
          skipped: 2,
          errors: 1,
          successRate: '62.50%'
        })
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Migration job completed with errors',
        expect.objectContaining({
          jobId: job?.id,
          errorCount: 1,
          errorRate: '12.50%'
        })
      );
    });

    it('should log appropriate message when no instances need migration', async () => {
      const { logger } = require('../../utils/logger');
      
      const mockResult: MigrationJobResult = {
        totalProcessed: 0,
        migrated: 0,
        skipped: 0,
        errors: 0,
        executionTimeMs: 300
      };

      mockInstanceMigrationService.processMigrationBatch.mockResolvedValue(mockResult);

      const payload: MigrateSpotInstancesJobPayload = {
        scheduledAt: new Date(),
        jobId: 'no-instances-test'
      };

      const jobId = await jobQueue.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);

      expect(logger.info).toHaveBeenCalledWith(
        'No instances required migration processing',
        expect.objectContaining({
          jobId: job?.id,
          scheduledAt: payload.scheduledAt
        })
      );
    });
  });
});