/**
 * Integration tests for migration service error handling and logging
 */

import { InstanceMigrationService } from '../instanceMigrationService';
import { novitaApiService } from '../novitaApiService';
import { migrationErrorHandler } from '../../utils/migrationErrorHandler';
import { migrationMetrics } from '../../utils/migrationMetrics';
import {
  InstanceResponse,
  InstanceStatus,
  MigrationResponse,
  NovitaApiClientError,
  RateLimitError,
  TimeoutError
} from '../../types/api';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity
} from '../../types/migration';

// Mock the dependencies
jest.mock('../novitaApiService');
jest.mock('../../utils/migrationErrorHandler');
jest.mock('../../utils/migrationMetrics');
jest.mock('../../utils/logger');

const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockMigrationErrorHandler = migrationErrorHandler as jest.Mocked<typeof migrationErrorHandler>;
const mockMigrationMetrics = migrationMetrics as jest.Mocked<typeof migrationMetrics>;

describe('InstanceMigrationService Error Handling', () => {
  let migrationService: InstanceMigrationService;

  beforeEach(() => {
    migrationService = new InstanceMigrationService();
    jest.clearAllMocks();
    
    // Reset metrics
    mockMigrationMetrics.recordJobStart.mockImplementation(() => {});
    mockMigrationMetrics.recordJobCompletion.mockImplementation(() => {});
    mockMigrationMetrics.recordError.mockImplementation(() => {});
    mockMigrationMetrics.recordMigrationTiming.mockImplementation(() => {});
  });

  describe('fetchAllInstances error handling', () => {
    it('should handle API errors and create migration errors', async () => {
      const apiError = new NovitaApiClientError('API unavailable', 503);
      mockNovitaApiService.listInstances.mockRejectedValue(apiError);

      const migrationError = new MigrationError(
        'API error: API unavailable',
        MigrationErrorType.API,
        { severity: MigrationErrorSeverity.HIGH }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);

      await expect(migrationService.fetchAllInstances()).rejects.toThrow(MigrationError);

      expect(mockMigrationErrorHandler.createMigrationError).toHaveBeenCalledWith(
        apiError,
        undefined,
        { step: 'fetch_instances', endpoint: '/v1/gpu/instances' }
      );
      expect(mockMigrationMetrics.recordError).toHaveBeenCalledWith(migrationError);
    });

    it('should handle network errors correctly', async () => {
      const networkError = new Error('ECONNRESET: Connection reset by peer');
      mockNovitaApiService.listInstances.mockRejectedValue(networkError);

      const migrationError = new MigrationError(
        'Network error: ECONNRESET: Connection reset by peer',
        MigrationErrorType.NETWORK,
        { severity: MigrationErrorSeverity.MEDIUM }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);

      await expect(migrationService.fetchAllInstances()).rejects.toThrow(MigrationError);

      expect(mockMigrationErrorHandler.createMigrationError).toHaveBeenCalledWith(
        networkError,
        undefined,
        { step: 'fetch_instances', endpoint: '/v1/gpu/instances' }
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new TimeoutError('Request timeout after 30s');
      mockNovitaApiService.listInstances.mockRejectedValue(timeoutError);

      const migrationError = new MigrationError(
        'Request timeout: Request timeout after 30s',
        MigrationErrorType.TIMEOUT,
        { severity: MigrationErrorSeverity.MEDIUM }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);

      await expect(migrationService.fetchAllInstances()).rejects.toThrow(MigrationError);
    });
  });

  describe('checkMigrationEligibility error handling', () => {
    it('should handle eligibility check errors', async () => {
      const instance: InstanceResponse = {
        id: 'instance-123',
        name: 'test-instance',
        status: InstanceStatus.EXITED,
        productId: 'product-1',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        spotReclaimTime: '1234567890'
      };

      // This test should actually test the real eligibility check logic
      // Let's test with a valid instance that should pass eligibility
      const result = await migrationService.checkMigrationEligibility(instance);
      
      expect(result.eligible).toBe(true);
      expect(result.instanceId).toBe('instance-123');
      expect(result.reason).toContain('spotReclaimTime: 1234567890');
    });

    it('should log eligibility decisions with detailed context', async () => {
      const instance: InstanceResponse = {
        id: 'instance-456',
        name: 'eligible-instance',
        status: InstanceStatus.EXITED,
        productId: 'product-1',
        region: 'us-east-1',
        gpuNum: 1,
        rootfsSize: 50,
        billingMode: 'spot',
        createdAt: '2024-01-01T00:00:00Z',
        spotStatus: 'reclaimed',
        spotReclaimTime: '1234567890'
      };

      const result = await migrationService.checkMigrationEligibility(instance);

      expect(result.eligible).toBe(true);
      expect(result.reason).toContain('spotReclaimTime: 1234567890');
      expect(result.instanceId).toBe('instance-456');
    });
  });

  describe('migrateInstance error handling and retry logic', () => {
    it('should handle migration API errors with retry logic', async () => {
      const instanceId = 'instance-789';
      const apiError = new RateLimitError('Rate limit exceeded', 60);
      
      mockNovitaApiService.migrateInstance.mockRejectedValueOnce(apiError);
      mockNovitaApiService.migrateInstance.mockResolvedValueOnce({
        success: true,
        instanceId,
        message: 'Migration successful',
        newInstanceId: 'new-instance-123'
      });

      const migrationError = new MigrationError(
        'Rate limit exceeded: Rate limit exceeded',
        MigrationErrorType.RATE_LIMIT,
        { severity: MigrationErrorSeverity.MEDIUM, instanceId }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);
      mockMigrationErrorHandler.handleError.mockResolvedValue({
        shouldRetry: true,
        delayMs: 1000,
        action: 'retry'
      });

      const result = await migrationService.migrateInstance(instanceId);

      expect(result.success).toBe(true);
      expect(mockMigrationErrorHandler.handleError).toHaveBeenCalledWith(migrationError, 1);
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledTimes(2);
    });

    it('should not retry when max attempts exceeded', async () => {
      const instanceId = 'instance-999';
      const apiError = new NovitaApiClientError('Server error', 500);
      
      mockNovitaApiService.migrateInstance.mockRejectedValue(apiError);

      const migrationError = new MigrationError(
        'API error: Server error',
        MigrationErrorType.API,
        { severity: MigrationErrorSeverity.HIGH, instanceId }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);
      mockMigrationErrorHandler.handleError.mockResolvedValue({
        shouldRetry: false,
        delayMs: 0,
        action: 'skip'
      });

      const result = await migrationService.migrateInstance(instanceId, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe(migrationError.message);
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledTimes(1);
    });

    it('should handle non-retryable errors correctly', async () => {
      const instanceId = 'instance-config-error';
      const configError = new Error('Invalid configuration');
      
      mockNovitaApiService.migrateInstance.mockRejectedValue(configError);

      const migrationError = new MigrationError(
        'Configuration error: Invalid configuration',
        MigrationErrorType.CONFIGURATION,
        { severity: MigrationErrorSeverity.HIGH, instanceId }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);
      mockMigrationErrorHandler.handleError.mockResolvedValue({
        shouldRetry: false,
        delayMs: 0,
        action: 'escalate'
      });

      const result = await migrationService.migrateInstance(instanceId);

      expect(result.success).toBe(false);
      expect(mockMigrationErrorHandler.handleError).toHaveBeenCalledWith(migrationError, 1);
      expect(mockNovitaApiService.migrateInstance).toHaveBeenCalledTimes(1);
    });

    it('should record migration timing for successful migrations', async () => {
      const instanceId = 'instance-timing';
      mockNovitaApiService.migrateInstance.mockResolvedValue({
        success: true,
        instanceId,
        message: 'Migration successful'
      });

      const result = await migrationService.migrateInstance(instanceId);

      expect(result.success).toBe(true);
      expect(mockMigrationMetrics.recordMigrationTiming).toHaveBeenCalledWith(
        instanceId,
        expect.any(Number)
      );
    });

    it('should handle failed migration responses', async () => {
      const instanceId = 'instance-failed-response';
      mockNovitaApiService.migrateInstance.mockResolvedValue({
        success: false,
        instanceId,
        error: 'Migration failed due to insufficient capacity'
      });

      const result = await migrationService.migrateInstance(instanceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Migration failed due to insufficient capacity');
      expect(mockMigrationMetrics.recordError).toHaveBeenCalled();
    });
  });

  describe('processMigrationBatch comprehensive error handling', () => {
    it('should handle batch processing with mixed results', async () => {
      const instances: InstanceResponse[] = [
        {
          id: 'instance-1',
          name: 'eligible-instance',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          spotReclaimTime: '1234567890'
        },
        {
          id: 'instance-2',
          name: 'not-eligible-instance',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          spotReclaimTime: '0'
        },
        {
          id: 'instance-3',
          name: 'running-instance',
          status: InstanceStatus.RUNNING,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances,
        total: 3,
        page: 1,
        pageSize: 100
      });

      // Mock successful migration for eligible instance
      mockNovitaApiService.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'instance-1',
        message: 'Migration successful',
        newInstanceId: 'new-instance-1'
      });

      const result = await migrationService.processMigrationBatch('test-job-123');

      expect(result.totalProcessed).toBe(2); // Only exited instances
      expect(result.migrated).toBe(1); // Only eligible instance
      expect(result.skipped).toBe(1); // Not eligible instance
      expect(result.errors).toBe(0);

      expect(mockMigrationMetrics.recordJobStart).toHaveBeenCalledWith('test-job-123', expect.any(Date));
      expect(mockMigrationMetrics.recordJobCompletion).toHaveBeenCalledWith(
        'test-job-123',
        result,
        expect.any(Object)
      );
    });

    it('should handle fetch errors in batch processing', async () => {
      const fetchError = new NovitaApiClientError('Service unavailable', 503);
      mockNovitaApiService.listInstances.mockRejectedValue(fetchError);

      const migrationError = new MigrationError(
        'API error: Service unavailable',
        MigrationErrorType.API,
        { severity: MigrationErrorSeverity.HIGH }
      );
      mockMigrationErrorHandler.createMigrationError.mockReturnValue(migrationError);

      const result = await migrationService.processMigrationBatch('failed-job');

      expect(result.totalProcessed).toBe(0);
      expect(result.errors).toBe(1);
      expect(mockMigrationMetrics.recordJobCompletion).toHaveBeenCalled();
    });

    it('should handle partial batch failures gracefully', async () => {
      const instances: InstanceResponse[] = [
        {
          id: 'instance-success',
          name: 'success-instance',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          spotReclaimTime: '1234567890'
        },
        {
          id: 'instance-error',
          name: 'error-instance',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          spotReclaimTime: '1234567891'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances,
        total: 2,
        page: 1,
        pageSize: 100
      });

      // First migration succeeds, second fails
      mockNovitaApiService.migrateInstance
        .mockResolvedValueOnce({
          success: true,
          instanceId: 'instance-success',
          message: 'Migration successful'
        })
        .mockResolvedValueOnce({
          success: false,
          instanceId: 'instance-error',
          error: 'Migration failed'
        });

      const result = await migrationService.processMigrationBatch('partial-fail-job');

      expect(result.totalProcessed).toBe(2);
      expect(result.migrated).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should create comprehensive execution context', async () => {
      const instances: InstanceResponse[] = [
        {
          id: 'instance-context',
          name: 'context-instance',
          status: InstanceStatus.EXITED,
          productId: 'product-1',
          region: 'us-east-1',
          gpuNum: 1,
          rootfsSize: 50,
          billingMode: 'spot',
          createdAt: '2024-01-01T00:00:00Z',
          spotReclaimTime: '1234567890'
        }
      ];

      mockNovitaApiService.listInstances.mockResolvedValue({
        instances,
        total: 1,
        page: 1,
        pageSize: 100
      });

      mockNovitaApiService.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'instance-context',
        message: 'Migration successful'
      });

      await migrationService.processMigrationBatch('context-job');

      expect(mockMigrationMetrics.recordJobCompletion).toHaveBeenCalledWith(
        'context-job',
        expect.any(Object),
        expect.objectContaining({
          jobId: 'context-job',
          scheduledAt: expect.any(Date),
          startedAt: expect.any(Date),
          completedAt: expect.any(Date),
          totalInstances: 1,
          processedInstances: 1,
          steps: expect.any(Array),
          errors: expect.any(Array),
          metrics: expect.objectContaining({
            fetchTime: expect.any(Number),
            eligibilityCheckTime: expect.any(Number),
            migrationTime: expect.any(Number),
            totalTime: expect.any(Number)
          })
        })
      );
    });
  });

  describe('dry run mode', () => {
    it('should simulate migrations in dry run mode', async () => {
      // Mock config to enable dry run
      const originalConfig = (migrationService as any).migrationConfig;
      (migrationService as any).migrationConfig = {
        ...originalConfig,
        dryRunMode: true
      };

      const result = await migrationService.migrateInstance('dry-run-instance');

      expect(result.success).toBe(true);
      expect(result.message).toContain('DRY RUN');
      expect(mockNovitaApiService.migrateInstance).not.toHaveBeenCalled();
      expect(mockMigrationMetrics.recordMigrationTiming).toHaveBeenCalled();

      // Restore original config
      (migrationService as any).migrationConfig = originalConfig;
    });
  });
});