/**
 * Background worker service for processing different job types
 */

import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('job-worker');
import { RedisJobQueueService } from './redisJobQueueService';
import { productService } from './productService';
import { templateService } from './templateService';
import { novitaApiService } from './novitaApiService';
import { instanceService } from './instanceService';
import { webhookClient } from '../clients/webhookClient';
import { healthCheckerService } from './healthCheckerService';
import { instanceMigrationService } from './instanceMigrationService';
import { autoStopService } from './autoStopService';
import { config } from '../config/config';
import {
  Job,
  JobType,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload,
  SendWebhookJobPayload,
  MigrateSpotInstancesJobPayload,
  MigrationJobResult,
  AutoStopCheckJobPayload,
  HandleFailedMigrationsJobPayload
} from '../types/job';
import {
  NovitaCreateInstanceRequest,
  InstanceStatus,
  NovitaApiClientError,
  HealthCheckResult,
  StartInstanceJobPayload
} from '../types/api';
import { JobPriority } from '../types/job';

export class JobWorkerService {
  private readonly pollIntervalMs: number;
  private readonly maxWaitTimeMs: number;
  private readonly maxRetryAttempts: number;

  constructor(private jobQueue: RedisJobQueueService) {
    // Use configurable polling interval and timeout settings
    this.pollIntervalMs = config.defaults.pollInterval * 1000; // Convert seconds to milliseconds
    this.maxWaitTimeMs = 20 * 60 * 1000; // 20 minutes timeout
    this.maxRetryAttempts = config.defaults.maxRetryAttempts;

    this.registerHandlers();
  }

  /**
   * Map region code to cluster ID for Novita.ai API
   */
  private mapRegionToClusterId(regionCode: string): string {
    // Map region codes to their corresponding cluster IDs
    const regionToClusterMap: Record<string, string> = {
      'CN-HK-01': 'cn-hongkong-1',
      'AS-SGP-02': 'as-sgp-2',
      'AS-IN-01': 'as-in-1',
      'US-CA-06': 'us-ca-06',
      'US-WEST-01': 'us-west-01',
      'EU-DE-01': 'eu-de-01',
      'EU-WEST-01': 'eu-west-01',
      'OC-AU-01': 'oc-au-01'
    };

    return regionToClusterMap[regionCode] || regionCode.toLowerCase();
  }

  /**
   * Register all job handlers with the queue service
   */
  private registerHandlers(): void {
    this.jobQueue.registerHandler(JobType.CREATE_INSTANCE, this.handleCreateInstance.bind(this));
    this.jobQueue.registerHandler(JobType.MONITOR_INSTANCE, this.handleMonitorInstance.bind(this));
    this.jobQueue.registerHandler(JobType.MONITOR_STARTUP, this.handleMonitorStartup.bind(this));
    this.jobQueue.registerHandler(JobType.SEND_WEBHOOK, this.handleSendWebhook.bind(this));
    this.jobQueue.registerHandler(JobType.MIGRATE_SPOT_INSTANCES, this.handleMigrateSpotInstances.bind(this));
    this.jobQueue.registerHandler(JobType.AUTO_STOP_CHECK, this.handleAutoStopCheck.bind(this));
    this.jobQueue.registerHandler(JobType.HANDLE_FAILED_MIGRATIONS, this.handleFailedMigrations.bind(this));
  }

  /**
   * Handle instance creation job
   */
  private async handleCreateInstance(job: Job): Promise<void> {
    const payload = job.payload as CreateInstanceJobPayload;

    logger.info('Processing create instance job', {
      jobId: job.id,
      instanceId: payload.instanceId,
      productName: payload.productName,
      templateId: payload.templateId
    });

    try {
      // Get instance state to update it throughout the process
      const instanceState = await instanceService.getInstanceState(payload.instanceId);
      if (!instanceState) {
        throw new Error(`Instance state not found: ${payload.instanceId}`);
      }

      // Step 1: Get optimal product selection with region fallback
      logger.debug('Fetching optimal product with region fallback', {
        jobId: job.id,
        instanceId: payload.instanceId,
        productName: payload.productName,
        preferredRegion: payload.region
      });

      const { product: optimalProduct, regionUsed } = await productService.getOptimalProductWithFallback(
        payload.productName,
        payload.region
      );

      logger.info('Optimal product selected with region fallback', {
        jobId: job.id,
        instanceId: payload.instanceId,
        productId: optimalProduct.id,
        regionUsed,
        spotPrice: optimalProduct.spotPrice,
        requestedRegion: payload.region
      });

      // Step 2: Get template configuration
      logger.debug('Fetching template configuration', {
        jobId: job.id,
        instanceId: payload.instanceId,
        templateId: payload.templateId
      });

      const templateConfig = await templateService.getTemplateConfiguration(payload.templateId);

      // Step 3: Create Novita.ai instance request
      const createRequest: NovitaCreateInstanceRequest = {
        name: payload.name,
        productId: optimalProduct.id,
        gpuNum: payload.gpuNum,
        rootfsSize: payload.rootfsSize,
        clusterId: this.mapRegionToClusterId(regionUsed),
        imageUrl: templateConfig.imageUrl,
        kind: 'gpu', // Default to GPU instances
        billingMode: 'spot', // Default to spot pricing for cost optimization
        ...(templateConfig.ports && templateConfig.ports.length > 0 && {
          ports: templateConfig.ports.map(p => `${p.port}/${p.type}`).join(',')
        }),
        ...(templateConfig.envs && templateConfig.envs.length > 0 && { envs: templateConfig.envs })
      };

      // Step 3.1: Handle image authentication if required
      if (templateConfig.imageAuth) {
        logger.debug('Fetching registry authentication credentials', {
          jobId: job.id,
          instanceId: payload.instanceId,
          imageAuthId: templateConfig.imageAuth
        });

        try {
          const registryAuth = await novitaApiService.getRegistryAuth(templateConfig.imageAuth);
          // Set imageAuth in username:password format
          createRequest.imageAuth = `${registryAuth.username}:${registryAuth.password}`;

          logger.info('Registry authentication credentials configured', {
            jobId: job.id,
            instanceId: payload.instanceId,
            imageAuthId: templateConfig.imageAuth,
            username: registryAuth.username
          });
        } catch (authError) {
          logger.error('Failed to fetch registry authentication credentials', {
            jobId: job.id,
            instanceId: payload.instanceId,
            imageAuthId: templateConfig.imageAuth,
            error: authError instanceof Error ? authError.message : 'Unknown error'
          });
          throw authError;
        }
      }

      logger.info('Creating Novita.ai instance', {
        jobId: job.id,
        instanceId: payload.instanceId,
        productId: optimalProduct.id,
        spotPrice: optimalProduct.spotPrice,
        regionUsed,
        requestedRegion: payload.region
      });

      // log createRequest details
      logger.debug('Novita.ai instance creation request', {
        instanceId: payload.instanceId
      });

      // Step 4: Create instance via Novita.ai API
      const novitaInstance = await novitaApiService.createInstance(createRequest);

      // Step 5: Update instance state with Novita instance ID
      await instanceService.updateInstanceState(payload.instanceId, {
        novitaInstanceId: novitaInstance.id,
        status: novitaInstance.status,
        timestamps: {
          created: instanceState.timestamps.created,
          ...(instanceState.timestamps.started && { started: instanceState.timestamps.started }),
          ...(instanceState.timestamps.ready && { ready: instanceState.timestamps.ready }),
          ...(instanceState.timestamps.failed && { failed: instanceState.timestamps.failed })
        }
      });

      logger.info('Novita.ai instance created successfully', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: novitaInstance.id,
        status: novitaInstance.status
      });

      // // Step 6: Automatically start the instance
      // logger.info('Starting Novita.ai instance', {
      //   jobId: job.id,
      //   instanceId: payload.instanceId,
      //   novitaInstanceId: novitaInstance.id
      // });

      // const startedInstance = await novitaApiService.startInstance(novitaInstance.id);

      // Step 7: Update instance state with started status
      await instanceService.updateInstanceState(payload.instanceId, {
        status: novitaInstance.status,
        timestamps: {
          created: instanceState.timestamps.created,
          started: new Date(),
          ...(instanceState.timestamps.ready && { ready: instanceState.timestamps.ready }),
          ...(instanceState.timestamps.failed && { failed: instanceState.timestamps.failed })
        }
      });

      logger.info('Instance start initiated', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: novitaInstance.id,
        status: novitaInstance.status
      });

