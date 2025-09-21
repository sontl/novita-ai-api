/**
 * In-memory job queue service for asynchronous processing
 */

// Simple ID generator for jobs
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
import { logger } from '../utils/logger';
import { recordJobMetrics } from '../middleware/metricsMiddleware';
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

export class JobQueueService {
  private jobs: Map<string, Job> = new Map();
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout | undefined;
  private readonly processingIntervalMs: number;
  private readonly maxRetryDelay: number;

  constructor(
    processingIntervalMs: number = 1000,
    maxRetryDelay: number = 300000 // 5 minutes
  ) {
    this.processingIntervalMs = processingIntervalMs;
    this.maxRetryDelay = maxRetryDelay;
  }

  /**
   * Add a job to the queue
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

    this.jobs.set(job.id, job);
    
    logger.info('Job added to queue', {
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
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs with optional filtering
   */
  getJobs(filter?: {
    status?: JobStatus;
    type?: JobType;
    limit?: number;
  }): Job[] {
    let jobs = Array.from(this.jobs.values());

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
  }

  /**
   * Get queue statistics
   */
  getStats(): JobQueueStats {
    const jobs = Array.from(this.jobs.values());
    
    const stats: JobQueueStats = {
      totalJobs: jobs.length,
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
        [JobType.AUTO_STOP_CHECK]: 0
      }
    };

    jobs.forEach(job => {
      switch (job.status) {
        case JobStatus.PENDING:
          stats.pendingJobs++;
          break;
        case JobStatus.PROCESSING:
          stats.processingJobs++;
          break;
        case JobStatus.COMPLETED:
          stats.completedJobs++;
          break;
        case JobStatus.FAILED:
          stats.failedJobs++;
          break;
      }
      
      stats.jobsByType[job.type]++;
    });

    return stats;
  }

  /**
   * Start background processing
   */
  startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.info('Starting job queue processing');

    this.processingInterval = setInterval(() => {
      this.processNextJob().catch(error => {
        logger.error('Error in job processing loop', { error: error.message });
      });
    }, this.processingIntervalMs);
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

    logger.info('Stopped job queue processing');
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    const job = this.getNextJob();
    if (!job) {
      return;
    }

    await this.processJob(job);
  }

  /**
   * Get the next job to process
   */
  private getNextJob(): Job | undefined {
    const now = new Date();
    
    // Get pending jobs that are ready to be processed (not waiting for retry)
    const availableJobs = this.getJobs({ status: JobStatus.PENDING })
      .filter(job => !job.nextRetryAt || job.nextRetryAt <= now);

    return availableJobs[0]; // Already sorted by priority and creation time
  }

  /**
   * Process a specific job
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update job status to processing
      job.status = JobStatus.PROCESSING;
      job.processedAt = new Date();
      job.attempts++;

      logger.info('Processing job', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts
      });

      // Process based on job type
      await this.executeJob(job);

      // Mark as completed
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      delete job.error;

      // Record successful job metrics
      const processingTime = Date.now() - startTime;
      const queueSize = this.getStats().pendingJobs;
      recordJobMetrics(job.type, processingTime, true, queueSize);

      logger.info('Job completed successfully', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        processingTimeMs: processingTime
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processingTime = Date.now() - startTime;
      
      logger.error('Job processing failed', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: errorMessage,
        processingTimeMs: processingTime
      });

      job.error = errorMessage;

      // Check if we should retry
      if (job.attempts < job.maxAttempts) {
        // Calculate retry delay with exponential backoff
        const baseDelay = 100; // 100ms for faster testing
        const delay = Math.min(
          baseDelay * Math.pow(2, job.attempts - 1),
          this.maxRetryDelay
        );
        
        job.status = JobStatus.PENDING;
        job.nextRetryAt = new Date(Date.now() + delay);

        logger.info('Job scheduled for retry', {
          jobId: job.id,
          type: job.type,
          nextRetryAt: job.nextRetryAt,
          delayMs: delay
        });
      } else {
        // Max attempts reached, mark as failed
        job.status = JobStatus.FAILED;
        job.completedAt = new Date();

        // Record failed job metrics
        const queueSize = this.getStats().pendingJobs;
        recordJobMetrics(job.type, processingTime, false, queueSize);

        logger.error('Job failed permanently', {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          error: errorMessage
        });
      }
    }
  }

  /**
   * Register a job handler for a specific job type
   */
  private jobHandlers: Map<JobType, (job: Job) => Promise<void>> = new Map();

  registerHandler(type: JobType, handler: (job: Job) => Promise<void>): void {
    this.jobHandlers.set(type, handler);
    logger.info('Job handler registered', { type });
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
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): number { // Default: 24 hours
    const cutoffTime = new Date(Date.now() - olderThanMs);
    let removedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) &&
        job.completedAt &&
        job.completedAt < cutoffTime
      ) {
        this.jobs.delete(jobId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('Cleaned up old jobs', { removedCount, cutoffTime });
    }

    return removedCount;
  }

  /**
   * Graceful shutdown - wait for current jobs to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info('Shutting down job queue service');
    
    this.stopProcessing();

    // Wait for processing jobs to complete
    const startTime = Date.now();
    while (this.getStats().processingJobs > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const remainingJobs = this.getStats().processingJobs;
    if (remainingJobs > 0) {
      logger.warn('Shutdown timeout reached with processing jobs remaining', { remainingJobs });
    } else {
      logger.info('Job queue service shutdown complete');
    }
  }
}

// Export singleton instance
export const jobQueueService = new JobQueueService();