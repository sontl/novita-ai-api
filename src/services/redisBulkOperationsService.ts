import { IRedisClient } from '../utils/redisClient';
import { RedisPipelineWrapper } from '../utils/redisPipelineWrapper';
import { logger } from '../utils/logger';

/**
 * Bulk operation result interface
 */
export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: string[];
  duration: number;
}

/**
 * Bulk set operation data
 */
export interface BulkSetData<T = any> {
  key: string;
  value: T;
  ttl?: number;
}

/**
 * Service for performing bulk Redis operations efficiently
 * Reduces Redis command count through batching and concurrent execution
 */
export class RedisBulkOperationsService {
  constructor(private readonly redisClient: IRedisClient) {}

  /**
   * Bulk set multiple key-value pairs
   * Reduces N individual SET commands to concurrent batch operations
   */
  async bulkSet<T>(data: BulkSetData<T>[], batchSize: number = 50): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const result: BulkOperationResult = {
      successful: 0,
      failed: 0,
      errors: [],
      duration: 0
    };

    if (data.length === 0) {
      result.duration = Date.now() - startTime;
      return result;
    }

    try {
      // Process in batches to avoid overwhelming Redis
      const batches = this.createBatches(data, batchSize);
      
      for (const batch of batches) {
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        
        // Add all operations to pipeline
        batch.forEach(item => {
          pipeline.set(item.key, item.value, item.ttl);
        });

        // Execute batch
        const results = await pipeline.exec();
        
        // Process results
        results.forEach((pipelineResult, index) => {
          if (pipelineResult.success) {
            result.successful++;
          } else {
            result.failed++;
            const errorMessage = pipelineResult.error !== undefined ? pipelineResult.error : 'Unknown error';
            // Type guard for batch[index] to ensure it exists and has key property
            const batchItem = batch[index];
            if (batchItem && typeof batchItem === 'object' && 'key' in batchItem) {
              result.errors.push(`Failed to set ${(batchItem as BulkSetData<T>).key}: ${errorMessage}`);
            } else {
              result.errors.push(`Failed to set item at index ${index}: ${errorMessage}`);
            }
          }
        });
      }

      result.duration = Date.now() - startTime;
      
      logger.info('Bulk set operation completed', {
        total: data.length,
        successful: result.successful,
        failed: result.failed,
        batches: batches.length,
        duration: `${result.duration}ms`
      });

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Bulk set operation failed: ${errorMessage}`);
      result.failed = data.length - result.successful;
      
      logger.error('Bulk set operation failed', {
        total: data.length,
        error: errorMessage,
        duration: `${result.duration}ms`
      });
      
      return result;
    }
  }

  /**
   * Bulk get multiple keys
   * Reduces N individual GET commands to concurrent batch operations
   */
  async bulkGet<T>(keys: string[], batchSize: number = 50): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    
    if (keys.length === 0) {
      return result;
    }

    try {
      const batches = this.createBatches(keys, batchSize);
      
      for (const batch of batches) {
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        
        // Add all get operations to pipeline
        batch.forEach(key => {
          pipeline.get(key);
        });

        // Execute batch
        const results = await pipeline.exec();
        
        // Process results
        results.forEach((pipelineResult, index) => {
          const key = batch[index];
          // Ensure key is defined before using it
          if (key !== undefined) {
            if (pipelineResult.success) {
              // Check if result exists before accessing it
              const value: T | null = pipelineResult.result !== undefined ? pipelineResult.result : null;
              result.set(key, value);
            } else {
              result.set(key, null);
              const errorMessage = pipelineResult.error !== undefined ? pipelineResult.error : 'Unknown error';
              logger.warn('Failed to get key in bulk operation', {
                key,
                error: errorMessage
              });
            }
          }
        });
      }

      logger.debug('Bulk get operation completed', {
        keys: keys.length,
        batches: batches.length,
        retrieved: result.size
      });

      return result;
    } catch (error) {
      logger.error('Bulk get operation failed', {
        keys: keys.length,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return empty results for all keys on failure
      keys.forEach(key => result.set(key, null));
      return result;
    }
  }

  /**
   * Bulk delete multiple keys
   * Reduces N individual DEL commands to concurrent batch operations
   */
  async bulkDelete(keys: string[], batchSize: number = 50): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const result: BulkOperationResult = {
      successful: 0,
      failed: 0,
      errors: [],
      duration: 0
    };

    if (keys.length === 0) {
      result.duration = Date.now() - startTime;
      return result;
    }

    try {
      const batches = this.createBatches(keys, batchSize);
      
      for (const batch of batches) {
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        
        // Add all delete operations to pipeline
        batch.forEach(key => {
          pipeline.del(key);
        });

        // Execute batch
        const results = await pipeline.exec();
        
        // Process results
        results.forEach((pipelineResult, index) => {
          if (pipelineResult.success) {
            // For delete operations, result indicates number of keys deleted
            const deleteCount = pipelineResult.result !== undefined ? pipelineResult.result : 0;
            if (deleteCount >= 0) { // Changed condition to >= 0 to handle 0 correctly
              result.successful++;
            } else {
              // Key didn't exist, still count as successful
              result.successful++;
            }
          } else {
            result.failed++;
            const errorMessage = pipelineResult.error !== undefined ? pipelineResult.error : 'Unknown error';
            result.errors.push(`Failed to delete ${batch[index]}: ${errorMessage}`);
          }
        });
      }

      result.duration = Date.now() - startTime;
      
      logger.info('Bulk delete operation completed', {
        total: keys.length,
        successful: result.successful,
        failed: result.failed,
        batches: batches.length,
        duration: `${result.duration}ms`
      });

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Bulk delete operation failed: ${errorMessage}`);
      result.failed = keys.length - result.successful;
      
