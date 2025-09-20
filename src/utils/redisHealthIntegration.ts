import { redisMetricsCollector, RedisHealthChecker } from './redisMetrics';
import { logger } from './logger';

/**
 * Redis health status for API responses
 */
export interface RedisHealthStatus {
  status: 'up' | 'down' | 'degraded';
  isConnected: boolean;
  responseTime?: number | undefined;
  errorRate: number;
  operationsPerSecond: number;
  consecutiveFailures: number;
  uptime: number;
  lastHealthCheck?: string | undefined;
  error?: string | undefined;
}

/**
 * Detailed Redis health information
 */
export interface RedisHealthDetails {
  status: 'up' | 'down' | 'degraded';
  connection: {
    isConnected: boolean;
    attempts: number;
    failures: number;
    uptime: number;
    lastConnected?: string | undefined;
    lastFailure?: string | undefined;
  };
  performance: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageLatency: number;
    operationsPerSecond: number;
    errorRate: number;
  };
  health: {
    isHealthy: boolean;
    consecutiveFailures: number;
    lastHealthCheck?: string | undefined;
  };
  commands: Array<{
    command: string;
    count: number;
    averageLatency: number;
    errorRate: number;
  }>;
}

/**
 * Redis health integration for the main health endpoint
 */
export class RedisHealthIntegration {
  private healthChecker?: RedisHealthChecker | undefined;
  private pingOperation?: (() => Promise<string>) | undefined;

  constructor(pingOperation?: (() => Promise<string>) | undefined) {
    this.pingOperation = pingOperation;
    if (pingOperation) {
      this.healthChecker = new RedisHealthChecker(redisMetricsCollector, pingOperation);
    }
  }

  /**
   * Start Redis health monitoring
   */
  startHealthMonitoring(intervalMs: number = 30000): void {
    if (this.healthChecker) {
      this.healthChecker.startHealthChecks(intervalMs);
      logger.info('Redis health monitoring started', {
        intervalMs,
        category: 'redis-health'
      });
    } else {
      logger.warn('Redis health monitoring not started - no ping operation configured', {
        category: 'redis-health'
      });
    }
  }

