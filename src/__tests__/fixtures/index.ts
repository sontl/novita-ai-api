/**
 * Test Fixtures and Mock Data
 * 
 * Centralized location for test data used across multiple test files.
 */

import { 
  Product, 
  Template, 
  InstanceResponse, 
  InstanceStatus,
  CreateInstanceRequest 
} from '../../types/api';
import { Job, JobType, JobStatus } from '../../types/job';

/**
 * Mock Products
 */
export const mockProducts: Product[] = [
  {
    id: 'prod-rtx4090-hk',
    name: 'RTX 4090 24GB',
    region: 'CN-HK-01',
    spotPrice: 0.45,
    onDemandPrice: 0.90,
    gpuType: 'RTX 4090',
    gpuMemory: 24,
    availability: 'available'
  },
  {
    id: 'prod-rtx4090-sg',
    name: 'RTX 4090 24GB',
    region: 'SG-01',
    spotPrice: 0.50,
    onDemandPrice: 0.95,
    gpuType: 'RTX 4090',
    gpuMemory: 24,
    availability: 'available'
  },
  {
    id: 'prod-a100-hk',
    name: 'A100 80GB',
    region: 'CN-HK-01',
    spotPrice: 1.20,
    onDemandPrice: 2.40,
    gpuType: 'A100',
    gpuMemory: 80,
    availability: 'limited'
  },
  {
    id: 'prod-h100-hk',
    name: 'H100 80GB',
    region: 'CN-HK-01',
    spotPrice: 2.50,
    onDemandPrice: 5.00,
    gpuType: 'H100',
    gpuMemory: 80,
    availability: 'available'
  }
];

/**
 * Mock Templates
 */
export const mockTemplates: Template[] = [
  {
    id: 'template-cuda-dev',
    name: 'CUDA Development Environment',
    imageUrl: 'docker.io/nvidia/cuda:11.8-devel-ubuntu20.04',
    imageAuth: '',
    ports: [
      { port: 8888, type: 'http' },
      { port: 22, type: 'tcp' }
    ],
    envs: [
      { key: 'JUPYTER_ENABLE_LAB', value: 'yes' },
      { key: 'JUPYTER_TOKEN', value: 'secure-token-123' }
    ]
  },
  {
    id: 'template-pytorch',
    name: 'PyTorch ML Environment',
    imageUrl: 'docker.io/pytorch/pytorch:2.0.1-cuda11.7-cudnn8-devel',
    imageAuth: '',
    ports: [
      { port: 8888, type: 'http' },
      { port: 6006, type: 'http' },
      { port: 22, type: 'tcp' }
    ],
    envs: [
      { key: 'JUPYTER_ENABLE_LAB', value: 'yes' },
      { key: 'PYTHONPATH', value: '/workspace' }
    ]
  },
  {
    id: 'template-tensorflow',
    name: 'TensorFlow ML Environment',
    imageUrl: 'docker.io/tensorflow/tensorflow:2.13.0-gpu-jupyter',
    imageAuth: '',
    ports: [
      { port: 8888, type: 'http' },
      { port: 6006, type: 'http' }
    ],
    envs: [
      { key: 'JUPYTER_ENABLE_LAB', value: 'yes' }
    ]
  }
];

/**
 * Mock Instance Responses
 */