      // Step 8: Queue monitoring job to track startup progress
      const monitoringPayload: MonitorInstanceJobPayload = {
        instanceId: payload.instanceId,
        novitaInstanceId: novitaInstance.id,
        startTime: new Date(),
        maxWaitTime: this.maxWaitTimeMs,
        ...(payload.webhookUrl && { webhookUrl: payload.webhookUrl })
      };

      await this.jobQueue.addJob(
        JobType.MONITOR_INSTANCE,
        monitoringPayload,
        JobPriority.HIGH
      );

      logger.info('Instance creation workflow completed, monitoring queued', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: novitaInstance.id
      });

    } catch (error) {
      // Update instance state to failed
      try {
        const currentState = await instanceService.getInstanceState(payload.instanceId);
        await instanceService.updateInstanceState(payload.instanceId, {
          status: InstanceStatus.FAILED,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          timestamps: {
            created: currentState?.timestamps.created || new Date(),
            ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
            ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
            failed: new Date()
          }
        });
      } catch (updateError) {
        logger.error('Failed to update instance state to failed', {
          instanceId: payload.instanceId,
          error: updateError instanceof Error ? updateError.message : 'Unknown error'
        });
      }

      // Send failure webhook if configured
      if (payload.webhookUrl) {
        try {
          const webhookPayload = webhookClient.createNotificationPayload(
            payload.instanceId,
            'failed',
            { error: error instanceof Error ? error.message : 'Unknown error' }
          );

          await this.jobQueue.addJob(JobType.SEND_WEBHOOK, {
            url: payload.webhookUrl,
            payload: webhookPayload
          });
        } catch (webhookError) {
          logger.error('Failed to queue failure webhook', {
            instanceId: payload.instanceId,
            error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
          });
        }
      }

      logger.error('Instance creation job failed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof NovitaApiClientError ? 'NovitaApiClientError' : 'Unknown'
      });

      throw error;
    }
  }

  /**
   * Handle instance monitoring job
   */
  private async handleMonitorInstance(job: Job): Promise<void> {
    const payload = job.payload as MonitorInstanceJobPayload;
    const elapsedTime = Date.now() - payload.startTime.getTime();
    const remainingTime = this.getRemainingStartupTime(payload.startTime, payload.maxWaitTime);

    logger.info('Processing monitor instance job', {
      jobId: job.id,
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      elapsedTime,
      remainingTime
    });

    try {
      // Check if monitoring timeout has been reached
      if (this.hasStartupTimedOut(payload.startTime, payload.maxWaitTime)) {
        await this.handleStartupTimeout(payload);
        return;
      }

      // Get current instance status from Novita.ai API
      logger.debug('Checking instance status', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        elapsedTime,
        remainingTime
      });

      const novitaInstance = await novitaApiService.getInstance(payload.novitaInstanceId);

      // Update our internal instance state with current status
      await instanceService.updateInstanceState(payload.instanceId, {
        status: novitaInstance.status
      });

      logger.debug('Instance status check completed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        status: novitaInstance.status,
        elapsedTime
      });

      if (novitaInstance.status === InstanceStatus.RUNNING) {
        // Instance is running, now perform health checks
        await this.handleHealthCheckPhase(payload, novitaInstance);
      } else if (novitaInstance.status === InstanceStatus.FAILED) {
        // Instance failed to start
        const failureError = new Error(`Instance failed to start with status: ${novitaInstance.status}`);
        await this.handleStartupFailure(payload, failureError);
        throw failureError;
      } else {
        // Instance still starting, reschedule monitoring with delay
        logger.debug('Instance still starting, rescheduling monitoring', {
          jobId: job.id,
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          status: novitaInstance.status,
          nextCheckIn: this.pollIntervalMs
        });

        // Wait for configured poll interval before next check
        setTimeout(async () => {
          try {
            await this.jobQueue.addJob(
              JobType.MONITOR_INSTANCE,
              payload,
              JobPriority.HIGH
            );
          } catch (error) {
            logger.error('Failed to reschedule monitoring job', {
              instanceId: payload.instanceId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }, this.pollIntervalMs);
      }

    } catch (error) {
      logger.error('Instance monitoring job failed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedTime
      });

      // Handle the failure using our centralized handler
      await this.handleStartupFailure(payload, error instanceof Error ? error : new Error('Unknown monitoring error'));
      throw error;
    }
  }

  /**
   * Handle webhook sending job
   */
  private async handleSendWebhook(job: Job): Promise<void> {
    const payload = job.payload as SendWebhookJobPayload;

    logger.info('Processing send webhook job', {
      jobId: job.id,
      url: payload.url
    });

    try {
      await webhookClient.sendWebhook({
        url: payload.url,
        payload: payload.payload,
        ...(payload.headers && { headers: payload.headers })
      });

      logger.info('Webhook sent successfully', {
        jobId: job.id,
        url: payload.url
      });

    } catch (error) {
      logger.error('Webhook sending job failed', {
        jobId: job.id,
        url: payload.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle spot instance migration job
   */
  private async handleMigrateSpotInstances(job: Job): Promise<void> {
    const payload = job.payload as MigrateSpotInstancesJobPayload;
    const jobStartTime = Date.now();

    logger.info('Processing migrate spot instances job', {
      jobId: job.id,
      scheduledAt: payload.scheduledAt,
      dryRun: payload.config?.dryRun,
      maxMigrations: payload.config?.maxMigrations
    });

    try {
      // Execute the migration batch processing
      const migrationResult: MigrationJobResult = await instanceMigrationService.processMigrationBatch();

      const jobExecutionTime = Date.now() - jobStartTime;

      // Log comprehensive job completion metrics
      logger.info('Spot instance migration job completed successfully', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        jobExecutionTimeMs: jobExecutionTime,
        migrationExecutionTimeMs: migrationResult.executionTimeMs,
        totalProcessed: migrationResult.totalProcessed,
        migrated: migrationResult.migrated,
        skipped: migrationResult.skipped,
        errors: migrationResult.errors,
        successRate: migrationResult.totalProcessed > 0
          ? ((migrationResult.migrated / migrationResult.totalProcessed) * 100).toFixed(2) + '%'
          : '0%'
      });

      // Log warning if there were errors during migration
      if (migrationResult.errors > 0) {
        logger.warn('Migration job completed with errors', {
          jobId: job.id,
          errorCount: migrationResult.errors,
          totalProcessed: migrationResult.totalProcessed,
          errorRate: ((migrationResult.errors / migrationResult.totalProcessed) * 100).toFixed(2) + '%'
        });
      }

      // Log info if no instances needed migration
      if (migrationResult.totalProcessed === 0) {
        logger.info('No instances required migration processing', {
          jobId: job.id,
          scheduledAt: payload.scheduledAt
        });
      }

    } catch (error) {
      const jobExecutionTime = Date.now() - jobStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration job error';

      logger.error('Spot instance migration job failed', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        jobExecutionTimeMs: jobExecutionTime,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      // Re-throw the error to mark the job as failed
      throw error;
    }
  }

  /**
   * Handle startup monitoring job for instances started via the start API
   */
  private async handleMonitorStartup(job: Job): Promise<void> {
    const payload = job.payload as StartInstanceJobPayload;
    const elapsedTime = Date.now() - payload.startTime.getTime();
    const remainingTime = this.getRemainingStartupTime(payload.startTime, payload.maxWaitTime);

    logger.info('Processing monitor startup job', {
      jobId: job.id,
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      elapsedTime,
      remainingTime
    });

    try {
      // Check if startup timeout has been reached
      if (this.hasStartupTimedOut(payload.startTime, payload.maxWaitTime)) {
        await this.handleStartupMonitoringTimeout(payload);
        return;
      }

      // Get current instance status from Novita.ai API
      logger.debug('Checking instance status during startup monitoring', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        elapsedTime,
        remainingTime
      });

      const novitaInstance = await novitaApiService.getInstance(payload.novitaInstanceId);

      // Update our internal instance state with current status
      await instanceService.updateInstanceState(payload.instanceId, {
        status: novitaInstance.status
      });

      logger.debug('Instance status check completed during startup monitoring', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        status: novitaInstance.status,
        elapsedTime
      });

      if (novitaInstance.status === InstanceStatus.RUNNING) {
        // Update startup operation phase
        const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
        if (startupOperation) {
          await await instanceService.updateStartupOperation(
            payload.instanceId,
            'monitoring',
            'instanceRunning'
          );
        }

        // Send startup progress webhook notification if configured
        if (payload.webhookUrl && startupOperation) {
          try {
            await webhookClient.sendStartupProgressNotification(
              payload.webhookUrl,
              payload.instanceId,
              'monitoring',
              {
                novitaInstanceId: payload.novitaInstanceId,
                operationId: startupOperation.operationId,
                startedAt: startupOperation.startedAt,
                phases: {
                  ...startupOperation.phases,
                  instanceRunning: new Date()
                },
                currentStatus: 'running'
              }
            );
          } catch (webhookError) {
            logger.error('Failed to send startup progress webhook notification when instance running', {
              instanceId: payload.instanceId,
              webhookUrl: payload.webhookUrl,
              error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
            });
          }
        }

        // Instance is running, now perform health checks
        await this.handleStartupHealthCheckPhase(payload, novitaInstance);
      } else if (novitaInstance.status === InstanceStatus.FAILED) {
        // Instance failed to start
        const failureError = new Error(`Instance failed to start with status: ${novitaInstance.status}`);
        await this.handleStartupMonitoringFailure(payload, failureError);
        throw failureError;
      } else {
        // Instance still starting, reschedule monitoring with delay
        logger.debug('Instance still starting, rescheduling startup monitoring', {
          jobId: job.id,
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          status: novitaInstance.status,
          nextCheckIn: this.pollIntervalMs
        });

        // Wait for configured poll interval before next check
        setTimeout(async () => {
          try {
            await this.jobQueue.addJob(
              JobType.MONITOR_STARTUP,
              payload,
              JobPriority.HIGH
            );
          } catch (error) {
            logger.error('Failed to reschedule startup monitoring job', {
              instanceId: payload.instanceId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }, this.pollIntervalMs);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      // Enhanced error logging with detailed context
      logger.error('Startup monitoring job failed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        error: errorMessage,
        errorType: errorName,
        elapsedTime,
        startTime: payload.startTime,
        maxWaitTime: payload.maxWaitTime,
        healthCheckConfig: payload.healthCheckConfig,
        phase: 'monitoring'
      });

      // Determine error severity and type
      const {
        isRetryableStartupError,
        getStartupErrorSuggestion,
        createStartupErrorContext
      } = await import('../utils/errorHandler');

      const isRetryable = isRetryableStartupError(error as Error);
      const suggestion = getStartupErrorSuggestion(error as Error);
      const errorContext = createStartupErrorContext(
        payload.instanceId,
        (await instanceService.getStartupOperation(payload.instanceId))?.operationId,
        'monitoring',
        elapsedTime
      );

      // Log additional context for debugging
      logger.error('Startup monitoring error context', {
        ...errorContext,
        isRetryable,
        suggestion,
        errorDetails: error instanceof Error ? {
          stack: error.stack,
          cause: (error as any).cause
        } : undefined
      });

      // Handle the failure using our centralized handler
      await this.handleStartupMonitoringFailure(payload, error instanceof Error ? error : new Error('Unknown startup monitoring error'));
      throw error;
    }
  }

  /**
   * Handle auto-stop check job
   */
  private async handleAutoStopCheck(job: Job): Promise<void> {
    const payload = job.payload as AutoStopCheckJobPayload;

    logger.info('Processing auto-stop check job', {
      jobId: job.id,
      scheduledAt: payload.scheduledAt,
      dryRun: payload.config?.dryRun,
      inactivityThresholdMinutes: payload.config?.inactivityThresholdMinutes
    });

    try {
      const result = await autoStopService.processAutoStopCheck(payload);

      logger.info('Auto-stop check job completed successfully', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        totalChecked: result.totalChecked,
        eligibleForStop: result.eligibleForStop,
        stopped: result.stopped,
        errors: result.errors,
        executionTimeMs: result.executionTimeMs,
        successRate: result.eligibleForStop > 0 ?
          ((result.stopped / result.eligibleForStop) * 100).toFixed(2) + '%' :
          '100%'
      });

      // Log warning if there were errors during auto-stop
      if (result.errors > 0) {
        logger.warn('Auto-stop check completed with errors', {
          jobId: job.id,
          errorCount: result.errors,
          totalChecked: result.totalChecked,
          errorRate: result.totalChecked > 0 ?
            ((result.errors / result.totalChecked) * 100).toFixed(2) + '%' :
            '0%'
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown auto-stop check error';

      logger.error('Auto-stop check job failed', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      // Re-throw the error to mark the job as failed
      throw error;
    }
  }

  /**
   * Handle failed migration jobs processing
   */
  private async handleFailedMigrations(job: Job): Promise<void> {
    const payload = job.payload as HandleFailedMigrationsJobPayload;

    logger.info('Processing failed migrations job', {
      jobId: job.id,
      scheduledAt: payload.scheduledAt,
      dryRun: payload.config?.dryRun
    });

    try {
      const result = await instanceMigrationService.processFailedMigrations(payload.jobId);

      logger.info('Failed migrations job completed successfully', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        totalChecked: result.totalChecked,
        failedJobsFound: result.failedJobsFound,
        instancesRecreated: result.instancesRecreated,
        errors: result.errors,
        executionTimeMs: result.executionTimeMs,
        successRate: result.failedJobsFound > 0 ?
          ((result.instancesRecreated / result.failedJobsFound) * 100).toFixed(2) + '%' :
          '100%'
      });

      // Log warning if there were errors during failed migration handling
      if (result.errors > 0) {
        logger.warn('Failed migrations job completed with errors', {
          jobId: job.id,
          errorCount: result.errors,
          totalChecked: result.totalChecked,
          errorRate: result.totalChecked > 0 ?
            ((result.errors / result.totalChecked) * 100).toFixed(2) + '%' :
            '0%'
        });
      }

      // Log info if no failed migrations were found
      if (result.failedJobsFound === 0) {
        logger.info('No failed migration jobs found', {
          jobId: job.id,
          scheduledAt: payload.scheduledAt,
          totalChecked: result.totalChecked
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown failed migrations error';

      logger.error('Failed migrations job failed', {
        jobId: job.id,
        scheduledAt: payload.scheduledAt,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      // Re-throw the error to mark the job as failed
      throw error;
    }
  }

  /**
   * Handle health check phase during startup monitoring
   */
  private async handleStartupHealthCheckPhase(payload: StartInstanceJobPayload, novitaInstance: any): Promise<void> {
    const currentState = await instanceService.getInstanceState(payload.instanceId);

    // Check if we're already in health checking phase
    const isAlreadyHealthChecking = currentState?.status === InstanceStatus.HEALTH_CHECKING;

    if (!isAlreadyHealthChecking) {
      // Transition to health checking status
      logger.info('Instance running during startup, starting health check phase', {
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        portMappings: novitaInstance.portMappings?.length || 0
      });

      await instanceService.updateInstanceState(payload.instanceId, {
        status: InstanceStatus.HEALTH_CHECKING,
        healthCheck: {
          status: 'in_progress',
          config: payload.healthCheckConfig,
          results: [],
          startedAt: new Date()
        }
      });

      // Update startup operation phase
      const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
      if (startupOperation) {
        await await instanceService.updateStartupOperation(
          payload.instanceId,
          'health_checking',
          'healthCheckStarted'
        );
      }

      // Send startup progress webhook notification if configured
      if (payload.webhookUrl && startupOperation) {
        try {
          await webhookClient.sendStartupProgressNotification(
            payload.webhookUrl,
            payload.instanceId,
            'health_checking',
            {
              novitaInstanceId: payload.novitaInstanceId,
              operationId: startupOperation.operationId,
              startedAt: startupOperation.startedAt,
              phases: {
                ...startupOperation.phases,
                healthCheckStarted: new Date()
              },
              currentStatus: 'health_checking'
            }
          );
        } catch (webhookError) {
          logger.error('Failed to send startup progress webhook notification during health check phase', {
            instanceId: payload.instanceId,
            webhookUrl: payload.webhookUrl,
            error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
          });
        }
      }
    }

    // Check if health check timeout has been reached
    const healthCheckStartTime = currentState?.healthCheck?.startedAt || new Date();

    if (this.hasStartupHealthCheckTimedOut(healthCheckStartTime, payload.healthCheckConfig.maxWaitTimeMs)) {
      await this.handleStartupHealthCheckTimeout(payload);
      return;
    }

    // Perform health checks if instance has port mappings
    if (novitaInstance.portMappings && novitaInstance.portMappings.length > 0) {
      try {
        // Filter port mappings based on targetPort if specified
        let portMappings = novitaInstance.portMappings.map((pm: any) => ({
          port: pm.port,
          endpoint: pm.endpoint,
          type: pm.type || 'http'
        }));

        // If targetPort is specified, only check that specific port
        if (payload.targetPort) {
          portMappings = portMappings.filter((pm: any) => pm.port === payload.targetPort);

          if (portMappings.length === 0) {
            logger.warn('Target port not found in instance port mappings', {
              instanceId: payload.instanceId,
              targetPort: payload.targetPort,
              availablePorts: novitaInstance.portMappings.map((pm: any) => pm.port)
            });
          }
        }

        logger.debug('Performing health checks during startup', {
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          endpoints: portMappings.length,
          targetPort: payload.targetPort,
          config: payload.healthCheckConfig
        });

        const healthCheckResult = await healthCheckerService.performHealthChecks(
          portMappings,
          payload.healthCheckConfig
        );

        // Update instance state with health check results
        const updatedState = await instanceService.getInstanceState(payload.instanceId);
        const existingResults = updatedState?.healthCheck?.results || [];

        await instanceService.updateInstanceState(payload.instanceId, {
          healthCheck: {
            status: 'in_progress',
            config: payload.healthCheckConfig,
            results: [...existingResults, healthCheckResult],
            startedAt: healthCheckStartTime
          }
        });

        if (healthCheckResult.overallStatus === 'healthy') {
          // All endpoints are healthy, mark instance as ready
          await this.handleStartupHealthCheckSuccess(payload, novitaInstance, healthCheckResult);
          // Job is complete, return without rescheduling
          return;
        } else {
          // Some endpoints are still unhealthy, continue monitoring
          logger.debug('Health checks not yet complete during startup, rescheduling', {
            instanceId: payload.instanceId,
            overallStatus: healthCheckResult.overallStatus,
            healthyEndpoints: healthCheckResult.endpoints.filter(e => e.status === 'healthy').length,
            totalEndpoints: healthCheckResult.endpoints.length,
            nextCheckIn: this.pollIntervalMs
          });

          // Wait for configured poll interval before next health check
          setTimeout(async () => {
            try {
              await this.jobQueue.addJob(
                JobType.MONITOR_STARTUP,
                payload,
                JobPriority.HIGH
              );
            } catch (error) {
              logger.error('Failed to reschedule startup health check monitoring job', {
                instanceId: payload.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }, this.pollIntervalMs);
        }

      } catch (error) {
        const healthCheckElapsedTime = Date.now() - healthCheckStartTime.getTime();
        const isHealthCheckError = error instanceof Error && error.name === 'HealthCheckError';
        const errorDetails = isHealthCheckError ? (error as any).toLogObject?.() : undefined;

        // Enhanced error logging with startup context
        logger.error('Health check execution failed during startup', {
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorCode: (error as any)?.code,
          isHealthCheckError,
          healthCheckElapsedTime,
          portMappingsCount: novitaInstance.portMappings?.length || 0,
          targetPort: payload.targetPort,
          healthCheckConfig: payload.healthCheckConfig,
          startupElapsedTime: Date.now() - payload.startTime.getTime(),
          ...(errorDetails && { healthCheckErrorDetails: errorDetails })
        });

        // Import enhanced error handling utilities
        const {
          HealthCheckFailedError,
          HealthCheckTimeoutError,
          isRetryableStartupError,
          getStartupErrorSuggestion
        } = await import('../utils/errorHandler');

        // Determine error characteristics
        const isRetryable = isHealthCheckError ? (error as any).isRetryable : isRetryableStartupError(error as Error);
        const errorSeverity = isHealthCheckError ? (error as any).severity : 'high';
        const suggestion = getStartupErrorSuggestion(error as Error);

        // Transform error into more specific health check error
        let transformedError: Error;
        if (error instanceof Error && error.message.includes('timeout')) {
          transformedError = new HealthCheckTimeoutError(
            payload.instanceId,
            payload.healthCheckConfig.maxWaitTimeMs,
            novitaInstance.portMappings?.length || 0
          );
        } else {
          transformedError = new HealthCheckFailedError(
            payload.instanceId,
            novitaInstance.portMappings?.length || 0,
            novitaInstance.portMappings?.length || 0,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }

        // Update health check status based on error severity
        const shouldFailInstance = errorSeverity === 'critical' || !isRetryable;

        if (shouldFailInstance) {
          logger.error('Health check failed with critical error during startup, marking instance as failed', {
            instanceId: payload.instanceId,
            errorSeverity,
            isRetryable,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          // Update instance state to failed for critical errors
          try {
            await instanceService.updateInstanceState(payload.instanceId, {
              status: InstanceStatus.FAILED,
              lastError: error instanceof Error ? error.message : 'Health check failed with critical error',
              timestamps: {
                created: currentState?.timestamps.created || new Date(),
                ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
                ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
                failed: new Date()
              },
              healthCheck: {
                status: 'failed',
                config: payload.healthCheckConfig,
                results: currentState?.healthCheck?.results || [],
                startedAt: healthCheckStartTime,
                completedAt: new Date()
              }
            });
          } catch (stateUpdateError) {
            logger.error('Failed to update instance state during startup health check error handling', {
              instanceId: payload.instanceId,
              error: stateUpdateError instanceof Error ? stateUpdateError.message : 'Unknown error',
              originalError: error instanceof Error ? error.message : 'Unknown error'
            });
          }

          // Send health check failed webhook notification if configured
          if (payload.webhookUrl) {
            try {
              await webhookClient.sendHealthCheckNotification(
                payload.webhookUrl,
                payload.instanceId,
                'failed',
                {
                  novitaInstanceId: payload.novitaInstanceId,
                  elapsedTime: Date.now() - payload.startTime.getTime(),
                  error: `${error instanceof Error ? error.message : 'Health check failed'} (type: startup_health_check_critical_error)`,
                  healthCheckStatus: 'failed',
                  healthCheckStartedAt: healthCheckStartTime,
                  healthCheckCompletedAt: new Date(),
                  data: {
                    errorSeverity,
                    isRetryable,
                    healthCheckElapsedTime
                  }
                }
              );
            } catch (webhookError) {
              logger.error('Failed to send startup health check failed webhook notification', {
                instanceId: payload.instanceId,
                webhookUrl: payload.webhookUrl,
                error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
              });
            }
          }

          throw error;
        } else {
          // For non-critical errors, continue monitoring with delay
          logger.warn('Health check failed with retryable error during startup, continuing monitoring', {
            instanceId: payload.instanceId,
            errorSeverity,
            isRetryable,
            error: error instanceof Error ? error.message : 'Unknown error',
            nextCheckIn: this.pollIntervalMs
          });

          // Wait for configured poll interval before next health check
          setTimeout(async () => {
            try {
              await this.jobQueue.addJob(
                JobType.MONITOR_STARTUP,
                payload,
                JobPriority.HIGH
              );
            } catch (error) {
              logger.error('Failed to reschedule startup monitoring after retryable health check error', {
                instanceId: payload.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }, this.pollIntervalMs);
        }
      }
    } else {
      // No port mappings available, mark instance as ready without health checks
      logger.info('No port mappings available for health checks during startup, marking instance as ready', {
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId
      });

      await this.handleStartupHealthCheckSuccess(payload, novitaInstance, null);
    }
  }

  /**
   * Handle successful health checks during startup monitoring
   */
  private async handleStartupHealthCheckSuccess(payload: StartInstanceJobPayload, novitaInstance: any, healthCheckResult: HealthCheckResult | null): Promise<void> {
    logger.info('Startup health checks completed successfully, marking instance as ready', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      elapsedTime: Date.now() - payload.startTime.getTime(),
      healthCheckResult: healthCheckResult ? {
        overallStatus: healthCheckResult.overallStatus,
        healthyEndpoints: healthCheckResult.endpoints.filter(e => e.status === 'healthy').length,
        totalEndpoints: healthCheckResult.endpoints.length
      } : 'no_health_checks'
    });

    // Update instance state to ready
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.READY,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ready: new Date(),
        ...(currentState?.timestamps.failed && { failed: currentState.timestamps.failed })
      },
      ...(healthCheckResult && {
        healthCheck: {
          status: 'completed',
          config: payload.healthCheckConfig,
          results: [...(currentState?.healthCheck?.results || []), healthCheckResult],
          startedAt: currentState?.healthCheck?.startedAt || new Date(),
          completedAt: new Date()
        }
      })
    });

    // Update startup operation to completed
    const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
    if (startupOperation) {
      await instanceService.updateStartupOperation(
        payload.instanceId,
        'completed',
        'ready'
      );
    }

    // Send startup completed webhook notification if configured
    if (payload.webhookUrl && startupOperation) {
      try {
        await webhookClient.sendStartupCompletedNotification(
          payload.webhookUrl,
          payload.instanceId,
          {
            novitaInstanceId: payload.novitaInstanceId,
            operationId: startupOperation.operationId,
            startedAt: startupOperation.startedAt,
            completedAt: new Date(),
            phases: {
              ...startupOperation.phases,
              ...(healthCheckResult && { healthCheckCompleted: new Date() }),
              ready: new Date()
            },
            ...(healthCheckResult && { healthCheckResult }),
            data: {
              healthCheckStatus: healthCheckResult ? 'completed' : 'skipped',
              portMappings: novitaInstance.portMappings
            }
          }
        );

        logger.info('Startup completed webhook notification sent', {
          instanceId: payload.instanceId,
          operationId: startupOperation.operationId,
          webhookUrl: payload.webhookUrl
        });
      } catch (webhookError) {
        logger.error('Failed to send startup completed webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Handle startup timeout for startup monitoring jobs
   */
  private async handleStartupMonitoringTimeout(payload: StartInstanceJobPayload): Promise<void> {
    const elapsedTime = Date.now() - payload.startTime.getTime();
    const timeoutError = `Instance startup timeout after ${payload.maxWaitTime}ms`;

    // Enhanced timeout logging with detailed context
    logger.error('Instance startup timed out during startup monitoring', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      maxWaitTime: payload.maxWaitTime,
      elapsedTime,
      startTime: payload.startTime,
      healthCheckConfig: payload.healthCheckConfig,
      targetPort: payload.targetPort,
      webhookUrl: payload.webhookUrl ? '[CONFIGURED]' : undefined,
      phase: 'startup_monitoring_timeout'
    });

    // Update instance state to failed
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.FAILED,
      lastError: timeoutError,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
        failed: new Date()
      }
    });

    // Update startup operation to failed
    const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
    if (startupOperation) {
      await instanceService.updateStartupOperation(
        payload.instanceId,
        'failed',
        undefined,
        timeoutError
      );
    }

    // Send startup failed webhook notification if configured
    if (payload.webhookUrl && startupOperation) {
      try {
        await webhookClient.sendStartupFailedNotification(
          payload.webhookUrl,
          payload.instanceId,
          timeoutError,
          {
            novitaInstanceId: payload.novitaInstanceId,
            operationId: startupOperation.operationId,
            startedAt: startupOperation.startedAt,
            failedAt: new Date(),
            phases: startupOperation.phases,
            failurePhase: 'timeout'
          }
        );

        logger.info('Startup timeout webhook notification sent', {
          instanceId: payload.instanceId,
          operationId: startupOperation.operationId,
          webhookUrl: payload.webhookUrl
        });
      } catch (webhookError) {
        logger.error('Failed to send startup timeout webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Handle startup failure for startup monitoring jobs
   */
  private async handleStartupMonitoringFailure(payload: StartInstanceJobPayload, error: Error): Promise<void> {
    const elapsedTime = Date.now() - payload.startTime.getTime();

    // Enhanced failure logging with detailed context and error analysis
    logger.error('Instance startup failed during startup monitoring', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      error: error.message,
      errorType: error.name,
      errorStack: error.stack,
      elapsedTime,
      startTime: payload.startTime,
      maxWaitTime: payload.maxWaitTime,
      healthCheckConfig: payload.healthCheckConfig,
      targetPort: payload.targetPort,
      webhookUrl: payload.webhookUrl ? '[CONFIGURED]' : undefined,
      phase: 'startup_monitoring_failure',
      // Additional error context
      errorCode: (error as any)?.code,
      errorStatusCode: (error as any)?.statusCode,
      isRetryable: await this.isStartupErrorRetryable(error)
    });

    // Update instance state to failed
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.FAILED,
      lastError: error.message,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
        failed: new Date()
      }
    });

    // Update startup operation to failed
    const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
    if (startupOperation) {
      await instanceService.updateStartupOperation(
        payload.instanceId,
        'failed',
        undefined,
        error.message
      );
    }

    // Send startup failed webhook notification if configured
    if (payload.webhookUrl && startupOperation) {
      try {
        await webhookClient.sendStartupFailedNotification(
          payload.webhookUrl,
          payload.instanceId,
          error.message,
          {
            novitaInstanceId: payload.novitaInstanceId,
            operationId: startupOperation.operationId,
            startedAt: startupOperation.startedAt,
            failedAt: new Date(),
            phases: startupOperation.phases,
            failurePhase: 'startup'
          }
        );

        logger.info('Startup failed webhook notification sent', {
          instanceId: payload.instanceId,
          operationId: startupOperation.operationId,
          webhookUrl: payload.webhookUrl
        });
      } catch (webhookError) {
        logger.error('Failed to send startup failed webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Check if a startup error is retryable
   */
  private async isStartupErrorRetryable(error: Error): Promise<boolean> {
    const { isRetryableStartupError } = await import('../utils/errorHandler');
    return isRetryableStartupError(error);
  }

  /**
   * Handle health check timeout during startup monitoring
   */
  private async handleStartupHealthCheckTimeout(payload: StartInstanceJobPayload): Promise<void> {
    const timeoutError = `Health check timeout after ${payload.healthCheckConfig.maxWaitTimeMs}ms during startup`;

    logger.error('Health check timed out during startup monitoring', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      healthCheckMaxWaitTime: payload.healthCheckConfig.maxWaitTimeMs,
      startTime: payload.startTime
    });

    // Update instance state to failed
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.FAILED,
      lastError: timeoutError,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
        failed: new Date()
      },
      healthCheck: {
        status: 'failed',
        config: payload.healthCheckConfig,
        results: currentState?.healthCheck?.results || [],
        startedAt: currentState?.healthCheck?.startedAt || new Date(),
        completedAt: new Date()
      }
    });

    // Update startup operation to failed
    const startupOperation = await instanceService.getStartupOperation(payload.instanceId);
    if (startupOperation) {
      await instanceService.updateStartupOperation(
        payload.instanceId,
        'failed',
        undefined,
        timeoutError
      );
    }

    // Send startup failed webhook notification if configured
    if (payload.webhookUrl && startupOperation) {
      try {
        await webhookClient.sendStartupFailedNotification(
          payload.webhookUrl,
          payload.instanceId,
          timeoutError,
          {
            novitaInstanceId: payload.novitaInstanceId,
            operationId: startupOperation.operationId,
            startedAt: startupOperation.startedAt,
            failedAt: new Date(),
            phases: startupOperation.phases,
            failurePhase: 'timeout',
            ...(currentState?.healthCheck?.results?.[currentState.healthCheck.results.length - 1] && {
              healthCheckResult: currentState.healthCheck.results[currentState.healthCheck.results.length - 1]
            })
          }
        );

        logger.info('Startup timeout webhook notification sent', {
          instanceId: payload.instanceId,
          operationId: startupOperation.operationId,
          webhookUrl: payload.webhookUrl
        });
      } catch (webhookError) {
        logger.error('Failed to send startup timeout webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Check if startup health check has timed out
   */
  private hasStartupHealthCheckTimedOut(startTime: Date, maxWaitTime: number): boolean {
    const elapsedTime = Date.now() - startTime.getTime();
    return elapsedTime > maxWaitTime;
  }

  /**
   * Check if instance startup has timed out
   */
  private hasStartupTimedOut(startTime: Date, maxWaitTime: number): boolean {
    const elapsedTime = Date.now() - startTime.getTime();
    return elapsedTime > maxWaitTime;
  }

  /**
   * Calculate remaining time for instance startup
   */
  private getRemainingStartupTime(startTime: Date, maxWaitTime: number): number {
    const elapsedTime = Date.now() - startTime.getTime();
    return Math.max(0, maxWaitTime - elapsedTime);
  }

  /**
   * Handle instance startup timeout
   */
  private async handleStartupTimeout(payload: MonitorInstanceJobPayload): Promise<void> {
    const timeoutError = `Instance startup timeout after ${payload.maxWaitTime}ms`;

    logger.error('Instance startup timed out', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      maxWaitTime: payload.maxWaitTime,
      startTime: payload.startTime
    });

    // Update instance state to failed
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.FAILED,
      lastError: timeoutError,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
        failed: new Date()
      }
    });

    // Send timeout webhook notification if configured
    if (payload.webhookUrl) {
      const webhookPayload = webhookClient.createNotificationPayload(
        payload.instanceId,
        'timeout',
        {
          novitaInstanceId: payload.novitaInstanceId,
          elapsedTime: Date.now() - payload.startTime.getTime(),
          error: timeoutError
        }
      );

      await this.jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: payload.webhookUrl,
        payload: webhookPayload
      });
    }
  }

  /**
   * Handle instance startup failure
   */
  private async handleStartupFailure(payload: MonitorInstanceJobPayload, error: Error): Promise<void> {
    logger.error('Instance startup failed', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      error: error.message,
      elapsedTime: Date.now() - payload.startTime.getTime()
    });

    // Update instance state to failed
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.FAILED,
      lastError: error.message,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
        failed: new Date()
      }
    });

    // Send failure webhook notification if configured
    if (payload.webhookUrl) {
      const webhookPayload = webhookClient.createNotificationPayload(
        payload.instanceId,
        'failed',
        {
          novitaInstanceId: payload.novitaInstanceId,
          elapsedTime: Date.now() - payload.startTime.getTime(),
          error: error.message
        }
      );

      await this.jobQueue.addJob(JobType.SEND_WEBHOOK, {
        url: payload.webhookUrl,
        payload: webhookPayload
      });
    }
  }

  /**
   * Handle health check phase after instance reaches running status
   */
  private async handleHealthCheckPhase(payload: MonitorInstanceJobPayload, novitaInstance: any): Promise<void> {
    const currentState = await instanceService.getInstanceState(payload.instanceId);

    // Check if we're already in health checking phase
    const isAlreadyHealthChecking = currentState?.status === InstanceStatus.HEALTH_CHECKING;

    if (!isAlreadyHealthChecking) {
      // Transition to health checking status
      logger.info('Instance running, starting health check phase', {
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId,
        portMappings: novitaInstance.portMappings?.length || 0
      });

      const healthCheckConfig = payload.healthCheckConfig || {
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 300000
      };

      await instanceService.updateInstanceState(payload.instanceId, {
        status: InstanceStatus.HEALTH_CHECKING,
        healthCheck: {
          status: 'in_progress',
          config: healthCheckConfig,
          results: [],
          startedAt: new Date()
        }
      });

      // Send health check started webhook notification if configured
      if (payload.webhookUrl) {
        try {
          await webhookClient.sendHealthCheckNotification(
            payload.webhookUrl,
            payload.instanceId,
            'health_checking',
            {
              novitaInstanceId: payload.novitaInstanceId,
              elapsedTime: Date.now() - payload.startTime.getTime(),
              healthCheckStatus: 'in_progress',
              healthCheckStartedAt: new Date()
            }
          );
        } catch (webhookError) {
          logger.error('Failed to send health check started webhook notification', {
            instanceId: payload.instanceId,
            webhookUrl: payload.webhookUrl,
            error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
          });
        }
      }
    }

    // Check if health check timeout has been reached
    const healthCheckStartTime = currentState?.healthCheck?.startedAt || new Date();
    const healthCheckConfig = payload.healthCheckConfig || {
      timeoutMs: 10000,
      retryAttempts: 3,
      retryDelayMs: 2000,
      maxWaitTimeMs: 300000
    };

    if (this.hasHealthCheckTimedOut(healthCheckStartTime, healthCheckConfig.maxWaitTimeMs)) {
      await this.handleHealthCheckTimeout(payload);
      return;
    }

    // Perform health checks if instance has port mappings
    if (novitaInstance.portMappings && novitaInstance.portMappings.length > 0) {
      try {
        // Convert Novita port mappings to expected format
        const portMappings = novitaInstance.portMappings.map((pm: any) => ({
          port: pm.port,
          endpoint: pm.endpoint, // Default endpoint format
          type: pm.type || 'http'
        }));

        logger.debug('Performing health checks', {
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          endpoints: portMappings.length,
          config: healthCheckConfig
        });

        const healthCheckResult = await healthCheckerService.performHealthChecks(
          portMappings,
          healthCheckConfig
        );

        // Update instance state with health check results
        const updatedState = await instanceService.getInstanceState(payload.instanceId);
        const existingResults = updatedState?.healthCheck?.results || [];

        await instanceService.updateInstanceState(payload.instanceId, {
          healthCheck: {
            status: 'in_progress',
            config: healthCheckConfig,
            results: [...existingResults, healthCheckResult],
            startedAt: healthCheckStartTime
          }
        });

        if (healthCheckResult.overallStatus === 'healthy') {
          // All endpoints are healthy, mark instance as ready
          await this.handleHealthCheckSuccess(payload, novitaInstance, healthCheckResult);
          // Job is complete, return without rescheduling
          return;
        } else {
          // Some endpoints are still unhealthy, continue monitoring
          logger.debug('Health checks not yet complete, rescheduling', {
            instanceId: payload.instanceId,
            overallStatus: healthCheckResult.overallStatus,
            healthyEndpoints: healthCheckResult.endpoints.filter(e => e.status === 'healthy').length,
            totalEndpoints: healthCheckResult.endpoints.length,
            nextCheckIn: this.pollIntervalMs
          });

          // Wait for configured poll interval before next health check
          setTimeout(async () => {
            try {
              await this.jobQueue.addJob(
                JobType.MONITOR_INSTANCE,
                payload,
                JobPriority.HIGH
              );
            } catch (error) {
              logger.error('Failed to reschedule health check monitoring job', {
                instanceId: payload.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }, this.pollIntervalMs);
        }

      } catch (error) {
        const healthCheckElapsedTime = Date.now() - healthCheckStartTime.getTime();
        const isHealthCheckError = error instanceof Error && error.name === 'HealthCheckError';
        const errorDetails = isHealthCheckError ? (error as any).toLogObject?.() : undefined;

        logger.error('Health check execution failed', {
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorCode: (error as any)?.code,
          isHealthCheckError,
          healthCheckElapsedTime,
          portMappingsCount: novitaInstance.portMappings?.length || 0,
          ...(errorDetails && { healthCheckErrorDetails: errorDetails })
        });

        // Determine if this is a retryable error
        const isRetryable = isHealthCheckError ? (error as any).isRetryable : true;
        const errorSeverity = isHealthCheckError ? (error as any).severity : 'high';

        // Update health check status based on error severity
        const shouldFailInstance = errorSeverity === 'critical' || !isRetryable;

        if (shouldFailInstance) {
          logger.error('Health check failed with critical error, marking instance as failed', {
            instanceId: payload.instanceId,
            errorSeverity,
            isRetryable,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          // Update instance state to failed for critical errors
          try {
            await instanceService.updateInstanceState(payload.instanceId, {
              status: InstanceStatus.FAILED,
              lastError: error instanceof Error ? error.message : 'Health check failed with critical error',
              timestamps: {
                created: currentState?.timestamps.created || new Date(),
                ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
                ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
                failed: new Date()
              },
              healthCheck: {
                status: 'failed',
                config: healthCheckConfig,
                results: currentState?.healthCheck?.results || [],
                startedAt: healthCheckStartTime,
                completedAt: new Date()
              }
            });
          } catch (stateUpdateError) {
            logger.error('Failed to update instance state during health check error handling', {
              instanceId: payload.instanceId,
              error: stateUpdateError instanceof Error ? stateUpdateError.message : 'Unknown error',
              originalError: error instanceof Error ? error.message : 'Unknown error'
            });
          }

          // Send health check failed webhook notification if configured
          if (payload.webhookUrl) {
            try {
              await webhookClient.sendHealthCheckNotification(
                payload.webhookUrl,
                payload.instanceId,
                'failed',
                {
                  novitaInstanceId: payload.novitaInstanceId,
                  elapsedTime: Date.now() - payload.startTime.getTime(),
                  error: `${error instanceof Error ? error.message : 'Health check failed'} (type: health_check_critical_error)`,
                  healthCheckStatus: 'failed',
                  healthCheckStartedAt: healthCheckStartTime,
                  healthCheckCompletedAt: new Date(),
                  data: {
                    errorSeverity,
                    isRetryable,
                    healthCheckElapsedTime,
                    totalElapsedTime: Date.now() - payload.startTime.getTime(),
                    ...(errorDetails && { errorDetails })
                  }
                }
              );

              logger.info('Health check failure webhook notification sent', {
                instanceId: payload.instanceId,
                webhookUrl: payload.webhookUrl
              });

            } catch (webhookError) {
              logger.error('Failed to send health check failed webhook notification', {
                instanceId: payload.instanceId,
                webhookUrl: payload.webhookUrl,
                error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
                originalError: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        } else {
          // For retryable errors, log and reschedule
          logger.warn('Health check failed with retryable error, will retry', {
            instanceId: payload.instanceId,
            errorSeverity,
            isRetryable,
            nextRetryIn: this.pollIntervalMs,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          // Update health check status to indicate ongoing issues but not failed
          try {
            const existingResults = currentState?.healthCheck?.results || [];
            await instanceService.updateInstanceState(payload.instanceId, {
              healthCheck: {
                status: 'in_progress',
                config: healthCheckConfig,
                results: existingResults,
                startedAt: healthCheckStartTime
              }
            });
          } catch (stateUpdateError) {
            logger.error('Failed to update instance state during retryable health check error', {
              instanceId: payload.instanceId,
              error: stateUpdateError instanceof Error ? stateUpdateError.message : 'Unknown error'
            });
          }

          // Reschedule to retry health checks for retryable errors
          setTimeout(async () => {
            try {
              await this.jobQueue.addJob(
                JobType.MONITOR_INSTANCE,
                payload,
                JobPriority.HIGH
              );

              logger.debug('Health check rescheduled after retryable error', {
                instanceId: payload.instanceId,
                retryDelay: this.pollIntervalMs
              });

            } catch (rescheduleError) {
              logger.error('Failed to reschedule health check after retryable error', {
                instanceId: payload.instanceId,
                error: rescheduleError instanceof Error ? rescheduleError.message : 'Unknown error',
                originalError: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }, this.pollIntervalMs);
        }
      }
    } else {
      // No port mappings to check, mark as ready immediately
      logger.info('No port mappings found, marking instance as ready', {
        instanceId: payload.instanceId,
        novitaInstanceId: payload.novitaInstanceId
      });

      await this.handleHealthCheckSuccess(payload, novitaInstance, {
        overallStatus: 'healthy',
        endpoints: [],
        checkedAt: new Date(),
        totalResponseTime: 0
      });
      // Job is complete, return without rescheduling
      return;
    }
  }

  /**
   * Handle successful health check completion
   */
  private async handleHealthCheckSuccess(payload: MonitorInstanceJobPayload, novitaInstance: any, healthCheckResult: any): Promise<void> {
    const elapsedTime = Date.now() - payload.startTime.getTime();

    logger.info('Health checks completed successfully, instance ready', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      overallStatus: healthCheckResult.overallStatus,
      healthyEndpoints: healthCheckResult.endpoints.filter((e: any) => e.status === 'healthy').length,
      totalEndpoints: healthCheckResult.endpoints.length,
      elapsedTime
    });

    // Update instance state to ready
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    await instanceService.updateInstanceState(payload.instanceId, {
      status: InstanceStatus.READY,
      timestamps: {
        created: currentState?.timestamps.created || new Date(),
        ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
        ready: new Date(),
        ...(currentState?.timestamps.failed && { failed: currentState.timestamps.failed })
      },
      healthCheck: {
        status: 'completed',
        config: payload.healthCheckConfig || {
          timeoutMs: 10000,
          retryAttempts: 3,
          retryDelayMs: 2000,
          maxWaitTimeMs: 300000
        },
        results: [...(currentState?.healthCheck?.results || []), healthCheckResult],
        startedAt: currentState?.healthCheck?.startedAt || new Date(),
        completedAt: new Date()
      }
    });

    // Send success webhook notification if configured
    if (payload.webhookUrl) {
      try {
        await webhookClient.sendHealthCheckNotification(
          payload.webhookUrl,
          payload.instanceId,
          'ready',
          {
            novitaInstanceId: payload.novitaInstanceId,
            elapsedTime,
            data: novitaInstance,
            healthCheckResult,
            healthCheckStatus: 'completed',
            ...(currentState?.healthCheck?.startedAt && { healthCheckStartedAt: currentState.healthCheck.startedAt }),
            healthCheckCompletedAt: new Date()
          }
        );
      } catch (webhookError) {
        logger.error('Failed to send ready webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Handle health check timeout with comprehensive error handling
   */
  private async handleHealthCheckTimeout(payload: MonitorInstanceJobPayload): Promise<void> {
    const currentState = await instanceService.getInstanceState(payload.instanceId);
    const healthCheckStartTime = currentState?.healthCheck?.startedAt || new Date();
    const elapsedTime = Date.now() - healthCheckStartTime.getTime();
    const maxWaitTime = payload.healthCheckConfig?.maxWaitTimeMs || 300000;

    const timeoutError = `Health check timeout after ${elapsedTime}ms (max: ${maxWaitTime}ms)`;

    logger.error('Health check timed out', {
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId,
      healthCheckStartTime: healthCheckStartTime.toISOString(),
      elapsedTimeMs: elapsedTime,
      maxWaitTimeMs: maxWaitTime,
      healthCheckResults: currentState?.healthCheck?.results?.length || 0,
      lastHealthCheckStatus: currentState?.healthCheck?.results?.[currentState.healthCheck.results.length - 1]?.overallStatus,
      endpointStatuses: currentState?.healthCheck?.results?.[currentState.healthCheck.results.length - 1]?.endpoints?.map(e => ({
        port: e.port,
        status: e.status,
        error: e.error
      })) || []
    });

    // Create detailed error summary for the timeout
    const lastResult = currentState?.healthCheck?.results?.[currentState.healthCheck.results.length - 1];
    const healthCheckSummary = lastResult
      ? healthCheckerService.summarizeResults(lastResult)
      : { summary: 'No health check results available', metrics: {}, issues: [] };

    try {
      // Update instance state to failed with comprehensive error information
      await instanceService.updateInstanceState(payload.instanceId, {
        status: InstanceStatus.FAILED,
        lastError: timeoutError,
        timestamps: {
          created: currentState?.timestamps.created || new Date(),
          ...(currentState?.timestamps.started && { started: currentState.timestamps.started }),
          ...(currentState?.timestamps.ready && { ready: currentState.timestamps.ready }),
          failed: new Date()
        },
        healthCheck: {
          status: 'failed',
          config: payload.healthCheckConfig || {
            timeoutMs: 10000,
            retryAttempts: 3,
            retryDelayMs: 2000,
            maxWaitTimeMs: 300000
          },
          results: currentState?.healthCheck?.results || [],
          startedAt: healthCheckStartTime,
          completedAt: new Date()
        }
      });

      logger.info('Instance state updated to failed due to health check timeout', {
        instanceId: payload.instanceId,
        healthCheckSummary: healthCheckSummary.summary,
        healthCheckIssues: healthCheckSummary.issues
      });

    } catch (stateUpdateError) {
      logger.error('Failed to update instance state during health check timeout handling', {
        instanceId: payload.instanceId,
        error: stateUpdateError instanceof Error ? stateUpdateError.message : 'Unknown error',
        originalTimeoutError: timeoutError
      });
    }

    // Send timeout webhook notification if configured
    if (payload.webhookUrl) {
      try {
        await webhookClient.sendHealthCheckNotification(
          payload.webhookUrl,
          payload.instanceId,
          'failed',
          {
            novitaInstanceId: payload.novitaInstanceId,
            error: `${timeoutError} (type: health_check_timeout)`,
            healthCheckStatus: 'failed',
            healthCheckStartedAt: healthCheckStartTime,
            healthCheckCompletedAt: new Date(),
            elapsedTime: elapsedTime,
            data: {
              maxWaitTimeMs: maxWaitTime,
              healthCheckSummary: healthCheckSummary.summary,
              healthCheckMetrics: healthCheckSummary.metrics,
              healthCheckIssues: healthCheckSummary.issues,
              endpointDetails: currentState?.healthCheck?.results?.[currentState.healthCheck.results.length - 1]?.endpoints?.map(e => ({
                port: e.port,
                endpoint: e.endpoint,
                status: e.status,
                error: e.error,
                responseTime: e.responseTime,
                lastChecked: e.lastChecked
              })) || []
            }
          }
        );

        logger.info('Health check timeout webhook notification sent successfully', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl
        });

      } catch (webhookError) {
        logger.error('Failed to send health check timeout webhook notification', {
          instanceId: payload.instanceId,
          webhookUrl: payload.webhookUrl,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
          errorType: webhookError instanceof Error ? webhookError.constructor.name : 'Unknown',
          originalTimeoutError: timeoutError
        });
      }
    }
  }

  /**
   * Check if health check has timed out
   */
  private hasHealthCheckTimedOut(startTime: Date, maxWaitTime: number): boolean {
    const elapsedTime = Date.now() - startTime.getTime();
    return elapsedTime > maxWaitTime;
  }

  /**
   * Handle successful instance startup (legacy method, now redirects to health check phase)
   */
  private async handleStartupSuccess(payload: MonitorInstanceJobPayload, novitaInstance: any): Promise<void> {
    // This method is now handled by handleHealthCheckPhase
    await this.handleHealthCheckPhase(payload, novitaInstance);
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): {
    pollIntervalMs: number;
    maxWaitTimeMs: number;
    maxRetryAttempts: number;
  } {
    return {
      pollIntervalMs: this.pollIntervalMs,
      maxWaitTimeMs: this.maxWaitTimeMs,
      maxRetryAttempts: this.maxRetryAttempts
    };
  }

  /**
   * Start the worker service
   */
  start(): void {
    logger.info('Starting job worker service', {
      pollIntervalMs: this.pollIntervalMs,
      maxWaitTimeMs: this.maxWaitTimeMs,
      maxRetryAttempts: this.maxRetryAttempts
    });
    this.jobQueue.startProcessing();
  }

  /**
   * Stop the worker service
   */
  stop(): void {
    logger.info('Stopping job worker service');
    this.jobQueue.stopProcessing();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info('Shutting down job worker service');
    await this.jobQueue.shutdown(timeoutMs);
  }
}

// Note: JobWorkerService should be instantiated with the proper RedisJobQueueService instance
// rather than using a singleton to avoid circular dependency issues