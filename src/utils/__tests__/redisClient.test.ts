import { RedisClient, IRedisClient } from '../redisClient';
import { RedisConnectionManager } from '../redisConnectionManager';
import { RedisSerializer } from '../redisSerializer';
import { Redis } from '@upstash/redis';

// Mock dependencies
jest.mock('../redisConnectionManager');
jest.mock('../redisSerializer');
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const MockedRedisConnectionManager = RedisConnectionManager as jest.MockedClass<typeof RedisConnectionManager>;
const MockedRedisSerializer = RedisSerializer as jest.MockedClass<typeof RedisSerializer>;

describe('RedisClient', () => {
  let redisClient: RedisClient;
  let mockConnectionManager: jest.Mocked<RedisConnectionManager>;
  let mockSerializer: jest.Mocked<RedisSerializer>;
  let mockRedisInstance: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis instance
    mockRedisInstance = {
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
      keys: jest.fn(),
      ttl: jest.fn(),
      pexpire: jest.fn(),
      ping: jest.fn()
    } as any;

    // Mock connection manager
    mockConnectionManager = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockRedisInstance),
      isHealthy: jest.fn().mockReturnValue(true),
      getConnectionStats: jest.fn().mockReturnValue({
        isConnected: true,
        reconnectAttempts: 0,
        maxRetryAttempts: 3,
        url: 'redis://localhost:6379'
      })
    } as any;

    MockedRedisConnectionManager.mockImplementation(() => mockConnectionManager);

    // Mock serializer
    mockSerializer = {
      serialize: jest.fn().mockImplementation((value) => JSON.stringify(value)),
      deserialize: jest.fn().mockImplementation((value) => JSON.parse(value))
    } as any;

    MockedRedisSerializer.mockImplementation(() => mockSerializer);

    const config = {
      url: 'redis://localhost:6379',
      token: 'test-token',
      commandTimeoutMs: 1000
    };

    redisClient = new RedisClient(config);
  });

  describe('constructor', () => {
    it('should initialize with connection manager and serializer', () => {
      expect(MockedRedisConnectionManager).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
        token: 'test-token',
        commandTimeoutMs: 1000
      });
      expect(MockedRedisSerializer).toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('should connect through connection manager', async () => {
      await redisClient.connect();
      expect(mockConnectionManager.connect).toHaveBeenCalled();
    });
  });

  describe('basic operations', () => {
    describe('get', () => {
      it('should get and deserialize a value', async () => {
        const testValue = { id: 'test', name: 'Test Object' };
        mockRedisInstance.get.mockResolvedValue('{"id":"test","name":"Test Object"}');
        mockSerializer.deserialize.mockReturnValue(testValue);

        const result = await redisClient.get<typeof testValue>('test-key');

        expect(mockRedisInstance.get).toHaveBeenCalledWith('test-key');
        expect(mockSerializer.deserialize).toHaveBeenCalledWith('{"id":"test","name":"Test Object"}');
        expect(result).toEqual(testValue);
      });

      it('should return null for non-existent keys', async () => {
        mockRedisInstance.get.mockResolvedValue(null);

        const result = await redisClient.get('non-existent');

        expect(result).toBeNull();
        expect(mockSerializer.deserialize).not.toHaveBeenCalled();
      });

      it('should handle already parsed JSON from Upstash', async () => {
        const testValue = { id: 'test', name: 'Test Object' };
        mockRedisInstance.get.mockResolvedValue(testValue);

        const result = await redisClient.get<typeof testValue>('test-key');

        expect(result).toEqual(testValue);
        expect(mockSerializer.deserialize).not.toHaveBeenCalled();
      });
    });

    describe('set', () => {
      it('should serialize and set a value', async () => {
        const testValue = { id: 'test', name: 'Test Object' };
        mockSerializer.serialize.mockReturnValue('{"id":"test","name":"Test Object"}');

        await redisClient.set('test-key', testValue);

        expect(mockSerializer.serialize).toHaveBeenCalledWith(testValue);
        expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', '{"id":"test","name":"Test Object"}');
      });

      it('should set a value with TTL', async () => {
        const testValue = { id: 'test' };
        mockSerializer.serialize.mockReturnValue('{"id":"test"}');

        await redisClient.set('test-key', testValue, 5000);

        expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', '{"id":"test"}', { px: 5000 });
      });
    });

    describe('del', () => {
      it('should delete a key and return true if successful', async () => {
        mockRedisInstance.del.mockResolvedValue(1);

        const result = await redisClient.del('test-key');

        expect(mockRedisInstance.del).toHaveBeenCalledWith('test-key');
        expect(result).toBe(true);
      });

      it('should return false if key does not exist', async () => {
        mockRedisInstance.del.mockResolvedValue(0);

        const result = await redisClient.del('non-existent');

        expect(result).toBe(false);
      });
    });

    describe('exists', () => {
      it('should return true if key exists', async () => {
        mockRedisInstance.exists.mockResolvedValue(1);

        const result = await redisClient.exists('test-key');

        expect(result).toBe(true);
      });

      it('should return false if key does not exist', async () => {
        mockRedisInstance.exists.mockResolvedValue(0);

        const result = await redisClient.exists('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('hash operations', () => {
    describe('hget', () => {
      it('should get and deserialize a hash field', async () => {
        const testValue = { data: 'test' };
        mockRedisInstance.hget.mockResolvedValue('{"data":"test"}');
        mockSerializer.deserialize.mockReturnValue(testValue);

        const result = await redisClient.hget<typeof testValue>('hash-key', 'field');

        expect(mockRedisInstance.hget).toHaveBeenCalledWith('hash-key', 'field');
        expect(result).toEqual(testValue);
      });

      it('should return null for non-existent hash field', async () => {
        mockRedisInstance.hget.mockResolvedValue(null);

        const result = await redisClient.hget('hash-key', 'field');

        expect(result).toBeNull();
      });
    });

    describe('hset', () => {
      it('should serialize and set a hash field', async () => {
        const testValue = { data: 'test' };
        mockSerializer.serialize.mockReturnValue('{"data":"test"}');

        await redisClient.hset('hash-key', 'field', testValue);

        expect(mockSerializer.serialize).toHaveBeenCalledWith(testValue);
        expect(mockRedisInstance.hset).toHaveBeenCalledWith('hash-key', { field: '{"data":"test"}' });
      });
    });

    describe('hdel', () => {
      it('should delete a hash field and return true if successful', async () => {
        mockRedisInstance.hdel.mockResolvedValue(1);

        const result = await redisClient.hdel('hash-key', 'field');

        expect(result).toBe(true);
      });
    });

    describe('hgetall', () => {
      it('should get and deserialize all hash fields', async () => {
        const hashData = {
          field1: '{"data":"test1"}',
          field2: '{"data":"test2"}'
        };
        mockRedisInstance.hgetall.mockResolvedValue(hashData);
        mockSerializer.deserialize
          .mockReturnValueOnce({ data: 'test1' })
          .mockReturnValueOnce({ data: 'test2' });

        const result = await redisClient.hgetall('hash-key');

        expect(result).toEqual({
          field1: { data: 'test1' },
          field2: { data: 'test2' }
        });
      });

      it('should return empty object for non-existent hash', async () => {
        mockRedisInstance.hgetall.mockResolvedValue(null);

        const result = await redisClient.hgetall('non-existent');

        expect(result).toEqual({});
      });
    });
  });

  describe('list operations', () => {
    describe('lpush', () => {
      it('should serialize and push values to list', async () => {
        const values = [{ id: 1 }, { id: 2 }];
        mockSerializer.serialize
          .mockReturnValueOnce('{"id":1}')
          .mockReturnValueOnce('{"id":2}');
        mockRedisInstance.lpush.mockResolvedValue(2);

        const result = await redisClient.lpush('list-key', ...values);

        expect(mockRedisInstance.lpush).toHaveBeenCalledWith('list-key', '{"id":1}', '{"id":2}');
        expect(result).toBe(2);
      });
    });

    describe('rpop', () => {
      it('should pop and deserialize a value from list', async () => {
        const testValue = { id: 1 };
        mockRedisInstance.rpop.mockResolvedValue('{"id":1}');
        mockSerializer.deserialize.mockReturnValue(testValue);

        const result = await redisClient.rpop<typeof testValue>('list-key');

        expect(result).toEqual(testValue);
      });

      it('should return null for empty list', async () => {
        mockRedisInstance.rpop.mockResolvedValue(null);

        const result = await redisClient.rpop('empty-list');

        expect(result).toBeNull();
      });
    });

    describe('lrange', () => {
      it('should get and deserialize a range of list values', async () => {
        const listData = ['{"id":1}', '{"id":2}'];
        mockRedisInstance.lrange.mockResolvedValue(listData);
        mockSerializer.deserialize
          .mockReturnValueOnce({ id: 1 })
          .mockReturnValueOnce({ id: 2 });

        const result = await redisClient.lrange('list-key', 0, -1);

        expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      });

      it('should return empty array for non-array result', async () => {
        mockRedisInstance.lrange.mockResolvedValue(null as any);

        const result = await redisClient.lrange('list-key', 0, -1);

        expect(result).toEqual([]);
      });
    });

    describe('llen', () => {
      it('should return list length', async () => {
        mockRedisInstance.llen.mockResolvedValue(5);

        const result = await redisClient.llen('list-key');

        expect(result).toBe(5);
      });
    });
  });

  describe('utility operations', () => {
    describe('keys', () => {
      it('should return matching keys', async () => {
        const keys = ['key1', 'key2', 'key3'];
        mockRedisInstance.keys.mockResolvedValue(keys);

        const result = await redisClient.keys('key*');

        expect(result).toEqual(keys);
      });

      it('should return empty array for non-array result', async () => {
        mockRedisInstance.keys.mockResolvedValue(null as any);

        const result = await redisClient.keys('pattern');

        expect(result).toEqual([]);
      });
    });

    describe('ttl', () => {
      it('should return TTL in seconds', async () => {
        mockRedisInstance.ttl.mockResolvedValue(300);

        const result = await redisClient.ttl('test-key');

        expect(result).toBe(300);
      });
    });

    describe('expire', () => {
      it('should set TTL and return true if successful', async () => {
        mockRedisInstance.pexpire.mockResolvedValue(1);

        const result = await redisClient.expire('test-key', 5000);

        expect(mockRedisInstance.pexpire).toHaveBeenCalledWith('test-key', 5000);
        expect(result).toBe(true);
      });

      it('should return false if key does not exist', async () => {
        mockRedisInstance.pexpire.mockResolvedValue(0);

        const result = await redisClient.expire('non-existent', 5000);

        expect(result).toBe(false);
      });
    });
  });

  describe('connection operations', () => {
    describe('ping', () => {
      it('should ping Redis and return response', async () => {
        mockRedisInstance.ping.mockResolvedValue('PONG');

        const result = await redisClient.ping();

        expect(result).toBe('PONG');
      });

      it('should return PONG for non-string response', async () => {
        mockRedisInstance.ping.mockResolvedValue(1 as any);

        const result = await redisClient.ping();

        expect(result).toBe('PONG');
      });
    });

    describe('disconnect', () => {
      it('should disconnect through connection manager', async () => {
        await redisClient.disconnect();

        expect(mockConnectionManager.disconnect).toHaveBeenCalled();
      });
    });

    describe('isHealthy', () => {
      it('should return health status from connection manager', () => {
        const result = redisClient.isHealthy();

        expect(mockConnectionManager.isHealthy).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('getConnectionStats', () => {
      it('should return connection stats from connection manager', () => {
        const result = redisClient.getConnectionStats();

        expect(mockConnectionManager.getConnectionStats).toHaveBeenCalled();
        expect(result).toEqual({
          isConnected: true,
          reconnectAttempts: 0,
          maxRetryAttempts: 3,
          url: 'redis://localhost:6379'
        });
      });
    });
  });

  describe('error handling and timeout', () => {
    it('should handle operation timeout', async () => {
      const shortTimeoutClient = new RedisClient({
        url: 'redis://localhost:6379',
        token: 'test-token',
        commandTimeoutMs: 50
      });

      // Mock a slow operation
      mockRedisInstance.get.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('value'), 100))
      );

      await expect(shortTimeoutClient.get('test-key')).rejects.toThrow(
        'Redis GET operation timed out after 50ms'
      );
    });

    it('should handle Redis operation errors', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Redis error'));

      await expect(redisClient.get('test-key')).rejects.toThrow('Redis GET failed: Redis error');
    });

    it('should handle connection errors', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Connection refused'));

      await expect(redisClient.get('test-key')).rejects.toThrow('Redis GET failed: Connection refused');
    });

    it('should handle non-Error objects', async () => {
      mockRedisInstance.get.mockRejectedValue('String error');

      await expect(redisClient.get('test-key')).rejects.toThrow('Redis GET failed: String error');
    });
  });

  describe('connection error detection', () => {
    it('should detect connection errors', async () => {
      const connectionErrors = [
        'Connection refused',
        'Network timeout',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT'
      ];

      for (const errorMessage of connectionErrors) {
        mockRedisInstance.get.mockRejectedValueOnce(new Error(errorMessage));
        
        await expect(redisClient.get('test-key')).rejects.toThrow();
      }
    });
  });
});