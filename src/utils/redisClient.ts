import { Redis } from '@upstash/redis';
import { RedisConnectionManager, RedisConnectionConfig } from './redisConnectionManager';
import { RedisSerializer, ISerializer } from './redisSerializer';
import { logger } from './logger';

/**
 * Interface for Redis client operations
 */
export interface IRedisClient {
  // Basic operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  
  // Hash operations (for job data)
  hget<T>(key: string, field: string): Promise<T | null>;
  hset<T>(key: string, field: string, value: T): Promise<void>;
  hdel(key: string, field: string): Promise<boolean>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  
  // List operations (for job queues)
  lpush<T>(key: string, ...values: T[]): Promise<number>;
  rpop<T>(key: string): Promise<T | null>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  llen(key: string): Promise<number>;
  
  // Sorted set operations (for priority queues)
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zscore(key: string, member: string): Promise<number | null>;
  
  // Utility operations
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  expire(key: string, ttlMs: number): Promise<boolean>;
  
  // Connection management
  ping(): Promise<string>;
  disconnect(): Promise<void>;
}

/**
 * Redis client implementation using Upstash Redis with error handling and serialization
 */
export class RedisClient implements IRedisClient {
  private connectionManager: RedisConnectionManager;
  private serializer: ISerializer;
  private commandTimeoutMs: number;

  constructor(
    config: RedisConnectionConfig,
    serializer: ISerializer = new RedisSerializer()
  ) {
    this.connectionManager = new RedisConnectionManager(config);
    this.serializer = serializer;
    this.commandTimeoutMs = config.commandTimeoutMs ?? 5000;
  }

  /**
   * Initialize the Redis connection
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  /**
   * Get a value from Redis
   */
  async get<T>(key: string): Promise<T | null> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.get(key);
      
      if (result === null || result === undefined) {
        return null;
      }
      
      if (typeof result === 'string') {
        return this.serializer.deserialize<T>(result);
      }
      