export const mockInstanceResponses: InstanceResponse[] = [
  {
    id: 'novita-inst-123',
    name: 'test-instance-1',
    status: InstanceStatus.CREATING,
    productId: 'prod-rtx4090-hk',
    region: 'CN-HK-01',
    createdAt: '2024-01-01T00:00:00Z',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot'
  },
  {
    id: 'novita-inst-456',
    name: 'test-instance-2',
    status: InstanceStatus.RUNNING,
    productId: 'prod-a100-hk',
    region: 'CN-HK-01',
    createdAt: '2024-01-01T00:00:00Z',
    startedAt: '2024-01-01T00:01:00Z',
    gpuNum: 2,
    rootfsSize: 100,
    billingMode: 'spot',
    connectionInfo: {
      ssh: 'ssh://user@instance-456.novita.ai:22',
      jupyter: 'https://instance-456.novita.ai:8888',
      webTerminal: 'https://instance-456.novita.ai:7681'
    }
  },
  {
    id: 'novita-inst-789',
    name: 'failed-instance',
    status: InstanceStatus.FAILED,
    productId: 'prod-h100-hk',
    region: 'CN-HK-01',
    createdAt: '2024-01-01T00:00:00Z',
    gpuNum: 1,
    rootfsSize: 60,
    billingMode: 'spot'
  }
];

/**
 * Mock Create Instance Requests
 */
export const mockCreateRequests: CreateInstanceRequest[] = [
  {
    name: 'cuda-dev-instance',
    productName: 'RTX 4090 24GB',
    templateId: 'template-cuda-dev',
    gpuNum: 1,
    rootfsSize: 60,
    region: 'CN-HK-01',
    webhookUrl: 'https://example.com/webhook'
  },
  {
    name: 'pytorch-training',
    productName: 'A100 80GB',
    templateId: 'template-pytorch',
    gpuNum: 2,
    rootfsSize: 200,
    region: 'CN-HK-01'
  },
  {
    name: 'tensorflow-experiment',
    productName: 'RTX 4090 24GB',
    templateId: 'template-tensorflow',
    gpuNum: 1,
    rootfsSize: 80,
    region: 'SG-01',
    webhookUrl: 'https://ml-platform.example.com/webhooks/instance-ready'
  }
];

/**
 * Mock Jobs
 */
export const mockJobs: Job[] = [
  {
    id: 'job-create-123',
    type: JobType.CREATE_INSTANCE,
    payload: {
      instanceId: 'inst-123',
      name: 'test-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template-cuda-dev',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01'
    },
    status: JobStatus.PENDING,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    priority: 1
  },
  {
    id: 'job-monitor-456',
    type: JobType.MONITOR_INSTANCE,
    payload: {
      instanceId: 'inst-456',
      novitaInstanceId: 'novita-inst-456',
      webhookUrl: 'https://example.com/webhook',
      startedAt: '2024-01-01T00:01:00Z'
    },
    status: JobStatus.PROCESSING,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date('2024-01-01T00:01:00Z'),
    processedAt: new Date('2024-01-01T00:01:30Z'),
    priority: 2
  },
  {
    id: 'job-webhook-789',
    type: JobType.SEND_WEBHOOK,
    payload: {
      url: 'https://example.com/webhook',
      data: {
        instanceId: 'inst-789',
        status: 'running',
        timestamp: '2024-01-01T00:02:00Z'
      }
    },
    status: JobStatus.COMPLETED,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date('2024-01-01T00:02:00Z'),
    processedAt: new Date('2024-01-01T00:02:10Z'),
    completedAt: new Date('2024-01-01T00:02:15Z'),
    priority: 3
  }
];

/**
 * Mock Error Responses
 */
export const mockErrors = {
  validationError: {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [
        { field: 'name', message: 'Name is required' },
        { field: 'templateId', message: 'Template ID is required' }
      ],
      timestamp: '2024-01-01T00:00:00Z',
      requestId: 'req-123'
    }
  },
  notFoundError: {
    error: {
      code: 'NOT_FOUND',
      message: 'Instance not found',
      timestamp: '2024-01-01T00:00:00Z',
      requestId: 'req-456'
    }
  },
  rateLimitError: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded. Please try again later.',
      timestamp: '2024-01-01T00:00:00Z',
      requestId: 'req-789'
    }
  },
  serviceUnavailableError: {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Novita.ai API is temporarily unavailable',
      timestamp: '2024-01-01T00:00:00Z',
      requestId: 'req-999'
    }
  }
};

