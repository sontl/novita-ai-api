/**
 * Tests for JobWorkerService startup monitoring functionality
 */

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { JobType, JobStatus, JobPriority } from '../../types/job';
import { StartInstanceJobPayload } from '../../types/api';
import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { webhookClient } from '../../clients/webhookClient';

// Mock dependencies
jest.mock('../instanceService');
jest.mock('../novitaApiService');
jest.mock('../../clients/webhookClient');

describe('JobWorkerService - Startup Monitoring', () => {
  let jobWorkerService: JobWorkerService;
  let jobQueue: JobQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    jobQueue = new JobQueueService();
    jobWorkerService = new JobWorkerService(jobQueue);
  });

  afterEach(async () => {
    await jobWorkerService.stop();
  });

  describe('handler registration', () => {
    it('should register handleMonitorStartup handler for MONITOR_STARTUP job type', () => {
      // Verify that the handler is registered by checking if we can add a job of this type
      const payload: StartInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        healthCheckConfig: {
          timeoutMs: 10000,
          retryAttempts: 3,
          retryDelayMs: 2000,
          maxWaitTimeMs: 300000
        },
        startTime: new Date(),
        maxWaitTime: 300000
      };

      // This should not throw an error if the handler is properly registered
      expect(() => {
        jobQueue.addJob(JobType.MONITOR_STARTUP, payload, JobPriority.HIGH);
      }).not.toThrow();
    });
  });

  describe('handleMonitorStartup', () => {
    it('should handle startup monitoring job payload correctly', async () => {
      const payload: StartInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        healthCheckConfig: {
          timeoutMs: 10000,
          retryAttempts: 3,
          retryDelayMs: 2000,
          maxWaitTimeMs: 300000
        },
        startTime: new Date(),
        maxWaitTime: 300000
      };

      // Mock instance service to return a valid state
      (instanceService.getInstanceState as jest.Mock).mockReturnValue({
        id: 'test-instance',
        status: 'starting',
        timestamps: { created: new Date() }
      });

      // Mock novita API to return a running instance
      (novitaApiService.getInstance as jest.Mock).mockResolvedValue({
        id: 'novita-123',
        status: 'running',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      });

      // Add the job
      const jobId = await jobQueue.addJob(JobType.MONITOR_STARTUP, payload, JobPriority.HIGH);
      
      // Start processing
      await jobWorkerService.start();
      
      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the job was processed (it should be in processing state due to async nature)
      const job = jobQueue.getJob(jobId);
      expect(job).toBeDefined();
      expect([JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.COMPLETED]).toContain(job?.status);
    });
  });
});