      logger.error('Bulk delete operation failed', {
        total: keys.length,
        error: errorMessage,
        duration: `${result.duration}ms`
      });
      
      return result;
    }
  }

  /**
   * Bulk check existence of multiple keys
   * Reduces N individual EXISTS commands to concurrent batch operations
   */
  async bulkExists(keys: string[], batchSize: number = 50): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    
    if (keys.length === 0) {
      return result;
    }

    try {
      const batches = this.createBatches(keys, batchSize);
      
      for (const batch of batches) {
        const pipeline = new RedisPipelineWrapper(this.redisClient);
        
        // Add all exists operations to pipeline
        batch.forEach(key => {
          pipeline.exists(key);
        });

        // Execute batch
        const results = await pipeline.exec();
        
        // Process results
        results.forEach((pipelineResult, index) => {
          const key = batch[index];
          // Ensure key is defined before using it
          if (key !== undefined) {
            if (pipelineResult.success) {
              // Check if result exists before accessing it
              const exists = pipelineResult.result !== undefined ? Boolean(pipelineResult.result) : false;
              result.set(key, exists);
            } else {
              result.set(key, false);
              const errorMessage = pipelineResult.error !== undefined ? pipelineResult.error : 'Unknown error';
              logger.warn('Failed to check existence in bulk operation', {
                key,
                error: errorMessage
              });
            }
          }
        });
      }

      logger.debug('Bulk exists operation completed', {
        keys: keys.length,
        batches: batches.length,
        checked: result.size
      });

      return result;
    } catch (error) {
      logger.error('Bulk exists operation failed', {
        keys: keys.length,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return false for all keys on failure
      keys.forEach(key => result.set(key, false));
      return result;
    }
  }

  /**
   * Bulk operation for cache synchronization
   * Optimized for the startup sync use case
   */
  async bulkSyncCache<T>(
    updates: BulkSetData<T>[],
    deletions: string[],
    batchSize: number = 30
  ): Promise<{
    updates: BulkOperationResult;
    deletions: BulkOperationResult;
    totalDuration: number;
  }> {
    const startTime = Date.now();
    
    // Execute updates and deletions in parallel
    const [updateResult, deleteResult] = await Promise.all([
      this.bulkSet(updates, batchSize),
      this.bulkDelete(deletions, batchSize)
    ]);

    const totalDuration = Date.now() - startTime;
    
    logger.info('Bulk cache sync completed', {
      updates: {
        total: updates.length,
        successful: updateResult.successful,
        failed: updateResult.failed
      },
      deletions: {
        total: deletions.length,
        successful: deleteResult.successful,
        failed: deleteResult.failed
      },
      totalDuration: `${totalDuration}ms`
    });

    return {
      updates: updateResult,
      deletions: deleteResult,
      totalDuration
    };
  }

  /**
   * Create batches from an array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}