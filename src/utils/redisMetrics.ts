import { logger } from './logger';

/**
 * Redis operation metrics interface
 */
export interface RedisOperationMetrics {
  command: string;
  key?: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

/**
 * Redis connection metrics interface
 */
export interface RedisConnectionMetrics {
  isConnected: boolean;
  connectionAttempts: number;
  connectionFailures: number;
  lastConnectionTime?: Date;
  lastFailureTime?: Date;
  uptime: number;
}

/**
 * Redis performance metrics interface
 */
export interface RedisPerformanceMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  operationsPerSecond: number;
  errorRate: number;
  lastOperationTime?: Date | undefined;
}

/**
 * Redis command-specific metrics
 */
export interface RedisCommandMetrics {
  [command: string]: {
    count: number;
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successCount: number;
    errorCount: number;
    lastExecuted?: Date;
  };
}

/**
 * Comprehensive Redis metrics
 */
export interface RedisMetrics {
  connection: RedisConnectionMetrics;
  performance: RedisPerformanceMetrics;
  commands: RedisCommandMetrics;
  health: {
    isHealthy: boolean;
    lastHealthCheck?: Date | undefined;
    consecutiveFailures: number;
    uptime: number;
  };
}

/**
 * Redis metrics collector and aggregator
 */
export class RedisMetricsCollector {
  private operationMetrics: RedisOperationMetrics[] = [];
  private connectionMetrics: RedisConnectionMetrics;
  private commandMetrics: RedisCommandMetrics = {};
  private startTime: Date = new Date();
  private consecutiveFailures: number = 0;
  private lastHealthCheck: Date | undefined = undefined;

  constructor() {
    this.connectionMetrics = {
      isConnected: false,
      connectionAttempts: 0,
      connectionFailures: 0,
      uptime: 0
    };
  }

  /**
   * Record a Redis operation
   */
  recordOperation(metrics: RedisOperationMetrics): void {
    this.operationMetrics.push(metrics);
    this.updateCommandMetrics(metrics);

    // Keep only last 1000 operations to prevent memory leaks
    if (this.operationMetrics.length > 1000) {
      this.operationMetrics = this.operationMetrics.slice(-1000);
    }

    // Update consecutive failures counter
    if (metrics.success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }

    // Log high latency operations
    if (metrics.duration > 1000) { // 1 second threshold
      logger.warn('High latency Redis operation detected', {
        command: metrics.command,
        key: metrics.key,
        duration: metrics.duration,
        category: 'redis-metrics'
      });
    }

    // Log errors
    if (!metrics.success && metrics.error) {
      logger.error('Redis operation failed', {
        command: metrics.command,
        key: metrics.key,
        error: metrics.error,
        duration: metrics.duration,
        category: 'redis-metrics'
      });
    }
  }

  /**
   * Record connection event
   */
  recordConnection(success: boolean, error?: string): void {
    this.connectionMetrics.connectionAttempts++;

    if (success) {
      this.connectionMetrics.isConnected = true;
      this.connectionMetrics.lastConnectionTime = new Date();
      this.consecutiveFailures = 0;

      logger.info('Redis connection established', {
        attempts: this.connectionMetrics.connectionAttempts,
        category: 'redis-metrics'
      });
    } else {
      this.connectionMetrics.isConnected = false;
      this.connectionMetrics.connectionFailures++;
      this.connectionMetrics.lastFailureTime = new Date();

      logger.error('Redis connection failed', {
        error,
        attempts: this.connectionMetrics.connectionAttempts,
        failures: this.connectionMetrics.connectionFailures,
        category: 'redis-metrics'
      });
    }
  }

  /**
   * Record disconnection event
   */
  recordDisconnection(): void {
    this.connectionMetrics.isConnected = false;

    logger.info('Redis disconnected', {
      uptime: this.getUptime(),
      category: 'redis-metrics'
    });
  }

  /**
   * Record health check result
   */
  recordHealthCheck(isHealthy: boolean, error?: string): void {
    this.lastHealthCheck = new Date();

    if (!isHealthy) {
      logger.warn('Redis health check failed', {
        error,
        consecutiveFailures: this.consecutiveFailures,
        category: 'redis-metrics'
      });
    } else {
      logger.debug('Redis health check passed', {
        category: 'redis-metrics'
      });
    }
  }

  /**
   * Get comprehensive Redis metrics
   */
  getMetrics(): RedisMetrics {
    const now = new Date();
    const uptime = this.getUptime();

    return {
      connection: {
        ...this.connectionMetrics,
        uptime
      },
      performance: this.calculatePerformanceMetrics(),
      commands: { ...this.commandMetrics },
      health: {
        isHealthy: this.isHealthy(),
        lastHealthCheck: this.lastHealthCheck,
        consecutiveFailures: this.consecutiveFailures,
        uptime
      }
    };
  }

