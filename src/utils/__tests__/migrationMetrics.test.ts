/**
 * Tests for migration metrics collection and reporting
 */

import {
  MigrationMetricsCollector,
  migrationMetrics
} from '../migrationMetrics';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity,
  MigrationExecutionContext
} from '../../types/migration';
import { MigrationJobResult } from '../../types/job';

describe('MigrationMetricsCollector', () => {
  let metricsCollector: MigrationMetricsCollector;

  beforeEach(() => {
    metricsCollector = new MigrationMetricsCollector();
  });

  describe('initialization', () => {
    it('should initialize with default metrics', () => {
      const metrics = metricsCollector.getMetrics();

      expect(metrics.totalJobsExecuted).toBe(0);
      expect(metrics.totalInstancesProcessed).toBe(0);
      expect(metrics.totalMigrationsPerformed).toBe(0);
      expect(metrics.totalMigrationsFailed).toBe(0);
      expect(metrics.averageJobExecutionTime).toBe(0);
      expect(metrics.averageMigrationTime).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.currentStatus).toBe('idle');
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should initialize error counters for all types and severities', () => {
      const metrics = metricsCollector.getMetrics();

      // Check that all error types are initialized
      Object.values(MigrationErrorType).forEach(type => {
        expect(metrics.errorsByType[type]).toBe(0);
      });

      // Check that all error severities are initialized
      Object.values(MigrationErrorSeverity).forEach(severity => {
        expect(metrics.errorsBySeverity[severity]).toBe(0);
      });
    });
  });

  describe('recordJobStart', () => {
    it('should record job start correctly', () => {
      const jobId = 'test-job-123';
      const scheduledAt = new Date('2024-01-01T10:00:00Z');

      metricsCollector.recordJobStart(jobId, scheduledAt);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.currentStatus).toBe('running');
      expect(metrics.lastExecutionTime).toBeInstanceOf(Date);
    });
  });

  describe('recordJobCompletion', () => {
    it('should record successful job completion', () => {
      const jobId = 'test-job-123';
      const result: MigrationJobResult = {
        totalProcessed: 10,
        migrated: 8,
        skipped: 2,
        errors: 0,
        executionTimeMs: 5000
      };

      const context: MigrationExecutionContext = {
        jobId,
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 15,
        processedInstances: 10,
        steps: [],
        errors: [],
        metrics: {
          fetchTime: 1000,
          eligibilityCheckTime: 1500,
          migrationTime: 2500,
          totalTime: 5000
        }
      };

      metricsCollector.recordJobCompletion(jobId, result, context);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(1);
      expect(metrics.totalInstancesProcessed).toBe(10);
      expect(metrics.totalMigrationsPerformed).toBe(8);
      expect(metrics.totalMigrationsFailed).toBe(0);
      expect(metrics.currentStatus).toBe('idle');
      expect(metrics.averageJobExecutionTime).toBe(5000);
      expect(metrics.successRate).toBe(1); // 8/8 successful migrations
    });

    it('should record job completion with errors', () => {
      const jobId = 'test-job-456';
      const result: MigrationJobResult = {
        totalProcessed: 5,
        migrated: 2,
        skipped: 1,
        errors: 2,
        executionTimeMs: 3000
      };

      const context: MigrationExecutionContext = {
        jobId,
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 8,
        processedInstances: 5,
        steps: [],
        errors: [],
        metrics: {
          fetchTime: 500,
          eligibilityCheckTime: 1000,
          migrationTime: 1500,
          totalTime: 3000
        }
      };

      metricsCollector.recordJobCompletion(jobId, result, context);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(1);
      expect(metrics.totalInstancesProcessed).toBe(5);
      expect(metrics.totalMigrationsPerformed).toBe(2);
      expect(metrics.totalMigrationsFailed).toBe(2);
      expect(metrics.currentStatus).toBe('error');
      expect(metrics.successRate).toBe(0.5); // 2/4 successful migrations
    });

    it('should update average execution time correctly', () => {
      // First job
      const result1: MigrationJobResult = {
        totalProcessed: 5,
        migrated: 5,
        skipped: 0,
        errors: 0,
        executionTimeMs: 2000
      };

      const context1: MigrationExecutionContext = {
        jobId: 'job-1',
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 5,
        processedInstances: 5,
        steps: [],
        errors: [],
        metrics: { fetchTime: 0, eligibilityCheckTime: 0, migrationTime: 0, totalTime: 2000 }
      };

      metricsCollector.recordJobCompletion('job-1', result1, context1);

      // Second job
      const result2: MigrationJobResult = {
        totalProcessed: 3,
        migrated: 3,
        skipped: 0,
        errors: 0,
        executionTimeMs: 4000
      };

      const context2: MigrationExecutionContext = {
        jobId: 'job-2',
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 3,
        processedInstances: 3,
        steps: [],
        errors: [],
        metrics: { fetchTime: 0, eligibilityCheckTime: 0, migrationTime: 0, totalTime: 4000 }
      };

      metricsCollector.recordJobCompletion('job-2', result2, context2);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(2);
      // Average should be weighted towards more recent execution (exponential moving average)
      // With alpha=0.2: 0.2 * 4000 + 0.8 * 2000 = 800 + 1600 = 2400
      expect(metrics.averageJobExecutionTime).toBeCloseTo(2400, 0);
    });
  });

  describe('recordError', () => {
    it('should record error and update counters', () => {
      const error = new MigrationError(
        'Test error',
        MigrationErrorType.API,
        {
          severity: MigrationErrorSeverity.HIGH,
          instanceId: 'instance-123'
        }
      );

      metricsCollector.recordError(error);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.errorsByType[MigrationErrorType.API]).toBe(1);
      expect(metrics.errorsBySeverity[MigrationErrorSeverity.HIGH]).toBe(1);
      expect(metrics.recentErrors).toHaveLength(1);
      expect(metrics.recentErrors[0]).toBe(error);
    });

    it('should maintain recent errors limit', () => {
      // Add more than 20 errors
      for (let i = 0; i < 25; i++) {
        const error = new MigrationError(
          `Error ${i}`,
          MigrationErrorType.MIGRATION,
          { severity: MigrationErrorSeverity.MEDIUM }
        );
        metricsCollector.recordError(error);
      }

      const metrics = metricsCollector.getMetrics();
      expect(metrics.recentErrors).toHaveLength(20);
      expect(metrics.errorsByType[MigrationErrorType.MIGRATION]).toBe(25);
    });
  });

  describe('recordMigrationTiming', () => {
    it('should record migration timing and update average', () => {
      metricsCollector.recordMigrationTiming('instance-1', 1000);
      metricsCollector.recordMigrationTiming('instance-2', 2000);

      const metrics = metricsCollector.getMetrics();
      // With alpha=0.2: 0.2 * 2000 + 0.8 * 1000 = 400 + 800 = 1200
      expect(metrics.averageMigrationTime).toBeCloseTo(1200, 0);
    });
  });

  describe('updateNextScheduledExecution', () => {
    it('should update next scheduled execution time', () => {
      const nextExecution = new Date('2024-01-01T11:00:00Z');
      metricsCollector.updateNextScheduledExecution(nextExecution);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.nextScheduledExecution).toBe(nextExecution);
    });
  });

  describe('recordHealthCheck', () => {
    it('should record health check and update uptime', () => {
      metricsCollector.recordHealthCheck('healthy');

      const metrics = metricsCollector.getMetrics();
      expect(metrics.lastHealthCheck).toBeInstanceOf(Date);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status for good metrics', () => {
      const healthStatus = metricsCollector.getHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.uptime).toBeGreaterThanOrEqual(0);
      expect(healthStatus.recentErrors).toBe(0);
      expect(healthStatus.errorRate).toBe(0);
      expect(healthStatus.details.schedulerRunning).toBe(true);
      expect(healthStatus.details.consecutiveFailures).toBe(0);
    });

    it('should return degraded status for moderate error rate', () => {
      // Simulate some errors but not too many
      const error = new MigrationError(
        'Test error',
        MigrationErrorType.NETWORK,
        { severity: MigrationErrorSeverity.MEDIUM }
      );
      metricsCollector.recordError(error);

      // Simulate a job with some errors
      const result: MigrationJobResult = {
        totalProcessed: 10,
        migrated: 7,
        skipped: 1,
        errors: 2,
        executionTimeMs: 5000
      };

      const context: MigrationExecutionContext = {
        jobId: 'test-job',
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 10,
        processedInstances: 10,
        steps: [],
        errors: [error],
        metrics: { fetchTime: 0, eligibilityCheckTime: 0, migrationTime: 0, totalTime: 5000 }
      };

      metricsCollector.recordJobCompletion('test-job', result, context);

      const healthStatus = metricsCollector.getHealthStatus();
      expect(['healthy', 'degraded']).toContain(healthStatus.status);
    });
  });

  describe('getExecutionStats', () => {
    it('should return empty stats when no executions', () => {
      const stats = metricsCollector.getExecutionStats();

      expect(stats.executions).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
      expect(stats.averageInstancesProcessed).toBe(0);
      expect(stats.averageMigrations).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should calculate execution stats correctly', () => {
      // Record a successful job
      const result: MigrationJobResult = {
        totalProcessed: 5,
        migrated: 5,
        skipped: 0,
        errors: 0,
        executionTimeMs: 3000
      };

      const context: MigrationExecutionContext = {
        jobId: 'test-job',
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 5,
        processedInstances: 5,
        steps: [
          {
            step: 'migration',
            startTime: new Date(),
            endTime: new Date(),
            status: 'completed'
          },
          {
            step: 'migration',
            startTime: new Date(),
            endTime: new Date(),
            status: 'completed'
          }
        ],
        errors: [],
        metrics: { fetchTime: 0, eligibilityCheckTime: 0, migrationTime: 0, totalTime: 3000 }
      };

      metricsCollector.recordJobCompletion('test-job', result, context);

      const stats = metricsCollector.getExecutionStats();
      expect(stats.executions).toBe(1);
      expect(stats.averageExecutionTime).toBe(3000);
      expect(stats.averageInstancesProcessed).toBe(5);
      expect(stats.averageMigrations).toBe(2); // 2 completed migration steps
      expect(stats.successRate).toBe(1); // No errors in execution
    });
  });

  describe('exportMetrics', () => {
    it('should export comprehensive metrics for monitoring', () => {
      const exported = metricsCollector.exportMetrics();

      expect(exported.timestamp).toBeDefined();
      expect(exported.service).toBe('migration');
      expect(exported.metrics).toBeDefined();
      expect(exported.health).toBeDefined();
      expect(exported.execution_stats).toBeDefined();
      expect(exported.error_summary).toBeDefined();

      expect(exported.error_summary.total_errors).toBe(0);
      expect(exported.error_summary.error_distribution).toBeDefined();
      expect(exported.error_summary.severity_distribution).toBeDefined();
      expect(exported.error_summary.recent_error_count).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      // Add some data first
      const error = new MigrationError(
        'Test error',
        MigrationErrorType.API,
        { severity: MigrationErrorSeverity.HIGH }
      );
      metricsCollector.recordError(error);

      const result: MigrationJobResult = {
        totalProcessed: 5,
        migrated: 3,
        skipped: 1,
        errors: 1,
        executionTimeMs: 2000
      };

      const context: MigrationExecutionContext = {
        jobId: 'test-job',
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        totalInstances: 5,
        processedInstances: 5,
        steps: [],
        errors: [error],
        metrics: { fetchTime: 0, eligibilityCheckTime: 0, migrationTime: 0, totalTime: 2000 }
      };

      metricsCollector.recordJobCompletion('test-job', result, context);

      // Verify data exists
      let metrics = metricsCollector.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(1);
      expect(metrics.recentErrors.length).toBe(1);

      // Reset
      metricsCollector.resetMetrics();

      // Verify reset
      metrics = metricsCollector.getMetrics();
      expect(metrics.totalJobsExecuted).toBe(0);
      expect(metrics.totalInstancesProcessed).toBe(0);
      expect(metrics.totalMigrationsPerformed).toBe(0);
      expect(metrics.recentErrors.length).toBe(0);
      expect(metrics.currentStatus).toBe('idle');
    });
  });

  describe('singleton instance', () => {
    it('should provide a singleton instance', () => {
      expect(migrationMetrics).toBeInstanceOf(MigrationMetricsCollector);
    });
  });
});