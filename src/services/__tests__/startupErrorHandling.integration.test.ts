import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { jobQueueService } from '../jobQueueService';
import { JobWorkerService } from '../jobWorkerService';
import { 
  StartupTimeoutError,
  StartupFailedError,
  StartupOperationInProgressError,
  ResourceConstraintsError,
  NetworkError,
  HealthCheckFailedError
} from '../../utils/errorHandler';
import { 
  InstanceStatus, 
  NovitaApiClientError,
  RateLimitError,
  TimeoutError,
  StartInstanceRequest
} from '../../types/api';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../jobQueueService');
jest.mock('../../clients/webhookClient');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockJobQueueService = jobQueueService as jest.Mocked<typeof jobQueueService>;

describe('Startup Error Handling Integration', () => {
  let jobWorkerService: JobWorkerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jobWorkerService = new JobWorkerService(mockJobQueueService);
    
    // Reset instance service state
    (instanceService as any).instanceStates.clear();
    (instanceService as any).activeStartupOperations.clear();
  });

  describe('Instance Service Error Handling', () => {
    beforeEach(() => {
      // Setup mock instance state
      const mockInstanceState = {
        id: 'test-instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        novitaInstanceId: 'novita-123',
        productId: 'product-123',
        templateId: 'template-123',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };
      
      (instanceService as any).instanceStates.set('test-instance-1', mockInstanceState);
    });

    it('should handle duplicate startup operation error', async () => {
      // Create an existing startup operation
      const existingOperation = (instanceService as any).createStartupOperation('test-instance-1', 'novita-123');
      
      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(StartupOperationInProgressError);
    });

    it('should handle Novita API rate limit error during startup', async () => {
      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new RateLimitError('Rate limit exceeded', 60000)
      );

      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(StartupFailedError);
    });

    it('should handle Novita API resource constraints error', async () => {
      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new NovitaApiClientError('Insufficient GPU resources', 403, 'RESOURCE_CONSTRAINTS')
      );

      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(ResourceConstraintsError);
    });

    it('should handle Novita API network error', async () => {
      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new NovitaApiClientError('Network error', 0, 'NETWORK_ERROR')
      );

      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(NetworkError);
    });

    it('should handle Novita API timeout error', async () => {
      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new TimeoutError('Request timeout')
      );

      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(StartupFailedError);
    });

    it('should handle generic API error', async () => {
      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new Error('Generic API error')
      );

      const startRequest: StartInstanceRequest = {};
      
      await expect(
        instanceService.startInstance('test-instance-1', startRequest, 'id')
      ).rejects.toThrow(StartupFailedError);
    });
  });

  describe('Novita API Service Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      // First two calls fail with retryable errors, third succeeds
      mockNovitaApiService.startInstance
        .mockRejectedValueOnce(new RateLimitError('Rate limit exceeded'))
        .mockRejectedValueOnce(new TimeoutError('Request timeout'))
        .mockResolvedValueOnce({
          id: 'novita-123',
          name: 'test-instance',
          status: InstanceStatus.STARTING,
          productId: 'product-123',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 60,
          billingMode: 'spot',
          createdAt: new Date().toISOString()
        });

      const result = await novitaApiService.startInstanceWithRetry('novita-123', 3);
      
      expect(result).toBeDefined();
      expect(result.status).toBe(InstanceStatus.STARTING);
      expect(mockNovitaApiService.startInstance).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      mockNovitaApiService.startInstance.mockRejectedValue(
        new NovitaApiClientError('Authentication failed', 401, 'AUTHENTICATION_FAILED')
      );

      await expect(
        novitaApiService.startInstanceWithRetry('novita-123', 3)
      ).rejects.toThrow(NovitaApiClientError);
      
      expect(mockNovitaApiService.startInstance).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      const rateLimitError = new RateLimitError('Rate limit exceeded');
      mockNovitaApiService.startInstance.mockRejectedValue(rateLimitError);

      await expect(
        novitaApiService.startInstanceWithRetry('novita-123', 2)
      ).rejects.toThrow(RateLimitError);
      
      expect(mockNovitaApiService.startInstance).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Context and Logging', () => {
    it('should create proper error context for startup operations', async () => {
      const mockInstanceState = {
        id: 'test-instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        novitaInstanceId: 'novita-123',
        productId: 'product-123',
        templateId: 'template-123',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };
      
      (instanceService as any).instanceStates.set('test-instance-1', mockInstanceState);

      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new Error('Test error for context')
      );

      try {
        await instanceService.startInstance('test-instance-1', {}, 'id');
      } catch (error) {
        expect(error).toBeInstanceOf(StartupFailedError);
        const startupError = error as StartupFailedError;
        expect(startupError.instanceId).toBe('test-instance-1');
        expect(startupError.phase).toBe('api_call');
        expect(startupError.reason).toBe('Test error for context');
      }
    });

    it('should handle startup operation tracking correctly', async () => {
      const mockInstanceState = {
        id: 'test-instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        novitaInstanceId: 'novita-123',
        productId: 'product-123',
        templateId: 'template-123',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };
      
      (instanceService as any).instanceStates.set('test-instance-1', mockInstanceState);

      mockNovitaApiService.startInstanceWithRetry.mockResolvedValue({
        id: 'novita-123',
        name: 'test-instance',
        status: InstanceStatus.STARTING,
        productId: 'product-123',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 60,
        billingMode: 'spot',
        createdAt: new Date().toISOString()
      });

      const result = await instanceService.startInstance('test-instance-1', {}, 'id');
      
      expect(result.operationId).toBeDefined();
      expect(result.status).toBe(InstanceStatus.STARTING);
      
      // Verify startup operation was created
      const operation = instanceService.getStartupOperation('test-instance-1');
      expect(operation).toBeDefined();
      expect(operation?.status).toBe('monitoring');
    });
  });

  describe('Error Recovery and Cleanup', () => {
    it('should clean up startup operation on failure', async () => {
      const mockInstanceState = {
        id: 'test-instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        novitaInstanceId: 'novita-123',
        productId: 'product-123',
        templateId: 'template-123',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };
      
      (instanceService as any).instanceStates.set('test-instance-1', mockInstanceState);

      mockNovitaApiService.startInstanceWithRetry.mockRejectedValue(
        new Error('Startup failed')
      );

      try {
        await instanceService.startInstance('test-instance-1', {}, 'id');
      } catch (error) {
        // Verify startup operation was cleaned up (marked as failed)
        const operation = instanceService.getStartupOperation('test-instance-1');
        expect(operation).toBeUndefined(); // Should be removed after failure
      }
    });
  });
});