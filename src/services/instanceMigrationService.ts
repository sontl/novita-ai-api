import { logger } from '../utils/logger';
import { novitaApiService } from './novitaApiService';
import { config } from '../config/config';
import {
  InstanceResponse,
  InstanceStatus,
  MigrationResponse,
  NovitaApiClientError
} from '../types/api';
import {
  MigrationEligibilityResult,
  MigrationAttempt,
  MigrationJobResult
} from '../types/job';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity,
  MigrationExecutionContext,
  MigrationWorkflowStep
} from '../types/migration';
import { migrationErrorHandler } from '../utils/migrationErrorHandler';
import { migrationMetrics } from '../utils/migrationMetrics';

/**
 * Service for handling spot instance migration operations
 */
export class InstanceMigrationService {
  private readonly migrationConfig = config.migration;

  /**
   * Fetch all instances directly from Novita API (bypassing cache)
   */
  async fetchAllInstances(): Promise<InstanceResponse[]> {
    const step: MigrationWorkflowStep = {
      step: 'fetch_instances',
      startTime: new Date(),
      status: 'started',
      details: {
        endpoint: '/v1/gpu/instances',
        bypassCache: true
      }
    };

    try {
      logger.info('Fetching all instances from Novita API for migration check', step.details);

      const startTime = Date.now();
      const response = await novitaApiService.listInstances();
      const fetchTime = Date.now() - startTime;

      step.endTime = new Date();
      step.status = 'completed';
      step.details = {
        ...step.details,
        instanceCount: response.instances.length,
        total: response.total,
        fetchTimeMs: fetchTime
      };

      logger.info('Successfully fetched instances from Novita API', step.details);

      return response.instances;
    } catch (error) {
      step.endTime = new Date();
      step.status = 'failed';

      const migrationError = migrationErrorHandler.createMigrationError(
        error instanceof Error ? error : new Error('Unknown fetch error'),
        undefined,
        { step: 'fetch_instances', endpoint: '/v1/gpu/instances' }
      );

      step.error = migrationError;
      migrationMetrics.recordError(migrationError);

      logger.error('Failed to fetch instances from Novita API', {
        error: migrationError.toLogObject(),
        step: step.step,
        duration: step.endTime.getTime() - step.startTime.getTime()
      });

      throw migrationError;
    }
  }