  /**
   * Get performance summary for health checks
   */
  getPerformanceSummary(): {
    operationsPerSecond: number;
    averageLatency: number;
    errorRate: number;
    isHealthy: boolean;
  } {
    const performance = this.calculatePerformanceMetrics();

    return {
      operationsPerSecond: performance.operationsPerSecond,
      averageLatency: performance.averageLatency,
      errorRate: performance.errorRate,
      isHealthy: this.isHealthy()
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.operationMetrics = [];
    this.commandMetrics = {};
    this.consecutiveFailures = 0;
    this.lastHealthCheck = undefined;
    this.startTime = new Date();

    this.connectionMetrics = {
      isConnected: false,
      connectionAttempts: 0,
      connectionFailures: 0,
      uptime: 0
    };

    logger.info('Redis metrics reset', { category: 'redis-metrics' });
  }

  /**
   * Get metrics for a specific time window (in minutes)
   */
  getMetricsForWindow(windowMinutes: number): RedisOperationMetrics[] {
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.operationMetrics.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * Get command statistics
   */
  getCommandStats(): Array<{
    command: string;
    count: number;
    averageLatency: number;
    errorRate: number;
    lastExecuted?: Date | undefined;
  }> {
    return Object.entries(this.commandMetrics).map(([command, stats]) => ({
      command,
      count: stats.count,
      averageLatency: stats.averageDuration,
      errorRate: stats.count > 0 ? (stats.errorCount / stats.count) * 100 : 0,
      lastExecuted: stats.lastExecuted
    }));
  }

  private updateCommandMetrics(operation: RedisOperationMetrics): void {
    const command = operation.command.toUpperCase();

    if (!this.commandMetrics[command]) {
      this.commandMetrics[command] = {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        successCount: 0,
        errorCount: 0
      };
    }

    const stats = this.commandMetrics[command];
    stats.count++;
    stats.totalDuration += operation.duration;
    stats.averageDuration = stats.totalDuration / stats.count;
    stats.minDuration = Math.min(stats.minDuration, operation.duration);
    stats.maxDuration = Math.max(stats.maxDuration, operation.duration);
    stats.lastExecuted = operation.timestamp;

    if (operation.success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
  }

  private calculatePerformanceMetrics(): RedisPerformanceMetrics {
    if (this.operationMetrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        operationsPerSecond: 0,
        errorRate: 0
      };
    }

    const totalOperations = this.operationMetrics.length;
    const successfulOperations = this.operationMetrics.filter(op => op.success).length;
    const failedOperations = totalOperations - successfulOperations;

    const durations = this.operationMetrics.map(op => op.duration);
    const averageLatency = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    const minLatency = Math.min(...durations);
    const maxLatency = Math.max(...durations);

    // Calculate operations per second based on last minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentOperations = this.operationMetrics.filter(op => op.timestamp >= oneMinuteAgo);
    const operationsPerSecond = recentOperations.length / 60;

    const errorRate = totalOperations > 0 ? (failedOperations / totalOperations) * 100 : 0;

    const lastOperation = this.operationMetrics[this.operationMetrics.length - 1];

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageLatency,
      minLatency,
      maxLatency,
      operationsPerSecond,
      errorRate,
      lastOperationTime: lastOperation?.timestamp
    };
  }

  private isHealthy(): boolean {
    // Consider unhealthy if:
    // 1. Not connected
    // 2. More than 5 consecutive failures
    // 3. Error rate > 50% in last 10 operations
    if (!this.connectionMetrics.isConnected) {
      return false;
    }

    if (this.consecutiveFailures > 5) {
      return false;
    }

    const recentOperations = this.operationMetrics.slice(-10);
    if (recentOperations.length >= 5) {
      const recentErrors = recentOperations.filter(op => !op.success).length;
      const recentErrorRate = (recentErrors / recentOperations.length) * 100;
      if (recentErrorRate > 50) {
        return false;
      }
    }

    return true;
  }

  private getUptime(): number {
    if (!this.connectionMetrics.lastConnectionTime) {
      return 0;
    }

    return Date.now() - this.connectionMetrics.lastConnectionTime.getTime();
  }
}

/**
 * Redis health checker
 */
export class RedisHealthChecker {
  private metricsCollector: RedisMetricsCollector;
  private healthCheckInterval: NodeJS.Timeout | undefined = undefined;
  private pingOperation: (() => Promise<string>) | undefined;

  constructor(
    metricsCollector: RedisMetricsCollector,
    pingOperation?: (() => Promise<string>) | undefined
  ) {
    this.metricsCollector = metricsCollector;
    this.pingOperation = pingOperation;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      this.stopHealthChecks();
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);

    logger.info('Redis health checks started', {
      intervalMs,
      category: 'redis-metrics'
    });
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;

      logger.info('Redis health checks stopped', {
        category: 'redis-metrics'
      });
    }
  }

  /**
   * Perform a single health check
   */
  async performHealthCheck(): Promise<boolean> {
    if (!this.pingOperation) {
      logger.warn('No ping operation configured for health check', {
        category: 'redis-metrics'
      });
      return false;
    }

    const startTime = Date.now();

    try {
      await this.pingOperation();
      const duration = Date.now() - startTime;

      this.metricsCollector.recordOperation({
        command: 'PING',
        duration,
        success: true,
        timestamp: new Date()
      });

      this.metricsCollector.recordHealthCheck(true);

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.metricsCollector.recordOperation({
        command: 'PING',
        duration,
        success: false,
        error: errorMessage,
        timestamp: new Date()
      });

      this.metricsCollector.recordHealthCheck(false, errorMessage);

      return false;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    lastCheck?: Date | undefined;
    consecutiveFailures: number;
    uptime: number;
  } {
    const metrics = this.metricsCollector.getMetrics();
    return {
      isHealthy: metrics.health.isHealthy,
      lastCheck: metrics.health.lastHealthCheck,
      consecutiveFailures: metrics.health.consecutiveFailures,
      uptime: metrics.health.uptime
    };
  }
}

// Export singleton instance
export const redisMetricsCollector = new RedisMetricsCollector();