/**
 * Tests for StartupSyncService
 */

import { StartupSyncService } from '../startupSyncService';
import { NovitaApiService } from '../novitaApiService';
import { RedisCacheService } from '../redisCacheService';
import { IRedisClient } from '../../utils/redisClient';
import { InstanceResponse, InstanceStatus } from '../../types/api';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../redisCacheService');
jest.mock('../../utils/redisClient');

describe('StartupSyncService', () => {
  let startupSyncService: StartupSyncService;
  let mockNovitaApiService: jest.Mocked<NovitaApiService>;
  let mockRedisClient: jest.Mocked<IRedisClient>;
  let mockInstanceCache: jest.Mocked<RedisCacheService<InstanceResponse>>;

  const mockNovitaInstances: InstanceResponse[] = [
    {
      id: 'novita-1',
      name: 'test-instance-1',
      status: InstanceStatus.RUNNING,
      productId: 'product-1',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 50,
      billingMode: 'spot',
      createdAt: '2024-01-01T00:00:00Z',
      portMappings: []
    },
    {
      id: 'novita-2',
      name: 'test-instance-2',
      status: InstanceStatus.STOPPED,
      productId: 'product-2',
      region: 'CN-HK-01',
      gpuNum: 2,
      rootfsSize: 100,
      billingMode: 'spot',
      createdAt: '2024-01-02T00:00:00Z',
      portMappings: []
    }
  ];

  const mockCachedInstances: InstanceResponse[] = [
    {
      id: 'novita-1',
      name: 'test-instance-1',
      status: InstanceStatus.STOPPED, // Different status - should be updated
      productId: 'product-1',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 50,
      billingMode: 'spot',
      createdAt: '2024-01-01T00:00:00Z',
      portMappings: []
    },
    {
      id: 'orphaned-1',
      name: 'orphaned-instance',
      status: InstanceStatus.RUNNING,
      productId: 'product-3',
      region: 'CN-HK-01',
      gpuNum: 1,
      rootfsSize: 50,
      billingMode: 'spot',
      createdAt: '2024-01-03T00:00:00Z',
      portMappings: []
    }
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockNovitaApiService = new NovitaApiService() as jest.Mocked<NovitaApiService>;
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      setNX: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn()
    } as any;
    mockInstanceCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      keys: jest.fn(),
      size: jest.fn()
    } as any;

    // Create service instance
    startupSyncService = new StartupSyncService(
      mockNovitaApiService,
      mockRedisClient,
      mockInstanceCache
    );
  });

  describe('synchronizeInstances', () => {
    it('should successfully synchronize instances', async () => {
      // Mock successful lock acquisition
      mockRedisClient.setNX.mockResolvedValue(true);
      mockRedisClient.del.mockResolvedValue(true);
      mockRedisClient.set.mockResolvedValue(undefined);

      // Mock Novita API response with pagination
      mockNovitaApiService.listInstances
        .mockResolvedValueOnce({
          instances: mockNovitaInstances,
          total: mockNovitaInstances.length,
          page: 1,
          pageSize: 50
        })
        .mockResolvedValueOnce({
          instances: [],
          total: 0,
          page: 2,
          pageSize: 50
        });

      // Mock cached instances
      mockInstanceCache.keys.mockResolvedValue(['novita-1', 'orphaned-1']);
      mockInstanceCache.get
        .mockResolvedValueOnce(mockCachedInstances[0]!)
        .mockResolvedValueOnce(mockCachedInstances[1]!);

      // Mock cache operations
      mockInstanceCache.set.mockResolvedValue(undefined);
      mockInstanceCache.delete.mockResolvedValue(true);

      // Execute synchronization
      const result = await startupSyncService.synchronizeInstances();

      // Verify results
      expect(result.novitaInstances).toBe(2);
      expect(result.redisInstances).toBe(2);
      expect(result.synchronized).toBe(2);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify API calls
      expect(mockNovitaApiService.listInstances).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50
      });

      // Verify cache operations
      expect(mockInstanceCache.set).toHaveBeenCalledTimes(2);
      expect(mockInstanceCache.delete).toHaveBeenCalledWith('orphaned-1');

      // Verify lock operations
      expect(mockRedisClient.setNX).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should handle lock acquisition failure', async () => {
      // Mock failed lock acquisition
      mockRedisClient.setNX.mockResolvedValue(false);

      // Execute synchronization
      const result = await startupSyncService.synchronizeInstances();

      // Verify results
      expect(result.novitaInstances).toBe(0);
      expect(result.redisInstances).toBe(0);
      expect(result.synchronized).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Another synchronization process is already running');

      // Verify no API calls were made
      expect(mockNovitaApiService.listInstances).not.toHaveBeenCalled();
    });

    it('should handle Novita API errors gracefully', async () => {
      // Mock successful lock acquisition
      mockRedisClient.setNX.mockResolvedValue(true);
      mockRedisClient.del.mockResolvedValue(true);

      // Mock API error
      const apiError = new Error('Novita API error');
      mockNovitaApiService.listInstances.mockRejectedValue(apiError);

      // Execute synchronization
      const result = await startupSyncService.synchronizeInstances();

      // Verify results
      expect(result.novitaInstances).toBe(0);
      expect(result.redisInstances).toBe(0);
      expect(result.synchronized).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Synchronization failed');

      // Verify lock was still released
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should handle cache errors during synchronization', async () => {
      // Mock successful lock acquisition
      mockRedisClient.setNX.mockResolvedValue(true);
      mockRedisClient.del.mockResolvedValue(true);
      mockRedisClient.set.mockResolvedValue(undefined);

      // Mock Novita API response
      mockNovitaApiService.listInstances
        .mockResolvedValueOnce({
          instances: [mockNovitaInstances[0]!],
          total: 1,
          page: 1,
          pageSize: 50
        })
        .mockResolvedValueOnce({
          instances: [],
          total: 0,
          page: 2,
          pageSize: 50
        });

      // Mock cached instances
      mockInstanceCache.keys.mockResolvedValue(['novita-1']);
      mockInstanceCache.get.mockResolvedValue(mockCachedInstances[0]!);

      // Mock cache set error
      mockInstanceCache.set.mockRejectedValue(new Error('Cache set error'));

      // Execute synchronization
      const result = await startupSyncService.synchronizeInstances();

      // Verify results
      expect(result.novitaInstances).toBe(1);
      expect(result.redisInstances).toBe(1);
      expect(result.synchronized).toBe(0); // Failed to sync due to cache error
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to sync instance');
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      // Mock Redis operations
      mockRedisClient.get.mockResolvedValue('2024-01-01T12:00:00Z');
      mockRedisClient.exists.mockResolvedValue(false);
      mockInstanceCache.size.mockResolvedValue(5);

      // Execute
      const status = await startupSyncService.getSyncStatus();

      // Verify
      expect(status.lastSync).toBe('2024-01-01T12:00:00Z');
      expect(status.isLocked).toBe(false);
      expect(status.cacheSize).toBe(5);
    });

    it('should handle Redis errors gracefully', async () => {
      // Mock Redis error
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      // Execute
      const status = await startupSyncService.getSyncStatus();

      // Verify fallback values
      expect(status.lastSync).toBeNull();
      expect(status.isLocked).toBe(false);
      expect(status.cacheSize).toBe(0);
    });
  });
});