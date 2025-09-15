/**
 * Simple integration test for the instance creation workflow
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

// Mock webhook client
jest.mock('../../clients/webhookClient', () => ({
  webhookClient: {
    sendWebhook: jest.fn().mockResolvedValue(undefined)
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
  CreateInstanceJobPayload
} from '../../types/job';
import {
  Product,
  Template,
  InstanceResponse,
  InstanceStatus,
  CreateInstanceRequest
} from '../../types/api';

// Mock dependencies
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../novitaApiService');

describe('Workflow Integration Test', () => {
  let jobWorkerService: JobWorkerService;
  let jobQueueService: JobQueueService;
  let instanceService: InstanceService;
  let mockProductService: jest.Mocked<ProductService>;
  let mockTemplateService: jest.Mocked<TemplateService>;
  let mockNovitaApiService: jest.Mocked<NovitaApiService>;

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

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create services
    jobQueueService = new JobQueueService();
    jobWorkerService = new JobWorkerService(jobQueueService);
    instanceService = new InstanceService();

    // Get mocked services
    mockProductService = require('../productService').productService as jest.Mocked<ProductService>;
    mockTemplateService = require('../templateService').templateService as jest.Mocked<TemplateService>;
    mockNovitaApiService = require('../novitaApiService').novitaApiService as jest.Mocked<NovitaApiService>;

    // Setup default mock implementations
    mockProductService.getOptimalProduct.mockResolvedValue(mockProduct);
    mockTemplateService.getTemplateConfiguration.mockResolvedValue(mockTemplate);
    mockNovitaApiService.createInstance.mockResolvedValue(mockInstanceResponse);
    mockNovitaApiService.startInstance.mockResolvedValue(mockStartedInstanceResponse);
  });

  afterEach(() => {
    // Stop job processing to prevent hanging tests
    jobWorkerService.stop();
  });

  it('should complete the instance creation workflow successfully', async () => {
    // Create instance request
    const createRequest: CreateInstanceRequest = {
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template_456',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01'
    };

    // Create instance through service
    const response = await instanceService.createInstance(createRequest);

    // Verify response
    expect(response.instanceId).toBeDefined();
    expect(response.status).toBe('creating');
    expect(response.message).toBe('Instance creation initiated successfully');

    // Verify instance state was created
    const instanceState = instanceService.getInstanceState(response.instanceId);
    expect(instanceState).toBeDefined();
    expect(instanceState?.name).toBe('test-instance');
    expect(instanceState?.status).toBe(InstanceStatus.CREATING);

    // Start job processing
    jobWorkerService.start();

    // Wait a bit for job processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify services were called
    expect(mockProductService.getOptimalProduct).toHaveBeenCalledWith(
      'RTX 4090 24GB',
      'CN-HK-01'
    );
    expect(mockTemplateService.getTemplateConfiguration).toHaveBeenCalledWith('template_456');
    expect(mockNovitaApiService.createInstance).toHaveBeenCalled();
    expect(mockNovitaApiService.startInstance).toHaveBeenCalledWith('novita_inst_789');

    // Verify instance state was updated
    const updatedState = instanceService.getInstanceState(response.instanceId);
    expect(updatedState?.novitaInstanceId).toBe('novita_inst_789');
    expect(updatedState?.status).toBe(InstanceStatus.STARTING);
  }, 10000);

  it('should handle errors gracefully', async () => {
    // Mock product service to throw error
    mockProductService.getOptimalProduct.mockRejectedValue(
      new Error('No products available')
    );

    // Create instance request
    const createRequest: CreateInstanceRequest = {
      name: 'test-instance',
      productName: 'Invalid GPU',
      templateId: 'template_456'
    };

    // Create instance through service
    const response = await instanceService.createInstance(createRequest);

    // Start job processing
    jobWorkerService.start();

    // Wait a bit for job processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify instance state was updated to failed
    const instanceState = instanceService.getInstanceState(response.instanceId);
    expect(instanceState?.status).toBe(InstanceStatus.FAILED);
    expect(instanceState?.lastError).toContain('No products available');
  }, 10000);
});