  /**
   * Check if an instance is eligible for migration based on spot status and GPU IDs
   */
  async checkMigrationEligibility(instance: InstanceResponse): Promise<MigrationEligibilityResult> {
    const { id: instanceId, status, spotStatus, spotReclaimTime, gpuIds } = instance;

    const step: MigrationWorkflowStep = {
      step: 'eligibility_check',
      instanceId,
      startTime: new Date(),
      status: 'started',
      details: {
        instanceId,
        status,
        spotStatus,
        spotReclaimTime,
        gpuIds
      }
    };

    try {
      logger.debug('Checking migration eligibility for instance', step.details);

      // First check: instance must have "exited" status
      if (status !== InstanceStatus.EXITED) {
        const result: MigrationEligibilityResult = {
          eligible: false,
          reason: `Instance status is "${status}", not "exited"`,
          instanceId,
          ...(spotStatus !== undefined && { spotStatus }),
          ...(spotReclaimTime !== undefined && { spotReclaimTime }),
          ...(gpuIds !== undefined && { gpuIds })
        };

        step.endTime = new Date();
        step.status = 'completed';
        step.details = { ...step.details, result, decision: 'not_eligible_wrong_status' };

        logger.debug('Instance not eligible for migration - wrong status', {
          instanceId,
          result,
          step: step.step
        });
        return result;
      }

      // Second check: GPU ID-based eligibility
      if (gpuIds && Array.isArray(gpuIds)) {
        // If gpuIds contains only [1], no migration needed
        if (gpuIds.length === 1 && gpuIds[0] === 1) {
          const result: MigrationEligibilityResult = {
            eligible: false,
            reason: 'Instance has gpuIds [1] - no migration needed',
            instanceId,
            ...(spotStatus !== undefined && { spotStatus }),
            ...(spotReclaimTime !== undefined && { spotReclaimTime }),
            gpuIds
          };

          step.endTime = new Date();
          step.status = 'completed';
          step.details = { ...step.details, result, decision: 'not_eligible_gpu_id_1' };

          logger.debug('Instance not eligible for migration - GPU ID 1', {
            instanceId,
            result,
            step: step.step
          });
          return result;
        }

        // If gpuIds contains [2], migration is needed
        if (gpuIds.length === 1 && gpuIds[0] === 2) {
          const result: MigrationEligibilityResult = {
            eligible: true,
            reason: 'Instance has gpuIds [2] - migration required',
            instanceId,
            ...(spotStatus !== undefined && { spotStatus }),
            ...(spotReclaimTime !== undefined && { spotReclaimTime }),
            gpuIds
          };

          step.endTime = new Date();
          step.status = 'completed';
          step.details = { ...step.details, result, decision: 'eligible_gpu_id_2' };

          logger.info('Instance eligible for migration - GPU ID 2', {
            instanceId,
            result,
            step: step.step
          });
          return result;
        }

        // For other GPU ID configurations, log and continue with spot-based checks
        logger.debug('Instance has non-standard GPU ID configuration, checking spot status', {
          instanceId,
          gpuIds,
          step: step.step
        });
      }

      // Third check: if spotStatus is empty AND spotReclaimTime is "0", skip
      if ((!spotStatus || spotStatus.trim() === '') && spotReclaimTime === '0') {
        const result: MigrationEligibilityResult = {
          eligible: false,
          reason: 'Instance has empty spotStatus and spotReclaimTime is "0" - no action needed',
          instanceId,
          ...(spotStatus !== undefined && { spotStatus }),
          ...(spotReclaimTime !== undefined && { spotReclaimTime }),
          ...(gpuIds !== undefined && { gpuIds })
        };

        step.endTime = new Date();
        step.status = 'completed';
        step.details = { ...step.details, result, decision: 'not_eligible_no_reclaim' };

        logger.debug('Instance not eligible for migration - no spot reclaim', {
          instanceId,
          result,
          step: step.step
        });
        return result;
      }

      // Fourth check: if spotReclaimTime is not "0", instance is eligible
      if (spotReclaimTime && spotReclaimTime !== '0') {
        const result: MigrationEligibilityResult = {
          eligible: true,
          reason: `Instance was reclaimed (spotReclaimTime: ${spotReclaimTime})`,
          instanceId,
          ...(spotStatus !== undefined && { spotStatus }),
          ...(spotReclaimTime !== undefined && { spotReclaimTime }),
          ...(gpuIds !== undefined && { gpuIds })
        };

        step.endTime = new Date();
        step.status = 'completed';
        step.details = { ...step.details, result, decision: 'eligible_spot_reclaimed' };

        logger.info('Instance eligible for migration - spot reclaim detected', {
          instanceId,
          result,
          step: step.step
        });
        return result;
      }

      // Default case: not eligible
      const result: MigrationEligibilityResult = {
        eligible: false,
        reason: 'Instance does not meet migration criteria',
        instanceId,
        ...(spotStatus !== undefined && { spotStatus }),
        ...(spotReclaimTime !== undefined && { spotReclaimTime }),
        ...(gpuIds !== undefined && { gpuIds })
      };

      step.endTime = new Date();
      step.status = 'completed';
      step.details = { ...step.details, result, decision: 'not_eligible_default' };

      logger.debug('Instance not eligible for migration - default case', {
        instanceId,
        result,
        step: step.step
      });
      return result;

    } catch (error) {
      step.endTime = new Date();
      step.status = 'failed';

      const migrationError = new MigrationError(
        `Eligibility check failed for instance ${instanceId}`,
        MigrationErrorType.ELIGIBILITY,
        {
          severity: MigrationErrorSeverity.MEDIUM,
          instanceId,
          originalError: error instanceof Error ? error : new Error('Unknown eligibility error'),
          context: { instance: { id: instanceId, status, spotStatus, spotReclaimTime, gpuIds } }
        }
      );

      step.error = migrationError;
      migrationMetrics.recordError(migrationError);

      logger.error('Eligibility check failed', {
        error: migrationError.toLogObject(),
        step: step.step,
        duration: step.endTime.getTime() - step.startTime.getTime()
      });

      throw migrationError;
    }
  }

