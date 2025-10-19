/**
 * Auto-stop service for managing automatic instance shutdown based on inactivity
 */

import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('auto-stop');
import { instanceService } from './instanceService';
import { serviceRegistry } from './serviceRegistry';
import { config } from '../config/config';
import { JobType, JobPriority, AutoStopCheckJobPayload } from '../types/job';
import { InstanceStatus, InstanceState } from '../types/api';

export class AutoStopService {
  private readonly defaultInactivityThresholdMinutes = 10;
  private readonly checkIntervalMs = 2 * 60 * 1000; // Check every 2 minutes
  private readonly startupGracePeriodMinutes = 45; // Grace period for instances that are starting
  private readonly creationGracePeriodMinutes = 60; // Grace period for instances that haven't started yet
  private isSchedulerRunning = false;

  /**
   * Start the auto-stop scheduler
   */
  startScheduler(): void {
    if (this.isSchedulerRunning) {
      logger.warn('Auto-stop scheduler is already running');
      return;
    }

    this.isSchedulerRunning = true;
    this.scheduleNextCheck();

    logger.info('Auto-stop scheduler started', {
      checkIntervalMinutes: this.checkIntervalMs / (60 * 1000),
      defaultInactivityThresholdMinutes: this.defaultInactivityThresholdMinutes,
      startupGracePeriodMinutes: this.startupGracePeriodMinutes,
      creationGracePeriodMinutes: this.creationGracePeriodMinutes
    });
  }

  /**
   * Stop the auto-stop scheduler
   */
  stopScheduler(): void {
    this.isSchedulerRunning = false;
    logger.info('Auto-stop scheduler stopped');
  }

  /**
   * Schedule the next auto-stop check
   */
  private scheduleNextCheck(): void {
    if (!this.isSchedulerRunning) {
      return;
    }

    setTimeout(async () => {
      try {
        await this.queueAutoStopCheck();
        this.scheduleNextCheck(); // Schedule next check
      } catch (error) {
        logger.error('Failed to queue auto-stop check', {
          error: (error as Error).message
        });
        // Continue scheduling even if one check fails
        this.scheduleNextCheck();
      }
    }, this.checkIntervalMs);
  }

  /**
   * Queue an auto-stop check job
   */
  async queueAutoStopCheck(dryRun: boolean = false): Promise<void> {
    const payload: AutoStopCheckJobPayload = {
      scheduledAt: new Date(),
      jobId: `auto_stop_${Date.now()}`,
      config: {
        dryRun,
        inactivityThresholdMinutes: this.defaultInactivityThresholdMinutes,
        startupGracePeriodMinutes: this.startupGracePeriodMinutes,
        creationGracePeriodMinutes: this.creationGracePeriodMinutes
      }
    };

    const jobQueueService = serviceRegistry.getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    await jobQueueService.addJob(
      JobType.AUTO_STOP_CHECK,
      payload,
      JobPriority.NORMAL
    );

    logger.debug('Auto-stop check job queued', {
      jobId: payload.jobId,
      dryRun,
      inactivityThresholdMinutes: this.defaultInactivityThresholdMinutes
    });
  }

