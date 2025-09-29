/**
 * Redis job queue data persistence layer
 * Handles low-level Redis operations for job queue management
 */

import { IRedisClient } from '../utils/redisClient';
import { Job, JobStatus, JobPriority } from '../types/job';
import {
  RedisJobQueueKeys,
  RedisJobData,
  JobQueueEntry,
  ProcessingJobEntry,
  RetryJobEntry,
  JobSerializer,
  RedisJobQueueOptions,
  DEFAULT_REDIS_JOB_QUEUE_OPTIONS
} from '../types/redisJobQueue';
import { logger } from '../utils/logger';

/**
 * Redis job queue data layer for managing job persistence
 */
export class RedisJobQueueDataLayer {
  private redisClient: IRedisClient;
  private keys: RedisJobQueueKeys;
  private options: Required<RedisJobQueueOptions>;

  constructor(
    redisClient: IRedisClient,
    options: RedisJobQueueOptions = {}
  ) {
    this.redisClient = redisClient;
    this.options = { ...DEFAULT_REDIS_JOB_QUEUE_OPTIONS, ...options };
    this.keys = new RedisJobQueueKeys(this.options.keyPrefix);
  }

  /**
   * Persist a job to Redis storage
   */
  async persistJob(job: Job): Promise<void> {
    const redisJobData = JobSerializer.toRedisJobData(job);
    const jobDataKey = this.keys.getJobDataKey(job.id);

    // Store job data as a hash
    await this.redisClient.hset(jobDataKey, 'data', redisJobData);

    logger.debug('Job persisted to Redis', {
      jobId: job.id,
      type: job.type,
      status: job.status,
      key: jobDataKey
    });
  }

  /**
   * Load a job from Redis storage
   */
  async loadJob(jobId: string): Promise<Job | null> {
    const jobDataKey = this.keys.getJobDataKey(jobId);
    const redisJobData = await this.redisClient.hget<RedisJobData>(jobDataKey, 'data');

    if (!redisJobData) {
      return null;
    }

    const job = JobSerializer.fromRedisJobData(redisJobData);

    logger.debug('Job loaded from Redis', {
      jobId: job.id,
      type: job.type,
      status: job.status,
      key: jobDataKey
    });

    return job;
  }

  /**
   * Delete a job from Redis storage
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const jobDataKey = this.keys.getJobDataKey(jobId);
    const deleted = await this.redisClient.del(jobDataKey);

    if (deleted) {
      logger.debug('Job deleted from Redis', {
        jobId,
        key: jobDataKey
      });
    }

    return deleted;
  }

  /**
   * Add a job to the priority queue
   */
  async addJobToQueue(job: Job): Promise<void> {
    const queueKey = this.keys.getPriorityQueueKey();
    const score = JobSerializer.calculatePriorityScore(job);

    await this.redisClient.zadd(queueKey, score, job.id);

    logger.debug('Job added to priority queue', {
      jobId: job.id,
      priority: job.priority,
      score,
      key: queueKey
    });
  }

  /**
   * Remove a job from the priority queue
   */
  async removeJobFromQueue(jobId: string): Promise<boolean> {
    const queueKey = this.keys.getPriorityQueueKey();
    const removed = await this.redisClient.zrem(queueKey, jobId);

    if (removed > 0) {
      logger.debug('Job removed from priority queue', {
        jobId,
        key: queueKey
      });
    }

    return removed > 0;
  }

  /**
   * Get the next job from the priority queue (highest priority first)
   */
  async getNextJobFromQueue(): Promise<string | null> {
    const queueKey = this.keys.getPriorityQueueKey();
    
    // Get the highest priority job (highest score)
    const jobIds = await this.redisClient.zrevrange(queueKey, 0, 0);
    
    if (jobIds.length === 0) {
      return null;
    }

    const jobId = jobIds[0];
    if (!jobId) {
      return null;
    }

    logger.debug('Next job retrieved from priority queue', {
      jobId,
      key: queueKey
    });

    return jobId;
  }

  /**
   * Get multiple jobs from the priority queue
   */
  async getJobsFromQueue(limit: number = 10): Promise<string[]> {
    const queueKey = this.keys.getPriorityQueueKey();
    
    // Get jobs in descending order (highest priority first)
    const jobIds = await this.redisClient.zrevrange(queueKey, 0, limit - 1);

    logger.debug('Multiple jobs retrieved from priority queue', {
      count: jobIds.length,
      limit,
      key: queueKey
    });

    return jobIds;
  }

  /**
   * Move a job to processing state
   */
  async moveJobToProcessing(jobId: string, workerId?: string): Promise<void> {
    const processingKey = this.keys.getProcessingKey();
    const processingEntry: ProcessingJobEntry = {
      jobId,
      startedAt: new Date().toISOString(),
      ...(workerId && { workerId })
    };

    // Add to processing hash
    await this.redisClient.hset(processingKey, jobId, processingEntry);

    // Remove from priority queue
    await this.removeJobFromQueue(jobId);

    logger.debug('Job moved to processing', {
      jobId,
      workerId,
      key: processingKey
    });
  }

