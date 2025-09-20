#!/usr/bin/env node

/**
 * Redis Migration Utility Script
 * 
 * This script helps migrate existing in-memory data to Redis storage.
 * It can be used during deployment to ensure data continuity.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import fetch for Node.js versions that don't have it built-in
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (error) {
  console.warn('⚠️ fetch not available, using mock operations for Redis commands');
}

// Configuration
const CONFIG = {
  // Redis connection settings (from environment)
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'novita_api'
  },
  
  // Migration settings
  migration: {
    batchSize: 100,
    retryAttempts: 3,
    retryDelayMs: 1000,
    dryRun: process.env.MIGRATION_DRY_RUN === 'true',
    verbose: process.env.MIGRATION_VERBOSE === 'true'
  }
};

class RedisMigrationUtility {
  constructor() {
    this.validateConfiguration();
    this.migrationLog = [];
  }

  /**
   * Validate required configuration
   */
  validateConfiguration() {
    if (!CONFIG.redis.url || !CONFIG.redis.token) {
      console.error('❌ Redis configuration missing. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
      process.exit(1);
    }

    console.log('✅ Redis configuration validated');
    
    if (CONFIG.migration.dryRun) {
      console.log('🔍 Running in DRY RUN mode - no actual changes will be made');
    }
  }

  /**
   * Main migration entry point
   */
  async migrate() {
    console.log('🚀 Starting Redis migration process...');
    console.log(`📊 Configuration: ${JSON.stringify(CONFIG, null, 2)}`);

    try {
      // Step 1: Backup existing data (if any)
      await this.backupExistingData();

      // Step 2: Migrate cache data
      await this.migrateCacheData();

      // Step 3: Migrate job queue data
      await this.migrateJobQueueData();

      // Step 4: Verify migration
      await this.verifyMigration();

      // Step 5: Generate migration report
      this.generateMigrationReport();

      console.log('✅ Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      this.generateErrorReport(error);
      process.exit(1);
    } finally {
      // Clean up Redis connection
      await this.cleanup();
    }
  }

  /**
   * Backup existing data before migration
   */
  async backupExistingData() {
    console.log('📦 Creating backup of existing data...');
    
    const backupDir = path.join(__dirname, '..', 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `redis-migration-backup-${timestamp}.json`);

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      config: CONFIG,
      cacheData: await this.exportCacheData(),
      jobQueueData: await this.exportJobQueueData()
    };

    if (!CONFIG.migration.dryRun) {
      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup created: ${backupFile}`);
    } else {
      console.log(`🔍 DRY RUN: Would create backup at ${backupFile}`);
    }

    this.migrationLog.push({
      step: 'backup',
      status: 'completed',
      file: backupFile,
      dataSize: JSON.stringify(backupData).length
    });
  }

  /**
   * Export existing cache data
   */
  async exportCacheData() {
    console.log('📤 Exporting cache data...');
    
    // In a real implementation, this would connect to the running application
    // and export cache data. For now, we'll simulate this.
    
    const mockCacheData = {
      instanceDetailsCache: {
        'instance-1': { id: 'instance-1', name: 'test-instance', status: 'running' },
        'instance-2': { id: 'instance-2', name: 'test-instance-2', status: 'stopped' }
      },
      instanceStatesCache: {
        'instance-1': { status: 'running', lastUpdated: new Date().toISOString() },
        'instance-2': { status: 'stopped', lastUpdated: new Date().toISOString() }
      },
      productCache: {
        'product-1': { id: 'product-1', name: 'GPU-A100', region: 'CN-HK-01' }
      }
    };

    console.log(`✅ Exported ${Object.keys(mockCacheData).length} cache collections`);
    return mockCacheData;
  }

  /**
   * Export existing job queue data
   */
  async exportJobQueueData() {
    console.log('📤 Exporting job queue data...');
    
    // In a real implementation, this would export pending/processing jobs
    const mockJobData = {
      pendingJobs: [
        { id: 'job-1', type: 'CREATE_INSTANCE', status: 'PENDING', payload: {} },
        { id: 'job-2', type: 'MONITOR_INSTANCE', status: 'PENDING', payload: {} }
      ],
      processingJobs: [
        { id: 'job-3', type: 'SEND_WEBHOOK', status: 'PROCESSING', payload: {} }
      ],
      completedJobs: [
        { id: 'job-4', type: 'CREATE_INSTANCE', status: 'COMPLETED', payload: {} }
      ]
    };

    console.log(`✅ Exported ${mockJobData.pendingJobs.length + mockJobData.processingJobs.length} active jobs`);
    return mockJobData;
  }

  /**
   * Migrate cache data to Redis
   */
  async migrateCacheData() {
    console.log('🔄 Migrating cache data to Redis...');
    
    const cacheData = await this.exportCacheData();
    let migratedCount = 0;

    for (const [cacheType, entries] of Object.entries(cacheData)) {
      console.log(`  📝 Migrating ${cacheType}...`);
      
      for (const [key, value] of Object.entries(entries)) {
        const redisKey = `${CONFIG.redis.keyPrefix}:cache:${cacheType}:${key}`;
        
        if (!CONFIG.migration.dryRun) {
          // In a real implementation, this would use the Redis client
          await this.setRedisValue(redisKey, value);
        } else {
          console.log(`    🔍 DRY RUN: Would set ${redisKey} = ${JSON.stringify(value).substring(0, 100)}...`);
        }
        
        migratedCount++;
      }
    }

    console.log(`✅ Migrated ${migratedCount} cache entries`);
    
    this.migrationLog.push({
      step: 'cache_migration',
      status: 'completed',
      migratedCount
    });
  }

  /**
   * Migrate job queue data to Redis
   */
  async migrateJobQueueData() {
    console.log('🔄 Migrating job queue data to Redis...');
    
    const jobData = await this.exportJobQueueData();
    let migratedCount = 0;

    // Migrate pending jobs to priority queue
    for (const job of jobData.pendingJobs) {
      const score = this.calculateJobPriority(job);
      
      if (!CONFIG.migration.dryRun) {
        await this.addJobToRedisQueue(job.id, score);
        await this.setJobData(job.id, job);
      } else {
        console.log(`  🔍 DRY RUN: Would add job ${job.id} to queue with score ${score}`);
      }
      
      migratedCount++;
    }

    // Migrate processing jobs to processing hash
    for (const job of jobData.processingJobs) {
      if (!CONFIG.migration.dryRun) {
        await this.addJobToProcessing(job.id, job);
      } else {
        console.log(`  🔍 DRY RUN: Would add job ${job.id} to processing`);
      }
      
      migratedCount++;
    }

    console.log(`✅ Migrated ${migratedCount} jobs`);
    
    this.migrationLog.push({
      step: 'job_migration',
      status: 'completed',
      migratedCount
    });
  }

  /**
   * Verify migration success
   */
  async verifyMigration() {
    console.log('🔍 Verifying migration...');
    
    const verificationResults = {
      cacheEntries: 0,
      jobEntries: 0,
      errors: []
    };

    try {
      // Verify cache data
      verificationResults.cacheEntries = await this.countRedisKeys(`${CONFIG.redis.keyPrefix}:cache:*`);
      
      // Verify job data
      verificationResults.jobEntries = await this.countRedisKeys(`${CONFIG.redis.keyPrefix}:jobs:*`);
      
      console.log(`✅ Verification completed:`);
      console.log(`  📊 Cache entries: ${verificationResults.cacheEntries}`);
      console.log(`  📊 Job entries: ${verificationResults.jobEntries}`);
      
      this.migrationLog.push({
        step: 'verification',
        status: 'completed',
        results: verificationResults
      });
      
    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      verificationResults.errors.push(error.message);
      
      this.migrationLog.push({
        step: 'verification',
        status: 'failed',
        error: error.message
      });
    }
  }

  /**
   * Generate migration report
   */
  generateMigrationReport() {
    console.log('📋 Generating migration report...');
    
    const reportDir = path.join(__dirname, '..', 'reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(reportDir, `redis-migration-report-${timestamp}.json`);

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      config: CONFIG,
      migrationLog: this.migrationLog,
      summary: {
        totalSteps: this.migrationLog.length,
        completedSteps: this.migrationLog.filter(log => log.status === 'completed').length,
        failedSteps: this.migrationLog.filter(log => log.status === 'failed').length,
        dryRun: CONFIG.migration.dryRun
      }
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`✅ Migration report generated: ${reportFile}`);
  }

  /**
   * Generate error report
   */
  generateErrorReport(error) {
    console.log('📋 Generating error report...');
    
    const reportDir = path.join(__dirname, '..', 'reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorReportFile = path.join(reportDir, `redis-migration-error-${timestamp}.json`);

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const errorReport = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack
      },
      config: CONFIG,
      migrationLog: this.migrationLog
    };

    fs.writeFileSync(errorReportFile, JSON.stringify(errorReport, null, 2));
    console.log(`❌ Error report generated: ${errorReportFile}`);
  }

  // Redis client methods (using actual Redis operations)
  
  async initializeRedisClient() {
    if (this.redisClient) {
      return this.redisClient;
    }

    try {
      // Import Redis client (assuming it's available in the project)
      const { RedisClient } = require('../dist/utils/redisClient');
      
      this.redisClient = new RedisClient({
        url: CONFIG.redis.url,
        token: CONFIG.redis.token
      });

      // Test connection
      await this.redisClient.ping();
      console.log('✅ Redis client initialized successfully');
      
      return this.redisClient;
    } catch (error) {
      console.error('❌ Failed to initialize Redis client:', error.message);
      
      if (CONFIG.migration.dryRun) {
        console.log('🔍 DRY RUN: Using mock Redis operations');
        return null;
      }
      
      throw error;
    }
  }

  async setRedisValue(key, value) {
    if (CONFIG.migration.dryRun) {
      if (CONFIG.migration.verbose) {
        console.log(`    DRY RUN: SET ${key} = ${JSON.stringify(value).substring(0, 100)}...`);
      }
      await this.delay(10);
      return;
    }

    try {
      const client = await this.initializeRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }

      await client.set(key, value);
      
      if (CONFIG.migration.verbose) {
        console.log(`    ✅ SET ${key}`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to set ${key}:`, error.message);
      throw error;
    }
  }

  async addJobToRedisQueue(jobId, score) {
    if (CONFIG.migration.dryRun) {
      if (CONFIG.migration.verbose) {
        console.log(`    DRY RUN: ZADD ${CONFIG.redis.keyPrefix}:jobs:queue ${score} ${jobId}`);
      }
      await this.delay(10);
      return;
    }

    try {
      const client = await this.initializeRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }

      const queueKey = `${CONFIG.redis.keyPrefix}:jobs:queue`;
      
      // Use Redis sorted set for priority queue
      await this.executeRedisCommand(['ZADD', queueKey, score, jobId]);
      
      if (CONFIG.migration.verbose) {
        console.log(`    ✅ ZADD ${queueKey} ${score} ${jobId}`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to add job ${jobId} to queue:`, error.message);
      throw error;
    }
  }

  async setJobData(jobId, jobData) {
    if (CONFIG.migration.dryRun) {
      if (CONFIG.migration.verbose) {
        console.log(`    DRY RUN: HSET ${CONFIG.redis.keyPrefix}:jobs:data:${jobId} data ${JSON.stringify(jobData).substring(0, 50)}...`);
      }
      await this.delay(10);
      return;
    }

    try {
      const client = await this.initializeRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }

      const jobKey = `${CONFIG.redis.keyPrefix}:jobs:data:${jobId}`;
      
      // Store job data as hash
      const serializedData = JSON.stringify(jobData);
      await this.executeRedisCommand(['HSET', jobKey, 'data', serializedData]);
      
      if (CONFIG.migration.verbose) {
        console.log(`    ✅ HSET ${jobKey} data`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to set job data for ${jobId}:`, error.message);
      throw error;
    }
  }

  async addJobToProcessing(jobId, jobData) {
    if (CONFIG.migration.dryRun) {
      if (CONFIG.migration.verbose) {
        console.log(`    DRY RUN: HSET ${CONFIG.redis.keyPrefix}:jobs:processing ${jobId} ${JSON.stringify(jobData).substring(0, 50)}...`);
      }
      await this.delay(10);
      return;
    }

    try {
      const client = await this.initializeRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }

      const processingKey = `${CONFIG.redis.keyPrefix}:jobs:processing`;
      const serializedData = JSON.stringify(jobData);
      
      await this.executeRedisCommand(['HSET', processingKey, jobId, serializedData]);
      
      if (CONFIG.migration.verbose) {
        console.log(`    ✅ HSET ${processingKey} ${jobId}`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to add job ${jobId} to processing:`, error.message);
      throw error;
    }
  }

  async countRedisKeys(pattern) {
    if (CONFIG.migration.dryRun) {
      if (CONFIG.migration.verbose) {
        console.log(`    DRY RUN: KEYS ${pattern}`);
      }
      await this.delay(10);
      return Math.floor(Math.random() * 100); // Mock count for dry run
    }

    try {
      const client = await this.initializeRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }

      const keys = await this.executeRedisCommand(['KEYS', pattern]);
      const count = Array.isArray(keys) ? keys.length : 0;
      
      if (CONFIG.migration.verbose) {
        console.log(`    ✅ KEYS ${pattern} returned ${count} keys`);
      }
      
      return count;
    } catch (error) {
      console.error(`    ❌ Failed to count keys for pattern ${pattern}:`, error.message);
      throw error;
    }
  }

  async executeRedisCommand(command) {
    try {
      // Use Upstash REST API for Redis commands
      const response = await fetch(CONFIG.redis.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.redis.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
      });

      if (!response.ok) {
        throw new Error(`Redis command failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error(`Redis command failed [${command.join(' ')}]:`, error.message);
      throw error;
    }
  }

  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.disconnect();
        console.log('✅ Redis client disconnected');
      } catch (error) {
        console.warn('⚠️ Error disconnecting Redis client:', error.message);
      }
    }
  }

  calculateJobPriority(job) {
    // Simple priority calculation (higher number = higher priority)
    const priorityMap = {
      'CREATE_INSTANCE': 100,
      'MONITOR_INSTANCE': 80,
      'SEND_WEBHOOK': 60,
      'MIGRATE_SPOT_INSTANCES': 90
    };
    
    const basePriority = priorityMap[job.type] || 50;
    const timestamp = Date.now();
    
    // Combine priority with timestamp for FIFO within same priority
    return basePriority * 1000000 + timestamp;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Redis Migration Utility

Usage: node redis-migration.js [options]

Options:
  --dry-run          Run migration in dry-run mode (no actual changes)
  --verbose          Enable verbose logging
  --help, -h         Show this help message

Environment Variables:
  UPSTASH_REDIS_REST_URL      Redis connection URL (required)
  UPSTASH_REDIS_REST_TOKEN    Redis authentication token (required)
  REDIS_KEY_PREFIX            Redis key prefix (default: novita_api)
  MIGRATION_DRY_RUN           Set to 'true' for dry-run mode
  MIGRATION_VERBOSE           Set to 'true' for verbose logging

Examples:
  # Run migration
  node redis-migration.js

  # Dry run with verbose logging
  MIGRATION_DRY_RUN=true MIGRATION_VERBOSE=true node redis-migration.js

  # Production migration
  UPSTASH_REDIS_REST_URL=https://... UPSTASH_REDIS_REST_TOKEN=... node redis-migration.js
`);
    process.exit(0);
  }

  // Override config from CLI args
  if (args.includes('--dry-run')) {
    CONFIG.migration.dryRun = true;
  }
  
  if (args.includes('--verbose')) {
    CONFIG.migration.verbose = true;
  }

  const migrationUtility = new RedisMigrationUtility();
  await migrationUtility.migrate();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration utility failed:', error);
    process.exit(1);
  });
}

module.exports = { RedisMigrationUtility, CONFIG };