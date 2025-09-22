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
      // Mock the actual API response structure
      const mockApiProducts = [
        {
          id: '1',
          name: 'RTX 4090 24GB',
          cpuPerGpu: 16,
          memoryPerGpu: 62,
          diskPerGpu: 1913,
          availableDeploy: true,
          prices: [],
          price: '35000',
          spotPrice: '0.5',
          regions: [],
          monthlyPrice: [],
          billingMethods: []
        },
        {
          id: '2',
          name: 'RTX 4090 24GB',
          cpuPerGpu: 16,
          memoryPerGpu: 125,
          diskPerGpu: 1016,
          availableDeploy: true,
          prices: [],
          price: '67000',
          spotPrice: '0.6',
          regions: [],
          monthlyPrice: [],
          billingMethods: []
        }
      ];

      mockedNovitaClient.get.mockResolvedValue({
        data: {
          data: mockApiProducts
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getProducts();

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('1');
      expect(result[0]!.name).toBe('RTX 4090 24GB');
      expect(result[0]!.spotPrice).toBe(0.5);
      expect(result[0]!.availability).toBe('available');
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/products', { params: { billingMethod: 'spot' } });
    });

    it('should apply filters when provided', async () => {
      const mockApiProduct = {
        id: '1',
        name: 'RTX 4090 24GB',
        cpuPerGpu: 16,
        memoryPerGpu: 62,
        availableDeploy: true,
        price: '35000',
        spotPrice: '0.5'
      };

      mockedNovitaClient.get.mockResolvedValue({
        data: {
          data: [mockApiProduct]
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await novitaApiService.getProducts({
        productName: 'RTX 4090',
        region: 'CN-HK-01'
      });

      expect(mockedNovitaClient.get).toHaveBeenCalledWith(
        '/v1/products',
        { params: { productName: 'RTX 4090', billingMethod: 'spot' } }
      );
    });

    it('should handle API errors', async () => {
      // Mock an axios error for the actual API
      const axiosError = {
        response: {
          status: 400,
          data: { message: 'Invalid parameters' }
        },
        message: 'Request failed with status code 400'
      };

      mockedNovitaClient.get.mockRejectedValue(axiosError);

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
      const mockApiProducts = [
        {
          id: 'prod-1',
          name: 'RTX 4090 24GB',
          availableDeploy: true,
          price: '67000',
          spotPrice: '0.6',
          regions: ['CN-HK-01']
        },
        {
          id: 'prod-2',
          name: 'RTX 4090 24GB',
          availableDeploy: true,
          price: '35000',
          spotPrice: '0.5',
          regions: ['CN-HK-01']
        }
      ];

      mockedNovitaClient.get.mockResolvedValue({
        data: {
          data: mockApiProducts
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
          data: []
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
      const unavailableApiProducts = [
        {
          id: 'prod-1',
          name: 'RTX 4090 24GB',
          availableDeploy: false,
          price: '35000',
          spotPrice: '0.5',
          regions: ['CN-HK-01']
        }
      ];

      mockedNovitaClient.get.mockResolvedValue({
        data: {
          data: unavailableApiProducts
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
      envs: [{ key: 'CUDA_VERSION', value: '12.0' }]
    };

    const mockApiResponse = {
      template: {
        Id: 'template-1',
        name: 'Ubuntu 22.04 with CUDA',
        image: 'ubuntu:22.04-cuda',
        imageAuth: 'token123',
        ports: [
          {
            type: 'tcp',
            ports: [22]
          }
        ],
        envs: [
          {
            key: 'CUDA_VERSION',
            value: '12.0'
          }
        ],
        description: undefined
      }
    };

    it('should fetch template successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate('template-1');

      expect(result).toEqual(mockTemplate);
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/template?templateId=template-1');
    });

    it('should handle template not found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getTemplate('nonexistent')
      ).rejects.toThrow('Template not found');
    });

    it('should handle numeric template ID', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate(107672);

      expect(result.id).toBe('template-1');
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/template?templateId=107672');
    });

    it('should transform ports correctly', async () => {
      const multiPortResponse = {
        template: {
          Id: 'template-multi',
          name: 'Multi Port Template',
          image: 'ubuntu:latest',
          ports: [
            {
              type: 'http',
              ports: [80, 8188, 8189]
            },
            {
              type: 'tcp',
              ports: [22]
            }
          ],
          envs: []
        }
      };

      mockedNovitaClient.get.mockResolvedValue({
        data: multiPortResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate('template-multi');

      expect(result.ports).toEqual([
        { port: 80, type: 'http' },
        { port: 8188, type: 'http' },
        { port: 8189, type: 'http' },
        { port: 22, type: 'tcp' }
      ]);
    });

    it('should transform envs correctly', async () => {
      const envResponse = {
        template: {
          Id: 'template-env',
          name: 'Env Template',
          image: 'ubuntu:latest',
          ports: [],
          envs: [
            {
              key: 'TORCH_INDUCTOR_FORCE_DISABLE_FP8',
              value: '1'
            },
            {
              key: 'CUDA_VISIBLE_DEVICES',
              value: '0'
            }
          ]
        }
      };

      mockedNovitaClient.get.mockResolvedValue({
        data: envResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate('template-env');

      expect(result.envs).toEqual([
        { key: 'TORCH_INDUCTOR_FORCE_DISABLE_FP8', value: '1' },
        { key: 'CUDA_VISIBLE_DEVICES', value: '0' }
      ]);
    });

    it('should handle templates with no ports or envs', async () => {
      const minimalResponse = {
        template: {
          Id: 'template-minimal',
          name: 'Minimal Template',
          image: 'ubuntu:latest'
        }
      };

      mockedNovitaClient.get.mockResolvedValue({
        data: minimalResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getTemplate('template-minimal');

      expect(result.ports).toEqual([]);
      expect(result.envs).toEqual([]);
    });
  });

  describe('getRegistryAuth', () => {
    const mockRegistryAuthsResponse = {
      data: [
        {
          id: 'auth_token_123',
          name: 'Docker Hub Auth',
          username: 'dockeruser',
          password: 'dockerpass'
        },
        {
          id: 'auth_token_456',
          name: 'GitHub Registry Auth',
          username: 'githubuser',
          password: 'githubpass'
        }
      ]
    };

    it('should fetch registry auth credentials successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: mockRegistryAuthsResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getRegistryAuth('auth_token_123');

      expect(result).toEqual({
        username: 'dockeruser',
        password: 'dockerpass'
      });
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/repository/auths');
    });

    it('should handle registry auth not found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: mockRegistryAuthsResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getRegistryAuth('nonexistent_auth')
      ).rejects.toThrow('Registry authentication not found for ID: nonexistent_auth');
    });

    it('should handle invalid API response format', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: { data: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await expect(
        novitaApiService.getRegistryAuth('auth_token_123')
      ).rejects.toThrow('Invalid response format from registry auths API');
    });

    it('should handle API errors when fetching registry auth', async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized access to registry auths' }
        },
        message: 'Request failed with status code 401'
      };

      mockedNovitaClient.get.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.getRegistryAuth('auth_token_123')
      ).rejects.toThrow(NovitaApiClientError);
    });
  });

  describe('createInstance', () => {
    const mockCreateRequest = {
      name: 'test-instance',
      productId: 'prod-1',
      gpuNum: 1,
      rootfsSize: 60,
      imageUrl: 'docker.io/nvidia/cuda:11.8-runtime-ubuntu20.04',
      kind: 'gpu' as const,
      billingMode: 'spot' as const
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
          id: 'instance-1'
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.createInstance(mockCreateRequest);

      expect(result.id).toBe('instance-1');
      expect(result.name).toBe('test-instance');
      expect(result.status).toBe(InstanceStatus.CREATING);
      expect(mockedNovitaClient.post).toHaveBeenCalledWith('/v1/gpu/instance/create', mockCreateRequest);
    });

    it('should handle creation errors', async () => {
      const axiosError = {
        response: {
          status: 400,
          data: { message: 'Insufficient quota' }
        },
        message: 'Request failed with status code 400'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.createInstance(mockCreateRequest)
      ).rejects.toThrow(NovitaApiClientError);
    });
  });

  describe('getInstance', () => {
    // Mock raw API response (what Novita API returns)
    const mockRawInstance = {
      id: 'instance-1',
      name: 'test-instance',
      status: 'running',
      productId: 'prod-1',
      clusterName: 'CN-HK-01',
      gpuNum: '1',
      rootfsSize: 60,
      billingMode: 'spot',
      createdAt: '1672531200', // Unix timestamp for 2023-01-01T00:00:00Z
      portMappings: [
        { port: 8080, type: 'http' }
      ]
    };

    // Expected transformed result
    const expectedInstance: InstanceResponse = {
      id: 'instance-1',
      name: 'test-instance',
      status: InstanceStatus.RUNNING,
      productId: 'prod-1',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      createdAt: '2023-01-01T00:00:00.000Z',
      portMappings: [
        { port: 8080, endpoint: '', type: 'http' }
      ]
    };

    it('should fetch instance successfully', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: mockRawInstance,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.getInstance('instance-1');

      expect(result).toEqual(expectedInstance);
      expect(mockedNovitaClient.get).toHaveBeenCalledWith('/v1/gpu/instance?instanceId=instance-1');
    });

    it('should handle instance not found', async () => {
      mockedNovitaClient.get.mockResolvedValue({
        data: null,
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

  describe('migrateInstance', () => {
    const instanceId = 'test-instance-123';

    it('should migrate instance successfully', async () => {
      const mockApiResponse = {
        message: 'Migration initiated successfully',
        newInstanceId: 'new-instance-456',
        instanceId: instanceId
      };

      mockedNovitaClient.post.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.migrateInstance(instanceId);

      expect(result).toEqual({
        success: true,
        instanceId: instanceId,
        message: 'Migration initiated successfully',
        newInstanceId: 'new-instance-456',
        migrationTime: expect.any(String)
      });

      expect(mockedNovitaClient.post).toHaveBeenCalledWith(
        '/gpu-instance/openapi/v1/gpu/instance/migrate',
        { instanceId }
      );
    });

    it('should handle migration API response without newInstanceId', async () => {
      const mockApiResponse = {
        message: 'Migration completed',
        instanceId: instanceId
      };

      mockedNovitaClient.post.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.migrateInstance(instanceId);

      expect(result).toEqual({
        success: true,
        instanceId: instanceId,
        message: 'Migration completed',
        newInstanceId: instanceId, // Should fallback to original instanceId
        migrationTime: expect.any(String)
      });
    });

    it('should handle migration API response with minimal data', async () => {
      mockedNovitaClient.post.mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.migrateInstance(instanceId);

      expect(result).toEqual({
        success: true,
        instanceId: instanceId,
        message: 'Migration initiated successfully',
        newInstanceId: undefined,
        migrationTime: expect.any(String)
      });
    });

    it('should handle API response with error field', async () => {
      const mockApiResponse = {
        error: 'Instance not eligible for migration',
        message: 'Migration failed'
      };

      mockedNovitaClient.post.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await novitaApiService.migrateInstance(instanceId);

      expect(result).toEqual({
        success: false,
        instanceId: instanceId,
        message: 'Migration failed',
        error: 'Instance not eligible for migration',
        migrationTime: expect.any(String)
      });
    });

    it('should handle 404 error (instance not found)', async () => {
      const axiosError = {
        response: {
          status: 404,
          data: { message: 'Instance not found' }
        },
        message: 'Request failed with status code 404'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow(NovitaApiClientError);

      expect(mockedNovitaClient.post).toHaveBeenCalledWith(
        '/gpu-instance/openapi/v1/gpu/instance/migrate',
        { instanceId }
      );
    });

    it('should handle 401 authentication error', async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        },
        message: 'Request failed with status code 401'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow('Authentication failed - check API key');
    });

    it('should handle 429 rate limit error', async () => {
      const axiosError = {
        response: {
          status: 429,
          data: { message: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' }
        },
        message: 'Request failed with status code 429'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow(RateLimitError);
    });

    it('should handle 500 server error', async () => {
      const axiosError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        },
        message: 'Request failed with status code 500'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow(NovitaApiClientError);
    });

    it('should handle network errors', async () => {
      const networkError = {
        code: 'ENOTFOUND',
        message: 'Network error'
      };

      mockedNovitaClient.post.mockRejectedValue(networkError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow('Network error - unable to connect to Novita.ai API');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'Request timeout'
      };

      mockedNovitaClient.post.mockRejectedValue(timeoutError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow('Request timeout');
    });

    it('should log migration request details', async () => {
      const mockApiResponse = {
        message: 'Migration successful'
      };

      mockedNovitaClient.post.mockResolvedValue({
        data: mockApiResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await novitaApiService.migrateInstance(instanceId);

      // Verify logging calls were made
      const { logger } = require('../../utils/logger');
      expect(logger.info).toHaveBeenCalledWith(
        'Initiating instance migration',
        expect.objectContaining({
          instanceId,
          endpoint: '/gpu-instance/openapi/v1/gpu/instance/migrate'
        })
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Migration API request details',
        expect.objectContaining({
          instanceId,
          payload: { instanceId },
          endpoint: '/gpu-instance/openapi/v1/gpu/instance/migrate'
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Instance migration completed successfully',
        expect.objectContaining({
          instanceId,
          success: true,
          responseStatus: 200
        })
      );
    });

    it('should log migration errors', async () => {
      const axiosError = {
        response: {
          status: 400,
          data: { message: 'Bad request' }
        },
        message: 'Request failed with status code 400'
      };

      mockedNovitaClient.post.mockRejectedValue(axiosError);

      await expect(
        novitaApiService.migrateInstance(instanceId)
      ).rejects.toThrow();

      // Verify error logging
      const { logger } = require('../../utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'Instance migration failed',
        expect.objectContaining({
          instanceId,
          error: expect.any(String),
          statusCode: 400
        })
      );
    });
  });
});