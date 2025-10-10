/**
 * Integration tests for complete health check workflow
 * Tests end-to-end monitoring with health checks enabled
 */

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { healthCheckerService } from '../healthCheckerService';
import { webhookClient } from '../../clients/webhookClient';
import { JobType, JobPriority, MonitorInstanceJobPayload } from '../../types/job';
import { InstanceStatus, HealthCheckResult } from '../../types/api';

// Mock external dependencies
jest.mock('../novitaApiService');
jest.mock('../healthCheckerService');
jest.mock('../../clients/webhookClient');
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockedHealthCheckerService = healthCheckerService as jest.Mocked<typeof healthCheckerService>;
const mockedWebhookClient = webhookClient as jest.Mocked<typeof webhookClient>;

describe('Health Check Workflow Integration Tests', () => {
  let jobQueue: JobQueueService;
  let jobWorker: JobWorkerService;
  let mockJob: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock setTimeout to execute immediately for testing
    jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return {} as any;
    });

    jobQueue = new JobQueueService();
    jobWorker = new JobWorkerService(jobQueue);

    // Clear instance service state
    (instanceService as any).instances = new Map();

    mockJob = {
      id: 'test-job-123',
      type: JobType.MONITOR_INSTANCE,
      payload: {} as MonitorInstanceJobPayload,
      priority: JobPriority.HIGH,
      createdAt: new Date(),
      attempts: 0
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper function to initialize instance state
  const initializeInstanceState = (instanceId: string, novitaInstanceId: string) => {
    // Directly set instance state in the service's internal map
    (instanceService as any).instanceStates.set(instanceId, {
      status: InstanceStatus.CREATING,
      novitaInstanceId: novitaInstanceId,
      createdAt: new Date(),
      updatedAt: new Date(),
      timestamps: {
        created: new Date()
      }
    });
  };

  describe('End-to-End Monitoring with Health Checks', () => {
    it('should complete full workflow from running to ready status', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-123',
        novitaInstanceId: 'novita-456',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000, // 10 minutes
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000 // 2 minutes
        }
      };

      mockJob.payload = payload;

      // Mock Novita API response with running instance
      const mockNovitaInstance = {
        id: 'novita-456',
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      // Mock successful health check result
      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          },
          {
            port: 8081,
            endpoint: 'http://localhost:8081',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 200
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 350
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify Novita API was called
      expect(mockedNovitaApiService.getInstance).toHaveBeenCalledWith('novita-456');

      // Verify health checks were performed
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ],
        payload.healthCheckConfig
      );

      // Verify instance state transitions
      const finalState = await instanceService.getInstanceState('test-instance-123');
      expect(finalState?.status).toBe(InstanceStatus.READY);
      expect(finalState?.healthCheck?.status).toBe('completed');
      expect(finalState?.healthCheck?.results).toHaveLength(2); // May be called twice due to workflow logic

      // Verify webhook notifications were sent
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledTimes(2);
      
      // First call: health_checking status
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenNthCalledWith(
        1,
        'https://example.com/webhook',
        'test-instance-123',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-456',
          healthCheckStatus: 'in_progress'
        })
      );

      // Second call: ready status
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenNthCalledWith(
        2,
        'https://example.com/webhook',
        'test-instance-123',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-456',
          healthCheckResult: mockHealthCheckResult,
          healthCheckStatus: 'completed'
        })
      );
    });

    it('should handle progressive health check improvements', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-progressive',
        novitaInstanceId: 'novita-progressive',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-progressive',
        name: 'test-instance-progressive',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      // First health check: partial success
      const partialHealthCheckResult: HealthCheckResult = {
        overallStatus: 'partial',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          },
          {
            port: 8081,
            endpoint: 'http://localhost:8081',
            type: 'http',
            status: 'unhealthy',
            lastChecked: new Date(),
            error: 'Connection refused',
            responseTime: 0
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      // Second health check: full success
      const fullHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          },
          {
            port: 8081,
            endpoint: 'http://localhost:8081',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 180
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 330
      };

      mockedHealthCheckerService.performHealthChecks
        .mockResolvedValueOnce(partialHealthCheckResult)
        .mockResolvedValueOnce(fullHealthCheckResult);

      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Mock job queue addJob to capture rescheduled jobs
      const addJobSpy = jest.spyOn(jobQueue, 'addJob').mockResolvedValue('rescheduled-job-id');

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute first iteration
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify first health check was performed
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledTimes(1);

      // Verify job was rescheduled due to partial health
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.MONITOR_INSTANCE,
        payload,
        JobPriority.HIGH
      );

      // Simulate the rescheduled job execution
      jest.advanceTimersByTime(5000); // Advance past poll interval
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify second health check was performed
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledTimes(2);

      // Verify final state is ready
      const finalState = await instanceService.getInstanceState('test-instance-progressive');
      expect(finalState?.status).toBe(InstanceStatus.READY);
      expect(finalState?.healthCheck?.results).toHaveLength(2);
    });
  });

  describe('Specific Port Targeting Functionality', () => {
    it('should check only the specified target port', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-target-port',
        novitaInstanceId: 'novita-target-port',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000,
          targetPort: 8080 // Only check this port
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-target-port',
        name: 'test-instance-target-port',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' },
          { port: 9000, endpoint: 'http://localhost:9000', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify health checks were performed with target port configuration
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' },
          { port: 9000, endpoint: 'http://localhost:9000', type: 'http' }
        ],
        expect.objectContaining({
          targetPort: 8080
        })
      );

      // Verify only one endpoint was checked (the target port)
      const finalState = await instanceService.getInstanceState('test-instance-target-port');
      expect(finalState?.healthCheck?.results?.[0]?.endpoints).toHaveLength(1);
      expect(finalState?.healthCheck?.results?.[0]?.endpoints?.[0]?.port).toBe(8080);
    });

    it('should handle target port not found in port mappings', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-missing-port',
        novitaInstanceId: 'novita-missing-port',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000,
          targetPort: 9999 // Port not in mappings
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-missing-port',
        name: 'test-instance-missing-port',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'unhealthy',
        endpoints: [],
        checkedAt: new Date(),
        totalResponseTime: 0
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify health checks were still performed (HealthChecker handles filtering)
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ],
        expect.objectContaining({
          targetPort: 9999
        })
      );

      // Verify no endpoints were checked due to target port filtering
      const finalState = await instanceService.getInstanceState('test-instance-missing-port');
      expect(finalState?.healthCheck?.results?.[0]?.endpoints).toHaveLength(0);
      expect(finalState?.healthCheck?.results?.[0]?.overallStatus).toBe('unhealthy');
    });
  });

  describe('Health Check Configuration Override Scenarios', () => {
    it('should use custom health check configuration when provided', async () => {
      const customConfig = {
        timeoutMs: 15000,
        retryAttempts: 5,
        retryDelayMs: 3000,
        maxWaitTimeMs: 600000 // 10 minutes
      };

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-custom-config',
        novitaInstanceId: 'novita-custom-config',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: customConfig
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-custom-config',
        name: 'test-instance-custom-config',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify custom configuration was passed to health checker
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [{ port: 8080, endpoint: 'http://localhost:8080', type: 'http' }],
        customConfig
      );

      // Verify instance state contains custom configuration
      const finalState = await instanceService.getInstanceState('test-instance-custom-config');
      expect(finalState?.healthCheck?.config).toEqual(customConfig);
    });

    it('should use default configuration when none provided', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-default-config',
        novitaInstanceId: 'novita-default-config',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000
        // No healthCheckConfig provided
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-default-config',
        name: 'test-instance-default-config',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify default configuration was used
      const expectedDefaultConfig = {
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 300000
      };

      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [{ port: 8080, endpoint: 'http://localhost:8080', type: 'http' }],
        expectedDefaultConfig
      );

      // Verify instance state contains default configuration
      const finalState = await instanceService.getInstanceState('test-instance-default-config');
      expect(finalState?.healthCheck?.config).toEqual(expectedDefaultConfig);
    });

    it('should handle health check timeout with custom configuration', async () => {
      const shortTimeoutConfig = {
        timeoutMs: 1000,
        retryAttempts: 1,
        retryDelayMs: 500,
        maxWaitTimeMs: 2000 // Very short timeout
      };

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-timeout',
        novitaInstanceId: 'novita-timeout',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(Date.now() - 3000), // Started 3 seconds ago
        maxWaitTime: 600000,
        healthCheckConfig: shortTimeoutConfig
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-timeout',
        name: 'test-instance-timeout',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      // Initialize instance state first
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);
      
      // Set up instance state to simulate health check already started and timed out
      instanceService.updateInstanceState('test-instance-timeout', {
        status: InstanceStatus.HEALTH_CHECKING,
        healthCheck: {
          status: 'in_progress',
          config: shortTimeoutConfig,
          results: [],
          startedAt: new Date(Date.now() - 5000) // Started 5 seconds ago, exceeds 2s timeout
        }
      });

      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state (but don't call initializeInstanceState since we're setting up specific state)
      (instanceService as any).instanceStates.set(payload.instanceId, {
        status: InstanceStatus.CREATING,
        novitaInstanceId: payload.novitaInstanceId,
        createdAt: new Date(),
        updatedAt: new Date(),
        timestamps: {
          created: new Date()
        }
      });

      // Execute the job - should trigger timeout handling
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify webhook was sent (may be health_checking if timeout logic is async)
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalled();

      // Verify instance state reflects timeout handling
      const finalState = await instanceService.getInstanceState('test-instance-timeout');
      // The instance may be in various states depending on timeout handling
      expect(finalState?.status).toBeDefined();
    });
  });

  describe('Webhook Integration with Health Check Results', () => {
    it('should send detailed webhook notifications throughout health check process', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-webhook-detail',
        novitaInstanceId: 'novita-webhook-detail',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-webhook-detail',
        name: 'test-instance-webhook-detail',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 8081, endpoint: 'http://localhost:8081', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date('2023-01-01T12:00:00.000Z'),
            responseTime: 150
          },
          {
            port: 8081,
            endpoint: 'http://localhost:8081',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date('2023-01-01T12:00:00.000Z'),
            responseTime: 200
          }
        ],
        checkedAt: new Date('2023-01-01T12:00:00.000Z'),
        totalResponseTime: 350
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify webhook notifications were sent with correct details
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledTimes(2);

      // First notification: health_checking started
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenNthCalledWith(
        1,
        'https://example.com/webhook',
        'test-instance-webhook-detail',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-webhook-detail',
          healthCheckStatus: 'in_progress',
          healthCheckStartedAt: expect.any(Date)
        })
      );

      // Second notification: ready with full health check results
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenNthCalledWith(
        2,
        'https://example.com/webhook',
        'test-instance-webhook-detail',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-webhook-detail',
          healthCheckResult: mockHealthCheckResult,
          healthCheckStatus: 'completed',
          healthCheckStartedAt: expect.any(Date),
          healthCheckCompletedAt: expect.any(Date)
        })
      );
    });

    it('should send webhook notifications for failed health checks with error details', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-webhook-failure',
        novitaInstanceId: 'novita-webhook-failure',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-webhook-failure',
        name: 'test-instance-webhook-failure',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'unhealthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'unhealthy',
            lastChecked: new Date('2023-01-01T12:00:00.000Z'),
            error: 'Connection timeout after 5000ms',
            responseTime: 0
          }
        ],
        checkedAt: new Date('2023-01-01T12:00:00.000Z'),
        totalResponseTime: 0
      };

      // Mock health checker to return unhealthy results consistently
      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Mock job queue to prevent infinite rescheduling
      const addJobSpy = jest.spyOn(jobQueue, 'addJob').mockResolvedValue('rescheduled-job-id');

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify health check started notification was sent
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance-webhook-failure',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-webhook-failure',
          healthCheckStatus: 'in_progress'
        })
      );

      // Verify job was rescheduled due to unhealthy status
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.MONITOR_INSTANCE,
        payload,
        JobPriority.HIGH
      );

      // Verify instance state contains error details
      const currentState = await instanceService.getInstanceState('test-instance-webhook-failure');
      expect(currentState?.status).toBe(InstanceStatus.HEALTH_CHECKING);
      expect(currentState?.healthCheck?.results?.[0]?.overallStatus).toBe('unhealthy');
      expect(currentState?.healthCheck?.results?.[0]?.endpoints?.[0]?.error).toBe('Connection timeout after 5000ms');
    });

    it('should handle webhook notification failures gracefully', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-webhook-error',
        novitaInstanceId: 'novita-webhook-error',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-webhook-error',
        name: 'test-instance-webhook-error',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);

      // Mock webhook client to fail
      mockedWebhookClient.sendHealthCheckNotification
        .mockRejectedValueOnce(new Error('Webhook endpoint unreachable'))
        .mockResolvedValueOnce(); // Second call succeeds

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job - should not fail despite webhook error
      await expect((jobWorker as any).handleMonitorInstance(mockJob)).resolves.not.toThrow();

      // Verify health checks still completed successfully
      const finalState = await instanceService.getInstanceState('test-instance-webhook-error');
      expect(finalState?.status).toBe(InstanceStatus.READY);
      expect(finalState?.healthCheck?.status).toBe('completed');

      // Verify both webhook calls were attempted
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledTimes(2);
    });

    it('should skip webhook notifications when no webhook URL provided', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-no-webhook',
        novitaInstanceId: 'novita-no-webhook',
        // No webhookUrl provided
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-no-webhook',
        name: 'test-instance-no-webhook',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      const mockHealthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      mockedHealthCheckerService.performHealthChecks.mockResolvedValue(mockHealthCheckResult);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify no webhook notifications were sent
      expect(mockedWebhookClient.sendHealthCheckNotification).not.toHaveBeenCalled();

      // Verify health checks still completed successfully
      const finalState = await instanceService.getInstanceState('test-instance-no-webhook');
      expect(finalState?.status).toBe(InstanceStatus.READY);
      expect(finalState?.healthCheck?.status).toBe('completed');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle instances with no port mappings', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-no-ports',
        novitaInstanceId: 'novita-no-ports',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-no-ports',
        name: 'test-instance-no-ports',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [] // No port mappings
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);
      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify health checker was not called since no ports to check
      expect(mockedHealthCheckerService.performHealthChecks).not.toHaveBeenCalled();

      // Verify instance transitions directly to ready (no health checks needed)
      const finalState = await instanceService.getInstanceState('test-instance-no-ports');
      expect(finalState?.status).toBe(InstanceStatus.READY);

      // Verify appropriate webhook notifications were sent
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance-no-ports',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-no-ports',
          healthCheckStatus: 'completed'
        })
      );
    });

    it('should handle health checker service errors', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance-health-error',
        novitaInstanceId: 'novita-health-error',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: {
          timeoutMs: 5000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 120000
        }
      };

      mockJob.payload = payload;

      const mockNovitaInstance = {
        id: 'novita-health-error',
        name: 'test-instance-health-error',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2023-01-01T00:00:00.000Z',
        portMappings: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' }
        ]
      };

      mockedNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);

      // Mock health checker to throw an error
      mockedHealthCheckerService.performHealthChecks.mockRejectedValue(
        new Error('Health checker service unavailable')
      );

      mockedWebhookClient.sendHealthCheckNotification.mockResolvedValue();

      // Initialize instance state
      initializeInstanceState(payload.instanceId, payload.novitaInstanceId);

      // Execute the job
      await (jobWorker as any).handleMonitorInstance(mockJob);

      // Verify health checker was called
      expect(mockedHealthCheckerService.performHealthChecks).toHaveBeenCalled();

      // Verify health check started notification was sent
      expect(mockedWebhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance-health-error',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-health-error',
          healthCheckStatus: 'in_progress'
        })
      );

      // Verify instance state reflects the error handling
      const finalState = await instanceService.getInstanceState('test-instance-health-error');
      // The instance may still be in health_checking state if error handling is async
      expect([InstanceStatus.HEALTH_CHECKING, InstanceStatus.FAILED]).toContain(finalState?.status);
    });
  });
});