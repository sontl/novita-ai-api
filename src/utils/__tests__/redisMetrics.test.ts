import {
  RedisMetricsCollector,
  RedisHealthChecker,
  RedisOperationMetrics,
  redisMetricsCollector
} from '../redisMetrics';

// Mock the logger and metrics service
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../services/metricsService', () => ({
  metricsService: {
    recordRequest: jest.fn()
  }
}));

describe('RedisMetricsCollector', () => {
  let collector: RedisMetricsCollector;

  beforeEach(() => {
    collector = new RedisMetricsCollector();
  });

  describe('recordOperation', () => {
    it('should record successful operation', () => {
      const operation: RedisOperationMetrics = {
        command: 'GET',
        key: 'test-key',
        duration: 10,
        success: true,
        timestamp: new Date()
      };

      collector.recordOperation(operation);

      const metrics = collector.getMetrics();
      expect(metrics.performance.totalOperations).toBe(1);
      expect(metrics.performance.successfulOperations).toBe(1);
      expect(metrics.performance.failedOperations).toBe(0);
      expect(metrics.performance.averageLatency).toBe(10);
      expect(metrics.commands.GET).toBeDefined();
      expect(metrics.commands.GET!.count).toBe(1);
      expect(metrics.commands.GET!.successCount).toBe(1);
    });

    it('should record failed operation', () => {
      const operation: RedisOperationMetrics = {
        command: 'SET',
        key: 'test-key',
        duration: 50,
        success: false,
        error: 'Connection failed',
        timestamp: new Date()
      };

      collector.recordOperation(operation);

      const metrics = collector.getMetrics();
      expect(metrics.performance.totalOperations).toBe(1);
      expect(metrics.performance.successfulOperations).toBe(0);
      expect(metrics.performance.failedOperations).toBe(1);
      expect(metrics.performance.errorRate).toBe(100);
      expect(metrics.commands.SET).toBeDefined();
      expect(metrics.commands.SET!.errorCount).toBe(1);
      expect(metrics.health.consecutiveFailures).toBe(1);
    });

    it('should update command metrics correctly', () => {
      const operations: RedisOperationMetrics[] = [
        {
          command: 'GET',
          duration: 10,
          success: true,
          timestamp: new Date()
        },
        {
          command: 'GET',
          duration: 20,
          success: true,
          timestamp: new Date()
        },
        {
          command: 'GET',
          duration: 30,
          success: false,
          error: 'Timeout',
          timestamp: new Date()
        }
      ];

      operations.forEach(op => collector.recordOperation(op));

      const metrics = collector.getMetrics();
      const getStats = metrics.commands.GET;
      
      expect(getStats!.count).toBe(3);
      expect(getStats!.successCount).toBe(2);
      expect(getStats!.errorCount).toBe(1);
      expect(getStats!.averageDuration).toBe(20);
      expect(getStats!.minDuration).toBe(10);
      expect(getStats!.maxDuration).toBe(30);
    });

    it('should limit stored operations to prevent memory leaks', () => {
      // Record more than 1000 operations
      for (let i = 0; i < 1100; i++) {
        collector.recordOperation({
          command: 'GET',
          duration: 10,
          success: true,
          timestamp: new Date()
        });
      }

      const windowMetrics = collector.getMetricsForWindow(60); // Last hour
      expect(windowMetrics.length).toBeLessThanOrEqual(1000);
    });

    it('should reset consecutive failures on success', () => {
      // Record failures
      for (let i = 0; i < 3; i++) {
        collector.recordOperation({
          command: 'GET',
          duration: 10,
          success: false,
          error: 'Error',
          timestamp: new Date()
        });
      }

      let metrics = collector.getMetrics();
      expect(metrics.health.consecutiveFailures).toBe(3);

      // Record success
      collector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date()
      });

      metrics = collector.getMetrics();
      expect(metrics.health.consecutiveFailures).toBe(0);
    });
  });

  describe('recordConnection', () => {
    it('should record successful connection', () => {
      collector.recordConnection(true);

      const metrics = collector.getMetrics();
      expect(metrics.connection.isConnected).toBe(true);
      expect(metrics.connection.connectionAttempts).toBe(1);
      expect(metrics.connection.connectionFailures).toBe(0);
      expect(metrics.connection.lastConnectionTime).toBeDefined();
    });

    it('should record failed connection', () => {
      collector.recordConnection(false, 'Connection refused');

      const metrics = collector.getMetrics();
      expect(metrics.connection.isConnected).toBe(false);
      expect(metrics.connection.connectionAttempts).toBe(1);
      expect(metrics.connection.connectionFailures).toBe(1);
      expect(metrics.connection.lastFailureTime).toBeDefined();
    });
  });

  describe('recordDisconnection', () => {
    it('should record disconnection', () => {
      collector.recordConnection(true);
      collector.recordDisconnection();

      const metrics = collector.getMetrics();
      expect(metrics.connection.isConnected).toBe(false);
    });
  });

  describe('recordHealthCheck', () => {
    it('should record successful health check', () => {
      collector.recordHealthCheck(true);

      const metrics = collector.getMetrics();
      expect(metrics.health.lastHealthCheck).toBeDefined();
      expect(metrics.health.consecutiveFailures).toBe(0);
    });

    it('should record failed health check', () => {
      collector.recordHealthCheck(false, 'Ping failed');

      const metrics = collector.getMetrics();
      expect(metrics.health.lastHealthCheck).toBeDefined();
      expect(metrics.health.consecutiveFailures).toBe(0); // Health check doesn't update consecutive failures
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return performance summary', () => {
      // Record some operations
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        collector.recordOperation({
          command: 'GET',
          duration: 10 + i,
          success: i < 8, // 80% success rate
          timestamp: new Date(now.getTime() - (60 - i) * 1000) // Spread over last minute
        });
      }

      const summary = collector.getPerformanceSummary();
      
      expect(summary.operationsPerSecond).toBeGreaterThan(0);
      expect(summary.averageLatency).toBeGreaterThan(0);
      expect(summary.errorRate).toBe(20);
      expect(typeof summary.isHealthy).toBe('boolean');
    });
  });

  describe('getCommandStats', () => {
    it('should return command statistics', () => {
      collector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date()
      });

      collector.recordOperation({
        command: 'SET',
        duration: 20,
        success: false,
        error: 'Error',
        timestamp: new Date()
      });

      const stats = collector.getCommandStats();
      
      expect(stats).toHaveLength(2);
      
      const getStats = stats.find(s => s.command === 'GET');
      const setStats = stats.find(s => s.command === 'SET');
      
      expect(getStats).toBeDefined();
      expect(getStats!.count).toBe(1);
      expect(getStats!.errorRate).toBe(0);
      
      expect(setStats).toBeDefined();
      expect(setStats!.count).toBe(1);
      expect(setStats!.errorRate).toBe(100);
    });
  });

  describe('getMetricsForWindow', () => {
    it('should return metrics for specified time window', () => {
      const now = new Date();
      
      // Record operations at different times
      collector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date(now.getTime() - 30 * 60 * 1000) // 30 minutes ago
      });

      collector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date(now.getTime() - 5 * 60 * 1000) // 5 minutes ago
      });

      const last10Minutes = collector.getMetricsForWindow(10);
      const last60Minutes = collector.getMetricsForWindow(60);

      expect(last10Minutes).toHaveLength(1);
      expect(last60Minutes).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date()
      });

      collector.recordConnection(true);
      collector.recordHealthCheck(true);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.performance.totalOperations).toBe(0);
      expect(metrics.connection.connectionAttempts).toBe(0);
      expect(metrics.health.consecutiveFailures).toBe(0);
      expect(Object.keys(metrics.commands)).toHaveLength(0);
    });
  });

  describe('health assessment', () => {
    it('should be unhealthy when not connected', () => {
      const metrics = collector.getMetrics();
      expect(metrics.health.isHealthy).toBe(false);
    });

    it('should be unhealthy with too many consecutive failures', () => {
      collector.recordConnection(true);
      
      // Record more than 5 consecutive failures
      for (let i = 0; i < 6; i++) {
        collector.recordOperation({
          command: 'GET',
          duration: 10,
          success: false,
          error: 'Error',
          timestamp: new Date()
        });
      }

      const metrics = collector.getMetrics();
      expect(metrics.health.isHealthy).toBe(false);
    });

    it('should be unhealthy with high error rate in recent operations', () => {
      collector.recordConnection(true);
      
      // Record 10 operations with 60% error rate
      for (let i = 0; i < 10; i++) {
        const operation: RedisOperationMetrics = {
          command: 'GET',
          duration: 10,
          success: i < 4, // 40% success rate
          timestamp: new Date()
        };
        if (i >= 4) {
          operation.error = 'Error';
        }
        collector.recordOperation(operation);
      }

      const metrics = collector.getMetrics();
      expect(metrics.health.isHealthy).toBe(false);
    });

    it('should be healthy with good connection and low error rate', () => {
      collector.recordConnection(true);
      
      // Record operations with good success rate
      for (let i = 0; i < 10; i++) {
        const operation: RedisOperationMetrics = {
          command: 'GET',
          duration: 10,
          success: i < 9, // 90% success rate
          timestamp: new Date()
        };
        if (i >= 9) {
          operation.error = 'Error';
        }
        collector.recordOperation(operation);
      }

      const metrics = collector.getMetrics();
      expect(metrics.health.isHealthy).toBe(true);
    });
  });
});

