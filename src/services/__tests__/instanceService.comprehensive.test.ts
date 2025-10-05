import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { 
  InstanceDetails, 
  EnhancedInstanceDetails, 
  InstanceResponse, 
  InstanceStatus,
  InstanceState 
} from '../../types/api';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../cacheService');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('InstanceService - Comprehensive Listing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listInstancesComprehensive', () => {
    it('should merge local and Novita instances correctly', async () => {
      // Mock local instance state
      const localInstanceId = 'local-123';
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'local-instance',
        status: InstanceStatus.RUNNING,
        novitaInstanceId: 'novita-123',
        productId: 'product-1',
        templateId: 'template-1',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      // Mock Novita API response
      const novitaInstance: InstanceResponse = {
        id: 'novita-123',
        name: 'local-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-1',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        portMappings: [
          { port: 8080, endpoint: 'http://example.com:8080', type: 'http' }
        ],
        clusterId: 'cluster-1',
        clusterName: 'Test Cluster',
        productName: 'RTX 4090'
      };

      // Set up mocks
      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive();

      expect(result.instances).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.sources.local).toBe(0);
      expect(result.sources.novita).toBe(0);
      expect(result.sources.merged).toBe(1);

      const mergedInstance = result.instances[0];
      expect(mergedInstance.id).toBe(localInstanceId);
      expect(mergedInstance.name).toBe('local-instance');
      expect(mergedInstance.source).toBe('merged');
      expect(mergedInstance.dataConsistency).toBe('consistent');
      expect(mergedInstance.clusterId).toBe('cluster-1');
      expect(mergedInstance.clusterName).toBe('Test Cluster');
      expect(mergedInstance.productName).toBe('RTX 4090');
      expect(mergedInstance.portMappings).toEqual([
        { port: 8080, endpoint: 'http://example.com:8080', type: 'http' }
      ]);
    });

    it('should include Novita-only instances when enabled', async () => {
      // Mock Novita API response with instance not in local state
      const novitaOnlyInstance: InstanceResponse = {
        id: 'novita-only-123',
        name: 'novita-only-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-2',
        region: 'CN-HK-01',
        gpuNum: 2,
        rootfsSize: 100,
        billingMode: 'onDemand',
        createdAt: '2024-01-02T00:00:00Z',
        portMappings: [],
        clusterId: 'cluster-2',
        productName: 'A100'
      };

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaOnlyInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true
      });

      expect(result.instances).toHaveLength(1);
      expect(result.sources.novita).toBe(1);
      expect(result.sources.local).toBe(0);
      expect(result.sources.merged).toBe(0);

      const novitaInstance = result.instances[0];
      expect(novitaInstance.id).toBe('novita-only-123');
      expect(novitaInstance.source).toBe('novita');
      expect(novitaInstance.dataConsistency).toBe('consistent');
      expect(novitaInstance.clusterId).toBe('cluster-2');
      expect(novitaInstance.productName).toBe('A100');
    });

    it('should exclude Novita-only instances when disabled', async () => {
      const novitaOnlyInstance: InstanceResponse = {
        id: 'novita-only-123',
        name: 'novita-only-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-2',
        region: 'CN-HK-01',
        gpuNum: 2,
        rootfsSize: 100,
        billingMode: 'onDemand',
        createdAt: '2024-01-02T00:00:00Z'
      };

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaOnlyInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive({
        includeNovitaOnly: false
      });

      expect(result.instances).toHaveLength(0);
      expect(result.sources.novita).toBe(0);
      expect(result.sources.local).toBe(0);
      expect(result.sources.merged).toBe(0);
    });

    it('should handle data consistency conflicts', async () => {
      const localInstanceId = 'local-456';
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'conflict-instance',
        status: InstanceStatus.CREATING,
        novitaInstanceId: 'novita-456',
        productId: 'product-3',
        templateId: 'template-3',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      const novitaInstance: InstanceResponse = {
        id: 'novita-456',
        name: 'conflict-instance',
        status: InstanceStatus.RUNNING, // Different status
        productId: 'product-3',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T01:00:00Z' // Later creation time
      };

      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive();

      expect(result.instances).toHaveLength(1);
      const mergedInstance = result.instances[0];
      
      expect(mergedInstance.dataConsistency).toBe('novita-newer');
      expect(mergedInstance.status).toBe(InstanceStatus.RUNNING); // Should prefer Novita status
      expect(mergedInstance.source).toBe('merged');
    });

    it('should handle Novita API failures gracefully', async () => {
      const localInstanceId = 'local-789';
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'local-only-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-4',
        templateId: 'template-4',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockRejectedValue(new Error('API unavailable'));

      const result = await instanceService.listInstancesComprehensive();

      expect(result.instances).toHaveLength(1);
      expect(result.sources.local).toBe(1);
      expect(result.sources.novita).toBe(0);
      expect(result.sources.merged).toBe(0);

      const localInstance = result.instances[0];
      expect(localInstance.source).toBe('local');
      expect(localInstance.id).toBe(localInstanceId);
    });

    it('should include performance metrics', async () => {
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [],
        total: 0,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive();

      expect(result.performance).toBeDefined();
      expect(result.performance?.totalRequestTime).toBeGreaterThanOrEqual(0);
      expect(result.performance?.novitaApiTime).toBeGreaterThanOrEqual(0);
      expect(result.performance?.localDataTime).toBeGreaterThanOrEqual(0);
      expect(result.performance?.mergeProcessingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.performance?.cacheHitRatio).toBe('number');
    });

    it('should sync local state when requested', async () => {
      const localInstanceId = 'local-sync-test';
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'sync-test-instance',
        status: InstanceStatus.CREATING,
        novitaInstanceId: 'novita-sync-test',
        productId: 'product-6',
        templateId: 'template-6',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      const novitaInstance: InstanceResponse = {
        id: 'novita-sync-test',
        name: 'sync-test-instance',
        status: InstanceStatus.RUNNING, // Different status
        productId: 'product-6',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z'
      };

      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const updateSpy = jest.spyOn(instanceService, 'updateInstanceState');

      await instanceService.listInstancesComprehensive({
        syncLocalState: true
      });

      expect(updateSpy).toHaveBeenCalledWith(localInstanceId, expect.objectContaining({
        status: InstanceStatus.RUNNING
      }));
    });
  });

  describe('instance matching logic', () => {
    it('should match instances by Novita instance ID', async () => {
      const localInstanceId = 'local-match-test';
      const novitaInstanceId = 'novita-match-test';
      
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'match-test-instance',
        status: InstanceStatus.RUNNING,
        novitaInstanceId: novitaInstanceId,
        productId: 'product-7',
        templateId: 'template-7',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      const novitaInstance: InstanceResponse = {
        id: novitaInstanceId,
        name: 'match-test-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-7',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z'
      };

      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive();

      expect(result.instances).toHaveLength(1);
      expect(result.sources.merged).toBe(1);
      expect(result.instances[0].id).toBe(localInstanceId); // Should use local ID
      expect(result.instances[0].source).toBe('merged');
    });

    it('should fallback to name and time matching', async () => {
      const localInstanceId = 'local-fallback-test';
      
      const localInstanceState: InstanceState = {
        id: localInstanceId,
        name: 'fallback-test-instance',
        status: InstanceStatus.RUNNING,
        // No novitaInstanceId set
        productId: 'product-8',
        templateId: 'template-8',
        configuration: {
          gpuNum: 1,
          rootfsSize: 50,
          region: 'CN-HK-01',
          imageUrl: 'test:latest',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date('2024-01-01T00:00:00Z')
        }
      };

      const novitaInstance: InstanceResponse = {
        id: 'novita-fallback-test',
        name: 'fallback-test-instance', // Same name
        status: InstanceStatus.RUNNING,
        productId: 'product-8',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:30Z' // Within 1 minute tolerance
      };

      (instanceService as any).instanceStates.set(localInstanceId, localInstanceState);
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [novitaInstance],
        total: 1,
        page: 1,
        pageSize: 10
      });

      const result = await instanceService.listInstancesComprehensive();

      expect(result.instances).toHaveLength(1);
      expect(result.sources.merged).toBe(1);
      expect(result.instances[0].id).toBe(localInstanceId);
      expect(result.instances[0].source).toBe('merged');
    });
  });
});