  /**
   * Stop Redis health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthChecker) {
      this.healthChecker.stopHealthChecks();
      logger.info('Redis health monitoring stopped', {
        category: 'redis-health'
      });
    }
  }

  /**
   * Perform a single Redis health check
   */
  async performHealthCheck(): Promise<boolean> {
    if (!this.healthChecker) {
      return false;
    }

    try {
      return await this.healthChecker.performHealthCheck();
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error),
        category: 'redis-health'
      });
      return false;
    }
  }

  /**
   * Get Redis health status for the main health endpoint
   */
  getHealthStatus(): RedisHealthStatus {
    const metrics = redisMetricsCollector.getMetrics();
    const performanceSummary = redisMetricsCollector.getPerformanceSummary();

    // Determine status based on health and performance
    let status: 'up' | 'down' | 'degraded' = 'down';
    
    if (metrics.connection.isConnected) {
      if (performanceSummary.isHealthy) {
        status = 'up';
      } else {
        status = 'degraded';
      }
    }

    // Calculate response time from recent PING operations
    const commandStats = redisMetricsCollector.getCommandStats();
    const pingStats = commandStats.find(cmd => cmd.command === 'PING');
    const responseTime = pingStats?.averageLatency;

    return {
      status,
      isConnected: metrics.connection.isConnected,
      responseTime,
      errorRate: performanceSummary.errorRate,
      operationsPerSecond: performanceSummary.operationsPerSecond,
      consecutiveFailures: metrics.health.consecutiveFailures,
      uptime: metrics.connection.uptime,
      lastHealthCheck: metrics.health.lastHealthCheck?.toISOString()
    };
  }

  /**
   * Get detailed Redis health information
   */
  getDetailedHealthInfo(): RedisHealthDetails {
    const metrics = redisMetricsCollector.getMetrics();
    const commandStats = redisMetricsCollector.getCommandStats();

    // Determine overall status
    let status: 'up' | 'down' | 'degraded' = 'down';
    
    if (metrics.connection.isConnected) {
      if (metrics.health.isHealthy) {
        status = 'up';
      } else {
        status = 'degraded';
      }
    }

    return {
      status,
      connection: {
        isConnected: metrics.connection.isConnected,
        attempts: metrics.connection.connectionAttempts,
        failures: metrics.connection.connectionFailures,
        uptime: metrics.connection.uptime,
        lastConnected: metrics.connection.lastConnectionTime?.toISOString(),
        lastFailure: metrics.connection.lastFailureTime?.toISOString()
      },
      performance: {
        totalOperations: metrics.performance.totalOperations,
        successfulOperations: metrics.performance.successfulOperations,
        failedOperations: metrics.performance.failedOperations,
        averageLatency: metrics.performance.averageLatency,
        operationsPerSecond: metrics.performance.operationsPerSecond,
        errorRate: metrics.performance.errorRate
      },
      health: {
        isHealthy: metrics.health.isHealthy,
        consecutiveFailures: metrics.health.consecutiveFailures,
        lastHealthCheck: metrics.health.lastHealthCheck?.toISOString()
      },
      commands: commandStats.map(cmd => ({
        command: cmd.command,
        count: cmd.count,
        averageLatency: cmd.averageLatency,
        errorRate: cmd.errorRate
      }))
    };
  }

  /**
   * Check if Redis is healthy for the main health endpoint
   */
  isHealthy(): boolean {
    const metrics = redisMetricsCollector.getMetrics();
    return metrics.connection.isConnected && metrics.health.isHealthy;
  }

  /**
   * Record Redis connection event
   */
  recordConnection(success: boolean, error?: string): void {
    redisMetricsCollector.recordConnection(success, error);
  }

  /**
   * Record Redis disconnection event
   */
  recordDisconnection(): void {
    redisMetricsCollector.recordDisconnection();
  }

  /**
   * Record Redis operation metrics
   */
  recordOperation(command: string, key: string | undefined, duration: number, success: boolean, error?: string): void {
    const operation: any = {
      command,
      duration,
      success,
      timestamp: new Date()
    };
    
    if (key !== undefined) {
      operation.key = key;
    }
    
    if (error !== undefined) {
      operation.error = error;
    }
    
    redisMetricsCollector.recordOperation(operation);
  }

  /**
   * Get Redis metrics for monitoring dashboards
   */
  getMetricsForMonitoring(): {
    connection: {
      isConnected: boolean;
      uptime: number;
      connectionAttempts: number;
      connectionFailures: number;
    };
    performance: {
      operationsPerSecond: number;
      averageLatency: number;
      errorRate: number;
      totalOperations: number;
    };
    topCommands: Array<{
      command: string;
      count: number;
      averageLatency: number;
      errorRate: number;
    }>;
  } {
    const metrics = redisMetricsCollector.getMetrics();
    const commandStats = redisMetricsCollector.getCommandStats();

    // Get top 10 most used commands
    const topCommands = commandStats
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      connection: {
        isConnected: metrics.connection.isConnected,
        uptime: metrics.connection.uptime,
        connectionAttempts: metrics.connection.connectionAttempts,
        connectionFailures: metrics.connection.connectionFailures
      },
      performance: {
        operationsPerSecond: metrics.performance.operationsPerSecond,
        averageLatency: metrics.performance.averageLatency,
        errorRate: metrics.performance.errorRate,
        totalOperations: metrics.performance.totalOperations
      },
      topCommands
    };
  }

  /**
   * Reset Redis metrics (useful for testing)
   */
  resetMetrics(): void {
    redisMetricsCollector.reset();
    logger.info('Redis metrics reset', { category: 'redis-health' });
  }
}

// Export singleton instance
export const redisHealthIntegration = new RedisHealthIntegration();