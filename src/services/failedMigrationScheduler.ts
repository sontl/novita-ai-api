/**
 * Failed Migration job scheduler for automated failed migration detection and handling
 * Runs failed migration check jobs at configurable intervals with deduplication and graceful shutdown
 */

import { logger, createContextLogger, LogContext } from '../utils/logger';
import { JobQueueService } from './jobQueueService';
import { JobType, JobPriority, HandleFailedMigrationsJobPayload } from '../types/job';
import { Config } from '../config/config';

export interface FailedMigrationSchedulerStatus {
  isRunning: boolean;
  isEnabled: boolean;
  lastExecution?: Date | undefined;
  nextExecution?: Date | undefined;
  totalExecutions: number;
  failedExecutions: number;
  currentJobId?: string | undefined;
  uptime: number; // milliseconds since start
}

export interface FailedMigrationSchedulerConfig {
  enabled: boolean;
  scheduleIntervalMs: number;
  jobTimeoutMs: number;
  dryRunMode: boolean;
  logLevel: string;
}

export class FailedMigrationScheduler {
  private timer?: NodeJS.Timeout | undefined;
  private isRunning = false;
  private isShuttingDown = false;
  private startTime?: Date | undefined;
  private lastExecution?: Date | undefined;
  private totalExecutions = 0;
  private failedExecutions = 0;
  private currentJobId?: string | undefined;
  private readonly contextLogger;

  constructor(
    private readonly config: FailedMigrationSchedulerConfig,
    private readonly jobQueueService: JobQueueService
  ) {
    const logContext: LogContext = {
      service: 'failed-migration-scheduler',
      component: 'FailedMigrationScheduler'
    };
    this.contextLogger = createContextLogger(logContext);
  }

  /**
   * Start the failed migration scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.contextLogger.warn('Failed migration scheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      this.contextLogger.info('Failed migration scheduler is disabled in configuration');
      return;
    }

    if (this.isShuttingDown) {
      this.contextLogger.warn('Cannot start failed migration scheduler during shutdown');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();
    this.isShuttingDown = false;

    this.contextLogger.info('Starting failed migration scheduler', {
      scheduleIntervalMs: this.config.scheduleIntervalMs,
      enabled: this.config.enabled,
      dryRunMode: this.config.dryRunMode
    });

    // Schedule the first execution
    this.scheduleNextExecution();
  }

  /**
   * Stop the failed migration scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      this.contextLogger.warn('Failed migration scheduler is not running');
      return;
    }

    this.contextLogger.info('Stopping failed migration scheduler');

    this.isRunning = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.contextLogger.info('Failed migration scheduler stopped', {
      totalExecutions: this.totalExecutions,
      failedExecutions: this.failedExecutions,
      uptime: this.getUptime()
    });
  }

  /**
   * Graceful shutdown - stop scheduler and wait for current job to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    this.contextLogger.info('Initiating graceful shutdown', { timeoutMs });
    
    this.isShuttingDown = true;
    this.stop();

    // Wait for current job to complete if one is running
    if (this.currentJobId) {
      const startTime = Date.now();
      
      this.contextLogger.info('Waiting for current failed migration job to complete', {
        jobId: this.currentJobId
      });

      while (this.currentJobId && (Date.now() - startTime) < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.currentJobId) {
        this.contextLogger.warn('Shutdown timeout reached with job still running', {
          jobId: this.currentJobId,
          timeoutMs
        });
      } else {
        this.contextLogger.info('Current failed migration job completed during shutdown');
      }
    }

    this.contextLogger.info('Failed migration scheduler shutdown complete');
  }

  /**
   * Get current scheduler status
   */
  getStatus(): FailedMigrationSchedulerStatus {
    return {
      isRunning: this.isRunning,
      isEnabled: this.config.enabled,
      lastExecution: this.lastExecution,
      nextExecution: this.getNextExecutionTime(),
      totalExecutions: this.totalExecutions,
      failedExecutions: this.failedExecutions,
      currentJobId: this.currentJobId,
      uptime: this.getUptime()
    };
  }