      // Handle case where Upstash returns already parsed JSON
      return result as T;
    }, 'GET', key);
  }

  /**
   * Set a value in Redis with optional TTL
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const serializedValue = this.serializer.serialize(value);
      
      if (ttlMs && ttlMs > 0) {
        await client.set(key, serializedValue, { px: ttlMs });
      } else {
        await client.set(key, serializedValue);
      }
    }, 'SET', key);
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<boolean> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.del(key);
      return result > 0;
    }, 'DEL', key);
  }

  /**
   * Check if a key exists in Redis
   */
  async exists(key: string): Promise<boolean> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.exists(key);
      return result > 0;
    }, 'EXISTS', key);
  }

  /**
   * Get a field from a Redis hash
   */
  async hget<T>(key: string, field: string): Promise<T | null> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.hget(key, field);
      
      if (result === null || result === undefined) {
        return null;
      }
      
      if (typeof result === 'string') {
        return this.serializer.deserialize<T>(result);
      }
      
      return result as T;
    }, 'HGET', `${key}:${field}`);
  }

  /**
   * Set a field in a Redis hash
   */
  async hset<T>(key: string, field: string, value: T): Promise<void> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const serializedValue = this.serializer.serialize(value);
      await client.hset(key, { [field]: serializedValue });
    }, 'HSET', `${key}:${field}`);
  }

  /**
   * Delete a field from a Redis hash
   */
  async hdel(key: string, field: string): Promise<boolean> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.hdel(key, field);
      return result > 0;
    }, 'HDEL', `${key}:${field}`);
  }

  /**
   * Get all fields and values from a Redis hash
   */
  async hgetall<T>(key: string): Promise<Record<string, T>> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.hgetall(key);
      
      if (!result || typeof result !== 'object') {
        return {};
      }
      
      const deserializedResult: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        if (typeof value === 'string') {
          deserializedResult[field] = this.serializer.deserialize<T>(value);
        } else {
          deserializedResult[field] = value as T;
        }
      }
      
      return deserializedResult;
    }, 'HGETALL', key);
  }

  /**
   * Push values to the left of a Redis list
   */
  async lpush<T>(key: string, ...values: T[]): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const serializedValues = values.map(value => this.serializer.serialize(value));
      return await client.lpush(key, ...serializedValues);
    }, 'LPUSH', key);
  }

  /**
   * Pop a value from the right of a Redis list
   */
  async rpop<T>(key: string): Promise<T | null> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.rpop(key);
      
      if (result === null || result === undefined) {
        return null;
      }
      
      if (typeof result === 'string') {
        return this.serializer.deserialize<T>(result);
      }
      
      return result as T;
    }, 'RPOP', key);
  }

  /**
   * Get a range of values from a Redis list
   */
  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.lrange(key, start, stop);
      
      if (!Array.isArray(result)) {
        return [];
      }
      
      return result.map(item => {
        if (typeof item === 'string') {
          return this.serializer.deserialize<T>(item);
        }
        return item as T;
      });
    }, 'LRANGE', key);
  }

  /**
   * Get the length of a Redis list
   */
  async llen(key: string): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      return await client.llen(key);
    }, 'LLEN', key);
  }

  /**
   * Add a member to a sorted set with a score
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.executeWithTimeout<number>(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.zadd(key, { score, member });
      return Number(result) || 0;
    }, 'ZADD', key);
  }

  /**
   * Remove a member from a sorted set
   */
  async zrem(key: string, member: string): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      return await client.zrem(key, member);
    }, 'ZREM', key);
  }

  /**
   * Get members from a sorted set by rank (ascending order)
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.zrange(key, start, stop);
      return Array.isArray(result) ? result.map(String) : [];
    }, 'ZRANGE', key);
  }

  /**
   * Get members from a sorted set by rank (descending order)
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      // Use zrange with REV option for Upstash compatibility
      const result = await (client as any).zrange(key, start, stop, { rev: true });
      return Array.isArray(result) ? result.map(String) : [];
    }, 'ZREVRANGE', key);
  }

  /**
   * Get members from a sorted set by score range
   */
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      // Use zrange with BYSCORE option for Upstash compatibility
      const result = await (client as any).zrange(key, min, max, { byScore: true });
      return Array.isArray(result) ? result.map(String) : [];
    }, 'ZRANGEBYSCORE', key);
  }

  /**
   * Remove members from a sorted set by score range
   */
  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      return await client.zremrangebyscore(key, min, max);
    }, 'ZREMRANGEBYSCORE', key);
  }

  /**
   * Get the number of members in a sorted set
   */
  async zcard(key: string): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      return await client.zcard(key);
    }, 'ZCARD', key);
  }

  /**
   * Get the score of a member in a sorted set
   */
  async zscore(key: string, member: string): Promise<number | null> {
    return this.executeWithTimeout<number | null>(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.zscore(key, member);
      return result !== null && result !== undefined ? Number(result) : null;
    }, 'ZSCORE', key);
  }

  /**
   * Get keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.keys(pattern);
      return Array.isArray(result) ? result : [];
    }, 'KEYS', pattern);
  }

  /**
   * Get the TTL of a key in seconds
   */
  async ttl(key: string): Promise<number> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      return await client.ttl(key);
    }, 'TTL', key);
  }

  /**
   * Set the TTL of a key in milliseconds
   */
  async expire(key: string, ttlMs: number): Promise<boolean> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.pexpire(key, ttlMs);
      return result === 1;
    }, 'EXPIRE', key);
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<string> {
    return this.executeWithTimeout(async () => {
      const client = this.connectionManager.getClient();
      const result = await client.ping();
      return typeof result === 'string' ? result : 'PONG';
    }, 'PING', '');
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
  }

  /**
   * Get connection health status
   */
  isHealthy(): boolean {
    return this.connectionManager.isHealthy();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return this.connectionManager.getConnectionStats();
  }

  /**
   * Execute a Redis command with timeout and error handling
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    command: string,
    key: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Redis ${command} operation timed out after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      
      logger.debug(`Redis ${command} operation completed`, {
        command,
        key,
        success: true
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Redis ${command} operation failed`, {
        command,
        key,
        error: errorMessage
      });

      // Check if it's a connection error and mark as unhealthy
      if (this.isConnectionError(error)) {
        logger.warn('Redis connection error detected, marking as unhealthy', {
          command,
          key,
          error: errorMessage
        });
      }

      throw new Error(`Redis ${command} failed: ${errorMessage}`);
    }
  }

  /**
   * Check if an error is a connection-related error
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || String(error);
    const connectionErrorPatterns = [
      'connection',
      'timeout',
      'network',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT'
    ];
    
    return connectionErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}