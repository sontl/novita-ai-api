/**
 * Redis-backed job queue service for persistent asynchronous processing
 * Maintains API compatibility with the original JobQueueService while providing Redis persistence
 */

import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('redis-job-queue');
import { IRedisClient } from '../utils/redisClient';
import { RedisJobQueueDataLayer } from './redisJobQueueDataLayer';
import {
  Job,
  JobType,
  JobStatus,
  JobPriority,
  JobQueueStats,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload,
  SendWebhookJobPayload,
  MigrateSpotInstancesJobPayload
} from '../types/job';
import { StartInstanceJobPayload } from '../types/api';
import { RedisJobQueueOptions, DEFAULT_REDIS_JOB_QUEUE_OPTIONS } from '../types/redisJobQueue';

// Simple ID generator for jobs
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Redis-backed job queue service with persistent storage and recovery capabilities
 */
export class RedisJobQueueService {
  private dataLayer: RedisJobQueueDataLayer;
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout | undefined;
  private cleanupInterval?: NodeJS.Timeout | undefined;
  private readonly processingIntervalMs: number;
  private readonly maxRetryDelay: number;
  private readonly options: Required<RedisJobQueueOptions>;
  private jobHandlers: Map<JobType, (job: Job) => Promise<void>> = new Map();

  constructor(
    redisClient: IRedisClient,
    processingIntervalMs: number = 1000,
    maxRetryDelay: number = 300000, // 5 minutes
    options: RedisJobQueueOptions = {}
  ) {
    this.options = { ...DEFAULT_REDIS_JOB_QUEUE_OPTIONS, ...options };
    this.dataLayer = new RedisJobQueueDataLayer(redisClient, this.options);
    this.processingIntervalMs = processingIntervalMs;
    this.maxRetryDelay = maxRetryDelay;
  }

