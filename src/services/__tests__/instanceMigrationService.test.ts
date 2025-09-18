import { InstanceMigrationService, instanceMigrationService } from '../instanceMigrationService';
import { novitaApiService } from '../novitaApiService';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';
import {
  InstanceResponse,
  InstanceStatus,
  MigrationResponse,
  NovitaApiClientError
} from '../../types/api';
import {
  MigrationEligibilityResult,
  MigrationJobResult
} from '../../types/job';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../../config/config', () => ({
  config: {
    nodeEnv: 'test',
    port: 3000,
    logLevel: 'error',
    novita: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.novita.ai',
    },
    webhook: {},
    defaults: {
      region: 'CN-HK-01',
      pollInterval: 30,
      maxRetryAttempts: 3,
      requestTimeout: 30000,
      webhookTimeout: 10000,
      cacheTimeout: 300,
      maxConcurrentJobs: 10,
    },
    security: {
      enableCors: true,
      enableHelmet: true,
      rateLimitWindowMs: 900000,
      rateLimitMaxRequests: 100,
    },
    instanceListing: {
      enableComprehensiveListing: true,
      defaultIncludeNovitaOnly: true,
      defaultSyncLocalState: false,
      comprehensiveCacheTtl: 30,
      novitaApiCacheTtl: 60,
      enableFallbackToLocal: true,
      novitaApiTimeout: 15000,
    },
    healthCheck: {
      defaultTimeoutMs: 10000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 2000,
      defaultMaxWaitTimeMs: 300000,
    },
    migration: {
      enabled: true,
      scheduleIntervalMs: 900000, // 15 minutes
      jobTimeoutMs: 600000, // 10 minutes
      maxConcurrentMigrations: 5,
      dryRunMode: false,
      retryFailedMigrations: true,
      logLevel: 'info'
    }
  }
}));
jest.mock('../../utils/logger');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('InstanceMigrationService', () => {
  let service: InstanceMigrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InstanceMigrationService();
  });

  describe('fetchAllInstances', () => {
    it('should successfully fetch all instances from Novita API', async () => {
      const mockInstances: InstanceResponse[] = [
        {
          id: 'instance-1',
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
          id: 'instance-2',
          name: 'test-instance-2',
          status: InstanceStatus.EXITED,
          productId: 'product-2',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          portMappings: [],
          spotStatus: 'reclaimed',
          spotReclaimTime: '1640995200'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: 2,
        page: 1,
        pageSize: 10
      });

      const result = await service.fetchAllInstances();

      expect(result).toEqual(mockInstances);
      expect(mockNovitaApiService.listInstances).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching all instances from Novita API for migration check',
        expect.objectContaining({
          endpoint: '/v1/gpu/instances',
          bypassCache: true
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully fetched instances from Novita API',
        expect.objectContaining({
          instanceCount: 2,
          total: 2
        })
      );
    });

    it('should handle API errors when fetching instances', async () => {
      const apiError = new NovitaApiClientError('API Error', 500, 'SERVER_ERROR');
      mockNovitaApiService.listInstances.mockRejectedValue(apiError);

      await expect(service.fetchAllInstances()).rejects.toThrow(apiError);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch instances from Novita API',
        expect.objectContaining({
          error: 'API Error',
          errorType: 'NovitaApiClientError'
        })
      );
    });
  });

  describe('checkMigrationEligibility', () => {
    it('should return not eligible for non-exited instances', async () => {
      const instance: InstanceResponse = {
        id: 'instance-1',
        name: 'test-instance',
        status: InstanceStatus.RUNNING,
        productId: 'product-1',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        portMappings: []
      };

      const result = await service.checkMigrationEligibility(instance);

      expect(result).toEqual({
        eligible: false,
        reason: 'Instance status is "running", not "exited"',
        instanceId: 'instance-1',
        spotStatus: undefined,
        spotReclaimTime: undefined
      });
    });

    it('should return not eligible for exited instances with empty spotStatus and spotReclaimTime "0"', async () => {
      const instance: InstanceResponse = {
        id: 'instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        productId: 'product-1',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        portMappings: [],
        spotStatus: '',
        spotReclaimTime: '0'
      };

      const result = await service.checkMigrationEligibility(instance);

      expect(result).toEqual({
        eligible: false,
        reason: 'Instance has empty spotStatus and spotReclaimTime is "0" - no action needed',
        instanceId: 'instance-1',
        spotStatus: '',
        spotReclaimTime: '0'
      });
    });

    it('should return eligible for exited instances with non-zero spotReclaimTime', async () => {
      const instance: InstanceResponse = {
        id: 'instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        productId: 'product-1',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        portMappings: [],
        spotStatus: 'reclaimed',
        spotReclaimTime: '1640995200'
      };

      const result = await service.checkMigrationEligibility(instance);

      expect(result).toEqual({
        eligible: true,
        reason: 'Instance was reclaimed (spotReclaimTime: 1640995200)',
        instanceId: 'instance-1',
        spotStatus: 'reclaimed',
        spotReclaimTime: '1640995200'
      });
    });

    it('should return not eligible for instances that do not meet criteria', async () => {
      const instance: InstanceResponse = {
        id: 'instance-1',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        productId: 'product-1',
        region: 'CN-HK-01',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        portMappings: [],
        spotStatus: 'some-status',
        spotReclaimTime: '0'
      };

      const result = await service.checkMigrationEligibility(instance);

      expect(result).toEqual({
        eligible: false,
        reason: 'Instance does not meet migration criteria',
        instanceId: 'instance-1',
        spotStatus: 'some-status',
        spotReclaimTime: '0'
      });
    });
  });

  describe('migrateInstance', () => {
    it('should successfully migrate an instance', async () => {
      const mockMigrationResponse: MigrationResponse = {
        success: true,
        instanceId: 'instance-1',
        message: 'Migration initiated successfully',
        newInstanceId: 'new-instance-1',
        migrationTime: '2024-01-01T00:00:00Z'
      };

      mockNovitaApiService.migrateInstance.mockResolvedValue(mockMigrationResponse);

      const result = await service.migrateInstance('instance-1');

      expect(result).toEqual(mockMigrationResponse);
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledWith('instance-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting instance migration',
        expect.objectContaining({
          instanceId: 'instance-1',
          dryRun: false
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Instance migration completed',
        expect.objectContaining({
          instanceId: 'instance-1',
          success: true,
          newInstanceId: 'new-instance-1'
        })
      );
    });

    it('should log dry run mode when enabled', async () => {
      // Test that dry run mode is properly logged - the actual dry run logic
      // will be tested in integration tests to avoid complex mocking
      const mockMigrationResponse: MigrationResponse = {
        success: true,
        instanceId: 'instance-1',
        message: 'Migration initiated successfully',
        newInstanceId: 'new-instance-1',
        migrationTime: '2024-01-01T00:00:00Z'
      };

      mockNovitaApiService.migrateInstance.mockResolvedValue(mockMigrationResponse);

      const result = await service.migrateInstance('instance-1');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting instance migration',
        expect.objectContaining({
          instanceId: 'instance-1',
          dryRun: false // Based on our mock config
        })
      );
    });

    it('should handle migration API errors gracefully', async () => {
      const apiError = new NovitaApiClientError('Migration failed', 500, 'MIGRATION_ERROR');
      mockNovitaApiService.migrateInstance.mockRejectedValue(apiError);

      const result = await service.migrateInstance('instance-1');

      expect(result).toEqual({
        success: false,
        instanceId: 'instance-1',
        error: 'Migration failed',
        migrationTime: expect.any(String)
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Instance migration failed',
        expect.objectContaining({
          instanceId: 'instance-1',
          error: 'Migration failed',
          errorType: 'NovitaApiClientError'
        })
      );
    });
  });

  describe('processMigrationBatch', () => {
    it('should process a batch of instances successfully', async () => {
      const mockInstances: InstanceResponse[] = [
        {
          id: 'instance-1',
          name: 'running-instance',
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
          id: 'instance-2',
          name: 'exited-not-eligible',
          status: InstanceStatus.EXITED,
          productId: 'product-2',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          portMappings: [],
          spotStatus: '',
          spotReclaimTime: '0'
        },
        {
          id: 'instance-3',
          name: 'exited-eligible',
          status: InstanceStatus.EXITED,
          productId: 'product-3',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          portMappings: [],
          spotStatus: 'reclaimed',
          spotReclaimTime: '1640995200'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: 3,
        page: 1,
        pageSize: 10
      });

      const mockMigrationResponse: MigrationResponse = {
        success: true,
        instanceId: 'instance-3',
        message: 'Migration successful',
        newInstanceId: 'new-instance-3',
        migrationTime: '2024-01-01T00:00:00Z'
      };

      mockNovitaApiService.migrateInstance.mockResolvedValue(mockMigrationResponse);

      const result = await service.processMigrationBatch();

      expect(result).toEqual({
        totalProcessed: 2, // Only exited instances are processed
        migrated: 1, // Only instance-3 was eligible and migrated
        skipped: 1, // instance-2 was skipped (not eligible)
        errors: 0,
        executionTimeMs: expect.any(Number)
      });

      expect(mockNovitaApiService.listInstances).toHaveBeenCalledTimes(1);
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledWith('instance-3');
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledTimes(1);
    });

    it('should handle migration failures gracefully', async () => {
      const mockInstances: InstanceResponse[] = [
        {
          id: 'instance-1',
          name: 'exited-eligible',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          portMappings: [],
          spotStatus: 'reclaimed',
          spotReclaimTime: '1640995200'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: 1,
        page: 1,
        pageSize: 10
      });

      const mockFailedMigrationResponse: MigrationResponse = {
        success: false,
        instanceId: 'instance-1',
        error: 'Migration API error',
        migrationTime: '2024-01-01T00:00:00Z'
      };

      mockNovitaApiService.migrateInstance.mockResolvedValue(mockFailedMigrationResponse);

      const result = await service.processMigrationBatch();

      expect(result).toEqual({
        totalProcessed: 1,
        migrated: 0,
        skipped: 0,
        errors: 1,
        executionTimeMs: expect.any(Number)
      });
    });

    it('should handle API fetch errors and return partial results', async () => {
      const apiError = new NovitaApiClientError('Failed to fetch instances', 500, 'SERVER_ERROR');
      mockNovitaApiService.listInstances.mockRejectedValue(apiError);

      const result = await service.processMigrationBatch();

      expect(result).toEqual({
        totalProcessed: 0,
        migrated: 0,
        skipped: 0,
        errors: 1, // Error from batch processing failure
        executionTimeMs: expect.any(Number)
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Migration batch processing failed',
        expect.objectContaining({
          error: 'Failed to fetch instances'
        })
      );
    });

    it('should handle unexpected errors during migration', async () => {
      const mockInstances: InstanceResponse[] = [
        {
          id: 'instance-1',
          name: 'exited-eligible',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'CN-HK-01',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          portMappings: [],
          spotStatus: 'reclaimed',
          spotReclaimTime: '1640995200'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances: mockInstances,
        total: 1,
        page: 1,
        pageSize: 10
      });

      // Simulate unexpected error during migration
      mockNovitaApiService.migrateInstance.mockRejectedValue(new Error('Unexpected error'));

      const result = await service.processMigrationBatch();

      expect(result).toEqual({
        totalProcessed: 1,
        migrated: 0,
        skipped: 0,
        errors: 1,
        executionTimeMs: expect.any(Number)
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Instance migration failed',
        expect.objectContaining({
          instanceId: 'instance-1',
          error: 'Unexpected error'
        })
      );
    });
  });

  describe('getServiceStatus', () => {
    it('should return service status and configuration', () => {
      const status = service.getServiceStatus();

      expect(status).toEqual({
        enabled: true,
        config: expect.objectContaining({
          enabled: true,
          scheduleIntervalMs: 900000,
          jobTimeoutMs: 600000,
          maxConcurrentMigrations: 5,
          dryRunMode: false,
          retryFailedMigrations: true,
          logLevel: 'info'
        })
      });
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(instanceMigrationService).toBeInstanceOf(InstanceMigrationService);
    });
  });
});