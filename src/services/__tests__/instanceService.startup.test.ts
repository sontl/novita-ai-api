import { InstanceService } from '../instanceService';
import { productService } from '../productService';
import { templateService } from '../templateService';
import { jobQueueService } from '../jobQueueService';
import { novitaApiService } from '../novitaApiService';
import { webhookClient } from '../../clients/webhookClient';
import {
  InstanceStatus,
  InstanceState,
  InstanceDetails,
  InstanceResponse,
  StartInstanceRequest,
  StartInstanceResponse,
  StartInstanceJobPayload,
  NovitaApiClientError
} from '../../types/api';
import { JobPriority, JobType } from '../../types/job';
import {
  InstanceNotFoundError,
  InstanceNotStartableError,
  StartupOperationInProgressError,
  StartupFailedError
} from '../../utils/errorHandler';

// Mock dependencies
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../jobQueueService');
jest.mock('../novitaApiService');
jest.mock('../../clients/webhookClient');
jest.mock('../../utils/logger');
jest.mock('../cacheService', () => ({
  cacheManager: {
    getCache: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      size: jest.fn(() => 0),
      getHitRatio: jest.fn(() => 0),
      getMetrics: jest.fn(() => ({})),
      keys: jest.fn(() => []),
      cleanupExpired: jest.fn(() => 0)
    }))
  }
}));
jest.mock('../../config/config', () => ({
  config: {
    nodeEnv: 'test',
    port: 3000,
    logLevel: 'info',
    novita: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.novita.ai',
    },
    webhook: {
      url: undefined,
      secret: undefined,
    },
    defaults: {
      region: 'CN-HK-01',
      maxRetryAttempts: 3,
      pollInterval: 30,
      requestTimeout: 30000,
      webhookTimeout: 10000,
      cacheTimeout: 300,
      maxConcurrentJobs: 10,
    },
    security: {
      enableCors: true,
      enableHelmet: true,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 100,
    },
    instanceListing: {
      enableComprehensiveListing: true,
      defaultIncludeNovitaOnly: true,
      defaultSyncLocalState: false,
      comprehensiveCacheTtl: 30,
      novitaApiCacheTtl: 60,
      enableFallbackToLocal: true,
      novitaApiTimeout: 10000,
    },
    healthCheck: {
      defaultTimeoutMs: 10000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 2000,
      defaultMaxWaitTimeMs: 300000,
    },
    instanceStartup: {
      defaultMaxWaitTime: 300000,
      defaultHealthCheckConfig: {
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 300000,
      },
      enableNameBasedLookup: true,
      operationTimeoutMs: 300000,
    },
  }
}));

const mockJobQueueService = jobQueueService as jest.Mocked<typeof jobQueueService>;
const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockWebhookClient = webhookClient as jest.Mocked<typeof webhookClient>;

