/**
 * Unit tests for JobWorkerService
 */

// Set required environment variables before any imports
process.env.NOVITA_API_KEY = 'test-api-key';

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import {
  Job,
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

describe('JobWorkerService', () => {
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
    it('should register handlers for all job types', () => {
      const registerHandlerSpy = jest.spyOn(jobQueue, 'registerHandler');
      
      new JobWorkerService(jobQueue);

      expect(registerHandlerSpy).toHaveBeenCalledWith(JobType.CREATE_INSTANCE, expect.any(Function));
      expect(registerHandlerSpy).toHaveBeenCalledWith(JobType.MONITOR_INSTANCE, expect.any(Function));
      expect(registerHandlerSpy).toHaveBeenCalledWith(JobType.SEND_WEBHOOK, expect.any(Function));
    });
  });

  describe('handleCreateInstance', () => {
    it('should process create instance job successfully', async () => {
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
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
    });

    it('should handle create instance job failure', async () => {
      // Mock Math.random to always trigger failure
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.05); // Will trigger failure in simulation

      const payload: CreateInstanceJobPayload = {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toContain('Simulated instance creation failure');

      // Restore Math.random
      Math.random = originalRandom;
    });
  });

  describe('handleMonitorInstance', () => {
    it('should process monitor instance job when instance becomes ready', async () => {
      // Mock Math.random to always return ready state
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.2); // Will trigger ready state

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook'
      };

      const jobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);

      // Should have created a webhook job
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should reschedule monitoring when instance is not ready', async () => {
      // Mock Math.random to never return ready state
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.8); // Will never trigger ready state

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000
      };

      const jobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);

      // Should have created another monitoring job
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(1);

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should handle monitoring timeout', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(Date.now() - 700000), // 700 seconds ago
        maxWaitTime: 600000, // 600 seconds max
        webhookUrl: 'https://example.com/webhook'
      };

      const jobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toContain('monitoring timeout');

      // Should have created a failure webhook job
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);
    });
  });

  describe('handleSendWebhook', () => {
    it('should process send webhook job successfully', async () => {
      const payload: SendWebhookJobPayload = {
        url: 'https://example.com/webhook',
        payload: {
          instanceId: 'test-instance',
          status: 'running'
        }
      };

      const jobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
    });

    it('should handle send webhook job failure', async () => {
      // Mock Math.random to always trigger failure
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.01); // Will trigger failure in simulation

      const payload: SendWebhookJobPayload = {
        url: 'https://example.com/webhook',
        payload: {
          instanceId: 'test-instance',
          status: 'running'
        }
      };

      const jobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, payload, JobPriority.NORMAL, 1);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.error).toContain('Simulated webhook delivery failure');

      // Restore Math.random
      Math.random = originalRandom;
    });
  });

  describe('start and stop', () => {
    it('should start job processing', () => {
      const startProcessingSpy = jest.spyOn(jobQueue, 'startProcessing');
      
      jobWorker.start();

      expect(startProcessingSpy).toHaveBeenCalled();
    });

    it('should stop job processing', () => {
      const stopProcessingSpy = jest.spyOn(jobQueue, 'stopProcessing');
      
      jobWorker.stop();

      expect(stopProcessingSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should gracefully shutdown', async () => {
      const shutdownSpy = jest.spyOn(jobQueue, 'shutdown');
      
      await jobWorker.shutdown(1000);

      expect(shutdownSpy).toHaveBeenCalledWith(1000);
    });
  });

  describe('integration tests', () => {
    it('should process multiple job types in correct order', async () => {
      const processedJobs: Array<{ type: JobType; id: string }> = [];
      
      // Override the job handlers to track processing order
      const originalHandlers = {
        create: jobWorker['handleCreateInstance'].bind(jobWorker),
        monitor: jobWorker['handleMonitorInstance'].bind(jobWorker),
        webhook: jobWorker['handleSendWebhook'].bind(jobWorker)
      };

      jobWorker['handleCreateInstance'] = async (job: Job) => {
        processedJobs.push({ type: job.type, id: job.id });
        return originalHandlers.create(job);
      };

      jobWorker['handleMonitorInstance'] = async (job: Job) => {
        processedJobs.push({ type: job.type, id: job.id });
        return originalHandlers.monitor(job);
      };

      jobWorker['handleSendWebhook'] = async (job: Job) => {
        processedJobs.push({ type: job.type, id: job.id });
        return originalHandlers.webhook(job);
      };

      // Re-register handlers
      jobQueue.registerHandler(JobType.CREATE_INSTANCE, jobWorker['handleCreateInstance'].bind(jobWorker));
      jobQueue.registerHandler(JobType.MONITOR_INSTANCE, jobWorker['handleMonitorInstance'].bind(jobWorker));
      jobQueue.registerHandler(JobType.SEND_WEBHOOK, jobWorker['handleSendWebhook'].bind(jobWorker));

      // Add jobs with different priorities
      const webhookJobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      }, JobPriority.LOW);

      const createJobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
        instanceId: 'test-instance',
        name: 'test',
        productName: 'RTX 4090',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      }, JobPriority.HIGH);

      const monitorJobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000
      }, JobPriority.NORMAL);

      // Wait for all jobs to process
      await new Promise(resolve => setTimeout(resolve, 800));

      expect(processedJobs).toHaveLength(3);
      expect(processedJobs[0]?.id).toBe(createJobId); // High priority first
      expect(processedJobs[1]?.id).toBe(monitorJobId); // Normal priority second
      expect(processedJobs[2]?.id).toBe(webhookJobId); // Low priority last
    });

    it('should handle job failures and retries correctly', async () => {
      let attemptCount = 0;
      
      // Override handler to fail first two attempts
      jobWorker['handleSendWebhook'] = async (job: Job) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        // Success on third attempt
      };

      jobQueue.registerHandler(JobType.SEND_WEBHOOK, jobWorker['handleSendWebhook'].bind(jobWorker));

      const jobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      }, JobPriority.NORMAL, 3);

      // Wait for all attempts
      await new Promise(resolve => setTimeout(resolve, 1200));

      const job = jobQueue.getJob(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.attempts).toBe(3);
      expect(attemptCount).toBe(3);
    });
  });
});