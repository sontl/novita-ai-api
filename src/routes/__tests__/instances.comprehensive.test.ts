import request from 'supertest';
import express from 'express';
import { instancesRouter } from '../instances';
import { instanceService } from '../../services/instanceService';
import { EnhancedListInstancesResponse } from '../../types/api';
import { config } from '../../config/config';

// Mock dependencies
jest.mock('../../services/instanceService');
jest.mock('../../config/config');

const mockInstanceService = instanceService as jest.Mocked<typeof instanceService>;
const mockConfig = config as jest.Mocked<typeof config>;

const app = express();
app.use(express.json());
app.use('/api/instances', instancesRouter);

describe('Instances Router - Comprehensive Listing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set default config mock
    mockConfig.instanceListing = {
      enableComprehensiveListing: true,
      defaultIncludeNovitaOnly: true,
      defaultSyncLocalState: false,
      comprehensiveCacheTtl: 30,
      novitaApiCacheTtl: 60,
      enableFallbackToLocal: true,
      novitaApiTimeout: 15000
    };
  });

  describe('GET /api/instances with comprehensive source', () => {
    it('should use comprehensive listing when source=all', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [
          {
            id: 'test-1',
            name: 'test-instance',
            status: 'running',
            gpuNum: 1,
            region: 'CN-HK-01',
            portMappings: [],
            createdAt: '2024-01-01T00:00:00Z',
            source: 'merged',
            dataConsistency: 'consistent',
            clusterId: 'cluster-1',
            lastSyncedAt: '2024-01-01T00:00:00Z'
          }
        ],
        total: 1,
        sources: {
          local: 0,
          novita: 0,
          merged: 1
        },
        performance: {
          totalRequestTime: 100,
          novitaApiTime: 50,
          localDataTime: 20,
          mergeProcessingTime: 30,
          cacheHitRatio: 0.5
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/instances?source=all')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: true, // Default from config
        syncLocalState: false    // Default from config
      });

      expect(response.body).toEqual(mockResponse);
    });

    it('should use comprehensive listing when source=comprehensive', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/instances?source=comprehensive&includeNovitaOnly=false&syncLocalState=true')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: false,
        syncLocalState: true
      });
    });

    it('should fallback to local listing when comprehensive is disabled', async () => {
      mockConfig.instanceListing.enableComprehensiveListing = false;

      const mockLocalResponse = {
        instances: [
          {
            id: 'local-1',
            name: 'local-instance',
            status: 'running',
            gpuNum: 1,
            region: 'CN-HK-01',
            portMappings: [],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        total: 1
      };

      mockInstanceService.listInstances.mockResolvedValue(mockLocalResponse);

      const response = await request(app)
        .get('/api/instances?source=all')
        .expect(200);

      expect(mockInstanceService.listInstances).toHaveBeenCalled();
      expect(mockInstanceService.listInstancesComprehensive).not.toHaveBeenCalled();
      expect(response.body).toEqual(mockLocalResponse);
    });

    it('should use traditional listing for local source', async () => {
      const mockLocalResponse = {
        instances: [
          {
            id: 'local-1',
            name: 'local-instance',
            status: 'running',
            gpuNum: 1,
            region: 'CN-HK-01',
            portMappings: [],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        total: 1
      };

      mockInstanceService.listInstances.mockResolvedValue(mockLocalResponse);

      const response = await request(app)
        .get('/api/instances?source=local')
        .expect(200);

      expect(mockInstanceService.listInstances).toHaveBeenCalled();
      expect(mockInstanceService.listInstancesComprehensive).not.toHaveBeenCalled();
      expect(response.body).toEqual(mockLocalResponse);
    });

    it('should use config defaults when query params are not provided', async () => {
      mockConfig.instanceListing.defaultIncludeNovitaOnly = false;
      mockConfig.instanceListing.defaultSyncLocalState = true;

      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/instances?source=all')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: false,
        syncLocalState: true
      });
    });
  });

  describe('GET /api/instances/comprehensive', () => {
    it('should return comprehensive instance data', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [
          {
            id: 'comprehensive-1',
            name: 'comprehensive-instance',
            status: 'running',
            gpuNum: 2,
            region: 'CN-HK-01',
            portMappings: [
              { port: 8080, endpoint: 'http://example.com:8080', type: 'http' }
            ],
            createdAt: '2024-01-01T00:00:00Z',
            source: 'merged',
            dataConsistency: 'consistent',
            clusterId: 'cluster-1',
            clusterName: 'Test Cluster',
            productName: 'RTX 4090',
            cpuNum: '8',
            memory: '32GB',
            imageUrl: 'docker.io/test:latest',
            lastSyncedAt: '2024-01-01T00:00:00Z'
          }
        ],
        total: 1,
        sources: {
          local: 0,
          novita: 0,
          merged: 1
        },
        performance: {
          totalRequestTime: 150,
          novitaApiTime: 80,
          localDataTime: 30,
          mergeProcessingTime: 40,
          cacheHitRatio: 0.75
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/instances/comprehensive')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: true,  // Default
        syncLocalState: false     // Default
      });

      expect(response.body).toEqual(mockResponse);
      expect(response.body.instances[0]).toHaveProperty('clusterId');
      expect(response.body.instances[0]).toHaveProperty('productName');
      expect(response.body.instances[0]).toHaveProperty('source');
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('performance');
    });

    it('should handle query parameters correctly', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/instances/comprehensive?includeNovitaOnly=false&syncLocalState=true')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: false,
        syncLocalState: true
      });
    });

    it('should return 404 when comprehensive listing is disabled', async () => {
      mockConfig.instanceListing.enableComprehensiveListing = false;

      const response = await request(app)
        .get('/api/instances/comprehensive')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('FEATURE_DISABLED');
      expect(response.body.error.message).toBe('Comprehensive instance listing is disabled');
      expect(mockInstanceService.listInstancesComprehensive).not.toHaveBeenCalled();
    });

    it('should include performance metrics in response', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        },
        performance: {
          totalRequestTime: 200,
          novitaApiTime: 120,
          localDataTime: 40,
          mergeProcessingTime: 40,
          cacheHitRatio: 0.9
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/instances/comprehensive')
        .expect(200);

      expect(response.body.performance).toBeDefined();
      expect(response.body.performance.totalRequestTime).toBe(200);
      expect(response.body.performance.cacheHitRatio).toBe(0.9);
    });

    it('should handle service errors appropriately', async () => {
      mockInstanceService.listInstancesComprehensive.mockRejectedValue(
        new Error('Service unavailable')
      );

      await request(app)
        .get('/api/instances/comprehensive')
        .expect(500);
    });

    it('should use config defaults when params not provided', async () => {
      mockConfig.instanceListing.defaultIncludeNovitaOnly = false;
      mockConfig.instanceListing.defaultSyncLocalState = true;

      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/instances/comprehensive')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalledWith({
        includeNovitaOnly: false,
        syncLocalState: true
      });
    });

    it('should handle boolean query parameter parsing correctly', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      // Test explicit false
      await request(app)
        .get('/api/instances/comprehensive?includeNovitaOnly=false')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenLastCalledWith({
        includeNovitaOnly: false,
        syncLocalState: false
      });

      // Test explicit true
      await request(app)
        .get('/api/instances/comprehensive?includeNovitaOnly=true&syncLocalState=true')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenLastCalledWith({
        includeNovitaOnly: true,
        syncLocalState: true
      });
    });
  });

  describe('request logging and context', () => {
    it('should log comprehensive listing requests with proper context', async () => {
      const mockResponse: EnhancedListInstancesResponse = {
        instances: [],
        total: 0,
        sources: {
          local: 0,
          novita: 0,
          merged: 0
        },
        performance: {
          totalRequestTime: 100,
          novitaApiTime: 50,
          localDataTime: 20,
          mergeProcessingTime: 30,
          cacheHitRatio: 0.5
        }
      };

      mockInstanceService.listInstancesComprehensive.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/instances/comprehensive')
        .set('x-request-id', 'test-request-123')
        .set('x-correlation-id', 'test-correlation-456')
        .expect(200);

      expect(mockInstanceService.listInstancesComprehensive).toHaveBeenCalled();
    });
  });
});