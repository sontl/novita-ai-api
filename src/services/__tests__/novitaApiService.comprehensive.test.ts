import { novitaApiService } from '../novitaApiService';
import { novitaClient } from '../../clients/novitaClient';
import { NovitaInstanceResponse, InstanceStatus } from '../../types/api';
import { AxiosResponse } from 'axios';

// Mock the novita client
jest.mock('../../clients/novitaClient');
const mockNovitaClient = novitaClient as jest.Mocked<typeof novitaClient>;

// Helper function to create proper Axios response mock
function createMockAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any
  };
}

describe('NovitaApiService - Comprehensive Listing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listInstances with correct endpoint', () => {
    it('should use the correct Novita.ai API endpoint', async () => {
      const mockResponse = createMockAxiosResponse({
        instances: []
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      await novitaApiService.listInstances();

      expect(mockNovitaClient.get).toHaveBeenCalledWith(
        '/v1/gpu/instances',
        { params: {} }
      );
    });

    it('should pass query parameters correctly', async () => {
      const mockResponse = createMockAxiosResponse({
        instances: []
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      const options = {
        page: 2,
        pageSize: 20,
        status: InstanceStatus.RUNNING
      };

      await novitaApiService.listInstances(options);

      expect(mockNovitaClient.get).toHaveBeenCalledWith(
        '/v1/gpu/instances',
        {
          params: {
            page: '2',
            page_size: '20',
            status: 'running'
          }
        }
      );
    });

    it('should transform Novita instances correctly', async () => {
      const mockNovitaInstance: NovitaInstanceResponse = {
        id: 'novita-123',
        name: 'test-instance',
        clusterId: 'cluster-1',
        clusterName: 'Test Cluster',
        status: 'running',
        imageUrl: 'docker.io/test:latest',
        imageAuthId: 'auth-123',
        command: 'python app.py',
        cpuNum: '8',
        memory: '32GB',
        gpuNum: '2',
        portMappings: [
          { port: 8080, endpoint: 'http://example.com:8080', type: 'http' },
          { port: 22, endpoint: 'ssh://example.com:22', type: 'ssh' }
        ],
        productId: 'product-123',
        productName: 'RTX 4090',
        rootfsSize: 100,
        volumeMounts: [
          {
            type: 'ssd',
            size: '50GB',
            id: 'vol-123',
            mountPath: '/data'
          }
        ],
        statusError: {
          state: 'error',
          message: 'Test error'
        },
        envs: [
          { key: 'ENV_VAR', value: 'test-value' }
        ],
        kind: 'gpu',
        billingMode: 'spot',
        endTime: '2024-12-31T23:59:59Z',
        spotStatus: 'active',
        spotReclaimTime: '2024-12-30T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        startedAt: '2024-01-01T00:01:00Z',
        stoppedAt: '2024-01-01T01:00:00Z',
        gpuIds: [0, 1],
        templateId: 'template-123'
      };

      const mockResponse = createMockAxiosResponse({
        instances: [mockNovitaInstance]
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      const result = await novitaApiService.listInstances();

      expect(result.instances).toHaveLength(1);
      const transformedInstance = result.instances[0]!;

      // Check core fields
      expect(transformedInstance.id).toBe('novita-123');
      expect(transformedInstance.name).toBe('test-instance');
      expect(transformedInstance.status).toBe('running');
      expect(transformedInstance.gpuNum).toBe(2);
      expect(transformedInstance.region).toBe('Test Cluster');

      // Check extended Novita.ai fields
      expect(transformedInstance.clusterId).toBe('cluster-1');
      expect(transformedInstance.clusterName).toBe('Test Cluster');
      expect(transformedInstance.productName).toBe('RTX 4090');
      expect(transformedInstance.cpuNum).toBe('8');
      expect(transformedInstance.memory).toBe('32GB');
      expect(transformedInstance.imageUrl).toBe('docker.io/test:latest');
      expect(transformedInstance.imageAuthId).toBe('auth-123');
      expect(transformedInstance.command).toBe('python app.py');
      expect(transformedInstance.volumeMounts).toEqual([{
        type: 'ssd',
        size: '50GB',
        id: 'vol-123',
        mountPath: '/data'
      }]);
      expect(transformedInstance.statusError).toEqual({
        state: 'error',
        message: 'Test error'
      });
      expect(transformedInstance.envs).toEqual([
        { key: 'ENV_VAR', value: 'test-value' }
      ]);
      expect(transformedInstance.kind).toBe('gpu');
      expect(transformedInstance.endTime).toBe('2024-12-31T23:59:59Z');
      expect(transformedInstance.spotStatus).toBe('active');
      expect(transformedInstance.spotReclaimTime).toBe('2024-12-30T23:59:59Z');

      // Check newly added fields
      expect(transformedInstance.startedAt).toBe('2024-01-01T00:01:00Z');
      expect(transformedInstance.stoppedAt).toBe('2024-01-01T01:00:00Z');
      expect(transformedInstance.gpuIds).toEqual([0, 1]);
      expect(transformedInstance.templateId).toBe('template-123');

      // Check port mappings transformation
      expect(transformedInstance.portMappings).toEqual([
        { port: 8080, endpoint: '', type: 'http' },
        { port: 22, endpoint: '', type: 'ssh' }
      ]);
    });

    it('should handle empty response correctly', async () => {
      const mockResponse = createMockAxiosResponse({
        instances: []
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      const result = await novitaApiService.listInstances();

      expect(result.instances).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should handle minimal instance data correctly', async () => {
      const mockNovitaInstance: Partial<NovitaInstanceResponse> = {
        id: 'novita-minimal',
        name: 'minimal-instance',
        clusterId: 'cluster-1',
        clusterName: 'Test Cluster',
        status: 'creating',
        imageUrl: 'docker.io/test:latest',
        cpuNum: '4',
        memory: '16GB',
        gpuNum: '1',
        portMappings: [],
        productId: 'product-123',
        productName: 'RTX 3080',
        rootfsSize: 50,
        envs: [],
        kind: 'gpu',
        billingMode: 'onDemand',
        createdAt: '2024-01-01T00:00:00Z'
      };

      const mockResponse = createMockAxiosResponse({
        instances: [mockNovitaInstance as NovitaInstanceResponse]
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      const result = await novitaApiService.listInstances();

      expect(result.instances).toHaveLength(1);
      const transformedInstance = result.instances[0]!;

      expect(transformedInstance.id).toBe('novita-minimal');
      expect(transformedInstance.name).toBe('minimal-instance');
      expect(transformedInstance.status).toBe('creating');
      expect(transformedInstance.portMappings).toEqual([]);
      
      // Optional fields should not be present when undefined
      expect(transformedInstance.imageAuthId).toBeUndefined();
      expect(transformedInstance.command).toBeUndefined();
      expect(transformedInstance.volumeMounts).toBeUndefined();
      expect(transformedInstance.statusError).toBeUndefined();
      expect(transformedInstance.endTime).toBeUndefined();
      expect(transformedInstance.spotStatus).toBeUndefined();
      expect(transformedInstance.spotReclaimTime).toBeUndefined();
    });

    it('should handle API errors correctly', async () => {
      const mockError = {
        response: {
          status: 404,
          data: {
            message: 'Instances not found',
            code: 'NOT_FOUND'
          }
        }
      };

      mockNovitaClient.get.mockRejectedValue(mockError);

      await expect(novitaApiService.listInstances()).rejects.toThrow('Instances not found');
    });

    it('should log request details correctly', async () => {
      const mockResponse = createMockAxiosResponse({
        instances: [
          {
            id: 'test-1',
            name: 'instance-1',
            clusterId: 'cluster-1',
            clusterName: 'Test Cluster',
            status: 'running',
            imageUrl: 'test:latest',
            cpuNum: '4',
            memory: '16GB',
            gpuNum: '1',
            portMappings: [],
            productId: 'product-1',
            productName: 'Test GPU',
            rootfsSize: 50,
            envs: [],
            kind: 'gpu',
            billingMode: 'spot',
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]
      });

      mockNovitaClient.get.mockResolvedValue(mockResponse);

      const result = await novitaApiService.listInstances();

      expect(result.instances).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});