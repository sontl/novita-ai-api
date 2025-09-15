// Mock logger first
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the novita client
jest.mock('../../clients/novitaClient', () => ({
  novitaClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    healthCheck: jest.fn(),
    getCircuitBreakerState: jest.fn(),
    getQueueStatus: jest.fn()
  }
}));

import { novitaApiService } from '../novitaApiService';
import { novitaClient } from '../../clients/novitaClient';
import {
  NovitaApiClientError,
  RateLimitError,
  Product,
  Template,
  InstanceResponse,
  InstanceStatus
} from '../../types/api';

const mockedNovitaClient = novitaClient as jest.Mocked<typeof novitaClient>;

describe('NovitaApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProducts', () => {
    const mockProducts: Product[] = [
      {
        id: 'prod-1',
        name: 'RTX 4090 24GB',
        region: 'CN-HK-01',
        spotPrice: 0.5,
        onDemandPrice: 1.0,
        gpuType: 'RTX 4090',
        gpuMemory: 24,
        availability: 'available'
      },
      {
        id: 'prod-2',
        name: 'RTX 4090 24GB',
        region: 'CN-HK-01',
        spotPrice: 0.6,
        onDemandPrice: 1.1,
        gpuType: 'RTX 4090',
        gpuMemory: 24,
        availability: 'available'
      }
    ];

    it('should fetch products successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: { products: mockProducts, total: 2 }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getProducts();

      expect(result).toEqual(mockProducts);
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/products?');
    });

    it('should apply filters when provided', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: { products: [mockProducts[0]], total: 1 }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await novitaApiService.getProducts({
        name: 'RTX 4090',
        region: 'CN-HK-01'
      });

      expect(mockedNovitaClient.get).toHaveBeenCalledWith(
        '/v1/products?name=RTX+4090&region=CN-HK-01'
      );
    });

    it('should handle API errors', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Invalid parameters' }
        },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {}
      } as any);

      await expect(novitaApiService.getProducts()).rejects.toThrow(NovitaApiClientError);
    });
  });

  describe('getOptimalProduct', () => {
    const mockProducts: Product[] = [
      {
        id: 'prod-1',
        name: 'RTX 4090 24GB',
        region: 'CN-HK-01',
        spotPrice: 0.6,
        onDemandPrice: 1.1,
        gpuType: 'RTX 4090',
        gpuMemory: 24,
        availability: 'available'
      },
      {
        id: 'prod-2',
        name: 'RTX 4090 24GB',
        region: 'CN-HK-01',
        spotPrice: 0.5,
        onDemandPrice: 1.0,
        gpuType: 'RTX 4090',
        gpuMemory: 24,
        availability: 'available'
      }
    ];

    it('should return the product with lowest spot price', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: { products: mockProducts, total: 2 }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getOptimalProduct('RTX 4090 24GB', 'CN-HK-01');

      expect(result.id).toBe('prod-2');
      expect(result.spotPrice).toBe(0.5);
    });

    it('should throw error when no products found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: { products: [], total: 0 }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getOptimalProduct('NonExistent', 'CN-HK-01')
      ).rejects.toThrow('No products found matching name');
    });

    it('should throw error when no available products', async () => {
      const unavailableProducts = mockProducts.map(p => ({
        ...p,
        availability: 'unavailable' as const
      }));

      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: { products: unavailableProducts, total: 2 }
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getOptimalProduct('RTX 4090 24GB', 'CN-HK-01')
      ).rejects.toThrow('No available products found');
    });
  });

  describe('getTemplate', () => {
    const mockTemplate: Template = {
      id: 'template-1',
      name: 'Ubuntu 22.04 with CUDA',
      imageUrl: 'ubuntu:22.04-cuda',
      imageAuth: 'token123',
      ports: [{ port: 22, type: 'tcp' }],
      envs: [{ name: 'CUDA_VERSION', value: '12.0' }]
    };

    it('should fetch template successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: mockTemplate
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate('template-1');

      expect(result).toEqual(mockTemplate);
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/templates/template-1');
    });

    it('should handle template not found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: null
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getTemplate('nonexistent')
      ).rejects.toThrow('Template not found');
    });
  });

  describe('createInstance', () => {
    const mockCreateRequest = {
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template-1',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01'
    };

    const mockInstanceResponse: InstanceResponse = {
      id: 'instance-1',
      name: 'test-instance',
      status: InstanceStatus.CREATING,
      productId: 'prod-1',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      createdAt: '2023-01-01T00:00:00Z'
    };

    it('should create instance successfully', async () => {
      mockedNovitaClient.post.mockResolvedValue({
        data: {
          success: true,
          data: mockInstanceResponse
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.createInstance(mockCreateRequest);

      expect(result).toEqual(mockInstanceResponse);
      expect(mockedNovitaClient.post).toHaveBeenCalledWith('/v1/instances', mockCreateRequest);
    });

    it('should handle creation errors', async () => {
      mockedNovitaClient.post.mockResolvedValue({
        data: {
          success: false,
          error: { code: 'INSUFFICIENT_QUOTA', message: 'Insufficient quota' }
        },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.createInstance(mockCreateRequest)
      ).rejects.toThrow('Insufficient quota');
    });
  });

  describe('getInstance', () => {
    const mockInstance: InstanceResponse = {
      id: 'instance-1',
      name: 'test-instance',
      status: InstanceStatus.RUNNING,
      productId: 'prod-1',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      createdAt: '2023-01-01T00:00:00Z',
      startedAt: '2023-01-01T00:05:00Z'
    };

    it('should fetch instance successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: mockInstance
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getInstance('instance-1');

      expect(result).toEqual(mockInstance);
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/instances/instance-1');
    });

    it('should handle instance not found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {
          success: true,
          data: null
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getInstance('nonexistent')
      ).rejects.toThrow('Instance not found');
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      const axiosError = {
        response: {
          status: 429,
          data: { message: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' }
        },
        message: 'Request failed with status code 429'
      };

      mockedNovitaClient.get.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.getProducts()
      ).rejects.toThrow(RateLimitError);
    });

    it('should handle authentication errors', async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { message: 'Invalid API key' }
        },
        message: 'Request failed with status code 401'
      };

      mockedNovitaClient.get.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.getProducts()
      ).rejects.toThrow('Authentication failed - check API key');
    });

    it('should handle server errors', async () => {
      const axiosError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        },
        message: 'Request failed with status code 500'
      };

      mockedNovitaClient.get.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.getProducts()
      ).rejects.toThrow(NovitaApiClientError);
    });
  });

  describe('healthCheck', () => {
    it('should delegate to client health check', async () => {
      mockedNovitaClient.healthCheck.mockResolvedValue(true);

      const result = await novitaApiService.healthCheck();

      expect(result).toBe(true);
      expect(mockedNovitaClient.healthCheck).toHaveBeenCalled();
    });
  });

  describe('getClientStatus', () => {
    it('should return client status', () => {
      mockedNovitaClient.getCircuitBreakerState.mockReturnValue('closed' as any);
      mockedNovitaClient.getQueueStatus.mockReturnValue({
        queueLength: 0,
        isProcessing: false
      });

      const status = novitaApiService.getClientStatus();

      expect(status).toEqual({
        circuitBreakerState: 'closed',
        queueStatus: {
          queueLength: 0,
          isProcessing: false
        }
      });
    });
  });
});