/**
 * Unit tests for Redis job queue data layer
 */

import { RedisJobQueueDataLayer } from '../redisJobQueueDataLayer';
import { IRedisClient } from '../../utils/redisClient';
import { Job, JobType, JobStatus, JobPriority } from '../../types/job';
import {
  RedisJobQueueKeys,
  JobSerializer,
  ProcessingJobEntry,
  DEFAULT_REDIS_JOB_QUEUE_OPTIONS
} from '../../types/redisJobQueue';

// Mock Redis client
const mockRedisClient: jest.Mocked<IRedisClient> = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  hgetall: jest.fn(),
  lpush: jest.fn(),
  rpop: jest.fn(),
  lrange: jest.fn(),
  llen: jest.fn(),
  zadd: jest.fn(),
  zrem: jest.fn(),
  zrange: jest.fn(),
  zrevrange: jest.fn(),
  zrangebyscore: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  zscore: jest.fn(),
  keys: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn()
};

describe('RedisJobQueueDataLayer', () => {
  let dataLayer: RedisJobQueueDataLayer;
  let keys: RedisJobQueueKeys;

  beforeEach(() => {
    jest.clearAllMocks();
    dataLayer = new RedisJobQueueDataLayer(mockRedisClient);
    keys = new RedisJobQueueKeys('jobs');
  });

  describe('Job Persistence', () => {
    const mockJob: Job = {
      id: 'job_123',
      type: JobType.CREATE_INSTANCE,
      payload: { instanceId: 'inst_123', name: 'test-instance' },
      status: JobStatus.PENDING,
      priority: JobPriority.NORMAL,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date('2023-01-01T00:00:00Z')
    };

    it('should persist job to Redis', async () => {
      mockRedisClient.hset.mockResolvedValue(undefined);

      await dataLayer.persistJob(mockJob);

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'jobs:data:job_123',
        'data',
        expect.objectContaining({
          id: 'job_123',
          type: JobType.CREATE_INSTANCE,
          payload: JSON.stringify(mockJob.payload),
          status: JobStatus.PENDING,
          priority: JobPriority.NORMAL,
          attempts: 0,
          maxAttempts: 3,
          createdAt: '2023-01-01T00:00:00.000Z'
        })
      );
    });

    it('should load job from Redis', async () => {
      const redisJobData = JobSerializer.toRedisJobData(mockJob);
      mockRedisClient.hget.mockResolvedValue(redisJobData);

      const result = await dataLayer.loadJob('job_123');

      expect(mockRedisClient.hget).toHaveBeenCalledWith('jobs:data:job_123', 'data');
      expect(result).toEqual(mockJob);
    });

    it('should return null when job does not exist', async () => {
      mockRedisClient.hget.mockResolvedValue(null);

      const result = await dataLayer.loadJob('nonexistent');

      expect(result).toBeNull();
    });

    it('should delete job from Redis', async () => {
      mockRedisClient.del.mockResolvedValue(true);

      const result = await dataLayer.deleteJob('job_123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('jobs:data:job_123');
      expect(result).toBe(true);
    });
  });

  describe('Priority Queue Operations', () => {
    const mockJob: Job = {
      id: 'job_123',
      type: JobType.CREATE_INSTANCE,
      payload: {},
      status: JobStatus.PENDING,
      priority: JobPriority.HIGH,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date('2023-01-01T00:00:00Z')
    };

    it('should add job to priority queue', async () => {
      mockRedisClient.zadd.mockResolvedValue(1);

      await dataLayer.addJobToQueue(mockJob);

      const expectedScore = JobSerializer.calculatePriorityScore(mockJob);
      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        'jobs:queue',
        expectedScore,
        'job_123'
      );
    });

    it('should remove job from priority queue', async () => {
      mockRedisClient.zrem.mockResolvedValue(1);

      const result = await dataLayer.removeJobFromQueue('job_123');

      expect(mockRedisClient.zrem).toHaveBeenCalledWith('jobs:queue', 'job_123');
      expect(result).toBe(true);
    });

    it('should get next job from priority queue', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['job_123']);

      const result = await dataLayer.getNextJobFromQueue();

      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith('jobs:queue', 0, 0);
      expect(result).toBe('job_123');
    });

    it('should return null when no jobs in queue', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);

      const result = await dataLayer.getNextJobFromQueue();

      expect(result).toBeNull();
    });

    it('should get multiple jobs from priority queue', async () => {
      const jobIds = ['job_1', 'job_2', 'job_3'];
      mockRedisClient.zrevrange.mockResolvedValue(jobIds);

      const result = await dataLayer.getJobsFromQueue(5);

      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith('jobs:queue', 0, 4);
      expect(result).toEqual(jobIds);
    });

    it('should get queue size', async () => {
      mockRedisClient.zcard.mockResolvedValue(5);

      const result = await dataLayer.getQueueSize();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:queue');
      expect(result).toBe(5);
    });
  });

  describe('Processing State Management', () => {
    it('should move job to processing state', async () => {
      mockRedisClient.hset.mockResolvedValue(undefined);
      mockRedisClient.zrem.mockResolvedValue(1);

      await dataLayer.moveJobToProcessing('job_123', 'worker_1');

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'jobs:processing',
        'job_123',
        expect.objectContaining({
          jobId: 'job_123',
          workerId: 'worker_1',
          startedAt: expect.any(String)
        })
      );
      expect(mockRedisClient.zrem).toHaveBeenCalledWith('jobs:queue', 'job_123');
    });

    it('should remove job from processing state', async () => {
      mockRedisClient.hdel.mockResolvedValue(true);

      const result = await dataLayer.removeJobFromProcessing('job_123');

      expect(mockRedisClient.hdel).toHaveBeenCalledWith('jobs:processing', 'job_123');
      expect(result).toBe(true);
    });

    it('should get processing jobs', async () => {
      const processingData = {
        job_1: {
          jobId: 'job_1',
          startedAt: '2023-01-01T00:00:00Z',
          workerId: 'worker_1'
        },
        job_2: {
          jobId: 'job_2',
          startedAt: '2023-01-01T00:01:00Z',
          workerId: 'worker_2'
        }
      };
      mockRedisClient.hgetall.mockResolvedValue(processingData);

      const result = await dataLayer.getProcessingJobs();

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith('jobs:processing');
      expect(result).toEqual(Object.values(processingData));
    });

    it('should get processing jobs count', async () => {
      const processingData = {
        job_1: { jobId: 'job_1' },
        job_2: { jobId: 'job_2' }
      };
      mockRedisClient.hgetall.mockResolvedValue(processingData);

      const result = await dataLayer.getProcessingJobsCount();

      expect(result).toBe(2);
    });
  });

  describe('Retry Queue Operations', () => {
    const mockJob: Job = {
      id: 'job_123',
      type: JobType.CREATE_INSTANCE,
      payload: {},
      status: JobStatus.PENDING,
      priority: JobPriority.NORMAL,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      nextRetryAt: new Date('2023-01-01T00:05:00Z')
    };

    it('should add job to retry queue', async () => {
      mockRedisClient.zadd.mockResolvedValue(1);

      await dataLayer.addJobToRetryQueue(mockJob);

      const expectedScore = JobSerializer.calculateRetryScore(mockJob.nextRetryAt!);
      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        'jobs:retry',
        expectedScore,
        'job_123'
      );
    });

    it('should throw error when adding job without nextRetryAt', async () => {
      const jobWithoutRetry: Job = { ...mockJob };
      delete (jobWithoutRetry as any).nextRetryAt;

      await expect(dataLayer.addJobToRetryQueue(jobWithoutRetry))
        .rejects.toThrow('Job must have nextRetryAt set to be added to retry queue');
    });

    it('should remove job from retry queue', async () => {
      mockRedisClient.zrem.mockResolvedValue(1);

      const result = await dataLayer.removeJobFromRetryQueue('job_123');

      expect(mockRedisClient.zrem).toHaveBeenCalledWith('jobs:retry', 'job_123');
      expect(result).toBe(true);
    });

    it('should get jobs ready for retry', async () => {
      const jobIds = ['job_1', 'job_2'];
      mockRedisClient.zrangebyscore.mockResolvedValue(jobIds);

      const result = await dataLayer.getJobsReadyForRetry();

      expect(mockRedisClient.zrangebyscore).toHaveBeenCalledWith(
        'jobs:retry',
        0,
        expect.any(Number)
      );
      expect(result).toEqual(jobIds);
    });

    it('should move retry jobs to main queue', async () => {
      const jobIds = ['job_123'];
      mockRedisClient.zrangebyscore.mockResolvedValue(jobIds);
      
      const redisJobData = JobSerializer.toRedisJobData({
        ...mockJob,
        status: JobStatus.PENDING,
        nextRetryAt: new Date('2023-01-01T00:05:00Z')
      });
      mockRedisClient.hget.mockResolvedValue(redisJobData);
      mockRedisClient.hset.mockResolvedValue(undefined);
      mockRedisClient.zadd.mockResolvedValue(1);
      mockRedisClient.zrem.mockResolvedValue(1);

      const result = await dataLayer.moveRetryJobsToQueue();

      expect(result).toBe(1);
      expect(mockRedisClient.hset).toHaveBeenCalled(); // Job persisted
      expect(mockRedisClient.zadd).toHaveBeenCalled(); // Added to main queue
      expect(mockRedisClient.zrem).toHaveBeenCalled(); // Removed from retry queue
    });

    it('should get retry queue size', async () => {
      mockRedisClient.zcard.mockResolvedValue(3);

      const result = await dataLayer.getRetryQueueSize();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:retry');
      expect(result).toBe(3);
    });
  });

  describe('Completed and Failed Job Tracking', () => {
    it('should add job to completed list', async () => {
      mockRedisClient.zadd.mockResolvedValue(1);

      await dataLayer.addJobToCompleted('job_123');

      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        'jobs:completed',
        expect.any(Number),
        'job_123'
      );
    });

    it('should add job to failed list', async () => {
      mockRedisClient.zadd.mockResolvedValue(1);

      await dataLayer.addJobToFailed('job_123');

      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        'jobs:failed',
        expect.any(Number),
        'job_123'
      );
    });

    it('should get completed jobs count', async () => {
      mockRedisClient.zcard.mockResolvedValue(10);

      const result = await dataLayer.getCompletedJobsCount();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:completed');
      expect(result).toBe(10);
    });

    it('should get failed jobs count', async () => {
      mockRedisClient.zcard.mockResolvedValue(5);

      const result = await dataLayer.getFailedJobsCount();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:failed');
      expect(result).toBe(5);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old completed jobs when limit exceeded', async () => {
      const maxCompleted = DEFAULT_REDIS_JOB_QUEUE_OPTIONS.maxCompletedJobs;
      mockRedisClient.zcard.mockResolvedValue(maxCompleted + 100);
      mockRedisClient.zremrangebyscore.mockResolvedValue(50);

      const result = await dataLayer.cleanupCompletedJobs();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:completed');
      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalled();
      expect(result).toBe(50);
    });

    it('should not cleanup completed jobs when under limit', async () => {
      const maxCompleted = DEFAULT_REDIS_JOB_QUEUE_OPTIONS.maxCompletedJobs;
      mockRedisClient.zcard.mockResolvedValue(maxCompleted - 100);

      const result = await dataLayer.cleanupCompletedJobs();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:completed');
      expect(mockRedisClient.zremrangebyscore).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should cleanup old failed jobs when limit exceeded', async () => {
      const maxFailed = DEFAULT_REDIS_JOB_QUEUE_OPTIONS.maxFailedJobs;
      mockRedisClient.zcard.mockResolvedValue(maxFailed + 50);
      mockRedisClient.zremrangebyscore.mockResolvedValue(25);

      const result = await dataLayer.cleanupFailedJobs();

      expect(mockRedisClient.zcard).toHaveBeenCalledWith('jobs:failed');
      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalled();
      expect(result).toBe(25);
    });

    it('should cleanup stale processing jobs', async () => {
      const staleTime = Date.now() - (DEFAULT_REDIS_JOB_QUEUE_OPTIONS.processingTimeoutMs + 1000);
      const processingJobs: ProcessingJobEntry[] = [
        {
          jobId: 'stale_job',
          startedAt: new Date(staleTime).toISOString(),
          workerId: 'worker_1'
        },
        {
          jobId: 'fresh_job',
          startedAt: new Date().toISOString(),
          workerId: 'worker_2'
        }
      ];

      mockRedisClient.hgetall.mockResolvedValue({
        stale_job: processingJobs[0],
        fresh_job: processingJobs[1]
      });

      const staleJob: Job = {
        id: 'stale_job',
        type: JobType.CREATE_INSTANCE,
        payload: {},
        status: JobStatus.PROCESSING,
        priority: JobPriority.NORMAL,
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date()
      };

      mockRedisClient.hget.mockResolvedValue(JobSerializer.toRedisJobData(staleJob));
      mockRedisClient.hset.mockResolvedValue(undefined);
      mockRedisClient.zadd.mockResolvedValue(1);
      mockRedisClient.hdel.mockResolvedValue(true);

      const result = await dataLayer.cleanupStaleProcessingJobs();

      expect(result).toBe(1);
      expect(mockRedisClient.hdel).toHaveBeenCalledWith('jobs:processing', 'stale_job');
    });
  });

  describe('Job Serialization', () => {
    const mockJob: Job = {
      id: 'job_123',
      type: JobType.CREATE_INSTANCE,
      payload: { instanceId: 'inst_123', config: { gpu: 1 } },
      status: JobStatus.PENDING,
      priority: JobPriority.HIGH,
      attempts: 2,
      maxAttempts: 5,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      processedAt: new Date('2023-01-01T00:01:00Z'),
      nextRetryAt: new Date('2023-01-01T00:05:00Z'),
      error: 'Test error'
    };

    it('should serialize job to Redis format', () => {
      const result = JobSerializer.toRedisJobData(mockJob);

      expect(result).toEqual({
        id: 'job_123',
        type: JobType.CREATE_INSTANCE,
        payload: JSON.stringify(mockJob.payload),
        status: JobStatus.PENDING,
        priority: JobPriority.HIGH,
        attempts: 2,
        maxAttempts: 5,
        createdAt: '2023-01-01T00:00:00.000Z',
        processedAt: '2023-01-01T00:01:00.000Z',
        nextRetryAt: '2023-01-01T00:05:00.000Z',
        error: 'Test error'
      });
    });

    it('should deserialize Redis data to job', () => {
      const redisData = JobSerializer.toRedisJobData(mockJob);
      const result = JobSerializer.fromRedisJobData(redisData);

      expect(result).toEqual(mockJob);
    });

    it('should calculate priority score correctly', () => {
      const highPriorityJob = { ...mockJob, priority: JobPriority.HIGH };
      const lowPriorityJob = { ...mockJob, priority: JobPriority.LOW };

      const highScore = JobSerializer.calculatePriorityScore(highPriorityJob);
      const lowScore = JobSerializer.calculatePriorityScore(lowPriorityJob);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should calculate retry score correctly', () => {
      const retryDate = new Date('2023-01-01T00:05:00Z');
      const score = JobSerializer.calculateRetryScore(retryDate);

      expect(score).toBe(retryDate.getTime());
    });
  });

  describe('Key Management', () => {
    it('should generate correct Redis keys', () => {
      const keys = new RedisJobQueueKeys('test_jobs');

      expect(keys.getPriorityQueueKey()).toBe('test_jobs:queue');
      expect(keys.getProcessingKey()).toBe('test_jobs:processing');
      expect(keys.getJobDataKey('job_123')).toBe('test_jobs:data:job_123');
      expect(keys.getStatsKey()).toBe('test_jobs:stats');
      expect(keys.getRetryQueueKey()).toBe('test_jobs:retry');
      expect(keys.getCompletedKey()).toBe('test_jobs:completed');
      expect(keys.getFailedKey()).toBe('test_jobs:failed');
      expect(keys.getJobDataPattern()).toBe('test_jobs:data:*');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.hget.mockRejectedValue(new Error('Redis connection failed'));

      await expect(dataLayer.loadJob('job_123')).rejects.toThrow('Redis connection failed');
    });

    it('should handle missing job data during retry queue processing', async () => {
      mockRedisClient.zrangebyscore.mockResolvedValue(['nonexistent_job']);
      mockRedisClient.hget.mockResolvedValue(null);
      mockRedisClient.zrem.mockResolvedValue(1);

      const result = await dataLayer.moveRetryJobsToQueue();

      expect(result).toBe(0);
      expect(mockRedisClient.zrem).toHaveBeenCalledWith('jobs:retry', 'nonexistent_job');
    });
  });
});