  /**
   * Add a job to the queue with Redis persistence
   */
  async addJob(
    type: JobType,
    payload: CreateInstanceJobPayload | MonitorInstanceJobPayload | SendWebhookJobPayload | MigrateSpotInstancesJobPayload | StartInstanceJobPayload,
    priority: JobPriority = JobPriority.NORMAL,
    maxAttempts: number = 3
  ): Promise<string> {
    const job: Job = {
      id: generateJobId(),
      type,
      payload,
      status: JobStatus.PENDING,
      priority,
      attempts: 0,
      maxAttempts,
      createdAt: new Date()
    };

    try {
      // Persist job data to Redis
      await this.dataLayer.persistJob(job);

      // Add job to priority queue
      await this.dataLayer.addJobToQueue(job);

      logger.info('Job added to Redis queue', {
        jobId: job.id,
        type: job.type,
        priority: job.priority,
        maxAttempts: job.maxAttempts
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }

      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to add job to Redis queue', {
        jobId: job.id,
        type: job.type,
        error: errorMessage
      });
      throw new Error(`Failed to add job to queue: ${errorMessage}`);
    }
  }

  /**
   * Get job by ID from Redis storage
   */
  async getJob(jobId: string): Promise<Job | undefined> {
    try {
      const job = await this.dataLayer.loadJob(jobId);
      return job || undefined;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get job from Redis', {
        jobId,
        error: errorMessage
      });
      return undefined;
    }
  }

  /**
   * Get all jobs with optional filtering
   * Note: This method loads jobs from Redis which may be expensive for large datasets
   */
  async getJobs(filter?: {
    status?: JobStatus;
    type?: JobType;
    limit?: number;
  }): Promise<Job[]> {
    try {
      // Get all job IDs from Redis
      const jobIds = await this.dataLayer.getAllJobIds();

      // Load jobs in parallel
      const jobPromises = jobIds.map(jobId => this.dataLayer.loadJob(jobId));
      const allJobs = await Promise.all(jobPromises);

      // Filter out null results and apply filters
      let jobs = allJobs.filter((job): job is Job => job !== null);

      if (filter?.status) {
        jobs = jobs.filter(job => job.status === filter.status);
      }

      if (filter?.type) {
        jobs = jobs.filter(job => job.type === filter.type);
      }

      // Sort by priority (highest first) then by creation time
      jobs.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      if (filter?.limit) {
        jobs = jobs.slice(0, filter.limit);
      }

      return jobs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get jobs from Redis', {
        filter,
        error: errorMessage
      });
      return [];
    }
  }

  /**
   * Get queue statistics from Redis
   */
  async getStats(): Promise<JobQueueStats> {
    try {
      const [
        queueSize,
        retryQueueSize,
        processingCount,
        completedCount,
        failedCount
      ] = await Promise.all([
        this.dataLayer.getQueueSize(),
        this.dataLayer.getRetryQueueSize(),
        this.dataLayer.getProcessingJobsCount(),
        this.dataLayer.getCompletedJobsCount(),
        this.dataLayer.getFailedJobsCount()
      ]);

      // Get job counts by type (this is expensive but needed for compatibility)
      const allJobs = await this.getJobs();
      const jobsByType: Record<JobType, number> = {
        [JobType.CREATE_INSTANCE]: 0,
        [JobType.MONITOR_INSTANCE]: 0,
        [JobType.MONITOR_STARTUP]: 0,
        [JobType.SEND_WEBHOOK]: 0,
        [JobType.MIGRATE_SPOT_INSTANCES]: 0,
        [JobType.AUTO_STOP_CHECK]: 0,
        [JobType.HANDLE_FAILED_MIGRATIONS]: 0
      };

      allJobs.forEach(job => {
        jobsByType[job.type]++;
      });

      const stats: JobQueueStats = {
        totalJobs: queueSize + retryQueueSize + processingCount + completedCount + failedCount,
        pendingJobs: queueSize + retryQueueSize,
        processingJobs: processingCount,
        completedJobs: completedCount,
        failedJobs: failedCount,
        jobsByType
      };

      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get queue stats from Redis', {
        error: errorMessage
      });

      // Return empty stats on error
      return {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        jobsByType: {
          [JobType.CREATE_INSTANCE]: 0,
          [JobType.MONITOR_INSTANCE]: 0,
          [JobType.MONITOR_STARTUP]: 0,
          [JobType.SEND_WEBHOOK]: 0,
          [JobType.MIGRATE_SPOT_INSTANCES]: 0,
          [JobType.AUTO_STOP_CHECK]: 0,
          [JobType.HANDLE_FAILED_MIGRATIONS]: 0
        }
      };
    }
  }

  /**
   * Start background processing with Redis-based job recovery
   */
  startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.info('Starting Redis job queue processing');

    // Start main processing loop
    this.processingInterval = setInterval(() => {
      this.processNextJob().catch(error => {
        logger.error('Error in job processing loop', { error: error.message });
      });
    }, this.processingIntervalMs);

    // Start cleanup and recovery tasks
    this.cleanupInterval = setInterval(() => {
      this.performMaintenanceTasks().catch(error => {
        logger.error('Error in maintenance tasks', { error: error.message });
      });
    }, this.options.cleanupIntervalMs);

    // Perform initial recovery
    this.performRecoveryTasks().catch(error => {
      logger.error('Error in initial recovery tasks', { error: error.message });
    });
  }

  /**
   * Stop background processing
   */
  stopProcessing(): void {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    logger.info('Stopped Redis job queue processing');
  }

  /**
   * Process the next available job from Redis
   */
  private async processNextJob(): Promise<void> {
    try {
      // First, move any retry jobs that are ready back to the main queue
      await this.dataLayer.moveRetryJobsToQueue();

      // Get the next job from the priority queue
      const jobId = await this.dataLayer.getNextJobFromQueue();
      if (!jobId) {
        return;
      }

      // Load the job data
      const job = await this.dataLayer.loadJob(jobId);
      if (!job) {
        logger.warn('Job not found in Redis storage, removing from queue', { jobId });
        await this.dataLayer.removeJobFromQueue(jobId);
        return;
      }

      // Check if job is ready to be processed (not waiting for retry)
      if (job.nextRetryAt && job.nextRetryAt > new Date()) {
        // Job is not ready yet, add back to retry queue
        await this.dataLayer.addJobToRetryQueue(job);
        return;
      }

      await this.processJob(job);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing next job', { error: errorMessage });
    }
  }

  /**
   * Check if a job type is ephemeral (should not persist data after completion)
   * Ephemeral jobs are routine/scheduled checks that run frequently and don't need historical data
   */
  private isEphemeralJobType(type: JobType): boolean {
    const ephemeralTypes = [
      JobType.AUTO_STOP_CHECK,
      // Add other ephemeral job types here as needed
    ];
    return ephemeralTypes.includes(type);
  }

  /**
   * Process a specific job with Redis state management
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();
    const isEphemeral = this.isEphemeralJobType(job.type);

    try {
      // Move job to processing state in Redis
      await this.dataLayer.moveJobToProcessing(job.id);

      // Update job status and persist
      job.status = JobStatus.PROCESSING;
      job.processedAt = new Date();
      job.attempts++;
      await this.dataLayer.persistJob(job);

      logger.info('Processing job from Redis', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        isEphemeral
      });

      // Execute the job
      await this.executeJob(job);

      // Mark as completed
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      delete job.error;

      // Remove from processing state
      await this.dataLayer.removeJobFromProcessing(job.id);

      // For ephemeral jobs, delete the job data immediately instead of persisting
      if (isEphemeral) {
        await this.dataLayer.deleteJob(job.id);
        logger.debug('Ephemeral job data deleted after completion', {
          jobId: job.id,
          type: job.type
        });
      } else {
        // Persist final state and update Redis tracking for non-ephemeral jobs
        await this.dataLayer.persistJob(job);
        await this.dataLayer.addJobToCompleted(job.id);
      }

      const processingTime = Date.now() - startTime;

      logger.info('Job completed successfully in Redis', {
        operation: 'job_processing',
        duration: processingTime,
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        processingTimeMs: processingTime,
        ephemeralCleanup: isEphemeral
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processingTime = Date.now() - startTime;

      logger.error('Job processing failed in Redis', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: errorMessage,
        processingTimeMs: processingTime
      });

      job.error = errorMessage;

      try {
        // Remove from processing state
        await this.dataLayer.removeJobFromProcessing(job.id);

        // For ephemeral jobs, don't retry - just delete the job data
        if (isEphemeral) {
          await this.dataLayer.deleteJob(job.id);
          logger.info('Ephemeral job deleted after failure (no retry)', {
            jobId: job.id,
            type: job.type,
            error: errorMessage
          });
          return;
        }

        // Check if we should retry (only for non-ephemeral jobs)
        if (job.attempts < job.maxAttempts) {
          // Calculate retry delay with exponential backoff
          const baseDelay = 100; // 100ms for faster testing
          const delay = Math.min(
            baseDelay * Math.pow(2, job.attempts - 1),
            this.maxRetryDelay
          );

          job.status = JobStatus.PENDING;
          job.nextRetryAt = new Date(Date.now() + delay);

          // Persist job and add to retry queue
          await this.dataLayer.persistJob(job);
          await this.dataLayer.addJobToRetryQueue(job);

          logger.info('Job scheduled for retry in Redis', {
            jobId: job.id,
            type: job.type,
            nextRetryAt: job.nextRetryAt,
            delayMs: delay
          });
        } else {
          // Max attempts reached, mark as failed
          job.status = JobStatus.FAILED;
          job.completedAt = new Date();

          // Persist final state and update Redis tracking
          await this.dataLayer.persistJob(job);
          await this.dataLayer.addJobToFailed(job.id);

          logger.error('Job failed permanently in Redis', {
            jobId: job.id,
            type: job.type,
            attempts: job.attempts,
            error: errorMessage
          });
        }
      } catch (persistError) {
        const persistErrorMessage = persistError instanceof Error ? persistError.message : 'Unknown error';
        logger.error('Failed to persist job error state to Redis', {
          jobId: job.id,
          originalError: errorMessage,
          persistError: persistErrorMessage
        });
      }
    }
  }

  /**
   * Register a job handler for a specific job type
   */
  registerHandler(type: JobType, handler: (job: Job) => Promise<void>): void {
    this.jobHandlers.set(type, handler);
    logger.info('Job handler registered for Redis queue', { type });
  }

  /**
   * Execute job based on its type using registered handlers
   */
  private async executeJob(job: Job): Promise<void> {
    const handler = this.jobHandlers.get(job.type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }

    await handler(job);
  }

  /**
   * Clean up completed and failed jobs older than specified time
   * Uses Redis-based cleanup for better performance
   */
  async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> { // Default: 24 hours
    try {
      const [completedCleaned, failedCleaned] = await Promise.all([
        this.dataLayer.cleanupCompletedJobs(),
        this.dataLayer.cleanupFailedJobs()
      ]);

      const totalCleaned = completedCleaned + failedCleaned;

      if (totalCleaned > 0) {
        logger.info('Cleaned up old jobs from Redis', {
          completedCleaned,
          failedCleaned,
          totalCleaned
        });
      }

      return totalCleaned;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cleanup old jobs from Redis', {
        error: errorMessage
      });
      return 0;
    }
  }

  /**
   * Perform maintenance tasks including stale job recovery
   */
  private async performMaintenanceTasks(): Promise<void> {
    try {
      // Clean up stale processing jobs
      await this.dataLayer.cleanupStaleProcessingJobs();

      // Clean up old completed and failed jobs
      await this.cleanup();

      // Move retry jobs back to main queue if ready
      await this.dataLayer.moveRetryJobsToQueue();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in maintenance tasks', { error: errorMessage });
    }
  }

  /**
   * Perform recovery tasks on startup
   */
  private async performRecoveryTasks(): Promise<void> {
    try {
      logger.info('Performing Redis job queue recovery tasks');

      // Clean up any stale processing jobs from previous runs
      const recoveredJobs = await this.dataLayer.cleanupStaleProcessingJobs();

      // Move any ready retry jobs back to main queue
      const movedJobs = await this.dataLayer.moveRetryJobsToQueue();

      logger.info('Redis job queue recovery completed', {
        recoveredJobs,
        movedJobs
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in recovery tasks', { error: errorMessage });
    }
  }

  /**
   * Graceful shutdown - wait for current jobs to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info('Shutting down Redis job queue service');

    this.stopProcessing();

    // Wait for processing jobs to complete
    const startTime = Date.now();
    while ((Date.now() - startTime) < timeoutMs) {
      try {
        const processingCount = await this.dataLayer.getProcessingJobsCount();
        if (processingCount === 0) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error('Error checking processing jobs during shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        break;
      }
    }

    try {
      const remainingJobs = await this.dataLayer.getProcessingJobsCount();
      if (remainingJobs > 0) {
        logger.warn('Shutdown timeout reached with processing jobs remaining in Redis', { remainingJobs });
      } else {
        logger.info('Redis job queue service shutdown complete');
      }
    } catch (error) {
      logger.error('Error during final shutdown check', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}