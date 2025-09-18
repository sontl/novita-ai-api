/**
 * Migration metrics collection and reporting system
 */

import { logger } from './logger';
import {
  MigrationMetrics,
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity,
  MigrationExecutionContext,
  MigrationHealthStatus
} from '../types/migration';
import { MigrationJobResult } from '../types/job';

/**
 * Migration metrics collector with comprehensive monitoring capabilities
 */
export class MigrationMetricsCollector {
  private metrics: MigrationMetrics;
  private executionHistory: MigrationExecutionContext[];
  private readonly maxHistorySize = 50;
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
    this.executionHistory = [];
  }

  /**
   * Initialize metrics with default values
   */
  private initializeMetrics(): MigrationMetrics {
    return {
      // Execution metrics
      totalJobsExecuted: 0,
      totalInstancesProcessed: 0,
      totalMigrationsPerformed: 0,
      totalMigrationsFailed: 0,

      // Timing metrics
      averageJobExecutionTime: 0,
      averageMigrationTime: 0,
      lastExecutionTime: undefined,
      nextScheduledExecution: undefined,

      // Error metrics
      errorRate: 0,
      errorsByType: this.initializeErrorsByType(),
      errorsBySeverity: this.initializeErrorsBySeverity(),
      recentErrors: [],

      // Performance metrics
      instancesPerMinute: 0,
      successRate: 0,
      retryRate: 0,

      // Status metrics
      currentStatus: 'idle',
      uptime: 0,
      lastHealthCheck: undefined
    };
  }

  /**
   * Initialize error counters by type
   */
  private initializeErrorsByType(): Record<MigrationErrorType, number> {
    const errorsByType: Record<MigrationErrorType, number> = {} as any;
    Object.values(MigrationErrorType).forEach(type => {
      errorsByType[type] = 0;
    });
    return errorsByType;
  }

  /**
   * Initialize error counters by severity
   */
  private initializeErrorsBySeverity(): Record<MigrationErrorSeverity, number> {
    const errorsBySeverity: Record<MigrationErrorSeverity, number> = {} as any;
    Object.values(MigrationErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });
    return errorsBySeverity;
  }

  /**
   * Record the start of a migration job execution
   */
  recordJobStart(jobId: string, scheduledAt: Date): void {
    this.metrics.currentStatus = 'running';
    this.metrics.lastExecutionTime = new Date();

    logger.info('Migration job started', {
      jobId,
      scheduledAt: scheduledAt.toISOString(),
      startedAt: this.metrics.lastExecutionTime.toISOString(),
      totalJobsExecuted: this.metrics.totalJobsExecuted
    });
  }

  /**
   * Record the completion of a migration job execution
   */
  recordJobCompletion(
    jobId: string,
    result: MigrationJobResult,
    context: MigrationExecutionContext
  ): void {
    const now = new Date();
    const executionTime = result.executionTimeMs;

    // Update execution metrics
    this.metrics.totalJobsExecuted++;
    this.metrics.totalInstancesProcessed += result.totalProcessed;
    this.metrics.totalMigrationsPerformed += result.migrated;
    this.metrics.totalMigrationsFailed += result.errors;

    // Update timing metrics
    this.updateAverageExecutionTime(executionTime);
    this.metrics.lastExecutionTime = now;

    // Update performance metrics
    this.updatePerformanceMetrics(result, executionTime);

    // Update status
    this.metrics.currentStatus = result.errors > 0 ? 'error' : 'idle';

    // Add to execution history
    this.addToExecutionHistory(context);

    // Log completion
    logger.info('Migration job completed', {
      jobId,
      result,
      executionTimeMs: executionTime,
      totalJobsExecuted: this.metrics.totalJobsExecuted,
      successRate: this.metrics.successRate,
      errorRate: this.metrics.errorRate
    });
  }

  /**
   * Record a migration error
   */
  recordError(error: MigrationError): void {
    // Update error counters
    this.metrics.errorsByType[error.type]++;
    this.metrics.errorsBySeverity[error.severity]++;

    // Add to recent errors (keep last 20)
    this.metrics.recentErrors.unshift(error);
    if (this.metrics.recentErrors.length > 20) {
      this.metrics.recentErrors = this.metrics.recentErrors.slice(0, 20);
    }

    // Update error rate
    this.updateErrorRate();

    logger.debug('Migration error recorded', {
      errorType: error.type,
      severity: error.severity,
      instanceId: error.instanceId,
      totalErrorsByType: this.metrics.errorsByType[error.type],
      currentErrorRate: this.metrics.errorRate
    });
  }

  /**
   * Record migration timing for a specific instance
   */
  recordMigrationTiming(instanceId: string, migrationTimeMs: number): void {
    this.updateAverageMigrationTime(migrationTimeMs);

    logger.debug('Migration timing recorded', {
      instanceId,
      migrationTimeMs,
      averageMigrationTime: this.metrics.averageMigrationTime
    });
  }

  /**
   * Update the next scheduled execution time
   */
  updateNextScheduledExecution(nextExecution: Date): void {
    this.metrics.nextScheduledExecution = nextExecution;
  }

  /**
   * Record a health check
   */
  recordHealthCheck(status: 'healthy' | 'degraded' | 'unhealthy'): void {
    this.metrics.lastHealthCheck = new Date();
    this.metrics.uptime = Date.now() - this.startTime.getTime();

    if (status !== 'healthy') {
      logger.warn('Migration service health check failed', {
        status,
        uptime: this.metrics.uptime,
        lastExecution: this.metrics.lastExecutionTime?.toISOString(),
        errorRate: this.metrics.errorRate
      });
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): MigrationMetrics {
    // Update uptime
    this.metrics.uptime = Date.now() - this.startTime.getTime();
    
    return { ...this.metrics };
  }

  /**
   * Get detailed health status
   */
  getHealthStatus(): MigrationHealthStatus {
    const now = new Date();
    const recentErrors = this.metrics.recentErrors.filter(error => 
      now.getTime() - error.timestamp.getTime() < 15 * 60 * 1000 // Last 15 minutes
    ).length;

    const consecutiveFailures = this.getConsecutiveFailures();
    const lastSuccessfulExecution = this.getLastSuccessfulExecution();

    let status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
    
    if (this.metrics.currentStatus === 'idle' && this.metrics.errorRate < 0.1) {
      status = 'healthy';
    } else if (this.metrics.errorRate < 0.3 && consecutiveFailures < 3) {
      status = 'degraded';
    } else if (this.metrics.currentStatus === 'disabled') {
      status = 'disabled';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      lastExecution: this.metrics.lastExecutionTime,
      nextExecution: this.metrics.nextScheduledExecution,
      recentErrors,
      errorRate: this.metrics.errorRate,
      uptime: this.metrics.uptime,
      details: {
        schedulerRunning: this.metrics.currentStatus !== 'disabled',
        lastSuccessfulExecution,
        consecutiveFailures,
        avgExecutionTime: this.metrics.averageJobExecutionTime
      }
    };
  }

  /**
   * Get execution statistics for the last N executions
   */
  getExecutionStats(limit: number = 10): {
    executions: number;
    averageExecutionTime: number;
    averageInstancesProcessed: number;
    averageMigrations: number;
    successRate: number;
  } {
    const recentExecutions = this.executionHistory.slice(0, limit);
    
    if (recentExecutions.length === 0) {
      return {
        executions: 0,
        averageExecutionTime: 0,
        averageInstancesProcessed: 0,
        averageMigrations: 0,
        successRate: 0
      };
    }

    const totalTime = recentExecutions.reduce((sum, exec) => sum + exec.metrics.totalTime, 0);
    const totalInstances = recentExecutions.reduce((sum, exec) => sum + exec.processedInstances, 0);
    const totalMigrations = recentExecutions.reduce((sum, exec) => 
      sum + exec.steps.filter(step => step.step === 'migration' && step.status === 'completed').length, 0
    );
    const successfulExecutions = recentExecutions.filter(exec => exec.errors.length === 0).length;

    return {
      executions: recentExecutions.length,
      averageExecutionTime: totalTime / recentExecutions.length,
      averageInstancesProcessed: totalInstances / recentExecutions.length,
      averageMigrations: totalMigrations / recentExecutions.length,
      successRate: successfulExecutions / recentExecutions.length
    };
  }

  /**
   * Reset metrics (for testing or maintenance)
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.executionHistory = [];
    this.startTime = new Date();

    logger.info('Migration metrics reset', {
      resetAt: this.startTime.toISOString()
    });
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): Record<string, any> {
    const healthStatus = this.getHealthStatus();
    const executionStats = this.getExecutionStats();

    return {
      timestamp: new Date().toISOString(),
      service: 'migration',
      metrics: this.getMetrics(),
      health: healthStatus,
      execution_stats: executionStats,
      error_summary: {
        total_errors: Object.values(this.metrics.errorsByType).reduce((sum, count) => sum + count, 0),
        error_distribution: this.metrics.errorsByType,
        severity_distribution: this.metrics.errorsBySeverity,
        recent_error_count: this.metrics.recentErrors.length
      }
    };
  }

  /**
   * Update average execution time with new measurement
   */
  private updateAverageExecutionTime(newTime: number): void {
    if (this.metrics.totalJobsExecuted === 1) {
      // First job, set as initial value
      this.metrics.averageJobExecutionTime = newTime;
    } else {
      // Exponential moving average
      const alpha = 0.2; // Weight for new measurement
      this.metrics.averageJobExecutionTime = 
        alpha * newTime + (1 - alpha) * this.metrics.averageJobExecutionTime;
    }
  }

  /**
   * Update average migration time with new measurement
   */
  private updateAverageMigrationTime(newTime: number): void {
    if (this.metrics.averageMigrationTime === 0) {
      // First migration, set as initial value
      this.metrics.averageMigrationTime = newTime;
    } else {
      // Exponential moving average
      const alpha = 0.2;
      this.metrics.averageMigrationTime = 
        alpha * newTime + (1 - alpha) * this.metrics.averageMigrationTime;
    }
  }

  /**
   * Update performance metrics based on job result
   */
  private updatePerformanceMetrics(result: MigrationJobResult, executionTimeMs: number): void {
    // Calculate instances per minute
    if (executionTimeMs > 0) {
      const instancesPerMs = result.totalProcessed / executionTimeMs;
      this.metrics.instancesPerMinute = instancesPerMs * 60 * 1000;
    }

    // Update success rate
    if (this.metrics.totalInstancesProcessed > 0) {
      const totalSuccessful = this.metrics.totalMigrationsPerformed;
      const totalAttempted = this.metrics.totalMigrationsPerformed + this.metrics.totalMigrationsFailed;
      this.metrics.successRate = totalAttempted > 0 ? totalSuccessful / totalAttempted : 0;
    }

    // Update retry rate (simplified - would need more detailed tracking in practice)
    this.metrics.retryRate = this.metrics.totalMigrationsFailed / Math.max(this.metrics.totalInstancesProcessed, 1);
  }

  /**
   * Update error rate based on recent performance
   */
  private updateErrorRate(): void {
    if (this.metrics.totalJobsExecuted === 0) {
      this.metrics.errorRate = 0;
      return;
    }

    // Calculate error rate based on recent executions
    const recentExecutions = this.executionHistory.slice(0, 10);
    if (recentExecutions.length === 0) {
      this.metrics.errorRate = 0;
      return;
    }

    const executionsWithErrors = recentExecutions.filter(exec => exec.errors.length > 0).length;
    this.metrics.errorRate = executionsWithErrors / recentExecutions.length;
  }

  /**
   * Add execution context to history
   */
  private addToExecutionHistory(context: MigrationExecutionContext): void {
    this.executionHistory.unshift(context);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get number of consecutive failures
   */
  private getConsecutiveFailures(): number {
    let failures = 0;
    for (const execution of this.executionHistory) {
      if (execution.errors.length > 0) {
        failures++;
      } else {
        break;
      }
    }
    return failures;
  }

  /**
   * Get last successful execution time
   */
  private getLastSuccessfulExecution(): Date | undefined {
    for (const execution of this.executionHistory) {
      if (execution.errors.length === 0 && execution.completedAt) {
        return execution.completedAt;
      }
    }
    return undefined;
  }
}

// Export singleton instance
export const migrationMetrics = new MigrationMetricsCollector();