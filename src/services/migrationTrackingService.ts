import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('migration-tracking');
import { serviceRegistry } from './serviceRegistry';

/**
 * Service for tracking migration times for instances
 */
export class MigrationTrackingService {
  private readonly cacheName = 'migration-times';
  private migrationCache: any = null;

  /**
   * Get or create the migration cache instance
   */
  private async getMigrationCache() {
    if (this.migrationCache) {
      return this.migrationCache;
    }

    const cacheManager = serviceRegistry.getCacheManager();
    if (!cacheManager) {
      return null;
    }

    this.migrationCache = await cacheManager.getCache<string>(this.cacheName, {
      maxSize: 10000,
      defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return this.migrationCache;
  }

  /**
   * Record the last migration time for an instance
   */
  async recordMigrationTime(instanceId: string, migrationTime: Date = new Date()): Promise<void> {
    try {
      const cache = await this.getMigrationCache();
      if (!cache) {
        logger.warn('Cache not available, migration time not recorded', { instanceId });
        return;
      }

      const value = migrationTime.toISOString();

      await cache.set(instanceId, value);

      logger.debug('Migration time recorded', {
        instanceId,
        migrationTime: value
      });
    } catch (error) {
      logger.error('Failed to record migration time', {
        instanceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get the last migration time for an instance
   */
  async getLastMigrationTime(instanceId: string): Promise<Date | null> {
    try {
      const cache = await this.getMigrationCache();
      if (!cache) {
        logger.debug('Cache not available, no migration time available', { instanceId });
        return null;
      }

      const value = await cache.get(instanceId);

      if (!value) {
        logger.debug('No migration time found for instance', { instanceId });
        return null;
      }

      const migrationTime = new Date(value);
      logger.debug('Retrieved migration time', {
        instanceId,
        migrationTime: migrationTime.toISOString()
      });

      return migrationTime;
    } catch (error) {
      logger.error('Failed to get migration time', {
        instanceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Calculate hours since last migration
   */
  async getHoursSinceLastMigration(instanceId: string): Promise<number> {
    let lastMigrationTime = await this.getLastMigrationTime(instanceId);

    if (!lastMigrationTime) {
      // If no migration time found, set it to now so migration can happen on next check
      const now = new Date();
      await this.recordMigrationTime(instanceId, now);
      return 0;
    }

    const now = new Date();
    const diffMs = now.getTime() - lastMigrationTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return Math.floor(diffHours * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Check if enough time has passed since last migration
   */
  async isEligibleByTime(instanceId: string, requiredIntervalHours: number): Promise<{
    eligible: boolean;
    hoursSinceLastMigration: number;
    lastMigrationTime: Date | null;
  }> {
    const lastMigrationTime = await this.getLastMigrationTime(instanceId);
    const hoursSinceLastMigration = await this.getHoursSinceLastMigration(instanceId);

    // Check if enough time has passed
    const eligible = hoursSinceLastMigration >= requiredIntervalHours;

    return {
      eligible,
      hoursSinceLastMigration,
      lastMigrationTime
    };
  }

  /**
   * Clear migration time for an instance (useful for testing)
   */
  async clearMigrationTime(instanceId: string): Promise<void> {
    try {
      const cache = await this.getMigrationCache();
      if (!cache) {
        logger.debug('Cache not available, nothing to clear', { instanceId });
        return;
      }

      await cache.delete(instanceId);

      logger.debug('Migration time cleared', { instanceId });
    } catch (error) {
      logger.error('Failed to clear migration time', {
        instanceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export singleton instance
export const migrationTrackingService = new MigrationTrackingService();