import {
  RedisHealthIntegration,
  redisHealthIntegration
} from '../redisHealthIntegration';
import { redisMetricsCollector } from '../redisMetrics';

// Mock the logger
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('RedisHealthIntegration', () => {
  let healthIntegration: RedisHealthIntegration;
  let mockPingOperation: jest.Mock;

  beforeEach(() => {
    mockPingOperation = jest.fn();
    healthIntegration = new RedisHealthIntegration(mockPingOperation);
    redisMetricsCollector.reset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    healthIntegration.stopHealthMonitoring();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with ping operation', () => {
      const integration = new RedisHealthIntegration(mockPingOperation);
      expect(integration).toBeInstanceOf(RedisHealthIntegration);
    });

    it('should create instance without ping operation', () => {
      const integration = new RedisHealthIntegration();
      expect(integration).toBeInstanceOf(RedisHealthIntegration);
    });
  });

  describe('startHealthMonitoring', () => {
    it('should start health monitoring with ping operation', () => {
      mockPingOperation.mockResolvedValue('PONG');

      healthIntegration.startHealthMonitoring(1000);

      // Fast forward time to trigger health check
      jest.advanceTimersByTime(1000);

      expect(mockPingOperation).toHaveBeenCalledTimes(1);
    });

    it('should not start health monitoring without ping operation', () => {
      const integrationWithoutPing = new RedisHealthIntegration();

      integrationWithoutPing.startHealthMonitoring(1000);

      // Fast forward time
      jest.advanceTimersByTime(1000);

      expect(mockPingOperation).not.toHaveBeenCalled();
    });
  });

  describe('stopHealthMonitoring', () => {
    it('should stop health monitoring', () => {
      mockPingOperation.mockResolvedValue('PONG');

      healthIntegration.startHealthMonitoring(1000);
      healthIntegration.stopHealthMonitoring();

      // Fast forward time
      jest.advanceTimersByTime(2000);

      expect(mockPingOperation).not.toHaveBeenCalled();
    });
  });

  describe('performHealthCheck', () => {
    it('should perform health check successfully', async () => {
      mockPingOperation.mockResolvedValue('PONG');

      const result = await healthIntegration.performHealthCheck();

      expect(result).toBe(true);
      expect(mockPingOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle health check failure', async () => {
      mockPingOperation.mockRejectedValue(new Error('Connection failed'));

      const result = await healthIntegration.performHealthCheck();

      expect(result).toBe(false);
      expect(mockPingOperation).toHaveBeenCalledTimes(1);
    });

    it('should return false when no ping operation configured', async () => {
      const integrationWithoutPing = new RedisHealthIntegration();

      const result = await integrationWithoutPing.performHealthCheck();

      expect(result).toBe(false);
    });
  });

  describe('getHealthStatus', () => {
    it('should return down status when not connected', () => {
      const status = healthIntegration.getHealthStatus();

      expect(status.status).toBe('down');
      expect(status.isConnected).toBe(false);
      expect(status.errorRate).toBe(0);
      expect(status.operationsPerSecond).toBe(0);
      expect(status.consecutiveFailures).toBe(0);
    });

    it('should return up status when connected and healthy', () => {
      // Simulate successful connection and operations
      redisMetricsCollector.recordConnection(true);
      
      for (let i = 0; i < 10; i++) {
        redisMetricsCollector.recordOperation({
          command: 'GET',
          duration: 10,
          success: true,
          timestamp: new Date()
        });
      }

      const status = healthIntegration.getHealthStatus();

      expect(status.status).toBe('up');
      expect(status.isConnected).toBe(true);
      expect(status.errorRate).toBe(0);
    });

    it('should return degraded status when connected but unhealthy', () => {
      // Simulate connection but with high error rate
      redisMetricsCollector.recordConnection(true);
      
      // Record operations with high error rate
      for (let i = 0; i < 10; i++) {
        const operation = {
          command: 'GET',
          duration: 10,
          success: i < 3, // 30% success rate
          timestamp: new Date()
        } as any;
        
        if (i >= 3) {
          operation.error = 'Error';
        }
        
        redisMetricsCollector.recordOperation(operation);
      }

      const status = healthIntegration.getHealthStatus();

      expect(status.status).toBe('degraded');
      expect(status.isConnected).toBe(true);
      expect(status.errorRate).toBe(70);
    });

    it('should include response time from PING operations', () => {
      redisMetricsCollector.recordConnection(true);
      
      // Record PING operations
      redisMetricsCollector.recordOperation({
        command: 'PING',
        duration: 15,
        success: true,
        timestamp: new Date()
      });

      const status = healthIntegration.getHealthStatus();

      expect(status.responseTime).toBe(15);
    });
  });

  describe('getDetailedHealthInfo', () => {
    it('should return detailed health information', () => {
      // Setup test data
      redisMetricsCollector.recordConnection(true);
      
      redisMetricsCollector.recordOperation({
        command: 'GET',
        key: 'test-key',
        duration: 10,
        success: true,
        timestamp: new Date()
      });

      redisMetricsCollector.recordOperation({
        command: 'SET',
        key: 'test-key',
        duration: 20,
        success: false,
        error: 'Timeout',
        timestamp: new Date()
      });

      const details = healthIntegration.getDetailedHealthInfo();

      expect(details.status).toBe('up');
      expect(details.connection.isConnected).toBe(true);
      expect(details.connection.attempts).toBe(1);
      expect(details.connection.failures).toBe(0);
      expect(details.performance.totalOperations).toBe(2);
      expect(details.performance.successfulOperations).toBe(1);
      expect(details.performance.failedOperations).toBe(1);
      expect(details.performance.errorRate).toBe(50);
      expect(details.commands).toHaveLength(2);
      
      const getCommand = details.commands.find(cmd => cmd.command === 'GET');
      const setCommand = details.commands.find(cmd => cmd.command === 'SET');
      
      expect(getCommand).toBeDefined();
      expect(getCommand!.count).toBe(1);
      expect(getCommand!.errorRate).toBe(0);
      
      expect(setCommand).toBeDefined();
      expect(setCommand!.count).toBe(1);
      expect(setCommand!.errorRate).toBe(100);
    });

    it('should return down status when not connected', () => {
      const details = healthIntegration.getDetailedHealthInfo();

      expect(details.status).toBe('down');
      expect(details.connection.isConnected).toBe(false);
      expect(details.performance.totalOperations).toBe(0);
      expect(details.commands).toHaveLength(0);
    });
  });

  describe('isHealthy', () => {
    it('should return false when not connected', () => {
      expect(healthIntegration.isHealthy()).toBe(false);
    });

    it('should return true when connected and healthy', () => {
      redisMetricsCollector.recordConnection(true);
      
      // Record successful operations
      for (let i = 0; i < 5; i++) {
        redisMetricsCollector.recordOperation({
          command: 'GET',
          duration: 10,
          success: true,
          timestamp: new Date()
        });
      }

      expect(healthIntegration.isHealthy()).toBe(true);
    });

    it('should return false when connected but unhealthy', () => {
      redisMetricsCollector.recordConnection(true);
      
      // Record many consecutive failures
      for (let i = 0; i < 10; i++) {
        redisMetricsCollector.recordOperation({
          command: 'GET',
          duration: 10,
          success: false,
          error: 'Error',
          timestamp: new Date()
        });
      }

      expect(healthIntegration.isHealthy()).toBe(false);
    });
  });

  describe('recordConnection', () => {
    it('should record successful connection', () => {
      healthIntegration.recordConnection(true);

      const status = healthIntegration.getHealthStatus();
      expect(status.isConnected).toBe(true);
    });

    it('should record failed connection', () => {
      healthIntegration.recordConnection(false, 'Connection refused');

      const details = healthIntegration.getDetailedHealthInfo();
      expect(details.connection.isConnected).toBe(false);
      expect(details.connection.failures).toBe(1);
    });
  });

  describe('recordDisconnection', () => {
    it('should record disconnection', () => {
      healthIntegration.recordConnection(true);
      healthIntegration.recordDisconnection();

      const status = healthIntegration.getHealthStatus();
      expect(status.isConnected).toBe(false);
    });
  });

  describe('recordOperation', () => {
    it('should record successful operation', () => {
      healthIntegration.recordOperation('GET', 'test-key', 10, true);

      const details = healthIntegration.getDetailedHealthInfo();
      expect(details.performance.totalOperations).toBe(1);
      expect(details.performance.successfulOperations).toBe(1);
      expect(details.commands).toHaveLength(1);
      expect(details.commands[0]!.command).toBe('GET');
    });

    it('should record failed operation', () => {
      healthIntegration.recordOperation('SET', 'test-key', 50, false, 'Timeout');

      const details = healthIntegration.getDetailedHealthInfo();
      expect(details.performance.totalOperations).toBe(1);
      expect(details.performance.failedOperations).toBe(1);
      expect(details.performance.errorRate).toBe(100);
    });
  });

  describe('getMetricsForMonitoring', () => {
    it('should return monitoring metrics', () => {
      // Setup test data
      redisMetricsCollector.recordConnection(true);
      
      // Record various operations
      const commands = ['GET', 'SET', 'DEL', 'PING', 'HGET'];
      commands.forEach((cmd, index) => {
        for (let i = 0; i < (5 - index); i++) { // Different counts for each command
          redisMetricsCollector.recordOperation({
            command: cmd,
            duration: 10 + index,
            success: true,
            timestamp: new Date()
          });
        }
      });

      const metrics = healthIntegration.getMetricsForMonitoring();

      expect(metrics.connection.isConnected).toBe(true);
      expect(metrics.connection.connectionAttempts).toBe(1);
      expect(metrics.performance.totalOperations).toBe(15); // 5+4+3+2+1
      expect(metrics.topCommands).toHaveLength(5);
      
      // Should be sorted by count (GET should be first with 5 operations)
      expect(metrics.topCommands[0]!.command).toBe('GET');
      expect(metrics.topCommands[0]!.count).toBe(5);
    });

    it('should limit top commands to 10', () => {
      redisMetricsCollector.recordConnection(true);
      
      // Record 15 different commands
      for (let i = 0; i < 15; i++) {
        redisMetricsCollector.recordOperation({
          command: `CMD${i}`,
          duration: 10,
          success: true,
          timestamp: new Date()
        });
      }

      const metrics = healthIntegration.getMetricsForMonitoring();

      expect(metrics.topCommands).toHaveLength(10);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      // Setup some data
      redisMetricsCollector.recordConnection(true);
      redisMetricsCollector.recordOperation({
        command: 'GET',
        duration: 10,
        success: true,
        timestamp: new Date()
      });

      healthIntegration.resetMetrics();

      const details = healthIntegration.getDetailedHealthInfo();
      expect(details.connection.isConnected).toBe(false);
      expect(details.performance.totalOperations).toBe(0);
      expect(details.commands).toHaveLength(0);
    });
  });
});

describe('redisHealthIntegration singleton', () => {
  it('should export a singleton instance', () => {
    expect(redisHealthIntegration).toBeInstanceOf(RedisHealthIntegration);
  });
});