  /**
   * Remove a job from processing state
   */
  async removeJobFromProcessing(jobId: string): Promise<boolean> {
    const processingKey = this.keys.getProcessingKey();
    const removed = await this.redisClient.hdel(processingKey, jobId);

    if (removed) {
      logger.debug('Job removed from processing', {
        jobId,
        key: processingKey
      });
    }

    return removed;
  }

  /**
   * Get all jobs currently being processed
   */
  async getProcessingJobs(): Promise<ProcessingJobEntry[]> {
    const processingKey = this.keys.getProcessingKey();
    const processingData = await this.redisClient.hgetall<ProcessingJobEntry>(processingKey);

    const processingJobs = Object.values(processingData);

    logger.debug('Processing jobs retrieved', {
      count: processingJobs.length,
      key: processingKey
    });

    return processingJobs;
  }

  /**
   * Add a job to the retry queue
   */
  async addJobToRetryQueue(job: Job): Promise<void> {
    if (!job.nextRetryAt) {
      throw new Error('Job must have nextRetryAt set to be added to retry queue');
    }

    const retryKey = this.keys.getRetryQueueKey();
    const score = JobSerializer.calculateRetryScore(job.nextRetryAt);

    await this.redisClient.zadd(retryKey, score, job.id);

    logger.debug('Job added to retry queue', {
      jobId: job.id,
      retryAt: job.nextRetryAt.toISOString(),
      score,
      key: retryKey
    });
  }

  /**
   * Remove a job from the retry queue
   */
  async removeJobFromRetryQueue(jobId: string): Promise<boolean> {
    const retryKey = this.keys.getRetryQueueKey();
    const removed = await this.redisClient.zrem(retryKey, jobId);

    if (removed > 0) {
      logger.debug('Job removed from retry queue', {
        jobId,
        key: retryKey
      });
    }

    return removed > 0;
  }

  /**
   * Get jobs ready for retry (retry time has passed)
   */
  async getJobsReadyForRetry(): Promise<string[]> {
    const retryKey = this.keys.getRetryQueueKey();
    const now = Date.now();

    // Get jobs with retry time <= now
    const jobIds = await this.redisClient.zrangebyscore(retryKey, 0, now);

    if (jobIds.length > 0) {
      logger.debug('Jobs ready for retry retrieved', {
        count: jobIds.length,
        key: retryKey
      });
    }

    return jobIds;
  }

