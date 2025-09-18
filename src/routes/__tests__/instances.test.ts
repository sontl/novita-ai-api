import request from 'supertest';

// Mock the config before importing anything else
jest.mock('../../config/config', () => ({
  config: {
    port: 3000,
    nodeEnv: 'test',
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
      pollInterval: 30,
      maxRetryAttempts: 3,
      requestTimeout: 30000,
      webhookTimeout: 10000,
      cacheTimeout: 300,
      maxConcurrentJobs: 10
    },
    security: {
      enableCors: true,
      enableHelmet: false,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 100
    },
    instanceListing: {
      enableComprehensiveListing: false,
      defaultIncludeNovitaOnly: false,
      defaultSyncLocalState: false,
      comprehensiveCacheTtl: 300,
      novitaApiCacheTtl: 60,
      enableFallbackToLocal: true,
      novitaApiTimeout: 30000
    },
    healthCheck: {
      defaultTimeoutMs: 30000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 2000,
      defaultMaxWaitTimeMs: 600000
    },
    migration: {
      enabled: false,
      scheduleIntervalMs: 300000,
      jobTimeoutMs: 600000,
      maxConcurrentMigrations: 3,
      dryRunMode: false,
      retryFailedMigrations: true,
      logLevel: 'info'
    },
    instanceStartup: {
      defaultMaxWaitTime: 600000,
      defaultHealthCheckConfig: {
        timeoutMs: 30000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 600000
      },
      enableNameBasedLookup: true,
      operationTimeoutMs: 1800000
    }
  }
}));

// Mock the instance service
jest.mock('../../services/instanceService');

import { app } from '../../index';
import { instanceService } from '../../services/instanceService';
import { CreateInstanceResponse, InstanceDetails, ListInstancesResponse, StartInstanceResponse, NovitaApiClientError, InstanceStatus } from '../../types/api';

const mockInstanceService = instanceService as jest.Mocked<typeof instanceService>;

