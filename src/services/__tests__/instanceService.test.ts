import { instanceService, InstanceService } from '../instanceService';
import { productService } from '../productService';
import { templateService } from '../templateService';
import { jobQueueService } from '../jobQueueService';
import { novitaApiService } from '../novitaApiService';
import {
  CreateInstanceRequest,
  InstanceStatus,
  InstanceState,
  Product,
  Template,
  InstanceResponse,
  NovitaApiClientError,
  JobType
} from '../../types/api';
import { JobPriority } from '../../types/job';

// Mock dependencies
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../jobQueueService');
jest.mock('../novitaApiService');
jest.mock('../../utils/logger');
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
      pollInterval: 30,
      maxRetryAttempts: 3,
      requestTimeout: 30000,
    },
  }
}));

const mockProductService = productService as jest.Mocked<typeof productService>;
const mockTemplateService = templateService as jest.Mocked<typeof templateService>;
const mockJobQueueService = jobQueueService as jest.Mocked<typeof jobQueueService>;
const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('InstanceService', () => {
  let service: InstanceService;

  const mockProduct: Product = {
    id: 'prod_123',
    name: 'RTX 4090 24GB',
    region: 'CN-HK-01',
    spotPrice: 0.5,
    onDemandPrice: 1.0,
    gpuType: 'RTX4090',
    gpuMemory: 24,
    availability: 'available'
  };

  const mockTemplate: Template = {
    id: 'template_123',
    name: 'PyTorch Template',
    imageUrl: 'nvidia/pytorch:latest',
    imageAuth: 'token123',
    ports: [
      { port: 8888, type: 'http', name: 'jupyter' },
      { port: 22, type: 'tcp', name: 'ssh' }
    ],
    envs: [
      { name: 'JUPYTER_TOKEN', value: 'secret' }
    ]
  };

  const mockTemplateConfig = {
    imageUrl: mockTemplate.imageUrl,
    imageAuth: mockTemplate.imageAuth as string,
    ports: mockTemplate.ports,
    envs: mockTemplate.envs
  };

  const mockNovitaInstance: InstanceResponse = {
    id: 'novita_inst_123',
    name: 'test-instance',
    status: InstanceStatus.RUNNING,
    productId: 'prod_123',
    region: 'CN-HK-01',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot',
    createdAt: '2023-01-01T00:00:00Z',
    startedAt: '2023-01-01T00:05:00Z',
    connectionInfo: {
      ssh: 'ssh://user@instance.novita.ai:22',
      jupyter: 'https://instance.novita.ai:8888'
    },
    portMappings: [
      { port: 8888, endpoint: 'https://instance.novita.ai:8888', type: 'http' },
      { port: 22, endpoint: 'ssh://instance.novita.ai:22', type: 'tcp' }
    ]
  };

  beforeEach(() => {
    // Create a new instance for each test to avoid state pollution
    service = new InstanceService();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockProductService.getOptimalProduct.mockResolvedValue(mockProduct);
    mockTemplateService.getTemplateConfiguration.mockResolvedValue(mockTemplateConfig);
    mockJobQueueService.addJob.mockResolvedValue('job_123');
    mockNovitaApiService.getInstance.mockResolvedValue(mockNovitaInstance);
  });

  describe('createInstance', () => {
    const validRequest: CreateInstanceRequest = {
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template_123',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01',
      webhookUrl: 'https://example.com/webhook'
    };

    it('should create instance successfully with all parameters', async () => {
      const result = await service.createInstance(validRequest);

      expect(result).toMatchObject({
        status: 'creating',
        message: 'Instance creation initiated successfully'
      });
      expect(result.instanceId).toMatch(/^inst_\d+_[a-z0-9]+$/);
      expect(result.estimatedReadyTime).toBeDefined();

      // Verify service calls
      expect(mockProductService.getOptimalProduct).toHaveBeenCalledWith('RTX 4090 24GB', 'CN-HK-01');
      expect(mockTemplateService.getTemplateConfiguration).toHaveBeenCalledWith('template_123');
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
        JobType.CREATE_INSTANCE,
        expect.objectContaining({
          name: 'test-instance',
          productName: 'RTX 4090 24GB',
          templateId: 'template_123',
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          webhookUrl: 'https://example.com/webhook'
        }),
        JobPriority.HIGH
      );
    });

    it('should create instance with default values', async () => {
      const minimalRequest: CreateInstanceRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      };

      const result = await service.createInstance(minimalRequest);

      expect(result.status).toBe('creating');
      expect(mockProductService.getOptimalProduct).toHaveBeenCalledWith('RTX 4090 24GB', 'CN-HK-01');
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
        JobType.CREATE_INSTANCE,
        expect.objectContaining({
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01'
        }),
        JobPriority.HIGH
      );
    });

    it('should validate required fields', async () => {
      const invalidRequests = [
        { ...validRequest, name: '' },
        { ...validRequest, name: undefined as any },
        { ...validRequest, productName: '' },
        { ...validRequest, productName: undefined as any },
        { ...validRequest, templateId: '' },
        { ...validRequest, templateId: undefined as any }
      ];

      for (const request of invalidRequests) {
        await expect(service.createInstance(request)).rejects.toThrow(NovitaApiClientError);
      }
    });

    it('should validate optional parameters', async () => {
      const invalidRequests = [
        { ...validRequest, gpuNum: 0 },
        { ...validRequest, gpuNum: 9 },
        { ...validRequest, rootfsSize: 5 },
        { ...validRequest, rootfsSize: 1001 },
        { ...validRequest, webhookUrl: 'invalid-url' },
        { ...validRequest, webhookUrl: 'ftp://example.com' }
      ];

      for (const request of invalidRequests) {
        await expect(service.createInstance(request)).rejects.toThrow(NovitaApiClientError);
      }
    });

    it('should handle product service errors', async () => {
      mockProductService.getOptimalProduct.mockRejectedValue(
        new NovitaApiClientError('Product not found', 404, 'PRODUCT_NOT_FOUND')
      );

      await expect(service.createInstance(validRequest)).rejects.toThrow('Product not found');
    });

    it('should handle template service errors', async () => {
      mockTemplateService.getTemplateConfiguration.mockRejectedValue(
        new NovitaApiClientError('Template not found', 404, 'TEMPLATE_NOT_FOUND')
      );

      await expect(service.createInstance(validRequest)).rejects.toThrow('Template not found');
    });

    it('should store instance state correctly', async () => {
      const result = await service.createInstance(validRequest);
      
      const instanceState = service.getInstanceState(result.instanceId);
      expect(instanceState).toMatchObject({
        id: result.instanceId,
        name: 'test-instance',
        status: InstanceStatus.CREATING,
        productId: 'prod_123',
        templateId: 'template_123',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'nvidia/pytorch:latest',
          imageAuth: 'token123',
          ports: mockTemplate.ports,
          envs: mockTemplate.envs
        },
        webhookUrl: 'https://example.com/webhook'
      });
      expect(instanceState?.timestamps.created).toBeInstanceOf(Date);
    });
  });

  describe('getInstanceStatus', () => {
    let instanceId: string;
    let instanceState: InstanceState;

    beforeEach(async () => {
      const result = await service.createInstance({
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });
      instanceId = result.instanceId;
      instanceState = service.getInstanceState(instanceId)!;
    });

    it('should return instance details for instance without Novita ID', async () => {
      const details = await service.getInstanceStatus(instanceId);

      expect(details).toMatchObject({
        id: instanceId,
        name: 'test-instance',
        status: InstanceStatus.CREATING,
        gpuNum: 1,
        region: 'CN-HK-01',
        portMappings: []
      });
      expect(details.createdAt).toBeDefined();
    });

    it('should fetch from Novita API when instance has Novita ID', async () => {
      // Update instance state to have Novita ID
      service.updateInstanceState(instanceId, {
        novitaInstanceId: 'novita_inst_123',
        status: InstanceStatus.RUNNING
      });

      const details = await service.getInstanceStatus(instanceId);

      expect(mockNovitaApiService.getInstance).toHaveBeenCalledWith('novita_inst_123');
      expect(details).toMatchObject({
        id: instanceId,
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        gpuNum: 1,
        region: 'CN-HK-01',
        connectionDetails: mockNovitaInstance.connectionInfo,
        portMappings: mockNovitaInstance.portMappings
      });
    });

    it('should use cached data when available', async () => {
      // First call
      await service.getInstanceStatus(instanceId);
      
      // Second call should use cache
      await service.getInstanceStatus(instanceId);

      // Should not call Novita API since no Novita ID
      expect(mockNovitaApiService.getInstance).not.toHaveBeenCalled();
    });

    it('should handle Novita API errors gracefully', async () => {
      service.updateInstanceState(instanceId, {
        novitaInstanceId: 'novita_inst_123'
      });

      mockNovitaApiService.getInstance.mockRejectedValue(
        new Error('API unavailable')
      );

      const details = await service.getInstanceStatus(instanceId);

      expect(details.status).toBe(InstanceStatus.CREATING);
      expect(details.portMappings).toEqual([]);
    });

    it('should throw error for non-existent instance', async () => {
      await expect(service.getInstanceStatus('non-existent')).rejects.toThrow(
        'Instance not found: non-existent'
      );
    });

    it('should update instance state when fetching from Novita API', async () => {
      service.updateInstanceState(instanceId, {
        novitaInstanceId: 'novita_inst_123'
      });

      await service.getInstanceStatus(instanceId);

      const updatedState = service.getInstanceState(instanceId);
      expect(updatedState?.status).toBe(InstanceStatus.RUNNING);
      expect(updatedState?.timestamps.ready).toBeInstanceOf(Date);
    });
  });

  describe('listInstances', () => {
    it('should return empty list when no instances', async () => {
      const result = await service.listInstances();

      expect(result).toEqual({
        instances: [],
        total: 0
      });
    });

    it('should list all instances', async () => {
      // Create multiple instances
      const instance1 = await service.createInstance({
        name: 'instance-1',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));

      const instance2 = await service.createInstance({
        name: 'instance-2',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });

      const result = await service.listInstances();

      expect(result.total).toBe(2);
      expect(result.instances).toHaveLength(2);
      
      // Check that both instances are present
      const instanceIds = result.instances.map(i => i.id);
      expect(instanceIds).toContain(instance1.instanceId);
      expect(instanceIds).toContain(instance2.instanceId);
      
      // Check that instances are sorted by creation time (newest first)
      const createdTimes = result.instances.map(i => new Date(i.createdAt).getTime());
      expect(createdTimes[0]!).toBeGreaterThanOrEqual(createdTimes[1]!);
    });

    it('should handle errors for individual instances gracefully', async () => {
      const instance1 = await service.createInstance({
        name: 'instance-1',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });

      // Update one instance to have Novita ID that will cause API error
      service.updateInstanceState(instance1.instanceId, {
        novitaInstanceId: 'invalid_id'
      });

      mockNovitaApiService.getInstance.mockRejectedValue(
        new Error('Instance not found')
      );

      const result = await service.listInstances();

      expect(result.total).toBe(1);
      expect(result.instances[0]?.id).toBe(instance1.instanceId);
    });
  });

  describe('updateInstanceState', () => {
    let instanceId: string;

    beforeEach(async () => {
      const result = await service.createInstance({
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });
      instanceId = result.instanceId;
    });

    it('should update instance state successfully', () => {
      service.updateInstanceState(instanceId, {
        status: InstanceStatus.RUNNING,
        novitaInstanceId: 'novita_123',
        timestamps: {
          created: new Date(),
          ready: new Date()
        }
      });

      const state = service.getInstanceState(instanceId);
      expect(state?.status).toBe(InstanceStatus.RUNNING);
      expect(state?.novitaInstanceId).toBe('novita_123');
      expect(state?.timestamps.ready).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent instance', () => {
      expect(() => {
        service.updateInstanceState('non-existent', { status: InstanceStatus.RUNNING });
      }).toThrow('Instance state not found: non-existent');
    });

    it('should clear cache when updating state', async () => {
      // Get status to populate cache
      await service.getInstanceStatus(instanceId);
      
      // Update state
      service.updateInstanceState(instanceId, { status: InstanceStatus.RUNNING });
      
      // Next call should not use cache (would need to fetch fresh data)
      const stats = service.getCacheStats();
      expect(stats.cachedInstanceIds).not.toContain(instanceId);
    });
  });

  describe('cache management', () => {
    let instanceId: string;

    beforeEach(async () => {
      const result = await service.createInstance({
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });
      instanceId = result.instanceId;
    });

    it('should clear all cache', async () => {
      await service.getInstanceStatus(instanceId);
      
      service.clearCache();
      
      const stats = service.getCacheStats();
      expect(stats.instanceDetailsCache.size).toBe(0);
    });

    it('should clear expired cache entries', async () => {
      // Cache entries expire based on configured TTL
      
      await service.getInstanceStatus(instanceId);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      service.clearExpiredCache();
      
      const stats = service.getCacheStats();
      expect(stats.instanceDetailsCache.size).toBe(0);
    });

    it('should get cache statistics', async () => {
      await service.getInstanceStatus(instanceId);
      
      const stats = service.getCacheStats();
      expect(stats.instanceDetailsCache.size).toBe(1);
      expect(stats.instanceStatesSize).toBe(1);
      expect(stats.cachedInstanceIds).toContain(instanceId);
    });

    it('should use configured cache TTL', () => {
      // Cache TTL is configured during service initialization
      const stats = service.getCacheStats();
      expect(stats.instanceDetailsCache).toBeDefined();
      expect(stats.instanceStatesCache).toBeDefined();
    });
  });

  describe('utility methods', () => {
    let instanceId: string;

    beforeEach(async () => {
      const result = await service.createInstance({
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template_123'
      });
      instanceId = result.instanceId;
    });

    it('should get all instance states', () => {
      const states = service.getAllInstanceStates();
      
      expect(states).toHaveLength(1);
      expect(states[0]?.id).toBe(instanceId);
    });

    it('should remove instance state', () => {
      const removed = service.removeInstanceState(instanceId);
      
      expect(removed).toBe(true);
      expect(service.getInstanceState(instanceId)).toBeUndefined();
      
      const stats = service.getCacheStats();
      expect(stats.instanceStatesSize).toBe(0);
    });

    it('should return false when removing non-existent instance', () => {
      const removed = service.removeInstanceState('non-existent');
      
      expect(removed).toBe(false);
    });
  });

  describe('validation helpers', () => {
    it('should validate webhook URLs correctly', async () => {
      const validUrls = [
        'https://example.com/webhook',
        'http://localhost:3000/webhook',
        'https://api.example.com/v1/webhooks/instance'
      ];

      for (const url of validUrls) {
        await expect(service.createInstance({
          name: 'test',
          productName: 'RTX 4090 24GB',
          templateId: 'template_123',
          webhookUrl: url
        })).resolves.toBeDefined();
      }
    });

    it('should reject invalid webhook URLs', async () => {
      const invalidUrls = [
        'ftp://example.com',
        'not-a-url',
        'javascript:alert(1)',
        ''
      ];

      for (const url of invalidUrls) {
        await expect(service.createInstance({
          name: 'test',
          productName: 'RTX 4090 24GB',
          templateId: 'template_123',
          webhookUrl: url
        })).rejects.toThrow(NovitaApiClientError);
      }
    });
  });
});