describe('InstanceService - Instance Start Functionality', () => {
  let service: InstanceService;

  const mockInstanceId = 'inst_123_abc';
  const mockNovitaInstanceId = 'novita_inst_456';
  const mockOperationId = 'startup_123_def';

  const mockInstanceState: InstanceState = {
    id: mockInstanceId,
    name: 'test-instance',
    status: InstanceStatus.EXITED,
    productId: 'prod_123',
    templateId: 'template_123',
    novitaInstanceId: mockNovitaInstanceId,
    configuration: {
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01',
      imageUrl: 'nvidia/pytorch:latest',
      ports: [{ port: 8888, type: 'http', name: 'jupyter' }],
      envs: []
    },
    timestamps: {
      created: new Date('2023-01-01T00:00:00Z')
    }
  };

  const mockInstanceDetails: InstanceDetails = {
    id: mockInstanceId,
    name: 'test-instance',
    status: InstanceStatus.EXITED,
    gpuNum: 1,
    region: 'CN-HK-01',
    portMappings: [{ port: 8888, endpoint: 'http://localhost:8888', type: 'http' }],
    createdAt: '2023-01-01T00:00:00Z'
  };

  const mockNovitaInstance: InstanceResponse = {
    id: mockNovitaInstanceId,
    name: 'test-instance',
    status: InstanceStatus.EXITED,
    productId: 'prod_123',
    region: 'CN-HK-01',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot',
    createdAt: '2023-01-01T00:00:00Z',
    portMappings: [{ port: 8888, endpoint: 'http://localhost:8888', type: 'http' }]
  };

  beforeEach(() => {
    service = new InstanceService();
    jest.clearAllMocks();

    // Setup default mock implementations
    mockJobQueueService.addJob.mockResolvedValue('job_123');
    mockNovitaApiService.startInstanceWithRetry.mockResolvedValue(mockNovitaInstance);
    mockWebhookClient.sendStartupInitiatedNotification.mockResolvedValue(undefined);

    // Mock the private generateOperationId method by spying on it
    jest.spyOn(service as any, 'generateOperationId').mockReturnValue(mockOperationId);
  });

  describe('startInstance', () => {
    beforeEach(() => {
      // Set up instance state in the service using private property access
      (service as any).instanceStates.set(mockInstanceId, mockInstanceState);
    });

    describe('successful startup by ID', () => {
      beforeEach(() => {
        jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);
      });

      it('should start instance successfully with minimal config', async () => {
        const result = await service.startInstance(mockInstanceId);

        expect(result).toEqual({
          instanceId: mockInstanceId,
          novitaInstanceId: mockNovitaInstanceId,
          status: InstanceStatus.STARTING,
          message: 'Instance startup initiated successfully',
          operationId: mockOperationId,
          estimatedReadyTime: expect.any(String)
        });

        // Verify Novita API was called
        expect(mockNovitaApiService.startInstanceWithRetry).toHaveBeenCalledWith(
          mockNovitaInstanceId,
          3
        );

        // Verify monitoring job was created
        expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
          JobType.MONITOR_STARTUP,
          expect.objectContaining({
            instanceId: mockInstanceId,
            novitaInstanceId: mockNovitaInstanceId,
            healthCheckConfig: {
              timeoutMs: 10000,
              retryAttempts: 3,
              retryDelayMs: 2000,
              maxWaitTimeMs: 300000
            },
            startTime: expect.any(Date),
            maxWaitTime: 300000
          }),
          JobPriority.HIGH
        );
      });

      it('should start instance with custom health check config', async () => {
        const customConfig: StartInstanceRequest = {
          healthCheckConfig: {
            timeoutMs: 15000,
            retryAttempts: 5,
            retryDelayMs: 3000,
            maxWaitTimeMs: 600000
          },
          targetPort: 9999
        };

        const result = await service.startInstance(mockInstanceId, customConfig);

        expect(result.status).toBe(InstanceStatus.STARTING);

        // Verify job payload includes custom config
        expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
          JobType.MONITOR_STARTUP,
          expect.objectContaining({
            healthCheckConfig: customConfig.healthCheckConfig,
            targetPort: 9999,
            maxWaitTime: 600000
          }),
          JobPriority.HIGH
        );
      });

      it('should start instance with webhook URL from config', async () => {
        const configWithWebhook: StartInstanceRequest = {
          webhookUrl: 'https://example.com/webhook'
        };

        await service.startInstance(mockInstanceId, configWithWebhook);

        // Verify webhook notification was sent
        expect(mockWebhookClient.sendStartupInitiatedNotification).toHaveBeenCalledWith(
          'https://example.com/webhook',
          mockInstanceId,
          expect.objectContaining({
            novitaInstanceId: mockNovitaInstanceId,
            operationId: mockOperationId,
            startedAt: expect.any(Date),
            estimatedReadyTime: expect.any(String)
          })
        );

        // Verify job payload includes webhook URL
        expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
          JobType.MONITOR_STARTUP,
          expect.objectContaining({
            webhookUrl: 'https://example.com/webhook'
          }),
          JobPriority.HIGH
        );
      });

      it('should use webhook URL from instance state if not provided in config', async () => {
        // Update instance state to include webhook URL
        const stateWithWebhook = {
          ...mockInstanceState,
          webhookUrl: 'https://state.example.com/webhook'
        };
        (service as any).instanceStates.set(mockInstanceId, stateWithWebhook);

        await service.startInstance(mockInstanceId);

        expect(mockWebhookClient.sendStartupInitiatedNotification).toHaveBeenCalledWith(
          'https://state.example.com/webhook',
          mockInstanceId,
          expect.any(Object)
        );
      });

      it('should handle webhook notification failure gracefully', async () => {
        const configWithWebhook: StartInstanceRequest = {
          webhookUrl: 'https://example.com/webhook'
        };

        mockWebhookClient.sendStartupInitiatedNotification.mockRejectedValue(
          new Error('Webhook failed')
        );

        // Should not throw error even if webhook fails
        const result = await service.startInstance(mockInstanceId, configWithWebhook);
        expect(result.status).toBe(InstanceStatus.STARTING);
      });
    });

    describe('successful startup by name', () => {
      beforeEach(() => {
        jest.spyOn(service, 'findInstanceByName').mockResolvedValue(mockInstanceDetails);
      });

      it('should start instance by name successfully', async () => {
        const result = await service.startInstance('test-instance', {}, 'name');

        expect(result.instanceId).toBe(mockInstanceId);
        expect(result.status).toBe(InstanceStatus.STARTING);

        // Verify findInstanceByName was called
        expect(service.findInstanceByName).toHaveBeenCalledWith('test-instance');

        // Verify Novita API was called
        expect(mockNovitaApiService.startInstanceWithRetry).toHaveBeenCalledWith(
          mockNovitaInstanceId,
          3
        );
      });
    });

    describe('validation errors', () => {
      it('should throw InstanceNotFoundError when instance does not exist', async () => {
        jest.spyOn(service, 'getInstanceStatus').mockRejectedValue(
          new NovitaApiClientError('Instance not found', 404, 'INSTANCE_NOT_FOUND')
        );

        await expect(service.startInstance('nonexistent-id')).rejects.toThrow(
          NovitaApiClientError
        );
      });

      it('should throw InstanceNotFoundError when instance state has no novitaInstanceId', async () => {
        const stateWithoutNovitaId = { ...mockInstanceState };
        delete stateWithoutNovitaId.novitaInstanceId;
        (service as any).instanceStates.set(mockInstanceId, stateWithoutNovitaId);

        jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);

        await expect(service.startInstance(mockInstanceId)).rejects.toThrow(
          InstanceNotFoundError
        );
      });

      it('should throw InstanceNotStartableError for non-exited status', async () => {
        const runningInstance = { ...mockInstanceDetails, status: InstanceStatus.RUNNING };
        jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(runningInstance);

        await expect(service.startInstance(mockInstanceId)).rejects.toThrow(
          InstanceNotStartableError
        );
      });

      it('should throw StartupOperationInProgressError for duplicate operations', async () => {
        jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);

        // Start first operation
        await service.startInstance(mockInstanceId);

        // Attempt second operation
        await expect(service.startInstance(mockInstanceId)).rejects.toThrow(
          StartupOperationInProgressError
        );
      });
    });

    describe('API failures', () => {
      beforeEach(() => {
        jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);
      });

      it('should handle Novita API failure during startup', async () => {
        mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
          new NovitaApiClientError('API Error', 500, 'INTERNAL_ERROR')
        );

        await expect(service.startInstance(mockInstanceId)).rejects.toThrow(
          StartupFailedError
        );

        // Verify operation was cleaned up
        expect(service.getStartupOperation(mockInstanceId)).toBeUndefined();
      });

      it('should handle job queue failure', async () => {
        mockJobQueueService.addJob.mockRejectedValue(new Error('Queue error'));

        await expect(service.startInstance(mockInstanceId)).rejects.toThrow('Queue error');
      });
    });
  });

  describe('findInstanceByName', () => {
    it('should find instance by name in local state', async () => {
      // Set up instance state
      (service as any).instanceStates.set(mockInstanceId, mockInstanceState);
      jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);

      const result = await service.findInstanceByName('test-instance');

      expect(result).toEqual(mockInstanceDetails);
      expect(service.getInstanceStatus).toHaveBeenCalledWith(mockInstanceId);
    });

    it('should find instance by name in Novita API when not in local state', async () => {
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [mockNovitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await service.findInstanceByName('test-instance');

      expect(result.name).toBe('test-instance');
      expect(result.id).toBe(mockNovitaInstanceId);
    });

    it('should throw InstanceNotFoundError when instance not found anywhere', async () => {
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [],
        total: 0,
        page: 1,
        pageSize: 10
      });

      await expect(service.findInstanceByName('nonexistent')).rejects.toThrow(
        InstanceNotFoundError
      );
    });

    it('should handle Novita API error during search', async () => {
      mockNovitaApiService.listInstances.mockRejectedValue(
        new NovitaApiClientError('API Error', 500, 'INTERNAL_ERROR')
      );

      await expect(service.findInstanceByName('test-instance')).rejects.toThrow(
        InstanceNotFoundError
      );
    });
  });

  describe('validateInstanceStartable', () => {
    it('should pass validation for exited instance', async () => {
      await expect(service.validateInstanceStartable(mockInstanceDetails)).resolves.not.toThrow();
    });

    it('should throw InstanceNotStartableError for running instance', async () => {
      const runningInstance = { ...mockInstanceDetails, status: InstanceStatus.RUNNING };

      await expect(service.validateInstanceStartable(runningInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for creating instance', async () => {
      const creatingInstance = { ...mockInstanceDetails, status: InstanceStatus.CREATING };

      await expect(service.validateInstanceStartable(creatingInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for starting instance', async () => {
      const startingInstance = { ...mockInstanceDetails, status: InstanceStatus.STARTING };

      await expect(service.validateInstanceStartable(startingInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for ready instance', async () => {
      const readyInstance = { ...mockInstanceDetails, status: InstanceStatus.READY };

      await expect(service.validateInstanceStartable(readyInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for stopping instance', async () => {
      const stoppingInstance = { ...mockInstanceDetails, status: InstanceStatus.STOPPING };

      await expect(service.validateInstanceStartable(stoppingInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for failed instance', async () => {
      const failedInstance = { ...mockInstanceDetails, status: InstanceStatus.FAILED };

      await expect(service.validateInstanceStartable(failedInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw InstanceNotStartableError for terminated instance', async () => {
      const terminatedInstance = { ...mockInstanceDetails, status: InstanceStatus.TERMINATED };

      await expect(service.validateInstanceStartable(terminatedInstance)).rejects.toThrow(
        InstanceNotStartableError
      );
    });

    it('should throw StartupOperationInProgressError when startup is already in progress', async () => {
      // Create an active startup operation
      const operation = service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);

      await expect(service.validateInstanceStartable(mockInstanceDetails)).rejects.toThrow(
        StartupOperationInProgressError
      );
    });
  });

  describe('isStartupInProgress', () => {
    it('should return false when no operation exists', () => {
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(false);
    });

    it('should return true for initiated operation', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(true);
    });

    it('should return true for monitoring operation', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'monitoring');
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(true);
    });

    it('should return true for health_checking operation', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'health_checking');
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(true);
    });

    it('should return false for completed operation', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'completed');
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(false);
    });

    it('should return false for failed operation', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'failed');
      const result = service.isStartupInProgress(mockInstanceId);
      expect(result).toBe(false);
    });
  });

  describe('startup operation tracking', () => {
    it('should create startup operation with correct properties', () => {
      const operation = service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);

      expect(operation).toEqual({
        operationId: mockOperationId,
        instanceId: mockInstanceId,
        novitaInstanceId: mockNovitaInstanceId,
        status: 'initiated',
        startedAt: expect.any(Date),
        phases: {
          startRequested: expect.any(Date)
        }
      });
    });

    it('should update startup operation status and phases', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'monitoring', 'instanceStarting');

      const operation = service.getStartupOperation(mockInstanceId);
      expect(operation?.status).toBe('monitoring');
      expect(operation?.phases.instanceStarting).toBeInstanceOf(Date);
    });

    it('should update startup operation with error', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'failed', undefined, 'Test error');

      // Operation should be removed after completion/failure
      const operation = service.getStartupOperation(mockInstanceId);
      expect(operation).toBeUndefined();
    });

    it('should remove operation when completed', () => {
      service.createStartupOperation(mockInstanceId, mockNovitaInstanceId);
      service.updateStartupOperation(mockInstanceId, 'completed');

      const operation = service.getStartupOperation(mockInstanceId);
      expect(operation).toBeUndefined();
    });

    it('should handle updating non-existent operation gracefully', () => {
      // Should not throw error
      expect(() => {
        service.updateStartupOperation('nonexistent', 'completed');
      }).not.toThrow();
    });
  });

  describe('deduplication', () => {
    beforeEach(() => {
      (service as any).instanceStates.set(mockInstanceId, mockInstanceState);
      jest.spyOn(service, 'getInstanceStatus').mockResolvedValue(mockInstanceDetails);
    });

    it('should prevent duplicate startup operations', async () => {
      // Start first operation
      const firstResult = await service.startInstance(mockInstanceId);
      expect(firstResult.status).toBe(InstanceStatus.STARTING);

      // Attempt second operation should fail
      await expect(service.startInstance(mockInstanceId)).rejects.toThrow(
        StartupOperationInProgressError
      );

      // Verify Novita API was only called once
      expect(mockNovitaApiService.startInstanceWithRetry).toHaveBeenCalledTimes(1);
    });

    it('should allow new operation after previous one completes', async () => {
      // Start and complete first operation
      await service.startInstance(mockInstanceId);
      service.updateStartupOperation(mockInstanceId, 'completed');

      // Second operation should succeed
      const secondResult = await service.startInstance(mockInstanceId);
      expect(secondResult.status).toBe(InstanceStatus.STARTING);

      // Verify Novita API was called twice
      expect(mockNovitaApiService.startInstanceWithRetry).toHaveBeenCalledTimes(2);
    });

    it('should allow new operation after previous one fails', async () => {
      // Start first operation
      await service.startInstance(mockInstanceId);
      
      // Simulate failure
      service.updateStartupOperation(mockInstanceId, 'failed', undefined, 'Test failure');

      // Second operation should succeed
      const secondResult = await service.startInstance(mockInstanceId);
      expect(secondResult.status).toBe(InstanceStatus.STARTING);
    });
  });
});