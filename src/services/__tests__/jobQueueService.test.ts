/**
 * Unit tests for JobQueueService
 */

import { JobQueueService } from '../jobQueueService';
import {
  JobType,
  JobStatus,
  JobPriority,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload,
  SendWebhookJobPayload
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

describe('JobQueueService', () => {
  let jobQueue: JobQueueService;

  beforeEach(() => {
    jobQueue = new JobQueueService(100); // Fast processing for tests
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jobQueue.stopProcessing();
    await new Promise(resolve => setTimeout(resolve, 50)); // Allow cleanup
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');

      const job = jobQueue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.type).toBe(JobType.CREATE_INSTANCE);
      expect(job?.status).toBe(JobStatus.PENDING);
      expect(job?.payload).toEqual(payload);
    });

    it('should add job with specified priority and max attempts', async () => {
      const payload: SendWebhookJobPayload = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      const jobId = await jobQueue.addJob(
        JobType.SEND_WEBHOOK,
        payload,
        JobPriority.HIGH,
        5
      );

      const job = jobQueue.getJob(jobId);
      expect(job?.priority).toBe(JobPriority.HIGH);
      expect(job?.maxAttempts).toBe(5);
    });

    it('should start processing when first job is added', async () => {
      const startProcessingSpy = jest.spyOn(jobQueue, 'startProcessing');
      
      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      await jobQueue.addJob(JobType.CREATE_INSTANCE, payload);

      expect(startProcessingSpy).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return job by ID', async () => {
      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload);
      const job = jobQueue.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
    });

    it('should return undefined for non-existent job', () => {
      const job = jobQueue.getJob('non-existent-id');
      expect(job).toBeUndefined();
    });
  });

  describe('getJobs', () => {
    beforeEach(async () => {
      // Add multiple jobs for testing
      await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'instance-1',
        name: 'test1',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      }, JobPriority.HIGH);

      await jobQueue.addJob(JobType.MONITOR_INSTANCE, {
        instanceId: 'instance-2',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000
      }, JobPriority.NORMAL);

      await jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      }, JobPriority.LOW);
    });

    it('should return all jobs when no filter is provided', () => {
      const jobs = jobQueue.getJobs();
      expect(jobs).toHaveLength(3);
    });

    it('should filter jobs by status', () => {
      const pendingJobs = jobQueue.getJobs({ status: JobStatus.PENDING });
      expect(pendingJobs).toHaveLength(3);
      expect(pendingJobs.every(job => job.status === JobStatus.PENDING)).toBe(true);
    });

    it('should filter jobs by type', () => {
      const createJobs = jobQueue.getJobs({ type: JobType.CREATE_INSTANCE });
      expect(createJobs).toHaveLength(1);
      expect(createJobs[0]?.type).toBe(JobType.CREATE_INSTANCE);
    });

    it('should limit number of returned jobs', () => {
      const jobs = jobQueue.getJobs({ limit: 2 });
      expect(jobs).toHaveLength(2);
    });

    it('should sort jobs by priority (highest first) then by creation time', () => {
      const jobs = jobQueue.getJobs();
      expect(jobs[0]?.priority).toBe(JobPriority.HIGH);
      expect(jobs[1]?.priority).toBe(JobPriority.NORMAL);
      expect(jobs[2]?.priority).toBe(JobPriority.LOW);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics for empty queue', () => {
      const stats = jobQueue.getStats();
      
      expect(stats.totalJobs).toBe(0);
      expect(stats.pendingJobs).toBe(0);
      expect(stats.processingJobs).toBe(0);
      expect(stats.completedJobs).toBe(0);
      expect(stats.failedJobs).toBe(0);
      expect(stats.jobsByType[JobType.CREATE_INSTANCE]).toBe(0);
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBe(0);
      expect(stats.jobsByType[JobType.SEND_WEBHOOK]).toBe(0);
    });

    it('should return correct statistics with jobs', async () => {
      await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'instance-1',
        name: 'test1',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      });

      await jobQueue.addJob(JobType.MONITOR_INSTANCE, {
        instanceId: 'instance-2',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000
      });

      const stats = jobQueue.getStats();
      
      expect(stats.totalJobs).toBe(2);
      expect(stats.pendingJobs).toBe(2);
      expect(stats.jobsByType[JobType.CREATE_INSTANCE]).toBe(1);
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBe(1);
    });
  });

  describe('registerHandler', () => {
    it('should register job handler for specific type', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);
      
      // Verify handler is registered (we can't directly test the private map)
      // This will be tested indirectly through job processing
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('job processing', () => {
    it('should process jobs with registered handlers', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(handler).toHaveBeenCalled();
      
      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.completedAt).toBeDefined();
    });

    it('should handle job processing failures and retry', async () => {
      let callCount = 0;
      const handler = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Simulated failure');
        }
        return Promise.resolve();
      });

      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload, JobPriority.NORMAL, 3);

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(handler).toHaveBeenCalledTimes(3);
      
      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.attempts).toBe(3);
    });

    it('should mark job as failed after max attempts', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload, JobPriority.NORMAL, 2);

      // Wait for all attempts
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(handler).toHaveBeenCalledTimes(2);
      
      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.attempts).toBe(2);
      expect(job?.error).toBe('Persistent failure');
    });

    it('should process jobs in priority order', async () => {
      const processedJobs: string[] = [];
      const handler = jest.fn().mockImplementation((job) => {
        processedJobs.push(job.id);
        return Promise.resolve();
      });

      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      // Add jobs in reverse priority order
      const lowPriorityJobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'low-priority',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      }, JobPriority.LOW);

      const highPriorityJobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'high-priority',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      }, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(processedJobs[0]).toBe(highPriorityJobId);
      expect(processedJobs[1]).toBe(lowPriorityJobId);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed and failed jobs', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      // Add and complete a job
      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      // Manually set completion time to past
      const job = jobQueue.getJob(jobId);
      if (job) {
        job.completedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }

      const removedCount = jobQueue.cleanup(24 * 60 * 60 * 1000); // 24 hours

      expect(removedCount).toBe(1);
      expect(jobQueue.getJob(jobId)).toBeUndefined();
    });

    it('should not remove recent jobs', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const removedCount = jobQueue.cleanup(24 * 60 * 60 * 1000); // 24 hours

      expect(removedCount).toBe(0);
      expect(jobQueue.getJob(jobId)).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should stop processing and wait for current jobs', async () => {
      const handler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, handler);

      await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      });

      // Start shutdown while job is processing
      const shutdownPromise = jobQueue.shutdown(1000);
      
      await shutdownPromise;

      expect(jobQueue.getStats().processingJobs).toBe(0);
    });
  });
});