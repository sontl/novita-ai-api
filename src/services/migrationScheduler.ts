/**
 * Migration job scheduler for automated spot instance migration
 * Runs migration jobs at configurable intervals with deduplication and graceful shutdown
 */

import { createContextLogger, LogContext } from '../utils/logger';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('migration-scheduler');
import { RedisJobQueueService } from './redisJobQueueService';
import { JobType, JobPriority, MigrateSpotInstancesJobPayload } from '../types/job';
import { Config } from '../config/config';

export interface SchedulerStatus {
  isRunning: boolean;
  isEnabled: boolean;
  lastExecution?: Date | undefined;
  nextExecution?: Date | undefined;
  totalExecutions: number;
  failedExecutions: number;
  currentJobId?: string | undefined;
  uptime: number; // milliseconds since start
}

export interface MigrationSchedulerConfig {
  enabled: boolean;
  scheduleIntervalMs: number;
  jobTimeoutMs: number;
  maxConcurrentMigrations: number;
  dryRunMode: boolean;
  retryFailedMigrations: boolean;
  logLevel: string;
}

export class MigrationScheduler {
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
    private readonly config: MigrationSchedulerConfig,
    private readonly jobQueueService: RedisJobQueueService
  ) {
    const logContext: LogContext = {
      service: 'migration-scheduler',
      component: 'MigrationScheduler'
    };
    this.contextLogger = createContextLogger(logContext);
  }

  /**
   * Start the migration scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.contextLogger.warn('Scheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      this.contextLogger.info('Migration scheduler is disabled in configuration');
      return;
    }

    if (this.isShuttingDown) {
      this.contextLogger.warn('Cannot start scheduler during shutdown');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();
    this.isShuttingDown = false;

    this.contextLogger.info('Starting migration scheduler', {
      scheduleIntervalMs: this.config.scheduleIntervalMs,
      enabled: this.config.enabled,
      dryRunMode: this.config.dryRunMode
    });

    // Schedule the first execution
    this.scheduleNextExecution();
  }

  /**
   * Stop the migration scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      this.contextLogger.warn('Scheduler is not running');
      return;
    }

    this.contextLogger.info('Stopping migration scheduler');

    this.isRunning = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.contextLogger.info('Migration scheduler stopped', {
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
      
      this.contextLogger.info('Waiting for current migration job to complete', {
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
        this.contextLogger.info('Current migration job completed during shutdown');
      }
    }

    this.contextLogger.info('Migration scheduler shutdown complete');
  }

  /**
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
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
      throw new Error('Migration scheduler is disabled');
    }

    if (this.isShuttingDown) {
      throw new Error('Cannot execute during shutdown');
    }

    this.contextLogger.info('Manual migration execution requested');
    return await this.executeMigrationJob();
  }

  /**
   * Schedule the next execution
   */
  private scheduleNextExecution(): void {
    if (!this.isRunning || this.isShuttingDown) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.executeMigrationJob();
      } catch (error) {
        this.failedExecutions++;
        this.contextLogger.error('Migration job execution failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          totalExecutions: this.totalExecutions,
          failedExecutions: this.failedExecutions
        });
      } finally {
        // Schedule next execution if still running
        if (this.isRunning && !this.isShuttingDown) {
          this.scheduleNextExecution();
        }
      }
    }, this.config.scheduleIntervalMs);
  }

  /**
   * Execute a migration job with deduplication
   */
  private async executeMigrationJob(): Promise<string> {
    // Check for existing migration jobs to prevent overlapping executions
    const existingJobs = await this.jobQueueService.getJobs({
      type: JobType.MIGRATE_SPOT_INSTANCES,
      limit: 10
    });

    const activeMigrationJobs = existingJobs.filter(job => 
      job.status === 'pending' || job.status === 'processing'
    );

    if (activeMigrationJobs.length > 0) {
      this.contextLogger.info('Skipping migration job - existing job in progress', {
        activeJobs: activeMigrationJobs.length,
        existingJobIds: activeMigrationJobs.map(job => job.id)
      });
      return activeMigrationJobs[0]!.id;
    }

    // Create migration job payload
    const payload: MigrateSpotInstancesJobPayload = {
      scheduledAt: new Date(),
      jobId: `migration_${Date.now()}`,
      config: {
        dryRun: this.config.dryRunMode,
        maxMigrations: this.config.maxConcurrentMigrations
      }
    };

    // Add job to queue
    const jobId = await this.jobQueueService.addJob(
      JobType.MIGRATE_SPOT_INSTANCES,
      payload,
      JobPriority.NORMAL,
      this.config.retryFailedMigrations ? 3 : 1
    );

    this.currentJobId = jobId;
    this.lastExecution = new Date();
    this.totalExecutions++;

    this.contextLogger.info('Migration job scheduled', {
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
    const checkInterval = setInterval(async () => {
      const job = await this.jobQueueService.getJob(jobId);
      
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
          this.contextLogger.warn('Migration job failed', {
            jobId,
            error: job.error,
            attempts: job.attempts
          });
        } else {
          this.contextLogger.info('Migration job completed', {
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
    status: SchedulerStatus;
    issues: string[];
  } {
    const status = this.getStatus();
    const issues: string[] = [];
    
    if (this.isShuttingDown) {
      issues.push('Scheduler is shutting down');
    }
    
    if (this.config.enabled && !this.isRunning) {
      issues.push('Scheduler should be running but is stopped');
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
 * Create migration scheduler from configuration
 */
export function createMigrationScheduler(
  config: Config,
  jobQueueService: RedisJobQueueService
): MigrationScheduler {
  return new MigrationScheduler(config.migration, jobQueueService);
}