describe('Instances API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/instances', () => {
    const validCreateRequest = {
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template-123',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01',
      webhookUrl: 'https://example.com/webhook'
    };

    it('should create instance successfully with valid request', async () => {
      const mockResponse: CreateInstanceResponse = {
        instanceId: 'inst_123',
        status: 'creating',
        message: 'Instance creation initiated successfully',
        estimatedReadyTime: new Date(Date.now() + 4 * 60 * 1000).toISOString()
      };

      mockInstanceService.createInstance.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/instances')
        .send(validCreateRequest)
        .expect(201);

      expect(response.body).toEqual(mockResponse);
      expect(mockInstanceService.createInstance).toHaveBeenCalledWith(validCreateRequest);
    });

    it('should create instance with minimal required fields', async () => {
      const minimalRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123'
      };

      const mockResponse: CreateInstanceResponse = {
        instanceId: 'inst_123',
        status: 'creating',
        message: 'Instance creation initiated successfully'
      };

      mockInstanceService.createInstance.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/instances')
        .send(minimalRequest)
        .expect(201);

      expect(response.body).toEqual(mockResponse);
      expect(mockInstanceService.createInstance).toHaveBeenCalledWith({
        ...minimalRequest,
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01'
      });
    });

    it('should return 400 for missing required fields', async () => {
      const invalidRequest = {
        name: 'test-instance'
        // Missing productName and templateId
      };

      const response = await request(app)
        .post('/api/instances')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toHaveLength(2);
      expect(mockInstanceService.createInstance).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid field values', async () => {
      const invalidRequest = {
        name: '', // Empty name
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        gpuNum: 0, // Invalid GPU number
        rootfsSize: 5, // Too small
        webhookUrl: 'invalid-url' // Invalid URL
      };

      const response = await request(app)
        .post('/api/instances')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBeGreaterThan(0);
      expect(mockInstanceService.createInstance).not.toHaveBeenCalled();
    });

    it('should handle service errors appropriately', async () => {
      const serviceError = new NovitaApiClientError(
        'Product not found',
        404,
        'PRODUCT_NOT_FOUND'
      );

      mockInstanceService.createInstance.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/instances')
        .send(validCreateRequest)
        .expect(404);

      expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
      expect(response.body.error.message).toBe('Product not found');
    });

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockInstanceService.createInstance.mockRejectedValue(unexpectedError);

      const response = await request(app)
        .post('/api/instances')
        .send(validCreateRequest)
        .expect(500);

      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should include request ID in response', async () => {
      const mockResponse: CreateInstanceResponse = {
        instanceId: 'inst_123',
        status: 'creating',
        message: 'Instance creation initiated successfully'
      };

      mockInstanceService.createInstance.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/instances')
        .set('x-request-id', 'test-request-123')
        .send(validCreateRequest)
        .expect(201);

      expect(response.body).toEqual(mockResponse);
    });
  });

  describe('GET /api/instances/:instanceId', () => {
    const mockInstanceDetails: InstanceDetails = {
      id: 'inst_123',
      name: 'test-instance',
      status: 'running',
      gpuNum: 1,
      region: 'CN-HK-01',
      portMappings: [
        { port: 8080, endpoint: 'https://example.com:8080', type: 'http' }
      ],
      connectionDetails: {
        ssh: 'ssh user@example.com',
        jupyter: 'https://example.com:8888'
      },
      createdAt: '2023-01-01T00:00:00.000Z',
      readyAt: '2023-01-01T00:05:00.000Z'
    };

    it('should return instance details successfully', async () => {
      mockInstanceService.getInstanceStatus.mockResolvedValue(mockInstanceDetails);

      const response = await request(app)
        .get('/api/instances/inst_123')
        .expect(200);

      expect(response.body).toEqual(mockInstanceDetails);
      expect(mockInstanceService.getInstanceStatus).toHaveBeenCalledWith('inst_123');
    });

    it('should return 400 for invalid instance ID format', async () => {
      const response = await request(app)
        .get('/api/instances/invalid@id')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_INSTANCE_ID');
      expect(mockInstanceService.getInstanceStatus).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent instance', async () => {
      const notFoundError = new NovitaApiClientError(
        'Instance not found: inst_999',
        404,
        'INSTANCE_NOT_FOUND'
      );

      mockInstanceService.getInstanceStatus.mockRejectedValue(notFoundError);

      const response = await request(app)
        .get('/api/instances/inst_999')
        .expect(404);

      expect(response.body.error.code).toBe('INSTANCE_NOT_FOUND');
      expect(response.body.error.message).toBe('Instance not found: inst_999');
    });

    it('should handle service errors', async () => {
      const serviceError = new NovitaApiClientError(
        'API unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );

      mockInstanceService.getInstanceStatus.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/api/instances/inst_123')
        .expect(503);

      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('GET /api/instances', () => {
    const mockListResponse: ListInstancesResponse = {
      instances: [
        {
          id: 'inst_123',
          name: 'test-instance-1',
          status: 'running',
          gpuNum: 1,
          region: 'CN-HK-01',
          portMappings: [],
          createdAt: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'inst_456',
          name: 'test-instance-2',
          status: 'creating',
          gpuNum: 2,
          region: 'US-WEST-01',
          portMappings: [],
          createdAt: '2023-01-01T01:00:00.000Z'
        }
      ],
      total: 2
    };

    it('should return list of instances successfully', async () => {
      mockInstanceService.listInstances.mockResolvedValue(mockListResponse);

      const response = await request(app)
        .get('/api/instances')
        .expect(200);

      expect(response.body).toEqual(mockListResponse);
      expect(mockInstanceService.listInstances).toHaveBeenCalled();
    });

    it('should return empty list when no instances exist', async () => {
      const emptyResponse: ListInstancesResponse = {
        instances: [],
        total: 0
      };

      mockInstanceService.listInstances.mockResolvedValue(emptyResponse);

      const response = await request(app)
        .get('/api/instances')
        .expect(200);

      expect(response.body).toEqual(emptyResponse);
    });

    it('should handle service errors', async () => {
      const serviceError = new NovitaApiClientError(
        'Internal service error',
        500,
        'INTERNAL_ERROR'
      );

      mockInstanceService.listInstances.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/api/instances')
        .expect(500);

      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/instances/:instanceId/start', () => {
    const mockStartResponse: StartInstanceResponse = {
      instanceId: 'inst_123',
      novitaInstanceId: 'novita_456',
      status: InstanceStatus.STARTING,
      message: 'Instance start initiated successfully',
      operationId: 'op_789',
      estimatedReadyTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    it('should start instance by ID successfully', async () => {
      mockInstanceService.startInstance.mockResolvedValue(mockStartResponse);

      const response = await request(app)
        .post('/api/instances/inst_123/start')
        .send({})
        .expect(202);

      expect(response.body).toEqual(mockStartResponse);
      expect(mockInstanceService.startInstance).toHaveBeenCalledWith('inst_123', {}, 'id');
    });

    it('should start instance with custom health check config', async () => {
      const requestBody = {
        healthCheckConfig: {
          timeoutMs: 15000,
          retryAttempts: 5,
          retryDelayMs: 3000,
          maxWaitTimeMs: 900000
        },
        targetPort: 8080,
        webhookUrl: 'https://example.com/webhook'
      };

      mockInstanceService.startInstance.mockResolvedValue(mockStartResponse);

      const response = await request(app)
        .post('/api/instances/inst_123/start')
        .send(requestBody)
        .expect(202);

      expect(response.body).toEqual(mockStartResponse);
      expect(mockInstanceService.startInstance).toHaveBeenCalledWith('inst_123', requestBody, 'id');
    });

    it('should return 400 for invalid instance ID format', async () => {
      const response = await request(app)
        .post('/api/instances/invalid@id/start')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockInstanceService.startInstance).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid health check config', async () => {
      const invalidRequest = {
        healthCheckConfig: {
          timeoutMs: 500, // Too small
          retryAttempts: 15, // Too large
          targetPort: 70000 // Invalid port
        }
      };

      const response = await request(app)
        .post('/api/instances/inst_123/start')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockInstanceService.startInstance).not.toHaveBeenCalled();
    });

    it('should handle instance not found error', async () => {
      const notFoundError = new NovitaApiClientError(
        'Instance not found: inst_999',
        404,
        'INSTANCE_NOT_FOUND'
      );

      mockInstanceService.startInstance.mockRejectedValue(notFoundError);

      const response = await request(app)
        .post('/api/instances/inst_999/start')
        .send({})
        .expect(404);

      expect(response.body.error.code).toBe('INSTANCE_NOT_FOUND');
    });

    it('should handle instance not startable error', async () => {
      const notStartableError = new NovitaApiClientError(
        'Instance cannot be started: already running',
        400,
        'INSTANCE_NOT_STARTABLE'
      );

      mockInstanceService.startInstance.mockRejectedValue(notStartableError);

      const response = await request(app)
        .post('/api/instances/inst_123/start')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('INSTANCE_NOT_STARTABLE');
    });
  });

  describe('POST /api/instances/start', () => {
    const mockStartResponse: StartInstanceResponse = {
      instanceId: 'inst_123',
      novitaInstanceId: 'novita_456',
      status: InstanceStatus.STARTING,
      message: 'Instance start initiated successfully',
      operationId: 'op_789',
      estimatedReadyTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    it('should start instance by name successfully', async () => {
      const requestBody = {
        instanceName: 'test-instance'
      };

      mockInstanceService.startInstance.mockResolvedValue(mockStartResponse);

      const response = await request(app)
        .post('/api/instances/start')
        .send(requestBody)
        .expect(202);

      expect(response.body).toEqual(mockStartResponse);
      expect(mockInstanceService.startInstance).toHaveBeenCalledWith('test-instance', requestBody, 'name');
    });

    it('should start instance by name with custom config', async () => {
      const requestBody = {
        instanceName: 'test-instance',
        healthCheckConfig: {
          timeoutMs: 20000,
          retryAttempts: 2,
          retryDelayMs: 1000,
          maxWaitTimeMs: 300000
        },
        targetPort: 3000,
        webhookUrl: 'https://example.com/webhook'
      };

      mockInstanceService.startInstance.mockResolvedValue(mockStartResponse);

      const response = await request(app)
        .post('/api/instances/start')
        .send(requestBody)
        .expect(202);

      expect(response.body).toEqual(mockStartResponse);
      expect(mockInstanceService.startInstance).toHaveBeenCalledWith('test-instance', requestBody, 'name');
    });

    it('should return 400 when instanceName is missing', async () => {
      const requestBody = {
        healthCheckConfig: {
          timeoutMs: 15000
        }
      };

      const response = await request(app)
        .post('/api/instances/start')
        .send(requestBody)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Instance name is required');
      expect(mockInstanceService.startInstance).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid instance name format', async () => {
      const requestBody = {
        instanceName: 'invalid@name!'
      };

      const response = await request(app)
        .post('/api/instances/start')
        .send(requestBody)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockInstanceService.startInstance).not.toHaveBeenCalled();
    });

    it('should handle instance not found by name error', async () => {
      const notFoundError = new NovitaApiClientError(
        'Instance not found: test-instance',
        404,
        'INSTANCE_NOT_FOUND'
      );

      mockInstanceService.startInstance.mockRejectedValue(notFoundError);

      const response = await request(app)
        .post('/api/instances/start')
        .send({ instanceName: 'test-instance' })
        .expect(404);

      expect(response.body.error.code).toBe('INSTANCE_NOT_FOUND');
    });

    it('should return 400 for invalid webhook URL', async () => {
      const requestBody = {
        instanceName: 'test-instance',
        webhookUrl: 'invalid-url'
      };

      const response = await request(app)
        .post('/api/instances/start')
        .send(requestBody)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockInstanceService.startInstance).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should include request ID in error responses', async () => {
      const serviceError = new NovitaApiClientError(
        'Test error',
        400,
        'TEST_ERROR'
      );

      mockInstanceService.createInstance.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/instances')
        .set('x-request-id', 'test-request-456')
        .send({
          name: 'test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-123'
        })
        .expect(400);

      expect(response.body.error.requestId).toBeDefined();
    });

    it('should generate request ID if not provided', async () => {
      const serviceError = new NovitaApiClientError(
        'Test error',
        400,
        'TEST_ERROR'
      );

      mockInstanceService.createInstance.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/instances')
        .send({
          name: 'test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-123'
        })
        .expect(400);

      expect(response.body.error.requestId).toBeDefined();
      expect(response.body.error.requestId).toMatch(/^req_/);
    });
  });
});