  /**
   * Force immediate execution (for testing or manual triggers)
   */
  async executeNow(): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Failed migration scheduler is disabled');
    }

    if (this.isShuttingDown) {
      throw new Error('Cannot execute during shutdown');
    }

    this.contextLogger.info('Manual failed migration check execution requested');
    return await this.executeFailedMigrationJob();
  }

  /**
   * Schedule the next execution
   */
  private scheduleNextExecution(): void {
    if (!this.isRunning || this.isShuttingDown) {
      this.contextLogger.debug('Skipping schedule - not running or shutting down', {
        isRunning: this.isRunning,
        isShuttingDown: this.isShuttingDown
      });
      return;
    }

    this.contextLogger.info('Scheduling next failed migration check execution', {
      intervalMs: this.config.scheduleIntervalMs,
      nextExecutionAt: new Date(Date.now() + this.config.scheduleIntervalMs).toISOString()
    });

    this.timer = setTimeout(async () => {
      try {
        this.contextLogger.info('Executing scheduled failed migration check');
        await this.executeFailedMigrationJob();
      } catch (error) {
        this.failedExecutions++;
        this.contextLogger.error('Failed migration job execution failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          totalExecutions: this.totalExecutions,
          failedExecutions: this.failedExecutions
        });
      } finally {
        // Schedule next execution if still running
        if (this.isRunning && !this.isShuttingDown) {
          this.contextLogger.debug('Scheduling next execution after completion');
          this.scheduleNextExecution();
        } else {
          this.contextLogger.info('Not scheduling next execution - scheduler stopped or shutting down');
        }
      }
    }, this.config.scheduleIntervalMs);
  }

  /**
   * Execute a failed migration job with deduplication
   */
  private async executeFailedMigrationJob(): Promise<string> {
    // Check for existing failed migration jobs to prevent overlapping executions
    const existingJobs = this.jobQueueService.getJobs({
      type: JobType.HANDLE_FAILED_MIGRATIONS,
      limit: 10
    });

    const activeFailedMigrationJobs = existingJobs.filter(job => 
      job.status === 'pending' || job.status === 'processing'
    );

    if (activeFailedMigrationJobs.length > 0) {
      this.contextLogger.info('Skipping failed migration job - existing job in progress', {
        activeJobs: activeFailedMigrationJobs.length,
        existingJobIds: activeFailedMigrationJobs.map(job => job.id)
      });
      return activeFailedMigrationJobs[0]!.id;
    }

    // Create failed migration job payload
    const payload: HandleFailedMigrationsJobPayload = {
      scheduledAt: new Date(),
      jobId: `failed_migration_check_${Date.now()}`,
      config: {
        dryRun: this.config.dryRunMode
      }
    };

    // Add job to queue
    const jobId = await this.jobQueueService.addJob(
      JobType.HANDLE_FAILED_MIGRATIONS,
      payload,
      JobPriority.NORMAL,
      1 // No retries for failed migration checks
    );

    this.currentJobId = jobId;
    this.lastExecution = new Date();
    this.totalExecutions++;

    this.contextLogger.info('Failed migration job scheduled', {
      jobId,
      scheduledAt: payload.scheduledAt,
      dryRun: this.config.dryRunMode,
      totalExecutions: this.totalExecutions
    });

    // Monitor job completion to clear currentJobId
    this.monitorJobCompletion(jobId);

    return jobId;
  }

  /**
   * Monitor job completion to update internal state
   */
  private monitorJobCompletion(jobId: string): void {
    const checkInterval = setInterval(() => {
      const job = this.jobQueueService.getJob(jobId);
      
      if (!job) {
        // Job not found, clear current job ID
        if (this.currentJobId === jobId) {
          this.currentJobId = undefined as string | undefined;
        }
        clearInterval(checkInterval);
        return;
      }

      if (job.status === 'completed' || job.status === 'failed') {
        // Job completed, clear current job ID
        if (this.currentJobId === jobId) {
          this.currentJobId = undefined as string | undefined;
        }

        if (job.status === 'failed') {
          this.contextLogger.warn('Failed migration job failed', {
            jobId,
            error: job.error,
            attempts: job.attempts
          });
        } else {
          this.contextLogger.info('Failed migration job completed', {
            jobId,
            attempts: job.attempts
          });
        }

        clearInterval(checkInterval);
      }
    }, 1000); // Check every second

    // Set timeout to prevent infinite monitoring
    setTimeout(() => {
      clearInterval(checkInterval);
      if (this.currentJobId === jobId) {
        this.contextLogger.warn('Job monitoring timeout reached', { jobId });
        this.currentJobId = undefined as string | undefined;
      }
    }, this.config.jobTimeoutMs + 10000); // Add 10 seconds buffer
  }

  /**
   * Get next execution time
   */
  private getNextExecutionTime(): Date | undefined {
    if (!this.isRunning || !this.lastExecution) {
      return undefined;
    }
    return new Date(this.lastExecution.getTime() + this.config.scheduleIntervalMs);
  }

  /**
   * Get uptime in milliseconds
   */
  private getUptime(): number {
    if (!this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Health check for the scheduler
   */
  isHealthy(): boolean {
    // Scheduler is healthy if:
    // 1. It's enabled and running, OR it's disabled (intentionally not running)
    // 2. Not in shutdown state
    // 3. No excessive failures (more than 50% failure rate with at least 10 executions)
    
    if (this.isShuttingDown) {
      return false;
    }

    if (!this.config.enabled) {
      return true; // Disabled is a valid healthy state
    }

    if (!this.isRunning) {
      return false; // Should be running if enabled
    }

    // Check failure rate
    if (this.totalExecutions >= 10) {
      const failureRate = this.failedExecutions / this.totalExecutions;
      if (failureRate > 0.5) {
        return false; // More than 50% failure rate
      }
    }

    return true;
  }

  /**
   * Get health check details
   */
  getHealthDetails(): {
    healthy: boolean;
    status: FailedMigrationSchedulerStatus;
    issues: string[];
  } {
    const status = this.getStatus();
    const issues: string[] = [];
    
    if (this.isShuttingDown) {
      issues.push('Failed migration scheduler is shutting down');
    }
    
    if (this.config.enabled && !this.isRunning) {
      issues.push('Failed migration scheduler should be running but is stopped');
    }
    
    if (this.totalExecutions >= 10) {
      const failureRate = this.failedExecutions / this.totalExecutions;
      if (failureRate > 0.5) {
        issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
      }
    }

    return {
      healthy: this.isHealthy(),
      status,
      issues
    };
  }
}

/**
 * Create failed migration scheduler from configuration
 */
export function createFailedMigrationScheduler(
  config: Config,
  jobQueueService: JobQueueService
): FailedMigrationScheduler {
  // Use migration config as base but with different defaults for failed migration checks
  const failedMigrationConfig: FailedMigrationSchedulerConfig = {
    enabled: config.migration.enabled, // Use same enabled state as migration
    scheduleIntervalMs: config.migration.scheduleIntervalMs * 2, // Check less frequently (2x interval)
    jobTimeoutMs: config.migration.jobTimeoutMs,
    dryRunMode: config.migration.dryRunMode,
    logLevel: config.migration.logLevel
  };

  return new FailedMigrationScheduler(failedMigrationConfig, jobQueueService);
}