/**
 * Performance integration tests for migration workflow
 * Tests system behavior under load, stress conditions, and performance requirements
 */

import { JobQueueService } from '../services/jobQueueService';
import { InstanceMigrationService } from '../services/instanceMigrationService';
import { MigrationScheduler } from '../services/migrationScheduler';
import { novitaApiService } from '../services/novitaApiService';
import { migrationMetrics } from '../utils/migrationMetrics';
import {
  JobType,
  JobStatus,
  MigrateSpotInstancesJobPayload
} from '../types/job';
import {
  InstanceResponse,
  InstanceStatus,
  MigrationResponse
} from '../types/api';
import { TestUtils, TestDataGenerator } from './fixtures';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../utils/logger');

describe('Migration Performance Integration Tests', () => {
  let jobQueueService: JobQueueService;
  let migrationService: InstanceMigrationService;
  let migrationScheduler: MigrationScheduler;

  const performanceConfig = {
    enabled: true,
    scheduleIntervalMs: 100, // Fast for testing
    jobTimeoutMs: 30000, // 30 seconds
    maxConcurrentMigrations: 10,
    dryRunMode: false,
    retryFailedMigrations: true,
    logLevel: 'error' // Reduce logging overhead
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize services with performance-oriented settings
    jobQueueService = new JobQueueService(10); // Very fast processing
    migrationService = new InstanceMigrationService();
    migrationScheduler = new MigrationScheduler(performanceConfig, jobQueueService);
    
    // Reset metrics
    migrationMetrics.reset();
  });

  afterEach(async () => {
    if (migrationScheduler) {
      await migrationScheduler.shutdown(2000);
    }
    if (jobQueueService) {
      jobQueueService.stop();
    }
  });

  describe('Large Scale Batch Processing', () => {
    it('should handle 1000+ instances efficiently', async () => {
      const INSTANCE_COUNT = 1000;
      const ELIGIBLE_PERCENTAGE = 0.3; // 30% eligible for migration

      // Generate large batch of instances
      const largeInstanceBatch: InstanceResponse[] = Array.from({ length: INSTANCE_COUNT }, (_, i) => {
        const isEligible = i < (INSTANCE_COUNT * ELIGIBLE_PERCENTAGE);
        return {
          ...TestDataGenerator.generateInstanceResponse(),
          id: `perf-instance-${i}`,
          name: `performance-test-${i}`,
          status: isEligible ? InstanceStatus.EXITED : InstanceStatus.RUNNING,
          spotStatus: isEligible ? 'reclaimed' : 'active',
          spotReclaimTime: isEligible ? `${1704067200 + i}` : '0'
        };
      });

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: largeInstanceBatch,
        total: largeInstanceBatch.length
      });

      // Mock fast migration responses
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        Promise.resolve({
          success: true,
          instanceId,
          newInstanceId: `migrated-${instanceId}`,
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
      );

      // Performance test
      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('large-scale-test');
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const expectedEligible = Math.floor(INSTANCE_COUNT * ELIGIBLE_PERCENTAGE);

      // Performance assertions
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.executionTimeMs).toBeLessThan(8000); // Internal timing should be even faster

      // Correctness assertions
      expect(result.totalProcessed).toBe(expectedEligible); // Only exited instances processed
      expect(result.migrated).toBe(expectedEligible);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      // Performance metrics
      const throughput = result.migrated / (executionTime / 1000);
      expect(throughput).toBeGreaterThan(30); // At least 30 migrations per second

      console.log(`✓ Processed ${INSTANCE_COUNT} instances (${expectedEligible} eligible) in ${executionTime}ms`);
      console.log(`✓ Migration throughput: ${throughput.toFixed(2)} migrations/second`);
      console.log(`✓ Average time per migration: ${(executionTime / result.migrated).toFixed(2)}ms`);
    });

    it('should maintain performance with high error rates', async () => {
      const INSTANCE_COUNT = 500;
      const ERROR_RATE = 0.5; // 50% error rate

      const instanceBatch: InstanceResponse[] = Array.from({ length: INSTANCE_COUNT }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `error-test-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: instanceBatch,
        total: instanceBatch.length
      });

      // Mock mixed success/failure responses
      mockNovitaApi.migrateInstance.mockImplementation((instanceId) => {
        const instanceIndex = parseInt(instanceId.split('-')[3]!);
        const shouldFail = instanceIndex % 2 === 0; // 50% failure rate

        if (shouldFail) {
          return Promise.resolve({
            success: false,
            instanceId,
            error: 'Simulated migration failure',
            migrationTime: new Date().toISOString()
          });
        } else {
          return Promise.resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          });
        }
      });

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('high-error-rate-test');
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // Performance should not degrade significantly with errors
      expect(executionTime).toBeLessThan(15000); // Allow more time due to error handling

      // Verify correct handling of mixed results
      expect(result.totalProcessed).toBe(INSTANCE_COUNT);
      expect(result.migrated).toBe(Math.floor(INSTANCE_COUNT * (1 - ERROR_RATE)));
      expect(result.errors).toBe(Math.floor(INSTANCE_COUNT * ERROR_RATE));

      console.log(`✓ Handled ${INSTANCE_COUNT} instances with ${ERROR_RATE * 100}% error rate in ${executionTime}ms`);
      console.log(`✓ Success rate: ${((result.migrated / result.totalProcessed) * 100).toFixed(1)}%`);
    });

    it('should handle memory efficiently with large datasets', async () => {
      const LARGE_BATCH_SIZE = 2000;

      // Monitor memory usage
      const initialMemory = process.memoryUsage();

      const largeBatch: InstanceResponse[] = Array.from({ length: LARGE_BATCH_SIZE }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `memory-test-instance-${i}`,
        name: `memory-test-${i}`,
        status: i % 4 === 0 ? InstanceStatus.EXITED : InstanceStatus.RUNNING,
        spotStatus: i % 4 === 0 ? 'reclaimed' : 'active',
        spotReclaimTime: i % 4 === 0 ? `${1704067200 + i}` : '0',
        // Add some additional data to increase memory footprint
        metadata: {
          tags: Array.from({ length: 10 }, (_, j) => `tag-${i}-${j}`),
          description: `This is a test instance ${i} with some metadata for memory testing`,
          config: {
            setting1: `value-${i}`,
            setting2: i * 2,
            setting3: i % 2 === 0
          }
        }
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: largeBatch,
        total: largeBatch.length
      });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Execute migration
      const result = await migrationService.processMigrationBatch('memory-test');

      // Check memory usage after processing
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePerInstance = memoryIncrease / LARGE_BATCH_SIZE;

      // Memory usage should be reasonable
      expect(memoryIncreasePerInstance).toBeLessThan(10000); // Less than 10KB per instance
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB total increase

      console.log(`✓ Processed ${LARGE_BATCH_SIZE} instances`);
      console.log(`✓ Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      console.log(`✓ Memory per instance: ${(memoryIncreasePerInstance / 1024).toFixed(2)}KB`);
    });
  });

  describe('Concurrent Processing Performance', () => {
    it('should handle multiple concurrent migration batches', async () => {
      const BATCH_COUNT = 5;
      const INSTANCES_PER_BATCH = 100;

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;

      // Mock different instance sets for each batch
      mockNovitaApi.listInstances.mockImplementation(() => {
        const instances = Array.from({ length: INSTANCES_PER_BATCH }, (_, i) => ({
          ...TestDataGenerator.generateInstanceResponse(),
          id: `concurrent-instance-${Date.now()}-${i}`,
          status: InstanceStatus.EXITED,
          spotStatus: 'reclaimed',
          spotReclaimTime: `${1704067200 + i}`
        }));

        return Promise.resolve({
          instances,
          total: instances.length
        });
      });

      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        new Promise(resolve => 
          setTimeout(() => resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          }), 10) // Small delay to simulate real API
        )
      );

      // Execute concurrent batches
      const startTime = Date.now();
      const batchPromises = Array.from({ length: BATCH_COUNT }, (_, i) =>
        migrationService.processMigrationBatch(`concurrent-batch-${i}`)
      );

      const results = await Promise.all(batchPromises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const totalMigrations = results.reduce((sum, result) => sum + result.migrated, 0);

      // Should complete faster than sequential processing
      const sequentialEstimate = BATCH_COUNT * INSTANCES_PER_BATCH * 15; // 15ms per migration sequentially
      expect(totalTime).toBeLessThan(sequentialEstimate * 0.8); // At least 20% faster

      // Verify all batches completed successfully
      results.forEach((result, i) => {
        expect(result.totalProcessed).toBe(INSTANCES_PER_BATCH);
        expect(result.migrated).toBe(INSTANCES_PER_BATCH);
        expect(result.errors).toBe(0);
      });

      const throughput = totalMigrations / (totalTime / 1000);
      expect(throughput).toBeGreaterThan(20); // At least 20 migrations per second

      console.log(`✓ Processed ${BATCH_COUNT} concurrent batches (${totalMigrations} total migrations) in ${totalTime}ms`);
      console.log(`✓ Concurrent throughput: ${throughput.toFixed(2)} migrations/second`);
    });

    it('should handle scheduler under high frequency execution', async () => {
      const HIGH_FREQUENCY_CONFIG = {
        ...performanceConfig,
        scheduleIntervalMs: 50 // Very high frequency
      };

      const highFreqScheduler = new MigrationScheduler(HIGH_FREQUENCY_CONFIG, jobQueueService);
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;

      // Mock fast API responses
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      highFreqScheduler.start();
      jobQueueService.start();

      // Let it run for a short period
      await TestUtils.wait(1000);

      const status = highFreqScheduler.getStatus();

      // Should handle high frequency without issues
      expect(status.totalExecutions).toBeGreaterThan(10);
      expect(status.isRunning).toBe(true);
      expect(status.failedExecutions / status.totalExecutions).toBeLessThan(0.1); // Less than 10% failure rate

      console.log(`✓ High frequency scheduler: ${status.totalExecutions} executions in 1 second`);
      console.log(`✓ Execution rate: ${status.totalExecutions} executions/second`);

      await highFreqScheduler.shutdown(1000);
    });
  });

  describe('API Response Time Performance', () => {
    it('should handle slow API responses gracefully', async () => {
      const SLOW_API_DELAY = 2000; // 2 second delay
      const INSTANCE_COUNT = 50;

      const instances = Array.from({ length: INSTANCE_COUNT }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `slow-api-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;

      // Mock slow API responses
      mockNovitaApi.listInstances.mockImplementation(() =>
        new Promise(resolve => 
          setTimeout(() => resolve({ instances, total: instances.length }), SLOW_API_DELAY)
        )
      );

      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        new Promise(resolve => 
          setTimeout(() => resolve({
            success: true,
            instanceId,
            newInstanceId: `migrated-${instanceId}`,
            message: 'Migration successful',
            migrationTime: new Date().toISOString()
          }), 100) // Faster migration API
        )
      );

      const startTime = Date.now();
      const result = await migrationService.processMigrationBatch('slow-api-test');
      const endTime = Date.now();

      const totalTime = endTime - startTime;

      // Should handle slow API gracefully
      expect(totalTime).toBeGreaterThan(SLOW_API_DELAY); // Must wait for slow API
      expect(totalTime).toBeLessThan(SLOW_API_DELAY + 10000); // But not excessively long

      expect(result.totalProcessed).toBe(INSTANCE_COUNT);
      expect(result.migrated).toBe(INSTANCE_COUNT);
      expect(result.errors).toBe(0);

      console.log(`✓ Handled slow API (${SLOW_API_DELAY}ms delay) with ${INSTANCE_COUNT} instances in ${totalTime}ms`);
    });

    it('should timeout appropriately on very slow APIs', async () => {
      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;

      // Mock extremely slow API that should timeout
      mockNovitaApi.listInstances.mockImplementation(() =>
        new Promise(resolve => 
          setTimeout(() => resolve({ instances: [], total: 0 }), 60000) // 1 minute delay
        )
      );

      const startTime = Date.now();
      
      // This should timeout or complete quickly due to internal timeouts
      const result = await migrationService.processMigrationBatch('timeout-test');
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should not wait for the full 60 seconds
      expect(totalTime).toBeLessThan(35000); // Should timeout within 35 seconds

      console.log(`✓ Handled timeout scenario in ${totalTime}ms`);
    });
  });

  describe('Resource Usage Under Load', () => {
    it('should maintain stable CPU usage under continuous load', async () => {
      const LOAD_DURATION = 3000; // 3 seconds of continuous load
      const BATCH_SIZE = 200;

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;

      // Create CPU-intensive mock (lots of instances to process)
      const heavyBatch = Array.from({ length: BATCH_SIZE }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `cpu-load-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`,
        // Add complex data to increase processing overhead
        metadata: {
          complexData: Array.from({ length: 100 }, (_, j) => ({
            id: j,
            value: Math.random(),
            nested: { data: `item-${i}-${j}` }
          }))
        }
      }));

      mockNovitaApi.listInstances.mockResolvedValue({
        instances: heavyBatch,
        total: heavyBatch.length
      });

      mockNovitaApi.migrateInstance.mockResolvedValue({
        success: true,
        instanceId: 'test',
        newInstanceId: 'migrated-test',
        message: 'Migration successful',
        migrationTime: new Date().toISOString()
      });

      // Run continuous load
      const startTime = Date.now();
      const loadPromises: Promise<any>[] = [];

      while (Date.now() - startTime < LOAD_DURATION) {
        loadPromises.push(
          migrationService.processMigrationBatch(`load-test-${Date.now()}`)
        );
        await TestUtils.wait(100); // Small delay between batches
      }

      // Wait for all batches to complete
      const results = await Promise.all(loadPromises);
      const endTime = Date.now();

      const totalBatches = results.length;
      const totalMigrations = results.reduce((sum, result) => sum + result.migrated, 0);
      const averageExecutionTime = results.reduce((sum, result) => sum + result.executionTimeMs, 0) / totalBatches;

      // Performance should remain stable
      expect(averageExecutionTime).toBeLessThan(5000); // Average batch should complete within 5 seconds
      expect(totalBatches).toBeGreaterThan(5); // Should have processed multiple batches

      console.log(`✓ Sustained load test: ${totalBatches} batches, ${totalMigrations} migrations in ${endTime - startTime}ms`);
      console.log(`✓ Average batch execution time: ${averageExecutionTime.toFixed(2)}ms`);
    });

    it('should handle job queue overflow gracefully', async () => {
      const OVERFLOW_JOB_COUNT = 1000;

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({ instances: [], total: 0 });

      // Create many jobs quickly to test queue overflow
      const jobPromises: Promise<string>[] = [];
      
      for (let i = 0; i < OVERFLOW_JOB_COUNT; i++) {
        const payload: MigrateSpotInstancesJobPayload = {
          scheduledAt: new Date(),
          jobId: `overflow-test-${i}`,
          config: { dryRun: true, maxMigrations: 1 }
        };

        jobPromises.push(
          jobQueueService.addJob(JobType.MIGRATE_SPOT_INSTANCES, payload)
        );
      }

      const startTime = Date.now();
      const jobIds = await Promise.all(jobPromises);
      const endTime = Date.now();

      // Should handle job creation efficiently
      expect(jobIds).toHaveLength(OVERFLOW_JOB_COUNT);
      expect(endTime - startTime).toBeLessThan(5000); // Should create jobs quickly

      // Start processing
      jobQueueService.start();

      // Wait for some jobs to process
      await TestUtils.wait(2000);

      // Check queue stats
      const stats = jobQueueService.getStats();
      expect(stats.totalJobs).toBe(OVERFLOW_JOB_COUNT);
      expect(stats.completedJobs + stats.failedJobs).toBeGreaterThan(0); // Some jobs should have processed

      console.log(`✓ Created ${OVERFLOW_JOB_COUNT} jobs in ${endTime - startTime}ms`);
      console.log(`✓ Queue stats: ${stats.completedJobs} completed, ${stats.failedJobs} failed, ${stats.pendingJobs} pending`);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should maintain baseline performance metrics', async () => {
      // Define performance baselines
      const BASELINE_METRICS = {
        maxBatchProcessingTime: 5000, // 5 seconds for 100 instances
        minThroughput: 20, // 20 migrations per second
        maxMemoryPerInstance: 5000, // 5KB per instance
        maxAPICallOverhead: 100 // 100ms overhead per API call
      };

      const STANDARD_BATCH_SIZE = 100;

      const standardBatch = Array.from({ length: STANDARD_BATCH_SIZE }, (_, i) => ({
        ...TestDataGenerator.generateInstanceResponse(),
        id: `baseline-instance-${i}`,
        status: InstanceStatus.EXITED,
        spotStatus: 'reclaimed',
        spotReclaimTime: `${1704067200 + i}`
      }));

      const mockNovitaApi = novitaApiService as jest.Mocked<typeof novitaApiService>;
      mockNovitaApi.listInstances.mockResolvedValue({
        instances: standardBatch,
        total: standardBatch.length
      });

      mockNovitaApi.migrateInstance.mockImplementation((instanceId) =>
        Promise.resolve({
          success: true,
          instanceId,
          newInstanceId: `migrated-${instanceId}`,
          message: 'Migration successful',
          migrationTime: new Date().toISOString()
        })
      );

      // Measure performance
      const initialMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();
      
      const result = await migrationService.processMigrationBatch('baseline-test');
      
      const endTime = Date.now();
      const finalMemory = process.memoryUsage().heapUsed;

      const executionTime = endTime - startTime;
      const memoryUsed = finalMemory - initialMemory;
      const throughput = result.migrated / (executionTime / 1000);
      const memoryPerInstance = memoryUsed / STANDARD_BATCH_SIZE;

      // Assert baseline performance
      expect(executionTime).toBeLessThan(BASELINE_METRICS.maxBatchProcessingTime);
      expect(throughput).toBeGreaterThan(BASELINE_METRICS.minThroughput);
      expect(memoryPerInstance).toBeLessThan(BASELINE_METRICS.maxMemoryPerInstance);

      // Verify correctness
      expect(result.totalProcessed).toBe(STANDARD_BATCH_SIZE);
      expect(result.migrated).toBe(STANDARD_BATCH_SIZE);
      expect(result.errors).toBe(0);

      console.log('✓ Baseline Performance Metrics:');
      console.log(`  - Execution time: ${executionTime}ms (baseline: <${BASELINE_METRICS.maxBatchProcessingTime}ms)`);
      console.log(`  - Throughput: ${throughput.toFixed(2)} migrations/sec (baseline: >${BASELINE_METRICS.minThroughput})`);
      console.log(`  - Memory per instance: ${(memoryPerInstance / 1024).toFixed(2)}KB (baseline: <${BASELINE_METRICS.maxMemoryPerInstance / 1024}KB)`);
    });
  });
});