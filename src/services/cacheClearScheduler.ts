import * as cron from 'node-cron';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';
import { cacheManager } from './cacheService';
import { templateService } from './templateService';

const logger = createAxiomSafeLogger('cache-clear-scheduler');

/**
 * Cache Clear Scheduler Service
 * Automatically clears all caches at a scheduled time each day
 */
class CacheClearScheduler {
    private scheduledTask: ReturnType<typeof cron.schedule> | null = null;
    private isRunning = false;
    private lastExecutionTime: Date | null = null;
    private executionCount = 0;

    /**
     * Start the scheduler to clear cache daily at 11 PM
     * Cron expression: "0 23 * * *" means at 23:00 (11 PM) every day
     */
    start(): void {
        if (this.isRunning) {
            logger.warn('Cache clear scheduler is already running');
            return;
        }

        try {
            // Schedule cache clearing at 11 PM every day
            // Format: minute hour day month weekday
            // 0 23 * * * = At 23:00 (11 PM) every day
            this.scheduledTask = cron.schedule('0 23 * * *', async () => {
                await this.executeCacheClear();
            }, {
                timezone: 'Europe/Paris' // Adjust to your timezone if needed
            });

            this.isRunning = true;
            logger.info('Cache clear scheduler started successfully', {
                schedule: 'Daily at 11:00 PM',
                timezone: 'Europe/Paris',
                nextExecution: this.getNextExecutionTime()
            });
        } catch (error) {
            logger.error('Failed to start cache clear scheduler', {
                error: (error as Error).message
            });
            throw error;
        }
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (!this.isRunning || !this.scheduledTask) {
            logger.warn('Cache clear scheduler is not running');
            return;
        }

        try {
            this.scheduledTask.stop();
            this.scheduledTask = null;
            this.isRunning = false;

            logger.info('Cache clear scheduler stopped successfully', {
                totalExecutions: this.executionCount,
                lastExecution: this.lastExecutionTime?.toISOString()
            });
        } catch (error) {
            logger.error('Failed to stop cache clear scheduler', {
                error: (error as Error).message
            });
            throw error;
        }
    }

    /**
     * Execute the cache clearing operation
     */
    private async executeCacheClear(): Promise<void> {
        const startTime = Date.now();

        logger.info('Starting scheduled cache clear operation');

        try {
            // Clear all caches
            await cacheManager.clearAll();

            // Also clear service-specific caches
            await templateService.clearCache();

            this.lastExecutionTime = new Date();
            this.executionCount++;

            const duration = Date.now() - startTime;

            logger.info('Scheduled cache clear completed successfully', {
                duration: `${duration}ms`,
                executionCount: this.executionCount,
                timestamp: this.lastExecutionTime.toISOString()
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Scheduled cache clear failed', {
                error: (error as Error).message,
                duration: `${duration}ms`,
                executionCount: this.executionCount
            });
        }
    }

    /**
     * Get the next execution time for the scheduled task
     */
    private getNextExecutionTime(): string {
        const now = new Date();
        const next = new Date();

        // Set to 11 PM today
        next.setHours(23, 0, 0, 0);

        // If 11 PM has already passed today, set to 11 PM tomorrow
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        return next.toISOString();
    }

    /**
     * Get the current status of the scheduler
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            executionCount: this.executionCount,
            lastExecution: this.lastExecutionTime?.toISOString() || 'Never',
            nextExecution: this.isRunning ? this.getNextExecutionTime() : 'Not scheduled',
            schedule: 'Daily at 11:00 PM'
        };
    }

    /**
     * Manually trigger cache clear (for testing or immediate execution)
     */
    async triggerManually(): Promise<void> {
        logger.info('Manual cache clear triggered');
        await this.executeCacheClear();
    }
}

// Export singleton instance
export const cacheClearScheduler = new CacheClearScheduler();
