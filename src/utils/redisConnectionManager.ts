import { Redis } from '@upstash/redis';
import { logger } from './logger';

/**
 * Configuration interface for Redis connection
 */
export interface RedisConnectionConfig {
  url: string;
  token: string;
  retryAttempts?: number;
  retryDelayMs?: number;
  connectionTimeoutMs?: number;
  commandTimeoutMs?: number;
}

/**
 * Redis connection manager with lifecycle management, retry logic, and health monitoring
 */
export class RedisConnectionManager {
  private config: RedisConnectionConfig;
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxRetryAttempts: number;
  private retryDelayMs: number;
  private connectionTimeoutMs: number;
  private commandTimeoutMs: number;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: RedisConnectionConfig) {
    this.config = config;
    this.maxRetryAttempts = config.retryAttempts ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.connectionTimeoutMs = config.connectionTimeoutMs ?? 10000;
    this.commandTimeoutMs = config.commandTimeoutMs ?? 5000;
  }

  /**
   * Establishes connection to Redis with retry logic
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      logger.info('Attempting to connect to Redis', {
        url: this.config.url,
        attempt: this.reconnectAttempts + 1,
        maxAttempts: this.maxRetryAttempts
      });

      // Create Redis client with timeout configuration
      this.client = new Redis({
        url: this.config.url,
        token: this.config.token,
        retry: {
          retries: this.maxRetryAttempts,
          backoff: (retryCount: number) => Math.min(1000 * Math.pow(2, retryCount), 30000)
        }
      });

      // Test the connection with a ping
      await this.pingWithTimeout();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Successfully connected to Redis', {
        url: this.config.url
      });

    } catch (error) {
      this.isConnected = false;
      this.client = null;
      this.reconnectAttempts++;

      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : String(error),
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxRetryAttempts,
        url: this.config.url
      });

      if (this.reconnectAttempts < this.maxRetryAttempts) {
        const delay = this.calculateExponentialBackoff(this.reconnectAttempts);
        logger.info(`Retrying Redis connection in ${delay}ms`, {
          attempt: this.reconnectAttempts,
          delay
        });
        
        await this.sleep(delay);
        return this.connect();
      } else {
        throw new Error(`Failed to connect to Redis after ${this.maxRetryAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Disconnects from Redis and cleans up resources
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      try {
        // Upstash Redis client doesn't have an explicit disconnect method
        // The connection is managed automatically
        this.client = null;
        this.isConnected = false;
        
        logger.info('Disconnected from Redis');
      } catch (error) {
        logger.error('Error during Redis disconnect', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Performs a health check by pinging Redis
   */
  async ping(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      await this.pingWithTimeout();
      return true;
    } catch (error) {
      logger.warn('Redis ping failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Gets the Redis client instance
   * @throws Error if not connected
   */
  getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Checks if the connection is healthy
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Gets connection statistics
   */
  getConnectionStats(): {
    isConnected: boolean;
    reconnectAttempts: number;
    maxRetryAttempts: number;
    url: string;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxRetryAttempts: this.maxRetryAttempts,
      url: this.config.url
    };
  }

  /**
   * Attempts to reconnect if the connection is lost
   */
  async reconnect(): Promise<void> {
    logger.info('Attempting to reconnect to Redis');
    this.isConnected = false;
    this.client = null;
    this.reconnectAttempts = 0;
    await this.connect();
  }

  /**
   * Performs a ping with timeout
   */
  private async pingWithTimeout(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Redis ping timeout')), this.commandTimeoutMs);
    });

    const pingPromise = this.client.ping();

    try {
      await Promise.race([pingPromise, timeoutPromise]);
    } catch (error) {
      throw new Error(`Redis ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculates exponential backoff delay
   */
  private calculateExponentialBackoff(attempt: number): number {
    const baseDelay = this.retryDelayMs;
    const maxDelay = 30000; // 30 seconds max
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}