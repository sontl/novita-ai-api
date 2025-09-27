/**
 * Unit tests for RedisJobQueueService
 * Tests Redis-backed job queue operations with mocked Redis client
 */

import { RedisJobQueueService } from '../redisJobQueueService';
import { RedisJobQueueDataLayer } from '../redisJobQueueDataLayer';
import { IRedisClient } from '../../utils/redisClient';
import {
  Job,
  JobType,
  JobStatus,
  JobPriority,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload
} from '../../types/job';
import { logger } from '../../utils/logger';
import { recordJobMetrics } from '../../middleware/metricsMiddleware';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../middleware/metricsMiddleware');
jest.mock('../redisJobQueueDataLayer');

describe('RedisJobQueueService', () => {
  let redisJobQueueService: RedisJobQueueService;
  let mockRedisClient: jest.Mocked<IRedisClient>;
  let mockDataLayer: jest.Mocked<RedisJobQueueDataLayer>;

  const mockCreateInstancePayload: CreateInstanceJobPayload = {
    instanceId: 'test-instance-1',
    name: 'Test Instance',
    productName: 'test-product',
    templateId: 'template-123',
    gpuNum: 1,
    rootfsSize: 50,
    region: 'us-east-1'
  };

  const mockMonitorInstancePayload: MonitorInstanceJobPayload = {
    instanceId: 'test-instance-1',
    novitaInstanceId: 'novita-123',
    startTime: new Date(),
    maxWaitTime: 300000
  };

  beforeEach(() => {
    // Create mock Redis client
    mockRedisClient = {
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
      setNX: jest.fn(),
      ping: jest.fn(),
      disconnect: jest.fn()
    };

    // Create mock data layer
    mockDataLayer = {
      persistJob: jest.fn(),
      loadJob: jest.fn(),
      deleteJob: jest.fn(),
      addJobToQueue: jest.fn(),
      removeJobFromQueue: jest.fn(),
      getNextJobFromQueue: jest.fn(),
      getJobsFromQueue: jest.fn(),
      moveJobToProcessing: jest.fn(),
      removeJobFromProcessing: jest.fn(),
      getProcessingJobs: jest.fn(),
      addJobToRetryQueue: jest.fn(),
      removeJobFromRetryQueue: jest.fn(),
      getJobsReadyForRetry: jest.fn(),
      moveRetryJobsToQueue: jest.fn(),
      addJobToCompleted: jest.fn(),
      addJobToFailed: jest.fn(),
      getQueueSize: jest.fn(),
      getRetryQueueSize: jest.fn(),
      getProcessingJobsCount: jest.fn(),
      getCompletedJobsCount: jest.fn(),
      getFailedJobsCount: jest.fn(),
      cleanupCompletedJobs: jest.fn(),
      cleanupFailedJobs: jest.fn(),
      cleanupStaleProcessingJobs: jest.fn(),
      getAllJobIds: jest.fn()
    } as any;

    // Mock the RedisJobQueueDataLayer constructor
    (RedisJobQueueDataLayer as jest.MockedClass<typeof RedisJobQueueDataLayer>).mockImplementation(() => mockDataLayer);

    redisJobQueueService = new RedisJobQueueService(mockRedisClient, 100, 5000);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    redisJobQueueService.stopProcessing();
  });

  describe('addJob', () => {
    it('should add a job to Redis queue successfully', async () => {
      mockDataLayer.persistJob.mockResolvedValue(undefined);
      mockDataLayer.addJobToQueue.mockResolvedValue(undefined);

      const jobId = await redisJobQueueService.addJob(
        JobType.CREATE_INSTANCE,
        mockCreateInstancePayload,
        JobPriority.HIGH,
        5
      );

      expect(jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      expect(mockDataLayer.persistJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: jobId,
          type: JobType.CREATE_INSTANCE,
          payload: mockCreateInstancePayload,
          status: JobStatus.PENDING,
          priority: JobPriority.HIGH,
          attempts: 0,
          maxAttempts: 5,
          createdAt: expect.any(Date)
        })
      );
      expect(mockDataLayer.addJobToQueue).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Job added to Redis queue',
        expect.objectContaining({
          jobId,
          type: JobType.CREATE_INSTANCE,
          priority: JobPriority.HIGH,
          maxAttempts: 5
        })
      );
    });

    it('should use default priority and maxAttempts when not specified', async () => {
      mockDataLayer.persistJob.mockResolvedValue(undefined);
      mockDataLayer.addJobToQueue.mockResolvedValue(undefined);

      const jobId = await redisJobQueueService.addJob(
        JobType.MONITOR_INSTANCE,
        mockMonitorInstancePayload
      );

      expect(mockDataLayer.persistJob).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: JobPriority.NORMAL,
          maxAttempts: 3
        })
      );
    });

    it('should handle Redis persistence errors', async () => {
      const error = new Error('Redis connection failed');
      mockDataLayer.persistJob.mockRejectedValue(error);

      await expect(
        redisJobQueueService.addJob(JobType.CREATE_INSTANCE, mockCreateInstancePayload)
      ).rejects.toThrow('Failed to add job to queue: Redis connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to add job to Redis queue',
        expect.objectContaining({
          error: 'Redis connection failed'
        })
      );
    });

    it('should start processing when not already running', async () => {
      mockDataLayer.persistJob.mockResolvedValue(undefined);
      mockDataLayer.addJobToQueue.mockResolvedValue(undefined);

      const startProcessingSpy = jest.spyOn(redisJobQueueService, 'startProcessing');

      await redisJobQueueService.addJob(JobType.CREATE_INSTANCE, mockCreateInstancePayload);

      expect(startProcessingSpy).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should retrieve a job from Redis by ID', async () => {
      const mockJob: Job = {
        id: 'job-123',
        type: JobType.CREATE_INSTANCE,
        payload: mockCreateInstancePayload,
        status: JobStatus.PENDING,
        priority: JobPriority.NORMAL,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      mockDataLayer.loadJob.mockResolvedValue(mockJob);

      const result = await redisJobQueueService.getJob('job-123');

      expect(result).toEqual(mockJob);
      expect(mockDataLayer.loadJob).toHaveBeenCalledWith('job-123');
    });

    it('should return undefined when job not found', async () => {
      mockDataLayer.loadJob.mockResolvedValue(null);

      const result = await redisJobQueueService.getJob('nonexistent-job');

      expect(result).toBeUndefined();
    });

    it('should handle Redis errors gracefully', async () => {
      mockDataLayer.loadJob.mockRejectedValue(new Error('Redis error'));

      const result = await redisJobQueueService.getJob('job-123');

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get job from Redis',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Redis error'
        })
      );
    });
  });

  describe('getJobs', () => {
    const mockJobs: Job[] = [
      {
        id: 'job-1',
        type: JobType.CREATE_INSTANCE,
        payload: mockCreateInstancePayload,
        status: JobStatus.PENDING,
        priority: JobPriority.HIGH,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date('2023-01-01T10:00:00Z')
      },
      {
        id: 'job-2',
        type: JobType.MONITOR_INSTANCE,
        payload: mockMonitorInstancePayload,
        status: JobStatus.COMPLETED,
        priority: JobPriority.NORMAL,
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date('2023-01-01T11:00:00Z')
      },
      {
        id: 'job-3',
        type: JobType.CREATE_INSTANCE,
        payload: mockCreateInstancePayload,
        status: JobStatus.PENDING,
        priority: JobPriority.LOW,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date('2023-01-01T09:00:00Z')
      }
    ];

    beforeEach(() => {
      mockDataLayer.getAllJobIds.mockResolvedValue(['job-1', 'job-2', 'job-3']);
      mockDataLayer.loadJob
        .mockResolvedValueOnce(mockJobs[0] as Job)
        .mockResolvedValueOnce(mockJobs[1] as Job)
        .mockResolvedValueOnce(mockJobs[2] as Job);
    });

    it('should retrieve all jobs without filters', async () => {
      const result = await redisJobQueueService.getJobs();

      expect(result).toHaveLength(3);
      // Jobs should be sorted by priority (HIGH=3, NORMAL=2, LOW=1) then by creation time
      expect(result[0]?.priority).toBe(JobPriority.HIGH); // job-1
      expect(result[1]?.priority).toBe(JobPriority.NORMAL); // job-2
      expect(result[2]?.priority).toBe(JobPriority.LOW); // job-3
    });

    it('should filter jobs by status', async () => {
      const result = await redisJobQueueService.getJobs({ status: JobStatus.PENDING });

      expect(result).toHaveLength(2);
      expect(result.every(job => job.status === JobStatus.PENDING)).toBe(true);
    });

    it('should filter jobs by type', async () => {
      const result = await redisJobQueueService.getJobs({ type: JobType.CREATE_INSTANCE });

      expect(result).toHaveLength(2);
      expect(result.every(job => job.type === JobType.CREATE_INSTANCE)).toBe(true);
    });

    it('should limit the number of jobs returned', async () => {
      const result = await redisJobQueueService.getJobs({ limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('should handle Redis errors and return empty array', async () => {
      mockDataLayer.getAllJobIds.mockRejectedValue(new Error('Redis error'));

      const result = await redisJobQueueService.getJobs();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get jobs from Redis',
        expect.objectContaining({
          error: 'Redis error'
        })
      );
    });

    it('should filter out null jobs from Redis', async () => {
      // Reset the mock to override the beforeEach setup
      mockDataLayer.loadJob.mockReset();
      mockDataLayer.loadJob
        .mockResolvedValueOnce(mockJobs[0] as Job)
        .mockResolvedValueOnce(null) // Simulate missing job
        .mockResolvedValueOnce(mockJobs[2] as Job);

      const result = await redisJobQueueService.getJobs();

      expect(result).toHaveLength(2);
      expect(result.map(job => job.id)).toEqual(['job-1', 'job-3']);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      mockDataLayer.getQueueSize.mockResolvedValue(5);
      mockDataLayer.getRetryQueueSize.mockResolvedValue(2);
      mockDataLayer.getProcessingJobsCount.mockResolvedValue(1);
      mockDataLayer.getCompletedJobsCount.mockResolvedValue(10);
      mockDataLayer.getFailedJobsCount.mockResolvedValue(3);
      mockDataLayer.getAllJobIds.mockResolvedValue(['job-1', 'job-2']);
      mockDataLayer.loadJob
        .mockResolvedValueOnce({
          id: 'job-1',
          type: JobType.CREATE_INSTANCE,
          payload: {},
          status: JobStatus.PENDING,
          priority: JobPriority.NORMAL,
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date()
        } as Job)
        .mockResolvedValueOnce({
          id: 'job-2',
          type: JobType.MONITOR_INSTANCE,
          payload: {},
          status: JobStatus.COMPLETED,
          priority: JobPriority.NORMAL,
          attempts: 1,
          maxAttempts: 3,
          createdAt: new Date()
        } as Job);
    });

    it('should return comprehensive queue statistics', async () => {
      const stats = await redisJobQueueService.getStats();

      expect(stats).toEqual({
        totalJobs: 21, // 5 + 2 + 1 + 10 + 3
        pendingJobs: 7, // 5 + 2
        processingJobs: 1,
        completedJobs: 10,
        failedJobs: 3,
        jobsByType: {
          [JobType.CREATE_INSTANCE]: 1,
          [JobType.MONITOR_INSTANCE]: 1,
          [JobType.MONITOR_STARTUP]: 0,
          [JobType.SEND_WEBHOOK]: 0,
          [JobType.MIGRATE_SPOT_INSTANCES]: 0,
          [JobType.AUTO_STOP_CHECK]: 0,
          [JobType.HANDLE_FAILED_MIGRATIONS]: 0
        }
      });
    });

    it('should return empty stats on Redis error', async () => {
      mockDataLayer.getQueueSize.mockRejectedValue(new Error('Redis error'));

      const stats = await redisJobQueueService.getStats();

      expect(stats).toEqual({
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
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get queue stats from Redis',
        expect.objectContaining({
          error: 'Redis error'
        })
      );
    });
  });

  describe('registerHandler', () => {
    it('should register a job handler for a specific type', () => {
      const mockHandler = jest.fn();

      redisJobQueueService.registerHandler(JobType.CREATE_INSTANCE, mockHandler);

      expect(logger.info).toHaveBeenCalledWith(
        'Job handler registered for Redis queue',
        { type: JobType.CREATE_INSTANCE }
      );
    });
  });

  describe('startProcessing and stopProcessing', () => {
    it('should start processing when not already running', () => {
      const performRecoveryTasksSpy = jest.spyOn(redisJobQueueService as any, 'performRecoveryTasks')
        .mockResolvedValue(undefined);

      redisJobQueueService.startProcessing();

      expect(logger.info).toHaveBeenCalledWith('Starting Redis job queue processing');
      expect(performRecoveryTasksSpy).toHaveBeenCalled();
    });

    it('should not start processing when already running', () => {
      redisJobQueueService.startProcessing();
      jest.clearAllMocks();

      redisJobQueueService.startProcessing();

      expect(logger.info).not.toHaveBeenCalledWith('Starting Redis job queue processing');
    });

    it('should stop processing when running', () => {
      redisJobQueueService.startProcessing();
      redisJobQueueService.stopProcessing();

      expect(logger.info).toHaveBeenCalledWith('Stopped Redis job queue processing');
    });

    it('should not stop processing when not running', () => {
      redisJobQueueService.stopProcessing();

      expect(logger.info).not.toHaveBeenCalledWith('Stopped Redis job queue processing');
    });
  });

  describe('cleanup', () => {
    it('should clean up old jobs using Redis data layer', async () => {
      mockDataLayer.cleanupCompletedJobs.mockResolvedValue(5);
      mockDataLayer.cleanupFailedJobs.mockResolvedValue(3);

      const result = await redisJobQueueService.cleanup();

      expect(result).toBe(8);
      expect(mockDataLayer.cleanupCompletedJobs).toHaveBeenCalled();
      expect(mockDataLayer.cleanupFailedJobs).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Cleaned up old jobs from Redis',
        {
          completedCleaned: 5,
          failedCleaned: 3,
          totalCleaned: 8
        }
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockDataLayer.cleanupCompletedJobs.mockRejectedValue(new Error('Cleanup error'));

      const result = await redisJobQueueService.cleanup();

      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup old jobs from Redis',
        expect.objectContaining({
          error: 'Cleanup error'
        })
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully when no processing jobs', async () => {
      mockDataLayer.getProcessingJobsCount.mockResolvedValue(0);

      await redisJobQueueService.shutdown(1000);

      expect(logger.info).toHaveBeenCalledWith('Shutting down Redis job queue service');
      expect(logger.info).toHaveBeenCalledWith('Redis job queue service shutdown complete');
    });

    it('should timeout when processing jobs remain', async () => {
      mockDataLayer.getProcessingJobsCount.mockResolvedValue(2);

      await redisJobQueueService.shutdown(100);

      expect(logger.warn).toHaveBeenCalledWith(
        'Shutdown timeout reached with processing jobs remaining in Redis',
        { remainingJobs: 2 }
      );
    });

    it('should handle Redis errors during shutdown', async () => {
      mockDataLayer.getProcessingJobsCount.mockRejectedValue(new Error('Redis error'));

      await redisJobQueueService.shutdown(100);

      expect(logger.error).toHaveBeenCalledWith(
        'Error checking processing jobs during shutdown',
        expect.objectContaining({
          error: 'Redis error'
        })
      );
    });
  });

  describe('job processing', () => {
    let mockJob: Job;
    let mockHandler: jest.Mock;

    beforeEach(() => {
      mockJob = {
        id: 'job-123',
        type: JobType.CREATE_INSTANCE,
        payload: mockCreateInstancePayload,
        status: JobStatus.PENDING,
        priority: JobPriority.NORMAL,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      mockHandler = jest.fn().mockResolvedValue(undefined);
      redisJobQueueService.registerHandler(JobType.CREATE_INSTANCE, mockHandler);

      // Mock data layer methods for job processing
      mockDataLayer.moveRetryJobsToQueue.mockResolvedValue(0);
      mockDataLayer.getNextJobFromQueue.mockResolvedValue('job-123');
      mockDataLayer.loadJob.mockResolvedValue(mockJob);
      mockDataLayer.moveJobToProcessing.mockResolvedValue(undefined);
      mockDataLayer.persistJob.mockResolvedValue(undefined);
      mockDataLayer.removeJobFromProcessing.mockResolvedValue(true);
      mockDataLayer.addJobToCompleted.mockResolvedValue(undefined);
      mockDataLayer.getQueueSize.mockResolvedValue(0);
    });

    it('should process a job successfully', async () => {
      // Trigger job processing
      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.moveJobToProcessing).toHaveBeenCalledWith('job-123');
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-123',
          type: JobType.CREATE_INSTANCE,
          attempts: 1
        })
      );
      expect(mockDataLayer.addJobToCompleted).toHaveBeenCalledWith('job-123');
      expect(recordJobMetrics).toHaveBeenCalledWith(
        JobType.CREATE_INSTANCE,
        expect.any(Number),
        true,
        0
      );
    });

    it('should retry failed jobs within max attempts', async () => {
      mockJob.attempts = 1;
      mockHandler.mockRejectedValue(new Error('Job failed'));
      mockDataLayer.addJobToRetryQueue.mockResolvedValue(undefined);

      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.addJobToRetryQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          status: JobStatus.PENDING,
          nextRetryAt: expect.any(Date)
        })
      );
    });

    it('should mark job as failed when max attempts reached', async () => {
      mockJob.attempts = 2;
      mockJob.maxAttempts = 3;
      mockHandler.mockRejectedValue(new Error('Job failed permanently'));
      mockDataLayer.addJobToFailed.mockResolvedValue(undefined);

      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.addJobToFailed).toHaveBeenCalledWith('job-123');
      expect(recordJobMetrics).toHaveBeenCalledWith(
        JobType.CREATE_INSTANCE,
        expect.any(Number),
        false,
        0
      );
    });

    it('should handle missing job handler', async () => {
      mockJob.type = JobType.MONITOR_STARTUP; // No handler registered
      mockJob.attempts = 2; // Set to max attempts - 1 so it will fail permanently
      mockDataLayer.addJobToFailed.mockResolvedValue(undefined);

      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.addJobToFailed).toHaveBeenCalledWith('job-123');
    });

    it('should skip jobs not ready for retry', async () => {
      mockJob.nextRetryAt = new Date(Date.now() + 10000); // 10 seconds in future
      mockDataLayer.addJobToRetryQueue.mockResolvedValue(undefined);

      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.addJobToRetryQueue).toHaveBeenCalledWith(mockJob);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle missing job data', async () => {
      mockDataLayer.loadJob.mockResolvedValue(null);
      mockDataLayer.removeJobFromQueue.mockResolvedValue(true);

      await (redisJobQueueService as any).processNextJob();

      expect(mockDataLayer.removeJobFromQueue).toHaveBeenCalledWith('job-123');
      expect(logger.warn).toHaveBeenCalledWith(
        'Job not found in Redis storage, removing from queue',
        { jobId: 'job-123' }
      );
    });
  });

  describe('maintenance tasks', () => {
    it('should perform maintenance tasks', async () => {
      mockDataLayer.cleanupStaleProcessingJobs.mockResolvedValue(2);
      mockDataLayer.cleanupCompletedJobs.mockResolvedValue(5);
      mockDataLayer.cleanupFailedJobs.mockResolvedValue(3);
      mockDataLayer.moveRetryJobsToQueue.mockResolvedValue(1);

      await (redisJobQueueService as any).performMaintenanceTasks();

      expect(mockDataLayer.cleanupStaleProcessingJobs).toHaveBeenCalled();
      expect(mockDataLayer.moveRetryJobsToQueue).toHaveBeenCalled();
    });

    it('should perform recovery tasks on startup', async () => {
      mockDataLayer.cleanupStaleProcessingJobs.mockResolvedValue(2);
      mockDataLayer.moveRetryJobsToQueue.mockResolvedValue(1);

      await (redisJobQueueService as any).performRecoveryTasks();

      expect(mockDataLayer.cleanupStaleProcessingJobs).toHaveBeenCalled();
      expect(mockDataLayer.moveRetryJobsToQueue).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Redis job queue recovery completed',
        {
          recoveredJobs: 2,
          movedJobs: 1
        }
      );
    });
  });
});