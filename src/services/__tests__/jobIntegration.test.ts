/**
 * Integration test for job queue and worker
 */

import { JobQueueService } from '../jobQueueService';
import { JobWorkerService } from '../jobWorkerService';
import { JobType, JobStatus, CreateInstanceJobPayload } from '../../types/job';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Job Queue and Worker Integration', () => {
  let jobQueue: JobQueueService;
  let jobWorker: JobWorkerService;

  beforeEach(() => {
    jobQueue = new JobQueueService(50); // Fast processing
    jobWorker = new JobWorkerService(jobQueue);
  });

  afterEach(async () => {
    await jobWorker.shutdown(1000);
  });

  it('should process a simple job end-to-end', async () => {
    const payload: CreateInstanceJobPayload = {
      instanceId: 'test-instance',
      name: 'test',
      productName: 'RTX 4090',
      templateId: 'template-1',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01'
    };

    // Start the worker
    jobWorker.start();

    // Add a job
    const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload);

    // Wait for processing
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds max
    
    while (attempts < maxAttempts) {
      const job = jobQueue.getJob(jobId);
      if (job?.status === JobStatus.COMPLETED || job?.status === JobStatus.FAILED) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const job = jobQueue.getJob(jobId);
    expect(job?.status).toBe(JobStatus.COMPLETED);
  }, 10000);

  it('should handle job failures correctly', async () => {
    // Mock Math.random to always trigger failure
    const originalRandom = Math.random;
    Math.random = jest.fn().mockReturnValue(0.05); // Will trigger failure

    const payload: CreateInstanceJobPayload = {
      instanceId: 'test-instance',
      name: 'test',
      productName: 'RTX 4090',
      templateId: 'template-1',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01'
    };

    // Start the worker
    jobWorker.start();

    // Add a job with only 1 attempt
    const jobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, payload, undefined, 1);

    // Wait for processing
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds max
    
    while (attempts < maxAttempts) {
      const job = jobQueue.getJob(jobId);
      if (job?.status === JobStatus.COMPLETED || job?.status === JobStatus.FAILED) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const job = jobQueue.getJob(jobId);
    expect(job?.status).toBe(JobStatus.FAILED);
    expect(job?.error).toContain('Simulated instance creation failure');

    // Restore Math.random
    Math.random = originalRandom;
  }, 10000);
});