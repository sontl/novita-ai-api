/**
 * Redis job queue data structures and types
 */

import { Job, JobType, JobStatus, JobPriority } from './job';

/**
 * Redis key structure for job queue operations
 */
export class RedisJobQueueKeys {
  private readonly keyPrefix: string;

  constructor(keyPrefix: string = 'jobs') {
    this.keyPrefix = keyPrefix;
  }

  /**
   * Get the key for the priority queue (sorted set)
   * Jobs are stored with priority as score for automatic ordering
   */
  getPriorityQueueKey(): string {
    return `${this.keyPrefix}:queue`;
  }

  /**
   * Get the key for processing jobs hash
   * Contains job IDs currently being processed with timestamps
   */
  getProcessingKey(): string {
    return `${this.keyPrefix}:processing`;
  }

  /**
   * Get the key for job data hash
   * Contains serialized job data indexed by job ID
   */
  getJobDataKey(jobId: string): string {
    return `${this.keyPrefix}:data:${jobId}`;
  }

  /**
   * Get the key for job statistics
   */
  getStatsKey(): string {
    return `${this.keyPrefix}:stats`;
  }

  /**
   * Get the key for retry queue (sorted set)
   * Jobs waiting for retry are stored with retry timestamp as score
   */
  getRetryQueueKey(): string {
    return `${this.keyPrefix}:retry`;
  }

  /**
   * Get the key for completed jobs list (for cleanup)
   */
  getCompletedKey(): string {
    return `${this.keyPrefix}:completed`;
  }

  /**
   * Get the key for failed jobs list (for cleanup)
   */
  getFailedKey(): string {
    return `${this.keyPrefix}:failed`;
  }

  /**
   * Get pattern for all job data keys
   */
  getJobDataPattern(): string {
    return `${this.keyPrefix}:data:*`;
  }
}

/**
 * Serializable job data structure for Redis storage
 */
export interface RedisJobData {
  id: string;
  type: JobType;
  payload: string; // Serialized payload
  status: JobStatus;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: string; // ISO date string
  processedAt?: string; // ISO date string
  completedAt?: string; // ISO date string
  nextRetryAt?: string; // ISO date string
  error?: string;
}

/**
 * Job queue entry for priority queue (sorted set)
 */
export interface JobQueueEntry {
  jobId: string;
  priority: JobPriority;
  createdAt: Date;
}

/**
 * Processing job entry for tracking active jobs
 */
export interface ProcessingJobEntry {
  jobId: string;
  startedAt: string; // ISO date string
  workerId?: string; // Optional worker identifier
}

/**
 * Retry job entry for delayed retry queue
 */
export interface RetryJobEntry {
  jobId: string;
  retryAt: Date;
  attempt: number;
}

/**
 * Job queue statistics stored in Redis
 */
export interface RedisJobQueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryJobs: number;
  jobsByType: Record<JobType, number>;
  lastUpdated: string; // ISO date string
}

/**
 * Utility class for job serialization/deserialization
 */
export class JobSerializer {
  /**
   * Convert a Job object to RedisJobData for storage
   */
  static toRedisJobData(job: Job): RedisJobData {
    // Import the RedisSerializer for proper Date handling
    const { defaultSerializer } = require('../utils/redisSerializer');
    
    const redisData: RedisJobData = {
      id: job.id,
      type: job.type,
      payload: defaultSerializer.serialize(job.payload),
      status: job.status,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt.toISOString()
    };

    if (job.processedAt) {
      redisData.processedAt = job.processedAt.toISOString();
    }
    if (job.completedAt) {
      redisData.completedAt = job.completedAt.toISOString();
    }
    if (job.nextRetryAt) {
      redisData.nextRetryAt = job.nextRetryAt.toISOString();
    }
    if (job.error) {
      redisData.error = job.error;
    }

    return redisData;
  }

  /**
   * Convert RedisJobData back to Job object
   */
  static fromRedisJobData(redisData: RedisJobData): Job {
    // Import the RedisSerializer for proper Date handling
    const { defaultSerializer } = require('../utils/redisSerializer');
    
    const job: Job = {
      id: redisData.id,
      type: redisData.type,
      payload: defaultSerializer.deserialize(redisData.payload),
      status: redisData.status,
      priority: redisData.priority,
      attempts: redisData.attempts,
      maxAttempts: redisData.maxAttempts,
      createdAt: new Date(redisData.createdAt)
    };

    if (redisData.processedAt) {
      job.processedAt = new Date(redisData.processedAt);
    }
    if (redisData.completedAt) {
      job.completedAt = new Date(redisData.completedAt);
    }
    if (redisData.nextRetryAt) {
      job.nextRetryAt = new Date(redisData.nextRetryAt);
    }
    if (redisData.error) {
      job.error = redisData.error;
    }

    return job;
  }

  /**
   * Calculate priority score for sorted set
   * Higher priority jobs get higher scores for proper ordering
   * Tie-breaker uses creation timestamp (earlier jobs get higher priority)
   */
  static calculatePriorityScore(job: Job): number {
    // Priority ranges: CRITICAL=4, HIGH=3, NORMAL=2, LOW=1
    // Use priority * 1000000 + (max_timestamp - created_timestamp) for tie-breaking
    const maxTimestamp = 9999999999999; // Year 2286
    const timeScore = maxTimestamp - job.createdAt.getTime();
    return job.priority * 1000000 + timeScore;
  }

  /**
   * Calculate retry score for retry queue
   * Uses the retry timestamp as score for automatic scheduling
   */
  static calculateRetryScore(retryAt: Date): number {
    return retryAt.getTime();
  }
}

/**
 * Redis job queue configuration options
 */
export interface RedisJobQueueOptions {
  keyPrefix?: string;
  processingTimeoutMs?: number; // How long before a processing job is considered stale
  retryDelayMs?: number; // Base retry delay
  maxRetryDelayMs?: number; // Maximum retry delay
  cleanupIntervalMs?: number; // How often to cleanup completed/failed jobs
  maxCompletedJobs?: number; // Maximum number of completed jobs to keep
  maxFailedJobs?: number; // Maximum number of failed jobs to keep
}

/**
 * Default configuration for Redis job queue
 */
export const DEFAULT_REDIS_JOB_QUEUE_OPTIONS: Required<RedisJobQueueOptions> = {
  keyPrefix: 'jobs',
  processingTimeoutMs: 300000, // 5 minutes
  retryDelayMs: 1000, // 1 second base delay
  maxRetryDelayMs: 300000, // 5 minutes max delay
  cleanupIntervalMs: 3600000, // 1 hour
  maxCompletedJobs: 1000,
  maxFailedJobs: 1000
};