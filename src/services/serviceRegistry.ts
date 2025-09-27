/**
 * Service registry for managing singleton service instances
 * Provides centralized access to services across the application
 */

import { MigrationScheduler } from './migrationScheduler';
import { FailedMigrationScheduler } from './failedMigrationScheduler';
import { ICacheService, RedisCacheManager } from './redisCacheManager';
import { IRedisClient } from '../utils/redisClient';
import { RedisJobQueueService } from './redisJobQueueService';
import { RedisCacheService } from './redisCacheService';
import { InstanceResponse } from '../types/api';

interface ServiceRegistry {
  migrationScheduler?: MigrationScheduler;
  failedMigrationScheduler?: FailedMigrationScheduler;
  cacheManager?: RedisCacheManager;
  redisClient?: IRedisClient;
  jobQueueService?: RedisJobQueueService;
  instanceCache?: RedisCacheService<InstanceResponse>;
}

class ServiceRegistryManager {
  private static instance: ServiceRegistryManager;
  private services: ServiceRegistry = {};

  private constructor() {}

  public static getInstance(): ServiceRegistryManager {
    if (!ServiceRegistryManager.instance) {
      ServiceRegistryManager.instance = new ServiceRegistryManager();
    }
    return ServiceRegistryManager.instance;
  }

  public registerMigrationScheduler(scheduler: MigrationScheduler): void {
    this.services.migrationScheduler = scheduler;
  }

  public getMigrationScheduler(): MigrationScheduler | undefined {
    return this.services.migrationScheduler;
  }

  public registerFailedMigrationScheduler(scheduler: FailedMigrationScheduler): void {
    this.services.failedMigrationScheduler = scheduler;
  }

  public getFailedMigrationScheduler(): FailedMigrationScheduler | undefined {
    return this.services.failedMigrationScheduler;
  }

  public registerCacheManager(cacheManager: RedisCacheManager): void {
    this.services.cacheManager = cacheManager;
  }

  public getCacheManager(): RedisCacheManager | undefined {
    return this.services.cacheManager;
  }

  public registerRedisClient(redisClient: IRedisClient): void {
    this.services.redisClient = redisClient;
  }

  public getRedisClient(): IRedisClient | undefined {
    return this.services.redisClient;
  }

  public registerJobQueueService(jobQueueService: RedisJobQueueService): void {
    this.services.jobQueueService = jobQueueService;
  }

  public getJobQueueService(): RedisJobQueueService | undefined {
    return this.services.jobQueueService;
  }

  public registerInstanceCache(instanceCache: RedisCacheService<InstanceResponse>): void {
    this.services.instanceCache = instanceCache;
  }

  public getInstanceCache(): RedisCacheService<InstanceResponse> | undefined {
    return this.services.instanceCache;
  }

  public reset(): void {
    this.services = {};
  }

  /**
   * Get all registered services for health checks
   */
  public getAllServices(): ServiceRegistry {
    return { ...this.services };
  }
}

export const serviceRegistry = ServiceRegistryManager.getInstance();