  /**
   * Migrate a single instance using the Novita API with retry logic
   */
  async migrateInstance(instanceId: string, attempt: number = 1): Promise<MigrationResponse> {
    const step: MigrationWorkflowStep = {
      step: 'migration',
      instanceId,
      startTime: new Date(),
      status: 'started',
      details: {
        instanceId,
        attempt,
        dryRun: this.migrationConfig.dryRunMode
      }
    };

    try {
      logger.info('Starting instance migration', step.details);

      // In dry run mode, simulate the migration without actually calling the API
      if (this.migrationConfig.dryRunMode) {
        const dryRunResponse: MigrationResponse = {
          success: true,
          instanceId,
          message: 'DRY RUN: Migration would be initiated',
          migrationTime: new Date().toISOString()
        };

        step.endTime = new Date();
        step.status = 'completed';
        step.details = { ...step.details, response: dryRunResponse };

        const executionTime = step.endTime.getTime() - step.startTime.getTime();
        migrationMetrics.recordMigrationTiming(instanceId, executionTime);

        logger.info('DRY RUN: Instance migration simulated', {
          instanceId,
          response: dryRunResponse,
          executionTimeMs: executionTime,
          step: step.step
        });

        return dryRunResponse;
      }

      // Actual migration API call
      const migrationResponse = await novitaApiService.migrateInstance(instanceId);

      step.endTime = new Date();
      const executionTime = step.endTime.getTime() - step.startTime.getTime();

      if (migrationResponse.success) {
        step.status = 'completed';
        migrationMetrics.recordMigrationTiming(instanceId, executionTime);
      } else {
        step.status = 'failed';
        // Create error for failed migration response
        const migrationError = new MigrationError(
          migrationResponse.error || 'Migration API returned failure',
          MigrationErrorType.MIGRATION,
          {
            severity: MigrationErrorSeverity.HIGH,
            instanceId,
            context: { response: migrationResponse, attempt }
          }
        );
        step.error = migrationError;
        migrationMetrics.recordError(migrationError);
      }

      step.details = {
        ...step.details,
        response: migrationResponse,
        executionTimeMs: executionTime
      };

      logger.info('Instance migration completed', {
        instanceId,
        success: migrationResponse.success,
        newInstanceId: migrationResponse.newInstanceId,
        message: migrationResponse.message,
        executionTimeMs: executionTime,
        attempt,
        step: step.step
      });

      return migrationResponse;

    } catch (error) {
      step.endTime = new Date();
      step.status = 'failed';
      const executionTime = step.endTime.getTime() - step.startTime.getTime();

      const migrationError = migrationErrorHandler.createMigrationError(
        error instanceof Error ? error : new Error('Unknown migration error'),
        instanceId,
        { attempt, executionTime, step: 'migration' }
      );

      step.error = migrationError;
      migrationMetrics.recordError(migrationError);

      // Check if we should retry
      const errorHandling = await migrationErrorHandler.handleError(migrationError, attempt);

      if (errorHandling.shouldRetry && attempt < 3) {
        logger.warn('Migration failed, retrying after delay', {
          instanceId,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: errorHandling.delayMs,
          error: migrationError.toLogObject()
        });

        // Wait before retry
        if (errorHandling.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, errorHandling.delayMs));
        }

        // Recursive retry
        return this.migrateInstance(instanceId, attempt + 1);
      }

      logger.error('Instance migration failed after retries', {
        instanceId,
        attempt,
        error: migrationError.toLogObject(),
        executionTimeMs: executionTime,
        step: step.step
      });

      // Return a failed migration response instead of throwing
      const failedResponse: MigrationResponse = {
        success: false,
        instanceId,
        error: migrationError.message,
        migrationTime: new Date().toISOString()
      };

