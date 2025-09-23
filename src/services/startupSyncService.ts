/**
 * Startup synchronization service for syncing Novita.ai instances with Redis cache
 * Ensures data consistency between external API and local cache on application startup
 */

import { logger } from '../utils/logger';
import { NovitaApiService } from './novitaApiService';
import { RedisCacheService } from './redisCacheService';
import { InstanceResponse, InstanceStatus } from '../types/api';
import { IRedisClient } from '../utils/redisClient';

export interface SyncResult {
  novitaInstances: number;
  redisInstances: number;
  synchronized: number;
  deleted: number;
  errors: string[];
}

export class StartupSyncService {
  private readonly instanceCacheKey = 'instances';
  private readonly syncLockKey = 'sync:startup:lock';
  private readonly syncLockTtl = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly novitaApiService: NovitaApiService,
    private readonly redisClient: IRedisClient,
    private readonly instanceCache: RedisCacheService<InstanceResponse>
  ) {}

  /**
   * Synchronize instances between Novita.ai and Redis on startup
   */
  async synchronizeInstances(): Promise<SyncResult> {
    const startTime = Date.now();
    logger.info('Starting instance synchronization on startup');

    const result: SyncResult = {
      novitaInstances: 0,
      redisInstances: 0,
      synchronized: 0,
      deleted: 0,
      errors: []
    };

    try {
      // Acquire sync lock to prevent concurrent synchronization
      const lockAcquired = await this.acquireSyncLock();
      if (!lockAcquired) {
        const error = 'Another synchronization process is already running';
        logger.warn(error);
        result.errors.push(error);
        return result;
      }

      try {
        // Fetch all instances from Novita.ai
        const novitaInstances = await this.fetchAllNovitaInstances();
        result.novitaInstances = novitaInstances.length;

        logger.info('Fetched instances from Novita.ai', {
          count: novitaInstances.length,
          statuses: this.getStatusCounts(novitaInstances)
        });

        // Get all cached instances from Redis
        const cachedInstances = await this.getAllCachedInstances();
        result.redisInstances = cachedInstances.length;

        logger.info('Found cached instances in Redis', {
          count: cachedInstances.length
        });

        // Create maps for efficient lookup
        const novitaInstanceMap = new Map(
          novitaInstances.map(instance => [instance.id, instance])
        );
        const cachedInstanceMap = new Map(
          cachedInstances.map(instance => [instance.id, instance])
        );

        // Synchronize instances: update existing and add new ones
        for (const novitaInstance of novitaInstances) {
          try {
            await this.instanceCache.set(novitaInstance.id, novitaInstance);
            result.synchronized++;

            logger.debug('Synchronized instance', {
              instanceId: novitaInstance.id,
              name: novitaInstance.name,
              status: novitaInstance.status
            });
          } catch (error) {
            const errorMsg = `Failed to sync instance ${novitaInstance.id}: ${error instanceof Error ? error.message : String(error)}`;
            logger.error(errorMsg);
            result.errors.push(errorMsg);
          }
        }

        // Remove instances from Redis that no longer exist in Novita.ai
        for (const cachedInstance of cachedInstances) {
          if (!novitaInstanceMap.has(cachedInstance.id)) {
            try {
              await this.instanceCache.delete(cachedInstance.id);
              result.deleted++;

              logger.info('Deleted orphaned instance from cache', {
                instanceId: cachedInstance.id,
                name: cachedInstance.name,
                lastStatus: cachedInstance.status
              });
            } catch (error) {
              const errorMsg = `Failed to delete orphaned instance ${cachedInstance.id}: ${error instanceof Error ? error.message : String(error)}`;
              logger.error(errorMsg);
              result.errors.push(errorMsg);
            }
          }
        }

        // Log synchronization summary
        const duration = Date.now() - startTime;
        logger.info('Instance synchronization completed', {
          duration: `${duration}ms`,
          novitaInstances: result.novitaInstances,
          redisInstances: result.redisInstances,
          synchronized: result.synchronized,
          deleted: result.deleted,
          errors: result.errors.length
        });

        return result;

      } finally {
        // Always release the sync lock
        await this.releaseSyncLock();
      }

    } catch (error) {
      const errorMsg = `Synchronization failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg, { error });
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Get synchronization status for health checks
   */
  async getSyncStatus(): Promise<{
    lastSync: string | null;
    isLocked: boolean;
    cacheSize: number;
  }> {
    try {
      const lastSync = await this.redisClient.get<string>('sync:startup:last');
      const isLocked = await this.redisClient.exists(this.syncLockKey);
      const cacheSize = await this.instanceCache.size();

      return {
        lastSync,
        isLocked,
        cacheSize
      };
    } catch (error) {
      logger.error('Failed to get sync status', { error });
      return {
        lastSync: null,
        isLocked: false,
        cacheSize: 0
      };
    }
  }

  /**
   * Fetch all instances from Novita.ai with pagination
   */
  private async fetchAllNovitaInstances(): Promise<InstanceResponse[]> {
    const allInstances: InstanceResponse[] = [];
    let page = 1;
    const pageSize = 50; // Reasonable page size to avoid timeouts

    try {
      while (true) {
        logger.debug('Fetching instances page from Novita.ai', { page, pageSize });

        const response = await this.novitaApiService.listInstances({
          page,
          pageSize
        });

        if (!response.instances || response.instances.length === 0) {
          break;
        }

        allInstances.push(...response.instances);

        logger.debug('Fetched instances page', {
          page,
          instancesInPage: response.instances.length,
          totalSoFar: allInstances.length
        });

        // Check if we've reached the end
        if (response.instances.length < pageSize) {
          break;
        }

        page++;

        // Add small delay between requests to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return allInstances;

    } catch (error) {
      logger.error('Failed to fetch instances from Novita.ai', {
        page,
        totalFetched: allInstances.length,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all cached instances from Redis
   */
  private async getAllCachedInstances(): Promise<InstanceResponse[]> {
    try {
      const keys = await this.instanceCache.keys();
      const instances: InstanceResponse[] = [];

      for (const key of keys) {
        try {
          const instance = await this.instanceCache.get(key);
          if (instance) {
            instances.push(instance);
          }
        } catch (error) {
          logger.warn('Failed to retrieve cached instance', {
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return instances;
    } catch (error) {
      logger.error('Failed to get cached instances', { error });
      return [];
    }
  }

  /**
   * Acquire synchronization lock to prevent concurrent sync operations
   */
  private async acquireSyncLock(): Promise<boolean> {
    try {
      const lockValue = `${Date.now()}-${Math.random()}`;
      const acquired = await this.redisClient.setNX(this.syncLockKey, lockValue, this.syncLockTtl);

      if (acquired) {
        logger.debug('Acquired synchronization lock');
        return true;
      } else {
        logger.warn('Failed to acquire synchronization lock - another process is running');
        return false;
      }
    } catch (error) {
      logger.error('Error acquiring synchronization lock', { error });
      return false;
    }
  }

  /**
   * Release synchronization lock
   */
  private async releaseSyncLock(): Promise<void> {
    try {
      await this.redisClient.del(this.syncLockKey);
      
      // Record last sync time
      await this.redisClient.set('sync:startup:last', new Date().toISOString(), 24 * 60 * 60 * 1000); // 24 hours TTL
      
      logger.debug('Released synchronization lock');
    } catch (error) {
      logger.error('Error releasing synchronization lock', { error });
    }
  }

  /**
   * Get status counts for logging
   */
  private getStatusCounts(instances: InstanceResponse[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const instance of instances) {
      counts[instance.status] = (counts[instance.status] || 0) + 1;
    }
    
    return counts;
  }
}