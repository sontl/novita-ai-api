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

/**
 * Service for handling spot instance migration operations
 */
export class InstanceMigrationService {
  private readonly migrationConfig = config.migration;

  /**
   * Fetch all instances directly from Novita API (bypassing cache)
   */
  async fetchAllInstances(): Promise<InstanceResponse[]> {
    try {
      logger.info('Fetching all instances from Novita API for migration check', {
        endpoint: '/v1/gpu/instances',
        bypassCache: true
      });

      const startTime = Date.now();
      const response = await novitaApiService.listInstances();
      const fetchTime = Date.now() - startTime;

      logger.info('Successfully fetched instances from Novita API', {
        instanceCount: response.instances.length,
        total: response.total,
        fetchTimeMs: fetchTime
      });

      return response.instances;
    } catch (error) {
      logger.error('Failed to fetch instances from Novita API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof NovitaApiClientError ? error.constructor.name : 'UnknownError'
      });
      throw error;
    }
  }

  /**
   * Check if an instance is eligible for migration based on spot status
   */
  async checkMigrationEligibility(instance: InstanceResponse): Promise<MigrationEligibilityResult> {
    const { id: instanceId, status, spotStatus, spotReclaimTime } = instance;

    logger.debug('Checking migration eligibility for instance', {
      instanceId,
      status,
      spotStatus,
      spotReclaimTime
    });

    // First check: instance must have "exited" status
    if (status !== InstanceStatus.EXITED) {
      const result: MigrationEligibilityResult = {
        eligible: false,
        reason: `Instance status is "${status}", not "exited"`,
        instanceId,
        ...(spotStatus !== undefined && { spotStatus }),
        ...(spotReclaimTime !== undefined && { spotReclaimTime })
      };

      logger.debug('Instance not eligible for migration - wrong status', result);
      return result;
    }

    // Second check: if spotStatus is empty AND spotReclaimTime is "0", skip
    if ((!spotStatus || spotStatus.trim() === '') && spotReclaimTime === '0') {
      const result: MigrationEligibilityResult = {
        eligible: false,
        reason: 'Instance has empty spotStatus and spotReclaimTime is "0" - no action needed',
        instanceId,
        ...(spotStatus !== undefined && { spotStatus }),
        ...(spotReclaimTime !== undefined && { spotReclaimTime })
      };

      logger.debug('Instance not eligible for migration - no spot reclaim', result);
      return result;
    }

    // Third check: if spotReclaimTime is not "0", instance is eligible
    if (spotReclaimTime && spotReclaimTime !== '0') {
      const result: MigrationEligibilityResult = {
        eligible: true,
        reason: `Instance was reclaimed (spotReclaimTime: ${spotReclaimTime})`,
        instanceId,
        ...(spotStatus !== undefined && { spotStatus }),
        ...(spotReclaimTime !== undefined && { spotReclaimTime })
      };

      logger.info('Instance eligible for migration - spot reclaim detected', result);
      return result;
    }

    // Default case: not eligible
    const result: MigrationEligibilityResult = {
      eligible: false,
      reason: 'Instance does not meet migration criteria',
      instanceId,
      ...(spotStatus !== undefined && { spotStatus }),
      ...(spotReclaimTime !== undefined && { spotReclaimTime })
    };

    logger.debug('Instance not eligible for migration - default case', result);
    return result;
  }

  /**
   * Migrate a single instance using the Novita API
   */
  async migrateInstance(instanceId: string): Promise<MigrationResponse> {
    const startTime = Date.now();

    try {
      logger.info('Starting instance migration', {
        instanceId,
        dryRun: this.migrationConfig.dryRunMode
      });

      // In dry run mode, simulate the migration without actually calling the API
      if (this.migrationConfig.dryRunMode) {
        const dryRunResponse: MigrationResponse = {
          success: true,
          instanceId,
          message: 'DRY RUN: Migration would be initiated',
          migrationTime: new Date().toISOString()
        };

        logger.info('DRY RUN: Instance migration simulated', {
          instanceId,
          response: dryRunResponse,
          executionTimeMs: Date.now() - startTime
        });

        return dryRunResponse;
      }

      // Actual migration API call
      const migrationResponse = await novitaApiService.migrateInstance(instanceId);
      const executionTime = Date.now() - startTime;

      logger.info('Instance migration completed', {
        instanceId,
        success: migrationResponse.success,
        newInstanceId: migrationResponse.newInstanceId,
        message: migrationResponse.message,
        executionTimeMs: executionTime
      });

      return migrationResponse;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration error';

      logger.error('Instance migration failed', {
        instanceId,
        error: errorMessage,
        errorType: error instanceof NovitaApiClientError ? error.constructor.name : 'UnknownError',
        executionTimeMs: executionTime
      });

      // Return a failed migration response instead of throwing
      const failedResponse: MigrationResponse = {
        success: false,
        instanceId,
        error: errorMessage,
        migrationTime: new Date().toISOString()
      };

      return failedResponse;
    }
  }

  /**
   * Process a batch of instances for migration
   */
  async processMigrationBatch(): Promise<MigrationJobResult> {
    const jobStartTime = Date.now();
    const attempts: MigrationAttempt[] = [];
    let totalProcessed = 0;
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      logger.info('Starting migration batch processing', {
        maxConcurrent: this.migrationConfig.maxConcurrentMigrations,
        dryRun: this.migrationConfig.dryRunMode,
        jobTimeout: this.migrationConfig.jobTimeoutMs
      });

      // Step 1: Fetch all instances
      const allInstances = await this.fetchAllInstances();
      logger.info('Fetched instances for migration processing', {
        totalInstances: allInstances.length
      });

      // Step 2: Filter for exited instances
      const exitedInstances = allInstances.filter(instance => 
        instance.status === InstanceStatus.EXITED
      );

      logger.info('Filtered instances by status', {
        totalInstances: allInstances.length,
        exitedInstances: exitedInstances.length
      });

      // Step 3: Check eligibility for each exited instance
      const eligibilityPromises = exitedInstances.map(instance => 
        this.checkMigrationEligibility(instance)
      );
      const eligibilityResults = await Promise.all(eligibilityPromises);

      // Step 4: Process each instance
      for (let i = 0; i < exitedInstances.length; i++) {
        const instance = exitedInstances[i];
        const eligibilityResult = eligibilityResults[i];
        
        if (!instance || !eligibilityResult) {
          continue; // Skip if instance or eligibility result is undefined
        }
        
        totalProcessed++;

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
          instanceId: instance.id,
          instanceName: instance.name,
          eligible: eligibilityResult.eligible,
          reason: eligibilityResult.reason
        });

        if (!eligibilityResult.eligible) {
          skipped++;
          attempts.push(attempt);
          logger.debug('Skipping instance - not eligible', {
            instanceId: instance.id,
            reason: eligibilityResult.reason
          });
          continue;
        }

        // Step 5: Attempt migration for eligible instances
        try {
          const migrationStartTime = Date.now();
          const migrationResult = await this.migrateInstance(instance.id);
          const migrationTime = Date.now() - migrationStartTime;

          attempt.migrationResult = {
            success: migrationResult.success,
            ...(migrationResult.error && { error: migrationResult.error }),
            responseTime: migrationTime
          };

          if (migrationResult.success) {
            migrated++;
            logger.info('Instance migration successful', {
              instanceId: instance.id,
              newInstanceId: migrationResult.newInstanceId,
              responseTime: migrationTime
            });
          } else {
            errors++;
            logger.warn('Instance migration failed', {
              instanceId: instance.id,
              error: migrationResult.error,
              responseTime: migrationTime
            });
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          attempt.migrationResult = {
            success: false,
            error: errorMessage,
            responseTime: 0
          };

          logger.error('Unexpected error during instance migration', {
            instanceId: instance.id,
            error: errorMessage
          });
        }

        attempts.push(attempt);
      }

      const executionTime = Date.now() - jobStartTime;
      const result: MigrationJobResult = {
        totalProcessed,
        migrated,
        skipped,
        errors,
        executionTimeMs: executionTime
      };

      logger.info('Migration batch processing completed', {
        ...result,
        totalInstances: allInstances.length,
        exitedInstances: exitedInstances.length,
        eligibleInstances: attempts.filter(a => a.eligibilityCheck.eligible).length
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - jobStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown batch processing error';

      logger.error('Migration batch processing failed', {
        error: errorMessage,
        executionTimeMs: executionTime,
        processedSoFar: totalProcessed
      });

      // Return partial results even if the batch failed
      return {
        totalProcessed,
        migrated,
        skipped,
        errors: errors + 1, // Add 1 for the batch processing error
        executionTimeMs: executionTime
      };
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