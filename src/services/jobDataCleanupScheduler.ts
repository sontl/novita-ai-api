import * as cron from 'node-cron';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';
import { serviceRegistry } from './serviceRegistry';

const logger = createAxiomSafeLogger('job-data-cleanup-scheduler');

/**
 * Job Data Cleanup Scheduler Service
 * Automatically deletes all jobs:data:job_* keys from Redis every 3 hours
 */
class JobDataCleanupScheduler {
    private scheduledTask: ReturnType<typeof cron.schedule> | null = null;
    private isRunning = false;
    private lastExecutionTime: Date | null = null;
    private executionCount = 0;
    private lastDeletedCount = 0;

    /**
     * Start the scheduler to clean up job data every 3 hours
     */
    start(): void {
        if (this.isRunning) {
            logger.warn('Job data cleanup scheduler is already running');
            return;
        }

        try {
            // Schedule job data cleanup every 3 hours
            // Format: minute hour day month weekday
            // 0 */3 * * * = At minute 0 every 3rd hour
            this.scheduledTask = cron.schedule('0 */3 * * *', async () => {
                await this.executeCleanup();
            }, {
                timezone: 'UTC' // Use UTC for consistent scheduling
            });

            this.isRunning = true;
            logger.info('Job data cleanup scheduler started successfully', {
                schedule: 'Every 3 hours (at minute 0)',
                timezone: 'UTC',
                nextExecution: this.getNextExecutionTime()
            });
        } catch (error) {
            logger.error('Failed to start job data cleanup scheduler', {
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
            logger.warn('Job data cleanup scheduler is not running');
            return;
        }

        try {
            this.scheduledTask.stop();
            this.scheduledTask = null;
            this.isRunning = false;

            logger.info('Job data cleanup scheduler stopped successfully', {
                totalExecutions: this.executionCount,
                lastExecution: this.lastExecutionTime?.toISOString(),
                lastDeletedCount: this.lastDeletedCount
            });
        } catch (error) {
            logger.error('Failed to stop job data cleanup scheduler', {
                error: (error as Error).message
            });
            throw error;
        }
    }

    /**
     * Execute the job data cleanup operation
     * Deletes all keys matching pattern jobs:data:job_*
     */
    private async executeCleanup(): Promise<number> {
        const startTime = Date.now();

        logger.info('Starting scheduled job data cleanup operation');

        try {
            const redisClient = serviceRegistry.getRedisClient();

            if (!redisClient) {
                logger.error('Redis client not available for job data cleanup');
                return 0;
            }

            // Use SCAN to find all keys matching the pattern (non-blocking)
            const pattern = 'jobs:data:job_*';
            const keysToDelete: string[] = [];
            let cursor = '0';

            // Scan for all matching keys
            do {
                const [newCursor, keys] = await redisClient.scan(cursor, {
                    match: pattern,
                    count: 100
                });
                cursor = newCursor;
                keysToDelete.push(...keys);
            } while (cursor !== '0');

            if (keysToDelete.length === 0) {
                logger.info('No job data keys found to delete');
                this.lastExecutionTime = new Date();
                this.executionCount++;
                this.lastDeletedCount = 0;
                return 0;
            }

            // Delete keys in batches to avoid overwhelming Redis
            const batchSize = 100;
            let deletedCount = 0;

            for (let i = 0; i < keysToDelete.length; i += batchSize) {
                const batch = keysToDelete.slice(i, i + batchSize);

                // Delete each key individually (IRedisClient doesn't have bulk delete)
                for (const key of batch) {
                    const deleted = await redisClient.del(key);
                    if (deleted) {
                        deletedCount++;
                    }
                }
            }

            this.lastExecutionTime = new Date();
            this.executionCount++;
            this.lastDeletedCount = deletedCount;

            const duration = Date.now() - startTime;

            logger.info('Scheduled job data cleanup completed successfully', {
                duration: `${duration}ms`,
                keysFound: keysToDelete.length,
                keysDeleted: deletedCount,
                executionCount: this.executionCount,
                timestamp: this.lastExecutionTime.toISOString()
            });

            return deletedCount;
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Scheduled job data cleanup failed', {
                error: (error as Error).message,
                duration: `${duration}ms`,
                executionCount: this.executionCount
            });

            return 0;
        }
    }

    /**
     * Get the next execution time for the scheduled task
     */
    private getNextExecutionTime(): string {
        const now = new Date();
        const next = new Date(now);

        // Get current hour
        const currentHour = now.getUTCHours();

        // Find the next 3-hour mark (0, 3, 6, 9, 12, 15, 18, 21)
        const hoursUntilNext = 3 - (currentHour % 3);

        // If we're exactly at a 3-hour mark but past minute 0, add 3 hours
        if (hoursUntilNext === 3 && now.getUTCMinutes() > 0) {
            next.setUTCHours(currentHour + 3, 0, 0, 0);
        } else if (hoursUntilNext === 3) {
            // We're at minute 0 of a 3-hour mark, next is in 3 hours
            next.setUTCHours(currentHour + 3, 0, 0, 0);
        } else {
            next.setUTCHours(currentHour + hoursUntilNext, 0, 0, 0);
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
            lastDeletedCount: this.lastDeletedCount,
            nextExecution: this.isRunning ? this.getNextExecutionTime() : 'Not scheduled',
            schedule: 'Every 3 hours (at minute 0)'
        };
    }

    /**
     * Manually trigger job data cleanup (for testing or immediate execution)
     */
    async triggerManually(): Promise<number> {
        logger.info('Manual job data cleanup triggered');
        return await this.executeCleanup();
    }
}

// Export singleton instance
export const jobDataCleanupScheduler = new JobDataCleanupScheduler();
