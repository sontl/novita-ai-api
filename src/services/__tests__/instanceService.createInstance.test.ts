import { instanceService, InstanceService } from '../instanceService';
import { productService } from '../productService';
import { templateService } from '../templateService';
import { novitaApiService } from '../novitaApiService';
import { serviceRegistry } from '../serviceRegistry';
import { webhookClient } from '../../clients/webhookClient';
import {
  CreateInstanceRequest,
  InstanceStatus,
  Product,
  NovitaApiClientError
} from '../../types/api';

// Mock dependencies
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../novitaApiService');
jest.mock('../serviceRegistry');
jest.mock('../../clients/webhookClient');
jest.mock('../../utils/axiomSafeLogger', () => ({
  createAxiomSafeLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));
jest.mock('../../config/config', () => ({
  config: {
    novita: {
      baseUrl: 'https://api.novita.ai',
      apiKey: 'test-key'
    },
    defaults: {
      region: 'CN-HK-01',
      requestTimeout: 30000,
      maxRetryAttempts: 3
    }
  }
}));

const mockProductService = productService as jest.Mocked<typeof productService>;
const mockTemplateService = templateService as jest.Mocked<typeof templateService>;
const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockServiceRegistry = serviceRegistry as jest.Mocked<typeof serviceRegistry>;
const mockWebhookClient = webhookClient as jest.Mocked<typeof webhookClient>;

describe('InstanceService - createInstance (Direct API)', () => {
  let service: InstanceService;

  const mockProduct: Product = {
    id: 'product_123',
    name: 'RTX 4090 24GB',
    region: 'CN-HK-01',
    spotPrice: 0.5,
    onDemandPrice: 1.0,
    gpuType: 'RTX4090',
    gpuMemory: 24,
    availability: 'available',
    cpuPerGpu: 8,
    memoryPerGpu: 32,
    diskPerGpu: 100,
    availableDeploy: true,
    prices: [],
    price: '0.5',
    minRootFS: 10,
    maxRootFS: 1000,
    minLocalStorage: 0,
    maxLocalStorage: 500,
    regions: ['CN-HK-01'],
    monthlyPrice: [],
    billingMethods: ['spot', 'onDemand']
  };

  const mockTemplateConfig = {
    imageUrl: 'test-image:latest',
    ports: [
      { port: 8888, type: 'http' as const, name: 'jupyter' }
    ],
    envs: [
      { key: 'TEST_ENV', value: 'test' }
    ]
  };

  const mockNovitaInstanceResponse = {
    id: 'novita_123',
    name: 'test-instance',
    status: InstanceStatus.CREATING,
    productId: 'product_123',
    region: 'CN-HK-01',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot' as const,
    createdAt: new Date().toISOString(),
    portMappings: []
  };

  beforeEach(() => {
    service = new InstanceService();
    jest.clearAllMocks();

    // Setup mocks
    mockProductService.getOptimalProductWithFallback.mockResolvedValue({
      product: mockProduct,
      regionUsed: 'CN-HK-01'
    });
    mockTemplateService.getTemplateConfiguration.mockResolvedValue(mockTemplateConfig);
    mockNovitaApiService.createInstance.mockResolvedValue(mockNovitaInstanceResponse);
    mockWebhookClient.createNotificationPayload.mockReturnValue({
      instanceId: 'test-id',
      status: 'running',
      timestamp: new Date().toISOString(),
      data: {}
    });
    mockWebhookClient.sendWebhook.mockResolvedValue();

    // Mock cache manager with proper state management
    const cacheStorage = new Map();
    const mockCache = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(cacheStorage.get(key));
      }),
      set: jest.fn().mockImplementation((key: string, value: any) => {
        cacheStorage.set(key, value);
        return Promise.resolve(undefined);
      }),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockImplementation((key: string) => {
        const existed = cacheStorage.has(key);
        cacheStorage.delete(key);
        return Promise.resolve(existed);
      }),
      clear: jest.fn().mockImplementation(() => {
        cacheStorage.clear();
        return Promise.resolve(undefined);
      })
    };
    const mockCacheManager = {
      getCache: jest.fn().mockResolvedValue(mockCache)
    };
    mockServiceRegistry.getCacheManager.mockReturnValue(mockCacheManager as any);
  });

  describe('Direct API Integration', () => {
    const validRequest: CreateInstanceRequest = {
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template_123',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01',
      billingMode: 'spot'
    };

    it('should create instance directly via Novita API', async () => {
      const result = await service.createInstance(validRequest);

      expect(result).toMatchObject({
        status: 'creating',
        message: 'Instance created successfully',
        productId: 'product_123',
        region: 'CN-HK-01',
        spotPrice: 0.5
      });
      expect(result.instanceId).toMatch(/^inst_\d+_[a-z0-9]+$/);
      expect(result.novitaInstanceId).toBe('novita_123');
      expect(result.estimatedReadyTime).toBeDefined();
    });

    it('should call Novita API with correct parameters', async () => {
      await service.createInstance(validRequest);

      expect(mockNovitaApiService.createInstance).toHaveBeenCalledWith({
        name: 'test-instance',
        productId: 'product_123',
        gpuNum: 1,
        rootfsSize: 60,
        clusterId: 'cn-hongkong-1',
        imageUrl: 'test-image:latest',
        kind: 'gpu',
        billingMode: 'spot',
        ports: '8888/http',
        envs: [{ key: 'TEST_ENV', value: 'test' }]
      });
    });

    it('should use region fallback when needed', async () => {
      await service.createInstance(validRequest);

      expect(mockProductService.getOptimalProductWithFallback).toHaveBeenCalledWith(
        'RTX 4090 24GB',
        'CN-HK-01'
      );
    });

    it('should send webhook notification if configured', async () => {
      const requestWithWebhook = {
        ...validRequest,
        webhookUrl: 'https://example.com/webhook'
      };

      await service.createInstance(requestWithWebhook);

      expect(mockWebhookClient.createNotificationPayload).toHaveBeenCalled();
      expect(mockWebhookClient.sendWebhook).toHaveBeenCalledWith({
        url: 'https://example.com/webhook',
        payload: expect.any(Object)
      });
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new NovitaApiClientError('API Error', 500, 'SERVER_ERROR');
      mockNovitaApiService.createInstance.mockRejectedValue(apiError);

      await expect(service.createInstance(validRequest)).rejects.toThrow('API Error');
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        ...validRequest,
        name: '' // Invalid empty name
      };

      await expect(service.createInstance(invalidRequest)).rejects.toThrow(NovitaApiClientError);
    });

    it('should handle template with image authentication', async () => {
      const templateWithAuth = {
        imageUrl: 'test-image:latest',
        imageAuth: 'auth_123',
        ports: [
          { port: 8888, type: 'http' as const, name: 'jupyter' }
        ],
        envs: [
          { key: 'TEST_ENV', value: 'test' }
        ]
      };
      mockTemplateService.getTemplateConfiguration.mockResolvedValue(templateWithAuth);
      mockNovitaApiService.getRegistryAuth.mockResolvedValue({
        username: 'testuser',
        password: 'testpass'
      });

      await service.createInstance(validRequest);

      expect(mockNovitaApiService.getRegistryAuth).toHaveBeenCalledWith('auth_123');
      expect(mockNovitaApiService.createInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          imageAuth: 'testuser:testpass'
        })
      );
    });
  });
});