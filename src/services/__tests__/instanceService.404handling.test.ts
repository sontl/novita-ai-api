import { InstanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { NovitaApiClientError, InstanceStatus } from '../../types/api';

// Mock the dependencies
jest.mock('../novitaApiService');
jest.mock('../serviceRegistry');
jest.mock('../../utils/logger');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('InstanceService - 404 Error Handling', () => {
  let instanceService: InstanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    instanceService = new InstanceService();
    
    // Mock the cache getters to return simple mock objects
    Object.defineProperty(instanceService, 'instanceCache', {
      get: () => Promise.resolve({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
      })
    });

    Object.defineProperty(instanceService, 'instanceStateCache', {
      get: () => Promise.resolve({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
      })
    });
  });

  describe('404 error handling in getInstanceStatus', () => {
    it('should remove instance from local state when Novita API returns 404', async () => {
      const instanceId = 'test-instance-id';
      const novitaInstanceId = 'novita-instance-id';

      // Set up initial instance state
      const instanceState = {
        id: instanceId,
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        novitaInstanceId,
        productId: 'test-product',
        templateId: 'test-template',
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

      // Add instance to service's internal state
      instanceService['instanceStates'].set(instanceId, instanceState);

      // Verify instance is in state before test
      expect(instanceService['instanceStates'].has(instanceId)).toBe(true);

      // Mock Novita API to return 404
      mockNovitaApiService.getInstance.mockRejectedValue(
        new NovitaApiClientError('Instance not found', 404, 'INSTANCE_NOT_FOUND')
      );

      // Call getInstanceStatus and expect it to throw 404
      await expect(instanceService.getInstanceStatus(instanceId))
        .rejects
        .toThrow('Instance not found');

      // Verify that the instance was removed from internal state
      expect(instanceService['instanceStates'].has(instanceId)).toBe(false);
    });

    it('should keep instance in local state for non-404 errors', async () => {
      const instanceId = 'test-instance-id';
      const novitaInstanceId = 'novita-instance-id';

      // Set up initial instance state
      const instanceState = {
        id: instanceId,
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        novitaInstanceId,
        productId: 'test-product',
        templateId: 'test-template',
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

      // Add instance to service's internal state
      instanceService['instanceStates'].set(instanceId, instanceState);

      // Mock Novita API to return network error (500)
      mockNovitaApiService.getInstance.mockRejectedValue(
        new NovitaApiClientError('Network error', 500, 'NETWORK_ERROR')
      );

      // Call getInstanceStatus - should return cached state instead of throwing
      const result = await instanceService.getInstanceStatus(instanceId);

      // Verify that the instance is still in internal state
      expect(instanceService['instanceStates'].has(instanceId)).toBe(true);

      // Verify that cached state was returned
      expect(result.id).toBe(instanceId);
      expect(result.status).toBe(InstanceStatus.RUNNING);
    });
  });

  describe('handleInstanceNotFound method', () => {
    it('should remove instance from local state', async () => {
      const instanceId = 'test-instance-id';
      const novitaInstanceId = 'novita-instance-id';

      // Set up initial instance state
      const instanceState = {
        id: instanceId,
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        novitaInstanceId,
        productId: 'test-product',
        templateId: 'test-template',
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

      // Add instance to service's internal state
      instanceService['instanceStates'].set(instanceId, instanceState);

      // Verify instance is in state before test
      expect(instanceService['instanceStates'].has(instanceId)).toBe(true);

      // Call handleInstanceNotFound
      await instanceService.handleInstanceNotFound(instanceId, novitaInstanceId);

      // Verify that the instance was removed from internal state
      expect(instanceService['instanceStates'].has(instanceId)).toBe(false);
    });
  });
});