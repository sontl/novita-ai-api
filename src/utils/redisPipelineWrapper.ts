import { IRedisClient } from './redisClient';
import { logger } from './logger';

/**
 * Pipeline operation interface
 */
interface PipelineOperation {
  type: 'get' | 'set' | 'del' | 'exists' | 'hget' | 'hset' | 'hdel';
  key: string;
  field?: string;
  value?: any;
  ttl?: number;
}

/**
 * Pipeline result interface
 */
interface PipelineResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Redis pipeline wrapper that batches operations for better performance
 * Since Upstash doesn't support native pipelines, we simulate with Promise.all
 */
export class RedisPipelineWrapper {
  private operations: PipelineOperation[] = [];
  
  constructor(private readonly redisClient: IRedisClient) {}

  /**
   * Add a GET operation to the pipeline
   */
  get<T>(key: string): this {
    this.operations.push({ type: 'get', key });
    return this;
  }

  /**
   * Add a SET operation to the pipeline
   */
  set<T>(key: string, value: T, ttl?: number): this {
    const operation: PipelineOperation = { type: 'set', key, value };
    if (ttl !== undefined) {
      operation.ttl = ttl;
    }
    this.operations.push(operation);
    return this;
  }

  /**
   * Add a DEL operation to the pipeline
   */
  del(key: string): this {
    this.operations.push({ type: 'del', key });
    return this;
  }

  /**
   * Add an EXISTS operation to the pipeline
   */
  exists(key: string): this {
    this.operations.push({ type: 'exists', key });
    return this;
  }

  /**
   * Add an HGET operation to the pipeline
   */
  hget<T>(key: string, field: string): this {
    this.operations.push({ type: 'hget', key, field });
    return this;
  }

  /**
   * Add an HSET operation to the pipeline
   */
  hset<T>(key: string, field: string, value: T): this {
    this.operations.push({ type: 'hset', key, field, value });
    return this;
  }

  /**
   * Add an HDEL operation to the pipeline
   */
  hdel(key: string, field: string): this {
    this.operations.push({ type: 'hdel', key, field });
    return this;
  }

  /**
   * Execute all operations in the pipeline
   */
  async exec(): Promise<PipelineResult[]> {
    if (this.operations.length === 0) {
      return [];
    }

    const startTime = Date.now();
    
    try {
      // Execute all operations concurrently
      const promises = this.operations.map(async (op): Promise<PipelineResult> => {
        try {
          let result: any;
          
          switch (op.type) {
            case 'get':
              result = await this.redisClient.get(op.key);
              break;
            case 'set':
              await this.redisClient.set(op.key, op.value, op.ttl);
              result = 'OK';
              break;
            case 'del':
              result = await this.redisClient.del(op.key) ? 1 : 0;
              break;
            case 'exists':
              result = await this.redisClient.exists(op.key);
              break;
            case 'hget':
              result = await this.redisClient.hget(op.key, op.field!);
              break;
            case 'hset':
              await this.redisClient.hset(op.key, op.field!, op.value);
              result = 'OK';
              break;
            case 'hdel':
              result = await this.redisClient.hdel(op.key, op.field!);
              break;
            default:
              throw new Error(`Unsupported operation type: ${(op as any).type}`);
          }

          return { success: true, result };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn('Pipeline operation failed', {
            operation: op.type,
            key: op.key,
            field: op.field,
            error: errorMessage
          });
          return { success: false, error: errorMessage };
        }
      });

      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      logger.debug('Pipeline executed', {
        operations: this.operations.length,
        successful: successCount,
        failed: this.operations.length - successCount,
        duration: `${duration}ms`
      });

      // Clear operations after execution
      this.operations = [];
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Pipeline execution failed', {
        operations: this.operations.length,
        error: errorMessage
      });
      
      // Clear operations even on failure
      this.operations = [];
      
      // Return error results for all operations
      return this.operations.map(() => ({ success: false, error: errorMessage }));
    }
  }

  /**
   * Get the number of operations in the pipeline
   */
  length(): number {
    return this.operations.length;
  }

  /**
   * Clear all operations from the pipeline
   */
  clear(): void {
    this.operations = [];
  }
}

/**
 * Extended Redis client interface with pipeline support
 */
export interface IRedisClientWithPipeline extends IRedisClient {
  pipeline(): RedisPipelineWrapper;
}

/**
 * Create a Redis client wrapper with pipeline support
 */
export function createRedisClientWithPipeline(redisClient: IRedisClient): IRedisClientWithPipeline {
  return {
    ...redisClient,
    pipeline(): RedisPipelineWrapper {
      return new RedisPipelineWrapper(redisClient);
    }
  };
}