  /**
   * Process auto-stop check - identify and stop inactive instances
   */
  async processAutoStopCheck(payload: AutoStopCheckJobPayload): Promise<{
    totalChecked: number;
    eligibleForStop: number;
    stopped: number;
    errors: number;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();
    const inactivityThreshold = payload.config?.inactivityThresholdMinutes || this.defaultInactivityThresholdMinutes;
    const startupGracePeriod = payload.config?.startupGracePeriodMinutes || this.startupGracePeriodMinutes;
    const creationGracePeriod = payload.config?.creationGracePeriodMinutes || this.creationGracePeriodMinutes;
    const dryRun = payload.config?.dryRun || false;

    logger.info('Processing auto-stop check', {
      operation: 'auto_stop_check',
      jobId: payload.jobId,
      scheduledAt: payload.scheduledAt,
      inactivityThresholdMinutes: inactivityThreshold,
      startupGracePeriodMinutes: startupGracePeriod,
      creationGracePeriodMinutes: creationGracePeriod,
      dryRun
    });

    try {
      // Get all instances eligible for auto-stop
      const eligibleInstances = await instanceService.getInstancesEligibleForAutoStop(
        inactivityThreshold,
        startupGracePeriod,
        creationGracePeriod
      );

      if (eligibleInstances.length > 0) {
        logger.info('Found instances eligible for auto-stop', {
          operation: 'auto_stop_check',
          jobId: payload.jobId,
          eligibleCount: eligibleInstances.length,
          inactivityThresholdMinutes: inactivityThreshold
        });
      } else {
        logger.info('No instances eligible for auto-stop', {
          operation: 'auto_stop_check',
          jobId: payload.jobId,
          eligibleCount: 0,
          inactivityThresholdMinutes: inactivityThreshold
        });
      }

      let stopped = 0;
      let errors = 0;

      // Process each eligible instance
      for (const instanceState of eligibleInstances) {
        try {
          const lastUsedTime = instanceState.timestamps.lastUsed ||
            instanceState.timestamps.started ||
            instanceState.timestamps.created ||
            instanceState.timestamps.ready;

          const inactiveMinutes = lastUsedTime ?
            Math.floor((Date.now() - lastUsedTime.getTime()) / (60 * 1000)) :
            'unknown';

          logger.info('Processing instance for auto-stop', {
            operation: 'auto_stop_check',
            instanceId: instanceState.id,
            jobId: payload.jobId,
            instanceName: instanceState.name,
            status: instanceState.status,
            lastUsedTime: lastUsedTime?.toISOString(),
            inactiveMinutes,
            dryRun
          });

          if (dryRun) {
            logger.info('DRY RUN: Would stop instance', {
              operation: 'auto_stop_check',
              instanceId: instanceState.id,
              instanceName: instanceState.name,
              inactiveMinutes
            });
          } else {
            // Clear lastUsed time before stopping the instance
            await instanceService.clearLastUsedTime(instanceState.id);

            // Actually stop the instance
            await instanceService.stopInstance(instanceState.id, {}, 'id');
            stopped++;

            logger.info('Instance auto-stopped due to inactivity', {
              operation: 'auto_stop_check',
              instanceId: instanceState.id,
              instanceName: instanceState.name,
              inactiveMinutes,
              inactivityThresholdMinutes: inactivityThreshold
            });
          }
        } catch (error) {
          errors++;
          logger.error('Failed to auto-stop instance', {
            operation: 'auto_stop_check',
            instanceId: instanceState.id,
            jobId: payload.jobId,
            instanceName: instanceState.name
          }, error as Error);
        }
      }

      const executionTimeMs = Date.now() - startTime;
      const result = {
        totalChecked: eligibleInstances.length,
        eligibleForStop: eligibleInstances.length,
        stopped,
        errors,
        executionTimeMs
      };

      logger.info('Auto-stop check completed', {
        operation: 'auto_stop_check',
        duration: executionTimeMs,
        jobId: payload.jobId,
        ...result,
        dryRun,
        successRate: eligibleInstances.length > 0 ?
          ((stopped / eligibleInstances.length) * 100).toFixed(2) + '%' :
          '100%'
      });

      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      logger.error('Auto-stop check failed', {
        operation: 'auto_stop_check',
        duration: executionTimeMs,
        jobId: payload.jobId
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get auto-stop statistics
   */
  getAutoStopStats(): {
    schedulerRunning: boolean;
    checkIntervalMinutes: number;
    defaultInactivityThresholdMinutes: number;
    startupGracePeriodMinutes: number;
    creationGracePeriodMinutes: number;
    nextCheckIn?: number;
  } {
    return {
      schedulerRunning: this.isSchedulerRunning,
      checkIntervalMinutes: this.checkIntervalMs / (60 * 1000),
      defaultInactivityThresholdMinutes: this.defaultInactivityThresholdMinutes,
      startupGracePeriodMinutes: this.startupGracePeriodMinutes,
      creationGracePeriodMinutes: this.creationGracePeriodMinutes
    };
  }

  /**
   * Manually trigger an auto-stop check (useful for testing)
   */
  async triggerManualCheck(dryRun: boolean = true): Promise<void> {
    logger.info('Manual auto-stop check triggered', { dryRun });
    await this.queueAutoStopCheck(dryRun);
  }
}

// Export singleton instance
export const autoStopService = new AutoStopService();