      return failedResponse;
    }
  }

  /**
   * Process a batch of instances for migration with comprehensive error handling
   */
  async processMigrationBatch(jobId: string = 'unknown'): Promise<MigrationJobResult> {
    const jobStartTime = Date.now();
    const scheduledAt = new Date();
    const attempts: MigrationAttempt[] = [];
    const workflowSteps: MigrationWorkflowStep[] = [];
    const errors: MigrationError[] = [];

    let totalProcessed = 0;
    let migrated = 0;
    let skipped = 0;
    let errorCount = 0;

    // Create execution context for detailed tracking
    const executionContext: MigrationExecutionContext = {
      jobId,
      scheduledAt,
      startedAt: new Date(),
      totalInstances: 0,
      processedInstances: 0,
      steps: workflowSteps,
      errors,
      metrics: {
        fetchTime: 0,
        eligibilityCheckTime: 0,
        migrationTime: 0,
        totalTime: 0
      }
    };

    // Record job start
    migrationMetrics.recordJobStart(jobId, scheduledAt);

    try {
      logger.info('Starting migration batch processing', {
        jobId,
        maxConcurrent: this.migrationConfig.maxConcurrentMigrations,
        dryRun: this.migrationConfig.dryRunMode,
        jobTimeout: this.migrationConfig.jobTimeoutMs
      });

      // Step 1: Fetch all instances
      const fetchStartTime = Date.now();
      let allInstances: InstanceResponse[];

      try {
        allInstances = await this.fetchAllInstances();
        executionContext.metrics.fetchTime = Date.now() - fetchStartTime;
        executionContext.totalInstances = allInstances.length;

        logger.info('Fetched instances for migration processing', {
          jobId,
          totalInstances: allInstances.length,
          fetchTimeMs: executionContext.metrics.fetchTime
        });
      } catch (error) {
        const migrationError = error instanceof MigrationError ? error :
          migrationErrorHandler.createMigrationError(
            error instanceof Error ? error : new Error('Unknown fetch error'),
            undefined,
            { jobId, step: 'fetch_instances' }
          );

        errors.push(migrationError);
        executionContext.completedAt = new Date();
        executionContext.metrics.totalTime = Date.now() - jobStartTime;

        const result: MigrationJobResult = {
          totalProcessed: 0,
          migrated: 0,
          skipped: 0,
          errors: 1,
          executionTimeMs: executionContext.metrics.totalTime
        };

        migrationMetrics.recordJobCompletion(jobId, result, executionContext);
        return result;
      }

      // Step 2: Filter for exited instances
      const exitedInstances = allInstances.filter(instance =>
        instance.status === InstanceStatus.EXITED
      );

      logger.info('Filtered instances by status', {
        jobId,
        totalInstances: allInstances.length,
        exitedInstances: exitedInstances.length
      });

      // Step 3: Check eligibility for each exited instance
      const eligibilityStartTime = Date.now();
      const eligibilityResults: MigrationEligibilityResult[] = [];

      for (const instance of exitedInstances) {
        try {
          const result = await this.checkMigrationEligibility(instance);
          eligibilityResults.push(result);
        } catch (error) {
          const migrationError = error instanceof MigrationError ? error :
            new MigrationError(
              `Eligibility check failed for instance ${instance.id}`,
              MigrationErrorType.ELIGIBILITY,
              {
                severity: MigrationErrorSeverity.MEDIUM,
                instanceId: instance.id,
                originalError: error instanceof Error ? error : new Error('Unknown eligibility error')
              }
            );

          errors.push(migrationError);
          // Add a failed eligibility result
          eligibilityResults.push({
            eligible: false,
            reason: `Eligibility check failed: ${migrationError.message}`,
            instanceId: instance.id
          });
        }
      }

      executionContext.metrics.eligibilityCheckTime = Date.now() - eligibilityStartTime;

      // Step 4: Process each instance
      const migrationStartTime = Date.now();

      for (let i = 0; i < exitedInstances.length; i++) {
        const instance = exitedInstances[i];
        const eligibilityResult = eligibilityResults[i];

        if (!instance || !eligibilityResult) {
          continue; // Skip if instance or eligibility result is undefined
        }

        totalProcessed++;
        executionContext.processedInstances = totalProcessed;

        const attempt: MigrationAttempt = {
          instanceId: instance.id,
          instanceName: instance.name,
          status: instance.status,
          eligibilityCheck: eligibilityResult,
          processedAt: new Date(),
          ...(instance.spotStatus !== undefined && { spotStatus: instance.spotStatus }),
          ...(instance.spotReclaimTime !== undefined && { spotReclaimTime: instance.spotReclaimTime })
        };

        logger.debug('Processing instance for migration', {
          jobId,
          instanceId: instance.id,
          instanceName: instance.name,
          eligible: eligibilityResult.eligible,
          reason: eligibilityResult.reason,
          processedCount: totalProcessed,
          totalExited: exitedInstances.length
        });

        if (!eligibilityResult.eligible) {
          skipped++;
          attempts.push(attempt);
          logger.debug('Skipping instance - not eligible', {
            jobId,
            instanceId: instance.id,
            reason: eligibilityResult.reason
          });
          continue;
        }

        // Step 5: Attempt migration for eligible instances
        try {
          const instanceMigrationStartTime = Date.now();
          const migrationResult = await this.migrateInstance(instance.id);
          const migrationTime = Date.now() - instanceMigrationStartTime;

          attempt.migrationResult = {
            success: migrationResult.success,
            ...(migrationResult.error && { error: migrationResult.error }),
            responseTime: migrationTime
          };

          if (migrationResult.success) {
            migrated++;
            logger.info('Instance migration successful', {
              jobId,
              instanceId: instance.id,
              newInstanceId: migrationResult.newInstanceId,
              responseTime: migrationTime,
              migratedCount: migrated
            });
          } else {
            errorCount++;
            logger.warn('Instance migration failed', {
              jobId,
              instanceId: instance.id,
              error: migrationResult.error,
              responseTime: migrationTime,
              errorCount
            });
          }
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          attempt.migrationResult = {
            success: false,
            error: errorMessage,
            responseTime: 0
          };

          const migrationError = error instanceof MigrationError ? error :
            new MigrationError(
              `Unexpected error during migration of instance ${instance.id}`,
              MigrationErrorType.MIGRATION,
              {
                severity: MigrationErrorSeverity.HIGH,
                instanceId: instance.id,
                originalError: error instanceof Error ? error : new Error(errorMessage),
                context: { jobId, step: 'instance_migration' }
              }
            );

          errors.push(migrationError);

          logger.error('Unexpected error during instance migration', {
            jobId,
            instanceId: instance.id,
            error: migrationError.toLogObject(),
            errorCount
          });
        }

        attempts.push(attempt);
      }

      executionContext.metrics.migrationTime = Date.now() - migrationStartTime;
      executionContext.completedAt = new Date();
      executionContext.metrics.totalTime = Date.now() - jobStartTime;

      const result: MigrationJobResult = {
        totalProcessed,
        migrated,
        skipped,
        errors: errorCount,
        executionTimeMs: executionContext.metrics.totalTime
      };

      // Record job completion
      migrationMetrics.recordJobCompletion(jobId, result, executionContext);

      logger.info('Migration batch processing completed', {
        jobId,
        ...result,
        totalInstances: allInstances.length,
        exitedInstances: exitedInstances.length,
        eligibleInstances: attempts.filter(a => a.eligibilityCheck.eligible).length,
        metrics: executionContext.metrics
      });

      return result;

    } catch (error) {
      executionContext.completedAt = new Date();
      executionContext.metrics.totalTime = Date.now() - jobStartTime;

      const migrationError = migrationErrorHandler.createMigrationError(
        error instanceof Error ? error : new Error('Unknown batch processing error'),
        undefined,
        { jobId, step: 'batch_processing', processedSoFar: totalProcessed }
      );

      errors.push(migrationError);

      logger.error('Migration batch processing failed', {
        jobId,
        error: migrationError.toLogObject(),
        executionTimeMs: executionContext.metrics.totalTime,
        processedSoFar: totalProcessed
      });

      // Return partial results even if the batch failed
      const result: MigrationJobResult = {
        totalProcessed,
        migrated,
        skipped,
        errors: errorCount + 1, // Add 1 for the batch processing error
        executionTimeMs: executionContext.metrics.totalTime
      };

      migrationMetrics.recordJobCompletion(jobId, result, executionContext);
      return result;
    }
  }

  /**
   * Get migration service status and configuration
   */
  getServiceStatus(): {
    enabled: boolean;
    config: {
      enabled: boolean;
      scheduleIntervalMs: number;
      jobTimeoutMs: number;
      maxConcurrentMigrations: number;
      dryRunMode: boolean;
      retryFailedMigrations: boolean;
      logLevel: string;
    };
    lastExecutionTime?: Date;
  } {
    return {
      enabled: this.migrationConfig.enabled,
      config: this.migrationConfig,
      // lastExecutionTime would be tracked by the scheduler
    };
  }
}

// Export singleton instance
export const instanceMigrationService = new InstanceMigrationService();