  /**
   * Move jobs from retry queue back to main queue
   */
  async moveRetryJobsToQueue(): Promise<number> {
    const jobIds = await this.getJobsReadyForRetry();
    let movedCount = 0;

    for (const jobId of jobIds) {
      try {
        // Load the job to get its current state
        const job = await this.loadJob(jobId);
        if (!job) {
          // Job doesn't exist, remove from retry queue
          await this.removeJobFromRetryQueue(jobId);
          continue;
        }

        // Reset retry state and add back to main queue
        job.status = JobStatus.PENDING;
        delete (job as any).nextRetryAt;

        await this.persistJob(job);
        await this.addJobToQueue(job);
        await this.removeJobFromRetryQueue(jobId);

        movedCount++;

        logger.debug('Job moved from retry queue to main queue', {
          jobId: job.id,
          attempt: job.attempts
        });
      } catch (error) {
        logger.error('Failed to move job from retry queue', {
          jobId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (movedCount > 0) {
      logger.info('Jobs moved from retry queue to main queue', {
        movedCount,
        totalReady: jobIds.length
      });
    }

    return movedCount;
  }

  /**
   * Add a job to completed list for tracking
   */
  async addJobToCompleted(jobId: string): Promise<void> {
    const completedKey = this.keys.getCompletedKey();
    const timestamp = Date.now();

    await this.redisClient.zadd(completedKey, timestamp, jobId);

    logger.debug('Job added to completed list', {
      jobId,
      key: completedKey
    });
  }

  /**
   * Add a job to failed list for tracking
   */
  async addJobToFailed(jobId: string): Promise<void> {
    const failedKey = this.keys.getFailedKey();
    const timestamp = Date.now();

    await this.redisClient.zadd(failedKey, timestamp, jobId);

    logger.debug('Job added to failed list', {
      jobId,
      key: failedKey
    });
  }

  /**
   * Get queue size (number of pending jobs)
   */
  async getQueueSize(): Promise<number> {
    const queueKey = this.keys.getPriorityQueueKey();
    return await this.redisClient.zcard(queueKey);
  }

  /**
   * Get retry queue size
   */
  async getRetryQueueSize(): Promise<number> {
    const retryKey = this.keys.getRetryQueueKey();
    return await this.redisClient.zcard(retryKey);
  }

  /**
   * Get processing jobs count
   */
  async getProcessingJobsCount(): Promise<number> {
    const processingKey = this.keys.getProcessingKey();
    const processingData = await this.redisClient.hgetall(processingKey);
    return Object.keys(processingData).length;
  }

  /**
   * Get completed jobs count
   */
  async getCompletedJobsCount(): Promise<number> {
    const completedKey = this.keys.getCompletedKey();
    return await this.redisClient.zcard(completedKey);
  }

  /**
   * Get failed jobs count
   */
  async getFailedJobsCount(): Promise<number> {
    const failedKey = this.keys.getFailedKey();
    return await this.redisClient.zcard(failedKey);
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupCompletedJobs(): Promise<number> {
    const completedKey = this.keys.getCompletedKey();
    const totalCompleted = await this.redisClient.zcard(completedKey);

    if (totalCompleted <= this.options.maxCompletedJobs) {
      return 0;
    }

    const toRemove = totalCompleted - this.options.maxCompletedJobs;
    
    // Remove oldest completed jobs (lowest scores)
    const removed = await this.redisClient.zremrangebyscore(
      completedKey,
      0,
      Date.now() - (toRemove * 1000) // Approximate cleanup
    );

    if (removed > 0) {
      logger.info('Cleaned up old completed jobs', {
        removed,
        remaining: totalCompleted - removed,
        maxAllowed: this.options.maxCompletedJobs
      });
    }

    return removed;
  }

  /**
   * Clean up old failed jobs
   */
  async cleanupFailedJobs(): Promise<number> {
    const failedKey = this.keys.getFailedKey();
    const totalFailed = await this.redisClient.zcard(failedKey);

    if (totalFailed <= this.options.maxFailedJobs) {
      return 0;
    }

    const toRemove = totalFailed - this.options.maxFailedJobs;
    
    // Remove oldest failed jobs (lowest scores)
    const removed = await this.redisClient.zremrangebyscore(
      failedKey,
      0,
      Date.now() - (toRemove * 1000) // Approximate cleanup
    );

    if (removed > 0) {
      logger.info('Cleaned up old failed jobs', {
        removed,
        remaining: totalFailed - removed,
        maxAllowed: this.options.maxFailedJobs
      });
    }

    return removed;
  }

  /**
   * Find and clean up stale processing jobs
   */
  async cleanupStaleProcessingJobs(): Promise<number> {
    const processingJobs = await this.getProcessingJobs();
    const now = Date.now();
    let cleanedUp = 0;

    for (const processingJob of processingJobs) {
      const startedAt = new Date(processingJob.startedAt).getTime();
      const processingTime = now - startedAt;

      if (processingTime > this.options.processingTimeoutMs) {
        try {
          // Load the job to restore it
          const job = await this.loadJob(processingJob.jobId);
          if (job) {
            // Reset job status and add back to queue or retry queue
            job.status = JobStatus.PENDING;
            
            if (job.attempts < job.maxAttempts) {
              // Calculate retry delay
              const retryDelay = Math.min(
                this.options.retryDelayMs * Math.pow(2, job.attempts - 1),
                this.options.maxRetryDelayMs
              );
              job.nextRetryAt = new Date(now + retryDelay);
              
              await this.persistJob(job);
              await this.addJobToRetryQueue(job);
            } else {
              // Max attempts reached, mark as failed
              job.status = JobStatus.FAILED;
              job.completedAt = new Date();
              job.error = 'Job processing timeout - exceeded maximum processing time';
              
              await this.persistJob(job);
              await this.addJobToFailed(job.id);
            }
          }

          // Remove from processing
          await this.removeJobFromProcessing(processingJob.jobId);
          cleanedUp++;

          logger.warn('Cleaned up stale processing job', {
            jobId: processingJob.jobId,
            processingTimeMs: processingTime,
            timeoutMs: this.options.processingTimeoutMs,
            workerId: processingJob.workerId
          });
        } catch (error) {
          logger.error('Failed to cleanup stale processing job', {
            jobId: processingJob.jobId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    if (cleanedUp > 0) {
      logger.info('Cleaned up stale processing jobs', {
        cleanedUp,
        totalProcessing: processingJobs.length
      });
    }

    return cleanedUp;
  }

  /**
   * Get all job IDs matching a pattern using SCAN instead of KEYS for better performance
   */
  async getAllJobIds(): Promise<string[]> {
    const pattern = this.keys.getJobDataPattern();
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      try {
        const result = await this.redisClient.scan(cursor, { match: pattern, count: 100 });
        cursor = result[0];
        keys.push(...result[1]);
      } catch (error) {
        logger.error('Redis SCAN operation failed', {
          command: 'SCAN',
          pattern,
          cursor,
          error: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    } while (cursor !== '0');
    
    // Extract job IDs from keys
    const jobIds = keys
      .map(key => {
        const parts = key.split(':');
        return parts[parts.length - 1]; // Last part is the job ID
      })
      .filter((jobId): jobId is string => jobId !== undefined);

    return jobIds;
  }
}