/**
 * Integration tests for the complete instance creation workflow
 */

// Mock config before importing other modules
jest.mock('../../config/config', () => ({
  config: {
    nodeEnv: 'test',
    port: 3000,
    logLevel: 'error',
    novita: {
      apiKey: 'test-key',
      baseUrl: 'https://api.novita.ai'
    },
    webhook: {
      url: undefined,
      secret: undefined
    },
    defaults: {
      region: 'CN-HK-01',
      pollInterval: 30000,
      maxRetryAttempts: 3,
      requestTimeout: 30000
    }
  }
}));

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { InstanceService } from '../instanceService';
import { ProductService } from '../productService';
import { TemplateService } from '../templateService';
import { NovitaApiService } from '../novitaApiService';
import {
  JobType,
  JobPriority,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload
} from '../../types/job';
import {
  Product,
  Template,
  InstanceResponse,
  InstanceStatus,
  NovitaCreateInstanceRequest,
  CreateInstanceRequest,
  NovitaApiClientError
} from '../../types/api';

// Mock dependencies
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../novitaApiService');
jest.mock('../instanceService');

describe('Instance Creation Workflow Integration Tests', () => {
  let jobWorkerService: JobWorkerService;
  let jobQueueService: JobQueueService;
  let mockProductService: jest.Mocked<ProductService>;
  let mockTemplateService: jest.Mocked<TemplateService>;
  let mockNovitaApiService: jest.Mocked<NovitaApiService>;
  let mockInstanceService: jest.Mocked<InstanceService>;

  const mockProduct: Product = {
    id: 'prod_123',
    name: 'RTX 4090 24GB',
    region: 'CN-HK-01',
    spotPrice: 0.50,
    onDemandPrice: 1.20,
    gpuType: 'RTX 4090',
    gpuMemory: 24576,
    availability: 'available'
  };

  const mockTemplate: Template = {
    id: 'template_456',
    name: 'PyTorch Environment',
    imageUrl: 'registry.example.com/pytorch:latest',
    imageAuth: 'auth_token_123',
    ports: [
      { port: 8888, type: 'http', name: 'jupyter' },
      { port: 22, type: 'tcp', name: 'ssh' }
    ],
    envs: [
      { name: 'JUPYTER_TOKEN', value: 'secure_token' },
      { name: 'CUDA_VISIBLE_DEVICES', value: '0' }
    ],
    description: 'PyTorch development environment'
  };

  const mockInstanceResponse: InstanceResponse = {
    id: 'novita_inst_789',
    name: 'test-instance',
    status: InstanceStatus.CREATED,
    productId: 'prod_123',
    region: 'CN-HK-01',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot',
    createdAt: '2024-01-01T00:00:00Z'
  };

  const mockStartedInstanceResponse: InstanceResponse = {
    ...mockInstanceResponse,
    status: InstanceStatus.STARTING,
    startedAt: '2024-01-01T00:01:00Z'
  };

  const mockRunningInstanceResponse: InstanceResponse = {
    ...mockInstanceResponse,
    status: InstanceStatus.RUNNING,
    startedAt: '2024-01-01T00:01:00Z',
    connectionInfo: {
      ssh: 'ssh://user@instance.novita.ai:22',
      jupyter: 'https://instance.novita.ai:8888',
      webTerminal: 'https://instance.novita.ai/terminal'
    },
    portMappings: [
      { port: 8888, endpoint: 'https://instance.novita.ai:8888', type: 'http' },
      { port: 22, endpoint: 'ssh://instance.novita.ai:22', type: 'tcp' }
    ]
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create job queue and worker service
    jobQueueService = new JobQueueService();
    jobWorkerService = new JobWorkerService(jobQueueService);

    // Get mocked services
    mockProductService = require('../productService').productService as jest.Mocked<ProductService>;
    mockTemplateService = require('../templateService').templateService as jest.Mocked<TemplateService>;
    mockNovitaApiService = require('../novitaApiService').novitaApiService as jest.Mocked<NovitaApiService>;
    mockInstanceService = require('../instanceService').instanceService as jest.Mocked<InstanceService>;

    // Setup default mock implementations
    mockProductService.getOptimalProduct.mockResolvedValue(mockProduct);
    mockTemplateService.getTemplateConfiguration.mockResolvedValue(mockTemplate);
    mockNovitaApiService.createInstance.mockResolvedValue(mockInstanceResponse);
    mockNovitaApiService.startInstance.mockResolvedValue(mockStartedInstanceResponse);
    mockNovitaApiService.getInstance.mockResolvedValue(mockRunningInstanceResponse);
    mockNovitaApiService.getRegistryAuth.mockResolvedValue({
      username: 'testuser',
      password: 'testpass'
    });

    mockInstanceService.getInstanceState.mockReturnValue({
      id: 'inst_123',
      name: 'test-instance',
      status: InstanceStatus.CREATING,
      productId: 'prod_123',
      templateId: 'template_456',
      configuration: {
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        imageUrl: mockTemplate.imageUrl,
        ...(mockTemplate.imageAuth && { imageAuth: mockTemplate.imageAuth }),
        ports: mockTemplate.ports,
        envs: mockTemplate.envs
      },
      timestamps: {
        created: new Date('2024-01-01T00:00:00Z')
      }
    });
  });

  describe('Successful Instance Creation Workflow', () => {
    it('should complete the full instance creation workflow successfully', async () => {
      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job
      await (jobWorkerService as any).handleCreateInstance(job);

      // Verify product service was called
      expect(mockProductService.getOptimalProduct).toHaveBeenCalledWith(
        'RTX 4090 24GB',
        'CN-HK-01'
      );

      // Verify template service was called
      expect(mockTemplateService.getTemplateConfiguration).toHaveBeenCalledWith('template_456');

      // Verify Novita API create instance was called with correct parameters
      expect(mockNovitaApiService.createInstance).toHaveBeenCalledWith({
        name: 'test-instance',
        productId: 'prod_123',
        gpuNum: 1,
        rootfsSize: 60,
        imageUrl: mockTemplate.imageUrl,
        kind: 'gpu',
        billingMode: 'spot',
        imageAuth: 'testuser:testpass',
        ports: '8888/http,22/tcp',
        envs: mockTemplate.envs
      });

      // Verify instance was started
      expect(mockNovitaApiService.startInstance).toHaveBeenCalledWith('novita_inst_789');

      // Verify instance state was updated
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        novitaInstanceId: 'novita_inst_789',
        status: InstanceStatus.CREATED,
        timestamps: expect.any(Object)
      });

      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.STARTING,
        timestamps: expect.any(Object)
      });
    });

    it('should queue monitoring job after successful creation', async () => {
      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Mock job queue addJob method
      const addJobSpy = jest.spyOn(jobQueueService, 'addJob').mockResolvedValue('mocked_job_id');

      // Execute the job
      await (jobWorkerService as any).handleCreateInstance(job);

      // Verify monitoring job was queued
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.MONITOR_INSTANCE,
        expect.objectContaining({
          instanceId: 'inst_123',
          novitaInstanceId: 'novita_inst_789',
          webhookUrl: 'https://example.com/webhook',
          startTime: expect.any(Date),
          maxWaitTime: 10 * 60 * 1000
        }),
        JobPriority.HIGH
      );
    });

    it('should handle template without imageAuth correctly', async () => {
      const templateWithoutAuth = {
        ...mockTemplate
      };
      delete (templateWithoutAuth as any).imageAuth;

      mockTemplateService.getTemplateConfiguration.mockResolvedValue(templateWithoutAuth);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job
      await (jobWorkerService as any).handleCreateInstance(job);

      // Verify create instance was called without imageAuth
      expect(mockNovitaApiService.createInstance).toHaveBeenCalledWith({
        name: 'test-instance',
        productId: 'prod_123',
        gpuNum: 1,
        rootfsSize: 60,
        imageUrl: templateWithoutAuth.imageUrl,
        kind: 'gpu',
        billingMode: 'spot',
        ports: '8888/http,22/tcp',
        envs: templateWithoutAuth.envs
      });
    });

    it('should handle template with imageAuth correctly', async () => {
      const templateWithAuth = {
        ...mockTemplate,
        imageAuth: 'auth_token_123'
      };

      mockTemplateService.getTemplateConfiguration.mockResolvedValue(templateWithAuth);
      mockNovitaApiService.getRegistryAuth.mockResolvedValue({
        username: 'registry_user',
        password: 'registry_pass'
      });

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job
      await (jobWorkerService as any).handleCreateInstance(job);

      // Verify registry auth was fetched
      expect(mockNovitaApiService.getRegistryAuth).toHaveBeenCalledWith('auth_token_123');

      // Verify create instance was called with imageAuth in username:password format
      expect(mockNovitaApiService.createInstance).toHaveBeenCalledWith({
        name: 'test-instance',
        productId: 'prod_123',
        gpuNum: 1,
        rootfsSize: 60,
        imageUrl: templateWithAuth.imageUrl,
        kind: 'gpu',
        billingMode: 'spot',
        imageAuth: 'registry_user:registry_pass',
        ports: '8888/http,22/tcp',
        envs: templateWithAuth.envs
      });
    });

    it('should handle registry authentication errors', async () => {
      const templateWithAuth = {
        ...mockTemplate,
        imageAuth: 'invalid_auth_token'
      };

      mockTemplateService.getTemplateConfiguration.mockResolvedValue(templateWithAuth);
      
      const registryAuthError = new NovitaApiClientError(
        'Registry authentication not found for ID: invalid_auth_token',
        404,
        'REGISTRY_AUTH_NOT_FOUND'
      );
      
      mockNovitaApiService.getRegistryAuth.mockRejectedValue(registryAuthError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(registryAuthError);

      // Verify registry auth was attempted
      expect(mockNovitaApiService.getRegistryAuth).toHaveBeenCalledWith('invalid_auth_token');

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: registryAuthError.message,
        timestamps: expect.any(Object)
      });
    });
  });

  describe('Error Handling in Instance Creation', () => {
    it('should handle product service errors', async () => {
      const productError = new NovitaApiClientError(
        'No products found matching name "Invalid GPU" in region "CN-HK-01"',
        404,
        'PRODUCT_NOT_FOUND'
      );

      mockProductService.getOptimalProduct.mockRejectedValue(productError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'Invalid GPU',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(productError);

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: productError.message,
        timestamps: expect.any(Object)
      });
    });

    it('should handle template service errors', async () => {
      const templateError = new NovitaApiClientError(
        'Template not found: invalid_template',
        404,
        'TEMPLATE_NOT_FOUND'
      );

      mockTemplateService.getTemplateConfiguration.mockRejectedValue(templateError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'invalid_template',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(templateError);

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: templateError.message,
        timestamps: expect.any(Object)
      });
    });

    it('should handle Novita API instance creation errors', async () => {
      const createError = new NovitaApiClientError(
        'Insufficient quota for GPU instances',
        400,
        'QUOTA_EXCEEDED'
      );

      mockNovitaApiService.createInstance.mockRejectedValue(createError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(createError);

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: createError.message,
        timestamps: expect.any(Object)
      });
    });

    it('should handle instance start errors', async () => {
      const startError = new NovitaApiClientError(
        'Failed to start instance: resource allocation failed',
        500,
        'START_FAILED'
      );

      mockNovitaApiService.startInstance.mockRejectedValue(startError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(startError);

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: startError.message,
        timestamps: expect.any(Object)
      });
    });

    it('should queue failure webhook when creation fails', async () => {
      const createError = new NovitaApiClientError(
        'Instance creation failed',
        500,
        'CREATE_FAILED'
      );

      mockNovitaApiService.createInstance.mockRejectedValue(createError);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'inst_123',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Mock job queue addJob method
      const addJobSpy = jest.spyOn(jobQueueService, 'addJob').mockResolvedValue('mocked_job_id');

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(createError);

      // Verify failure webhook was queued
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.SEND_WEBHOOK,
        {
          url: 'https://example.com/webhook',
          payload: {
            instanceId: 'inst_123',
            status: 'failed',
            error: createError.message,
            timestamp: expect.any(String)
          }
        }
      );
    });

    it('should handle missing instance state gracefully', async () => {
      mockInstanceService.getInstanceState.mockReturnValue(undefined);

      const jobPayload: CreateInstanceJobPayload = {
        instanceId: 'nonexistent_inst',
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_456',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      };

      const job = {
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: jobPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the job and expect it to throw
      await expect((jobWorkerService as any).handleCreateInstance(job)).rejects.toThrow(
        'Instance state not found: nonexistent_inst'
      );
    });
  });

  describe('Instance Monitoring Workflow', () => {
    it('should complete monitoring when instance becomes running', async () => {
      const monitoringPayload: MonitorInstanceJobPayload = {
        instanceId: 'inst_123',
        novitaInstanceId: 'novita_inst_789',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000
      };

      const job = {
        id: 'job_456',
        type: JobType.MONITOR_INSTANCE,
        payload: monitoringPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Mock job queue addJob method
      const addJobSpy = jest.spyOn(jobQueueService, 'addJob').mockResolvedValue('mocked_job_id');

      // Execute the monitoring job
      await (jobWorkerService as any).handleMonitorInstance(job);

      // Verify instance status was checked
      expect(mockNovitaApiService.getInstance).toHaveBeenCalledWith('novita_inst_789');

      // Verify instance state was updated to running
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.RUNNING,
        timestamps: expect.any(Object)
      });

      // Verify success webhook was queued
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.SEND_WEBHOOK,
        {
          url: 'https://example.com/webhook',
          payload: {
            instanceId: 'inst_123',
            novitaInstanceId: 'novita_inst_789',
            status: 'running',
            data: mockRunningInstanceResponse,
            timestamp: expect.any(String)
          }
        }
      );
    });

    it('should reschedule monitoring when instance is still starting', async () => {
      const stillStartingResponse: InstanceResponse = {
        ...mockInstanceResponse,
        status: InstanceStatus.STARTING
      };

      mockNovitaApiService.getInstance.mockResolvedValue(stillStartingResponse);

      const monitoringPayload: MonitorInstanceJobPayload = {
        instanceId: 'inst_123',
        novitaInstanceId: 'novita_inst_789',
        startTime: new Date(),
        maxWaitTime: 10 * 60 * 1000
      };

      const job = {
        id: 'job_456',
        type: JobType.MONITOR_INSTANCE,
        payload: monitoringPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Mock setTimeout to execute immediately for testing
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      // Mock job queue addJob method
      const addJobSpy = jest.spyOn(jobQueueService, 'addJob').mockResolvedValue('mocked_job_id');

      // Execute the monitoring job
      await (jobWorkerService as any).handleMonitorInstance(job);

      // Verify instance status was updated
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.STARTING
      });

      // Verify monitoring was rescheduled
      expect(addJobSpy).toHaveBeenCalledWith(
        JobType.MONITOR_INSTANCE,
        monitoringPayload,
        JobPriority.HIGH
      );
    });

    it('should handle monitoring timeout', async () => {
      const monitoringPayload: MonitorInstanceJobPayload = {
        instanceId: 'inst_123',
        novitaInstanceId: 'novita_inst_789',
        webhookUrl: 'https://example.com/webhook',
        startTime: new Date(Date.now() - 11 * 60 * 1000), // 11 minutes ago
        maxWaitTime: 10 * 60 * 1000 // 10 minute timeout
      };

      const job = {
        id: 'job_456',
        type: JobType.MONITOR_INSTANCE,
        payload: monitoringPayload,
        status: 'pending' as any,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Execute the monitoring job and expect timeout error
      await expect((jobWorkerService as any).handleMonitorInstance(job)).rejects.toThrow(
        'Instance monitoring timeout after 600000ms'
      );

      // Verify instance state was updated to failed
      expect(mockInstanceService.updateInstanceState).toHaveBeenCalledWith('inst_123', {
        status: InstanceStatus.FAILED,
        lastError: 'Instance monitoring timeout after 600000ms',
        timestamps: expect.any(Object)
      });
    });
  });
});