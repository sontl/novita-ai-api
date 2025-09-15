/**
 * Integration tests for instance startup and monitoring functionality
 */

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { webhookClient } from '../../clients/webhookClient';
import { config } from '../../config/config';
import {
  JobType,
  JobPriority,
  MonitorInstanceJobPayload,
  CreateInstanceJobPayload
} from '../../types/job';
import { InstanceStatus, InstanceResponse } from '../../types/api';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../../clients/webhookClient');
jest.mock('../../config/config', () => ({
  config: {
    novita: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.novita.ai'
    },
    defaults: {
      pollInterval: 1, // 1 second for faster tests
      maxRetryAttempts: 3,
      requestTimeout: 5000
    }
  }
}));

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockWebhookClient = webhookClient as jest.Mocked<typeof webhookClient>;

describe('Instance Startup and Monitoring Integration Tests', () => {
  let jobQueue: JobQueueService;
  let jobWorker: JobWorkerService;
  let mockInstanceId: string;
  let mockNovitaInstanceId: string;

  // Helper function to create mock instance response
  const createMockInstanceResponse = (status: InstanceStatus, additionalProps: Partial<InstanceResponse> = {}): InstanceResponse => ({
    id: mockNovitaInstanceId,
    status,
    name: 'test-instance',
    productId: 'prod_123',
    region: 'CN-HK-01',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot',
    createdAt: new Date().toISOString(),
    ...additionalProps
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    jobQueue = new JobQueueService();
    jobWorker = new JobWorkerService(jobQueue);

    mockInstanceId = 'inst_test_123';
    mockNovitaInstanceId = 'novita_inst_456';

    // Setup instance state
    instanceService.updateInstanceState = jest.fn();
    instanceService.getInstanceState = jest.fn().mockReturnValue({
      id: mockInstanceId,
      name: 'test-instance',
      status: InstanceStatus.STARTING,
      novitaInstanceId: mockNovitaInstanceId,
      timestamps: {
        created: new Date(),
        started: new Date()
      }
    });

    // Mock webhook client
    mockWebhookClient.sendWebhook.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jobWorker.stop();
  });

  describe('Automatic Instance Startup', () => {
    it('should automatically start instance after creation', async () => {
      const createPayload: CreateInstanceJobPayload = {
        instanceId: mockInstanceId,
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      // Mock successful instance creation and start
      mockNovitaApiService.createInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.CREATING)
      );

      mockNovitaApiService.startInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.STARTING)
      );

      // Start worker and add job
      jobWorker.start();
      await jobQueue.addJob(JobType.CREATE_INSTANCE, createPayload, JobPriority.HIGH);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance was created and started
      expect(mockNovitaApiService.createInstance).toHaveBeenCalledTimes(1);
      expect(mockNovitaApiService.startInstance).toHaveBeenCalledWith(mockNovitaInstanceId);

      // Verify monitoring job was queued
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(0);
    });

    it('should handle instance creation failure gracefully', async () => {
      const createPayload: CreateInstanceJobPayload = {
        instanceId: mockInstanceId,
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance creation failure
      mockNovitaApiService.createInstance.mockRejectedValue(new Error('API Error'));

      // Start worker and add job
      jobWorker.start();
      await jobQueue.addJob(JobType.CREATE_INSTANCE, createPayload, JobPriority.HIGH);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance state was updated to failed
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: 'API Error'
        })
      );

      // Verify failure webhook was queued
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);
    });
  });

  describe('Status Polling with Configurable Intervals', () => {
    it('should poll instance status at configured intervals', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000, // 10 minutes
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance still starting
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.STARTING)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for initial processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify status was checked
      expect(mockNovitaApiService.getInstance).toHaveBeenCalledWith(mockNovitaInstanceId);

      // Fast-forward to next poll interval
      jest.advanceTimersByTime(1000); // 1 second (configured poll interval)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify another monitoring job was scheduled
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(1);
    });

    it('should use configurable poll interval from config', () => {
      const monitoringConfig = jobWorker.getMonitoringConfig();
      
      expect(monitoringConfig.pollIntervalMs).toBe(1000); // 1 second from mock config
      expect(monitoringConfig.maxWaitTimeMs).toBe(10 * 60 * 1000); // 10 minutes
      expect(monitoringConfig.maxRetryAttempts).toBe(3);
    });
  });

  describe('Running State Detection', () => {
    it('should detect when instance reaches running state', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000,
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance reaching running state
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.RUNNING, {
          connectionInfo: {
            ssh: 'ssh://user@host:22',
            jupyter: 'https://host:8888'
          }
        })
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance state was updated to running
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.RUNNING,
          timestamps: expect.objectContaining({
            ready: expect.any(Date)
          })
        })
      );

      // Verify success webhook was sent
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);
    });

    it('should stop polling when instance is running', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000
      };

      // Mock instance reaching running state
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.RUNNING)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fast-forward past poll interval
      jest.advanceTimersByTime(2000);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no additional monitoring jobs were scheduled
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.MONITOR_INSTANCE]).toBe(1); // Only the original job
    });
  });

  describe('Startup Failure Handling', () => {
    it('should handle instance startup failure', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000,
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance failing to start
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.FAILED)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance state was updated to failed
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: expect.stringContaining('Instance failed to start'),
          timestamps: expect.objectContaining({
            failed: expect.any(Date)
          })
        })
      );

      // Verify failure webhook was sent
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);
    });

    it('should handle API errors during monitoring', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000,
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock API error
      mockNovitaApiService.getInstance.mockRejectedValue(new Error('Network error'));

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance state was updated to failed
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: 'Network error'
        })
      );
    });
  });

  describe('Timeout Scenarios', () => {
    it('should handle startup timeout', async () => {
      const startTime = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime,
        maxWaitTime: 10 * 60 * 1000, // 10 minutes timeout
        webhookUrl: 'https://example.com/webhook'
      };

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance state was updated to failed with timeout error
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: expect.stringContaining('timeout'),
          timestamps: expect.objectContaining({
            failed: expect.any(Date)
          })
        })
      );

      // Verify timeout webhook was sent
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBeGreaterThan(0);
    });

    it('should not timeout before the configured limit', async () => {
      const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime,
        maxWaitTime: 10 * 60 * 1000 // 10 minutes timeout
      };

      // Mock instance still starting
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.STARTING)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify instance status was checked (not timed out)
      expect(mockNovitaApiService.getInstance).toHaveBeenCalledWith(mockNovitaInstanceId);

      // Verify instance state was not updated to failed
      expect(instanceService.updateInstanceState).not.toHaveBeenCalledWith(
        mockInstanceId,
        expect.objectContaining({
          status: InstanceStatus.FAILED
        })
      );
    });
  });

  describe('Webhook Notifications', () => {
    it('should send success webhook when instance is ready', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000,
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance reaching running state
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.RUNNING)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify webhook job was queued with success payload
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBe(1);
    });

    it('should send failure webhook when instance fails', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000,
        webhookUrl: 'https://example.com/webhook'
      };

      // Mock instance failure
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.FAILED)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify webhook job was queued with failure payload
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBe(1);
    });

    it('should not send webhook when webhookUrl is not configured', async () => {
      const monitorPayload: MonitorInstanceJobPayload = {
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000
        // No webhookUrl
      };

      // Mock instance reaching running state
      mockNovitaApiService.getInstance.mockResolvedValue(
        createMockInstanceResponse(InstanceStatus.RUNNING)
      );

      // Start worker and add monitoring job
      jobWorker.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, monitorPayload, JobPriority.HIGH);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no webhook job was queued
      const queueStats = jobQueue.getStats();
      expect(queueStats.jobsByType[JobType.SEND_WEBHOOK]).toBe(0);
    });
  });

  describe('Configuration Integration', () => {
    it('should use configuration values for monitoring behavior', () => {
      const monitoringConfig = jobWorker.getMonitoringConfig();
      
      // Verify configuration is loaded correctly
      expect(monitoringConfig.pollIntervalMs).toBe(config.defaults.pollInterval * 1000);
      expect(monitoringConfig.maxRetryAttempts).toBe(config.defaults.maxRetryAttempts);
    });
  });
});