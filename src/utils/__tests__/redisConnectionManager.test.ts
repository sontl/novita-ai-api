import { RedisConnectionManager, RedisConnectionConfig } from '../redisConnectionManager';
import { Redis } from '@upstash/redis';

// Mock the @upstash/redis module
jest.mock('@upstash/redis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('RedisConnectionManager', () => {
  let connectionManager: RedisConnectionManager;
  let mockRedisInstance: jest.Mocked<Redis>;
  let config: RedisConnectionConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock Redis instance
    mockRedisInstance = {
      ping: jest.fn()
    } as any;
    
    MockedRedis.mockImplementation(() => mockRedisInstance);

    config = {
      url: 'redis://localhost:6379',
      token: 'test-token',
      retryAttempts: 3,
      retryDelayMs: 100,
      connectionTimeoutMs: 5000,
      commandTimeoutMs: 2000
    };

    connectionManager = new RedisConnectionManager(config);
  });

  afterEach(async () => {
    // Clean up any connections
    if (connectionManager) {
      await connectionManager.disconnect();
    }
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const stats = connectionManager.getConnectionStats();
      expect(stats.maxRetryAttempts).toBe(3);
      expect(stats.url).toBe('redis://localhost:6379');
      expect(stats.isConnected).toBe(false);
      expect(stats.reconnectAttempts).toBe(0);
    });

    it('should use default values when optional config is not provided', () => {
      const minimalConfig = {
        url: 'redis://localhost:6379',
        token: 'test-token'
      };
      
      const manager = new RedisConnectionManager(minimalConfig);
      const stats = manager.getConnectionStats();
      
      expect(stats.maxRetryAttempts).toBe(3); // default
    });
  });

  describe('connect', () => {
    it('should successfully connect to Redis', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      await connectionManager.connect();

      expect(MockedRedis).toHaveBeenCalledWith({
        url: config.url,
        token: config.token,
        retry: {
          retries: 3,
          backoff: expect.any(Function)
        }
      });
      expect(mockRedisInstance.ping).toHaveBeenCalled();
      expect(connectionManager.isHealthy()).toBe(true);
    });

    it('should not reconnect if already connected', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      await connectionManager.connect();
      const firstCallCount = MockedRedis.mock.calls.length;
      
      await connectionManager.connect();
      
      expect(MockedRedis.mock.calls.length).toBe(firstCallCount);
    });

    it('should retry connection on failure with exponential backoff', async () => {
      mockRedisInstance.ping
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce('PONG');

      const startTime = Date.now();
      await connectionManager.connect();
      const endTime = Date.now();

      // Should have taken some time due to retries
      expect(endTime - startTime).toBeGreaterThan(100);
      expect(connectionManager.isHealthy()).toBe(true);
    });

    it('should throw error after max retry attempts', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection failed'));

      await expect(connectionManager.connect()).rejects.toThrow(
        'Failed to connect to Redis after 3 attempts'
      );
      expect(connectionManager.isHealthy()).toBe(false);
    });

    it('should handle ping timeout', async () => {
      // Mock ping to hang indefinitely
      mockRedisInstance.ping.mockImplementation(() => new Promise(() => {}));

      await expect(connectionManager.connect()).rejects.toThrow('Redis ping timeout');
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      await connectionManager.connect();
      expect(connectionManager.isHealthy()).toBe(true);
      
      await connectionManager.disconnect();
      expect(connectionManager.isHealthy()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(connectionManager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('ping', () => {
    it('should return true for successful ping', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      await connectionManager.connect();
      const result = await connectionManager.ping();
      
      expect(result).toBe(true);
    });

    it('should return false when not connected', async () => {
      const result = await connectionManager.ping();
      expect(result).toBe(false);
    });

    it('should return false and mark as disconnected on ping failure', async () => {
      mockRedisInstance.ping.mockResolvedValueOnce('PONG'); // for connect
      await connectionManager.connect();
      
      mockRedisInstance.ping.mockRejectedValueOnce(new Error('Ping failed'));
      const result = await connectionManager.ping();
      
      expect(result).toBe(false);
      expect(connectionManager.isHealthy()).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return Redis client when connected', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      await connectionManager.connect();
      const client = connectionManager.getClient();
      
      expect(client).toBe(mockRedisInstance);
    });

    it('should throw error when not connected', () => {
      expect(() => connectionManager.getClient()).toThrow(
        'Redis client is not connected. Call connect() first.'
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true when connected', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      await connectionManager.connect();
      expect(connectionManager.isHealthy()).toBe(true);
    });

    it('should return false when not connected', () => {
      expect(connectionManager.isHealthy()).toBe(false);
    });
  });

  describe('getConnectionStats', () => {
    it('should return correct connection statistics', async () => {
      const stats = connectionManager.getConnectionStats();
      
      expect(stats).toEqual({
        isConnected: false,
        reconnectAttempts: 0,
        maxRetryAttempts: 3,
        url: 'redis://localhost:6379'
      });
    });

    it('should update stats after connection', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      await connectionManager.connect();
      const stats = connectionManager.getConnectionStats();
      
      expect(stats.isConnected).toBe(true);
    });
  });

  describe('reconnect', () => {
    it('should reset connection state and reconnect', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      
      // Initial connection
      await connectionManager.connect();
      expect(connectionManager.isHealthy()).toBe(true);
      
      // Reconnect
      await connectionManager.reconnect();
      expect(connectionManager.isHealthy()).toBe(true);
      
      // Should have created new Redis instance
      expect(MockedRedis).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('should calculate exponential backoff correctly', async () => {
      const config = {
        url: 'redis://localhost:6379',
        token: 'test-token',
        retryAttempts: 4,
        retryDelayMs: 100
      };
      
      const manager = new RedisConnectionManager(config);
      
      // Mock ping to fail multiple times to test backoff
      let callCount = 0;
      mockRedisInstance.ping.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve('PONG');
      });

      const startTime = Date.now();
      await manager.connect();
      const endTime = Date.now();

      // Should have taken time for exponential backoff
      // First retry: ~100ms, second retry: ~200ms
      expect(endTime - startTime).toBeGreaterThan(200);
    });
  });

  describe('error handling', () => {
    it('should handle Redis constructor errors', async () => {
      MockedRedis.mockImplementation(() => {
        throw new Error('Redis constructor failed');
      });

      await expect(connectionManager.connect()).rejects.toThrow(
        'Failed to connect to Redis after 3 attempts'
      );
    });

    it('should handle non-Error objects in catch blocks', async () => {
      mockRedisInstance.ping.mockRejectedValue('String error');

      await expect(connectionManager.connect()).rejects.toThrow(
        'Failed to connect to Redis after 3 attempts: Redis ping failed: String error'
      );
    });
  });

  describe('timeout handling', () => {
    it('should timeout ping operations', async () => {
      const shortTimeoutConfig = {
        ...config,
        commandTimeoutMs: 50
      };
      
      const manager = new RedisConnectionManager(shortTimeoutConfig);
      
      // Mock ping to take longer than timeout
      mockRedisInstance.ping.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('PONG'), 100))
      );

      await expect(manager.connect()).rejects.toThrow('Redis ping timeout');
    });
  });

  describe('configuration validation', () => {
    it('should handle missing optional configuration gracefully', () => {
      const minimalConfig = {
        url: 'redis://localhost:6379',
        token: 'test-token'
      };
      
      expect(() => new RedisConnectionManager(minimalConfig)).not.toThrow();
    });
  });
});