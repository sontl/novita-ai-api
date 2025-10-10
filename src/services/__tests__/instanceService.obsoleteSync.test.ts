/**
 * Tests for obsolete instance synchronization functionality
 */

import { InstanceService } from '../instanceService';
import { NovitaApiService } from '../novitaApiService';
import { ConfigService } from '../configService';
import { InstanceStatus } from '../../types/api';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../configService');
jest.mock('../../utils/logger');

describe('InstanceService - Obsolete Instance Sync', () => {
  let instanceService: InstanceService;
  let mockNovitaApiService: jest.Mocked<NovitaApiService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock services
    mockNovitaApiService = new NovitaApiService({} as any) as jest.Mocked<NovitaApiService>;
    mockConfigService = new ConfigService() as jest.Mocked<ConfigService>;

    // Mock config with sync settings
    mockConfigService.getConfig.mockReturnValue({
      sync: {
        removeObsoleteInstances: false, // Default to marking as terminated
        obsoleteInstanceRetentionDays: 7,
        enableAutomaticSync: true,
        syncIntervalMinutes: 30,
      }
    } as any);

    // Create instance service
    instanceService = new InstanceService(
      mockNovitaApiService,
      mockConfigService
    );
  });

  describe('syncLocalStateWithNovita', () => {
    it('should mark obsolete instances as terminated when removeObsoleteInstances is false', async () => {
      // Setup: Create a local instance that doesn't exist in Novita
      const localInstanceId = 'local-123';
      const novitaInstanceId = 'novita-456';
      
      instanceService.updateInstanceState(localInstanceId, {
        id: localInstanceId,
        novitaInstanceId,
        status: InstanceStatus.RUNNING,
        timestamps: {
          created: new Date(Date.now() - 60000), // 1 minute ago
        }
      } as any);

      // Mock Novita API to return empty list (instance no longer exists)
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [], // No instances in Novita
        total: 0
      });

      // Trigger sync
      await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true,
        syncLocalState: true
      });

      // Verify instance was marked as terminated
      const instanceState = await instanceService.getInstanceState(localInstanceId);
      expect(instanceState?.status).toBe(InstanceStatus.TERMINATED);
      expect(instanceState?.timestamps.terminated).toBeDefined();
    });
  });
});    i
t('should remove obsolete instances when removeObsoleteInstances is true', async () => {
      // Configure to remove obsolete instances
      mockConfigService.getConfig.mockReturnValue({
        sync: {
          removeObsoleteInstances: true,
          obsoleteInstanceRetentionDays: 7,
          enableAutomaticSync: true,
          syncIntervalMinutes: 30,
        }
      } as any);

      // Setup: Create a local instance that doesn't exist in Novita
      const localInstanceId = 'local-789';
      const novitaInstanceId = 'novita-101';
      
      instanceService.updateInstanceState(localInstanceId, {
        id: localInstanceId,
        novitaInstanceId,
        status: InstanceStatus.RUNNING,
        timestamps: {
          created: new Date(Date.now() - 60000), // 1 minute ago
        }
      } as any);

      // Mock Novita API to return empty list
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [],
        total: 0
      });

      // Trigger sync
      await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true,
        syncLocalState: true
      });

      // Verify instance was removed
      const instanceState = await instanceService.getInstanceState(localInstanceId);
      expect(instanceState).toBeUndefined();
    });

    it('should update existing instances with current Novita status', async () => {
      // Setup: Create a local instance with outdated status
      const localInstanceId = 'local-update';
      const novitaInstanceId = 'novita-update';
      
      instanceService.updateInstanceState(localInstanceId, {
        id: localInstanceId,
        novitaInstanceId,
        status: InstanceStatus.STARTING,
        timestamps: {
          created: new Date(Date.now() - 60000),
        }
      } as any);

      // Mock Novita API to return updated status
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [{
          id: novitaInstanceId,
          name: 'test-instance',
          status: InstanceStatus.RUNNING,
          region: 'us-east-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }],
        total: 1
      });

      // Trigger sync
      await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true,
        syncLocalState: true
      });

      // Verify instance status was updated
      const instanceState = await instanceService.getInstanceState(localInstanceId);
      expect(instanceState?.status).toBe(InstanceStatus.RUNNING);
    });

    it('should handle mixed scenarios - update some, remove others', async () => {
      // Setup multiple instances
      const keepInstanceId = 'keep-123';
      const keepNovitaId = 'novita-keep';
      const removeInstanceId = 'remove-456';
      const removeNovitaId = 'novita-remove';

      // Instance that exists in both local and Novita (should be updated)
      instanceService.updateInstanceState(keepInstanceId, {
        id: keepInstanceId,
        novitaInstanceId: keepNovitaId,
        status: InstanceStatus.STARTING,
        timestamps: { created: new Date() }
      } as any);

      // Instance that exists only locally (should be marked terminated)
      instanceService.updateInstanceState(removeInstanceId, {
        id: removeInstanceId,
        novitaInstanceId: removeNovitaId,
        status: InstanceStatus.RUNNING,
        timestamps: { created: new Date() }
      } as any);

      // Mock Novita API to return only one instance
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [{
          id: keepNovitaId,
          name: 'keep-instance',
          status: InstanceStatus.RUNNING,
          region: 'us-east-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }],
        total: 1
      });

      // Trigger sync
      await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true,
        syncLocalState: true
      });

      // Verify results
      const keepState = await instanceService.getInstanceState(keepInstanceId);
      const removeState = await instanceService.getInstanceState(removeInstanceId);

      expect(keepState?.status).toBe(InstanceStatus.RUNNING);
      expect(removeState?.status).toBe(InstanceStatus.TERMINATED);
    });

    it('should handle retention policy for old terminated instances', async () => {
      // Configure to remove old terminated instances
      mockConfigService.getConfig.mockReturnValue({
        sync: {
          removeObsoleteInstances: true,
          obsoleteInstanceRetentionDays: 1, // 1 day retention
          enableAutomaticSync: true,
          syncIntervalMinutes: 30,
        }
      } as any);

      // Setup: Create an old terminated instance
      const oldInstanceId = 'old-terminated';
      const oldNovitaId = 'novita-old';
      
      instanceService.updateInstanceState(oldInstanceId, {
        id: oldInstanceId,
        novitaInstanceId: oldNovitaId,
        status: InstanceStatus.TERMINATED,
        timestamps: {
          created: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          terminated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        }
      } as any);

      // Mock Novita API to return empty list
      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: [],
        total: 0
      });

      // Trigger sync
      await instanceService.listInstancesComprehensive({
        includeNovitaOnly: true,
        syncLocalState: true
      });

      // Verify old terminated instance was removed
      const instanceState = await instanceService.getInstanceState(oldInstanceId);
      expect(instanceState).toBeUndefined();
    });
  });
});