/**
 * Mock Webhook Payloads
 */
export const mockWebhookPayloads = {
  instanceReady: {
    instanceId: 'inst-123',
    novitaInstanceId: 'novita-inst-123',
    status: 'running',
    timestamp: '2024-01-01T00:02:00Z',
    connectionDetails: {
      ssh: 'ssh://user@instance-123.novita.ai:22',
      jupyter: 'https://instance-123.novita.ai:8888'
    }
  },
  instanceFailed: {
    instanceId: 'inst-456',
    novitaInstanceId: 'novita-inst-456',
    status: 'failed',
    timestamp: '2024-01-01T00:01:30Z',
    error: 'Instance failed to start within timeout period'
  }
};

/**
 * Mock Configuration
 */
export const mockConfig = {
  nodeEnv: 'test',
  port: 3003,
  logLevel: 'error',
  novita: {
    apiKey: 'test-api-key-12345',
    baseUrl: 'https://api.novita.ai'
  },
  webhook: {
    url: 'https://example.com/webhook',
    secret: 'webhook-secret-123'
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
    enableHelmet: true,
    rateLimitWindowMs: 900000,
    rateLimitMaxRequests: 100
  }
};

/**
 * Helper Functions for Test Data Generation
 */
export class TestDataGenerator {
  /**
   * Generate a random instance ID
   */
  static generateInstanceId(): string {
    return `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a random job ID
   */
  static generateJobId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a mock create instance request
   */
  static generateCreateRequest(overrides: Partial<CreateInstanceRequest> = {}): CreateInstanceRequest {
    return {
      name: `test-instance-${Date.now()}`,
      productName: 'RTX 4090 24GB',
      templateId: 'template-cuda-dev',
      gpuNum: 1,
      rootfsSize: 60,
      region: 'CN-HK-01',
      ...overrides
    };
  }

  /**
   * Generate a mock instance response
   */
  static generateInstanceResponse(overrides: Partial<InstanceResponse> = {}): InstanceResponse {
    return {
      id: `novita-inst-${Date.now()}`,
      name: `test-instance-${Date.now()}`,
      status: InstanceStatus.CREATING,
      productId: 'prod-rtx4090-hk',
      region: 'CN-HK-01',
      createdAt: new Date().toISOString(),
      gpuNum: 1,
      rootfsSize: 60,
      billingMode: 'spot',
      ...overrides
    };
  }

  /**
   * Generate a mock job
   */
  static generateJob(overrides: Partial<Job> = {}): Job {
    return {
      id: this.generateJobId(),
      type: JobType.CREATE_INSTANCE,
      payload: {
        instanceId: this.generateInstanceId(),
        name: `test-instance-${Date.now()}`,
        productName: 'RTX 4090 24GB',
        templateId: 'template-cuda-dev'
      },
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      priority: 1,
      ...overrides
    };
  }

  /**
   * Generate multiple test instances
   */
  static generateMultipleInstances(count: number): CreateInstanceRequest[] {
    return Array.from({ length: count }, (_, i) => 
      this.generateCreateRequest({
        name: `batch-instance-${i}`,
        productName: i % 2 === 0 ? 'RTX 4090 24GB' : 'A100 80GB',
        templateId: i % 3 === 0 ? 'template-cuda-dev' : 'template-pytorch'
      })
    );
  }
}

/**
 * Test Utilities
 */
export class TestUtils {
  /**
   * Wait for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.wait(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Create a mock function that resolves after a delay
   */
  static createDelayedMock<T>(value: T, delay: number = 100): jest.Mock<Promise<T>> {
    return jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(value), delay))
    );
  }

  /**
   * Create a mock function that rejects after a delay
   */
  static createDelayedErrorMock(error: Error, delay: number = 100): jest.Mock<Promise<never>> {
    return jest.fn().mockImplementation(() => 
      new Promise((_, reject) => setTimeout(() => reject(error), delay))
    );
  }
}