describe('RedisHealthChecker', () => {
  let collector: RedisMetricsCollector;
  let healthChecker: RedisHealthChecker;
  let mockPingOperation: jest.Mock;

  beforeEach(() => {
    collector = new RedisMetricsCollector();
    mockPingOperation = jest.fn();
    healthChecker = new RedisHealthChecker(collector, mockPingOperation);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('performHealthCheck', () => {
    it('should record successful health check', async () => {
      mockPingOperation.mockResolvedValue('PONG');

      const result = await healthChecker.performHealthCheck();

      expect(result).toBe(true);
      expect(mockPingOperation).toHaveBeenCalledTimes(1);
      
      const metrics = collector.getMetrics();
      expect(metrics.health.lastHealthCheck).toBeDefined();
      expect(metrics.commands.PING).toBeDefined();
      expect(metrics.commands.PING!.successCount).toBe(1);
    });

    it('should record failed health check', async () => {
      mockPingOperation.mockRejectedValue(new Error('Connection failed'));

      const result = await healthChecker.performHealthCheck();

      expect(result).toBe(false);
      expect(mockPingOperation).toHaveBeenCalledTimes(1);
      
      const metrics = collector.getMetrics();
      expect(metrics.health.lastHealthCheck).toBeDefined();
      expect(metrics.health.consecutiveFailures).toBe(1);
      expect(metrics.commands.PING!.errorCount).toBe(1);
    });

    it('should return false when no ping operation is configured', async () => {
      const checkerWithoutPing = new RedisHealthChecker(collector);

      const result = await checkerWithoutPing.performHealthCheck();

      expect(result).toBe(false);
    });
  });

  describe('startHealthChecks', () => {
    it('should start periodic health checks', () => {
      mockPingOperation.mockResolvedValue('PONG');

      healthChecker.startHealthChecks(1000);

      // Fast forward time
      jest.advanceTimersByTime(1000);

      expect(mockPingOperation).toHaveBeenCalledTimes(1);

      // Fast forward again
      jest.advanceTimersByTime(1000);

      expect(mockPingOperation).toHaveBeenCalledTimes(2);
    });

    it('should stop existing health checks before starting new ones', () => {
      mockPingOperation.mockResolvedValue('PONG');

      healthChecker.startHealthChecks(1000);
      healthChecker.startHealthChecks(2000);

      // Fast forward by 1 second - should not trigger with old interval
      jest.advanceTimersByTime(1000);
      expect(mockPingOperation).toHaveBeenCalledTimes(0);

      // Fast forward by another second - should trigger with new interval
      jest.advanceTimersByTime(1000);
      expect(mockPingOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopHealthChecks', () => {
    it('should stop periodic health checks', () => {
      mockPingOperation.mockResolvedValue('PONG');

      healthChecker.startHealthChecks(1000);
      healthChecker.stopHealthChecks();

      // Fast forward time
      jest.advanceTimersByTime(2000);

      expect(mockPingOperation).not.toHaveBeenCalled();
    });

    it('should handle stopping when not started', () => {
      expect(() => healthChecker.stopHealthChecks()).not.toThrow();
    });
  });

  describe('getHealthStatus', () => {
    it('should return current health status', () => {
      collector.recordConnection(true);
      collector.recordHealthCheck(true);

      const status = healthChecker.getHealthStatus();

      expect(status.isHealthy).toBe(true);
      expect(status.lastCheck).toBeDefined();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('redisMetricsCollector singleton', () => {
  it('should export a singleton instance', () => {
    expect(redisMetricsCollector).toBeInstanceOf(RedisMetricsCollector);
  });
});