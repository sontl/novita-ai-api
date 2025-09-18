/**
 * Service registry for managing singleton service instances
 * Provides centralized access to services across the application
 */

import { MigrationScheduler } from './migrationScheduler';

interface ServiceRegistry {
  migrationScheduler?: MigrationScheduler;
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

  public reset(): void {
    this.services = {};
  }
}

export const serviceRegistry = ServiceRegistryManager.getInstance();