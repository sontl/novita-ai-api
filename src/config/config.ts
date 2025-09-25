import dotenv from 'dotenv';
import Joi from 'joi';
import path from 'path';
import fs from 'fs';

/**
 * Configuration validation error class
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public details: Joi.ValidationErrorItem[]) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Configuration interface
 */
export interface Config {
  readonly nodeEnv: string;
  readonly port: number;
  readonly logLevel: string;
  readonly novita: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly internalApiKey: string;
    readonly internalBaseUrl: string;
  };
  readonly webhook: {
    readonly url?: string;
    readonly secret?: string;
  };
  readonly defaults: {
    readonly region: string;
    readonly pollInterval: number;
    readonly maxRetryAttempts: number;
    readonly requestTimeout: number;
    readonly webhookTimeout: number;
    readonly cacheTimeout: number;
    readonly maxConcurrentJobs: number;
  };
  readonly security: {
    readonly enableCors: boolean;
    readonly enableHelmet: boolean;
    readonly rateLimitWindowMs: number;
    readonly rateLimitMaxRequests: number;
  };
  readonly instanceListing: {
    readonly enableComprehensiveListing: boolean;
    readonly defaultIncludeNovitaOnly: boolean;
    readonly defaultSyncLocalState: boolean;
    readonly comprehensiveCacheTtl: number;
    readonly novitaApiCacheTtl: number;
    readonly enableFallbackToLocal: boolean;
    readonly novitaApiTimeout: number;
  };
  readonly healthCheck: {
    readonly defaultTimeoutMs: number;
    readonly defaultRetryAttempts: number;
    readonly defaultRetryDelayMs: number;
    readonly defaultMaxWaitTimeMs: number;
  };
  readonly migration: {
    readonly enabled: boolean;
    readonly scheduleIntervalMs: number;
    readonly jobTimeoutMs: number;
    readonly maxConcurrentMigrations: number;
    readonly dryRunMode: boolean;
    readonly retryFailedMigrations: boolean;
    readonly logLevel: string;
    readonly eligibilityIntervalHours: number;
  };
  readonly instanceStartup: {
    readonly defaultMaxWaitTime: number;
    readonly defaultHealthCheckConfig: {
      readonly timeoutMs: number;
      readonly retryAttempts: number;
      readonly retryDelayMs: number;
      readonly maxWaitTimeMs: number;
    };
    readonly enableNameBasedLookup: boolean;
    readonly operationTimeoutMs: number;
  };
  readonly redis: {
    readonly url: string;
    readonly token: string;
    readonly connectionTimeoutMs: number;
    readonly commandTimeoutMs: number;
    readonly retryAttempts: number;
    readonly retryDelayMs: number;
    readonly keyPrefix: string;
    readonly enableFallback: boolean;
  };
}

/**
 * Configuration loader class
 */
class ConfigLoader {
  private static instance: ConfigLoader;
  private _config: Config | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load configuration from environment variables
   */
  public loadConfig(envPath?: string): Config {
    if (this._config && process.env.FORCE_CONFIG_VALIDATION !== 'true') {
      return this._config;
    }

    // Load environment variables from file if specified
    if (envPath && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      // Try to load from default locations
      const defaultPaths = ['.env', '.env.local'];
      for (const defaultPath of defaultPaths) {
        if (fs.existsSync(defaultPath)) {
          dotenv.config({ path: defaultPath });
          break;
        }
      }
    }

    const newConfig = this.validateAndTransform(process.env);
    this._config = newConfig;
    return this._config;
  }

  /**
   * Get current configuration (throws if not loaded)
   */
  public getConfig(): Config {
    if (!this._config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this._config;
  }

  /**
   * Reset configuration (useful for testing)
   */
  public reset(): void {
    this._config = null;
    // Also reset the singleton instance for testing
    if (process.env.NODE_ENV === 'test') {
      ConfigLoader.instance = new ConfigLoader();
    }
  }

  /**
   * Validate and transform environment variables
   */
  private validateAndTransform(env: NodeJS.ProcessEnv): Config {
    const schema = this.getValidationSchema();
    
    const { error, value: envVars } = schema.validate(env, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = `Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`;
      throw new ConfigValidationError(errorMessage, error.details);
    }

    return {
      nodeEnv: envVars.NODE_ENV,
      port: envVars.PORT,
      logLevel: envVars.LOG_LEVEL,
      novita: {
        apiKey: envVars.NOVITA_API_KEY,
        baseUrl: envVars.NOVITA_API_BASE_URL,
        internalApiKey: envVars.NOVITA_INTERNAL_API_KEY,
        internalBaseUrl: envVars.NOVITA_INTERNAL_API_BASE_URL,
      },
      webhook: {
        url: envVars.WEBHOOK_URL,
        secret: envVars.WEBHOOK_SECRET,
      },
      defaults: {
        region: envVars.DEFAULT_REGION,
        pollInterval: envVars.INSTANCE_POLL_INTERVAL,
        maxRetryAttempts: envVars.MAX_RETRY_ATTEMPTS,
        requestTimeout: envVars.REQUEST_TIMEOUT,
        webhookTimeout: envVars.WEBHOOK_TIMEOUT,
        cacheTimeout: envVars.CACHE_TIMEOUT,
        maxConcurrentJobs: envVars.MAX_CONCURRENT_JOBS,
      },
      security: {
        enableCors: envVars.ENABLE_CORS,
        enableHelmet: envVars.ENABLE_HELMET,
        rateLimitWindowMs: envVars.RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
      },
      instanceListing: {
        enableComprehensiveListing: envVars.ENABLE_COMPREHENSIVE_LISTING,
        defaultIncludeNovitaOnly: envVars.DEFAULT_INCLUDE_NOVITA_ONLY,
        defaultSyncLocalState: envVars.DEFAULT_SYNC_LOCAL_STATE,
        comprehensiveCacheTtl: envVars.COMPREHENSIVE_CACHE_TTL,
        novitaApiCacheTtl: envVars.NOVITA_API_CACHE_TTL,
        enableFallbackToLocal: envVars.ENABLE_FALLBACK_TO_LOCAL,
        novitaApiTimeout: envVars.NOVITA_API_TIMEOUT,
      },
      healthCheck: {
        defaultTimeoutMs: envVars.HEALTH_CHECK_TIMEOUT_MS,
        defaultRetryAttempts: envVars.HEALTH_CHECK_RETRY_ATTEMPTS,
        defaultRetryDelayMs: envVars.HEALTH_CHECK_RETRY_DELAY_MS,
        defaultMaxWaitTimeMs: envVars.HEALTH_CHECK_MAX_WAIT_TIME_MS,
      },
      migration: {
        enabled: envVars.MIGRATION_ENABLED,
        scheduleIntervalMs: envVars.MIGRATION_INTERVAL_MINUTES * 60 * 1000,
        jobTimeoutMs: envVars.MIGRATION_JOB_TIMEOUT_MS,
        maxConcurrentMigrations: envVars.MIGRATION_MAX_CONCURRENT,
        dryRunMode: envVars.MIGRATION_DRY_RUN,
        retryFailedMigrations: envVars.MIGRATION_RETRY_FAILED,
        logLevel: envVars.MIGRATION_LOG_LEVEL,
        eligibilityIntervalHours: envVars.MIGRATION_ELIGIBILITY_INTERVAL_HOURS,
      },
      instanceStartup: {
        defaultMaxWaitTime: envVars.INSTANCE_STARTUP_MAX_WAIT_TIME,
        defaultHealthCheckConfig: {
          timeoutMs: envVars.INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS,
          retryAttempts: envVars.INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS,
          retryDelayMs: envVars.INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS,
          maxWaitTimeMs: envVars.INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS,
        },
        enableNameBasedLookup: envVars.INSTANCE_STARTUP_ENABLE_NAME_LOOKUP,
        operationTimeoutMs: envVars.INSTANCE_STARTUP_OPERATION_TIMEOUT_MS,
      },
      redis: {
        url: envVars.UPSTASH_REDIS_REST_URL,
        token: envVars.UPSTASH_REDIS_REST_TOKEN,
        connectionTimeoutMs: envVars.REDIS_CONNECTION_TIMEOUT_MS,
        commandTimeoutMs: envVars.REDIS_COMMAND_TIMEOUT_MS,
        retryAttempts: envVars.REDIS_RETRY_ATTEMPTS,
        retryDelayMs: envVars.REDIS_RETRY_DELAY_MS,
        keyPrefix: envVars.REDIS_KEY_PREFIX,
        enableFallback: envVars.REDIS_ENABLE_FALLBACK,
      },
    };
  }

  /**
   * Get Joi validation schema
   */
  private getValidationSchema(): Joi.ObjectSchema {
    return Joi.object({
      NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development')
        .description('Application environment'),
      
      PORT: Joi.number()
        .port()
        .default(3000)
        .description('Server port number'),
      
      LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug')
        .default('info')
        .description('Logging level'),
      
      // Novita.ai API Configuration
      NOVITA_API_KEY: Joi.string()
        .required()
        .min(10)
        .description('Novita.ai API key (required)'),
      
      NOVITA_API_BASE_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .default('https://api.novita.ai')
        .description('Novita.ai API base URL'),
      
      NOVITA_INTERNAL_API_KEY: Joi.string()
        .required()
        .min(10)
        .description('Novita.ai internal API key for jobs endpoint (required)'),
      
      NOVITA_INTERNAL_API_BASE_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .default('https://api-server.novita.ai')
        .description('Novita.ai internal API base URL for jobs endpoint'),
      
      // Webhook Configuration
      WEBHOOK_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .optional()
        .description('Optional webhook URL for notifications'),
      
      WEBHOOK_SECRET: Joi.string()
        .optional()
        .min(8)
        .description('Optional webhook signing secret (min 8 characters)'),
      
      // Default Settings
      DEFAULT_REGION: Joi.string()
        .default('CN-HK-01')
        .description('Default region for instance creation'),
      
      INSTANCE_POLL_INTERVAL: Joi.number()
        .integer()
        .min(10)
        .max(300)
        .default(30)
        .description('Instance status polling interval in seconds (10-300)'),
      
      MAX_RETRY_ATTEMPTS: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .default(3)
        .description('Maximum retry attempts for API calls (1-10)'),
      
      REQUEST_TIMEOUT: Joi.number()
        .integer()
        .min(5000)
        .max(120000)
        .default(30000)
        .description('HTTP request timeout in milliseconds (5000-120000)'),
      
      WEBHOOK_TIMEOUT: Joi.number()
        .integer()
        .min(1000)
        .max(30000)
        .default(10000)
        .description('Webhook request timeout in milliseconds (1000-30000)'),
      
      CACHE_TIMEOUT: Joi.number()
        .integer()
        .min(60)
        .max(3600)
        .default(300)
        .description('Cache timeout in seconds (60-3600)'),
      
      MAX_CONCURRENT_JOBS: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(10)
        .description('Maximum concurrent background jobs (1-100)'),
      
      // Security Settings
      ENABLE_CORS: Joi.boolean()
        .default(true)
        .description('Enable CORS middleware'),
      
      ENABLE_HELMET: Joi.boolean()
        .default(true)
        .description('Enable Helmet security middleware'),
      
      RATE_LIMIT_WINDOW_MS: Joi.number()
        .integer()
        .min(60000)
        .max(3600000)
        .default(900000)
        .description('Rate limit window in milliseconds (1-60 minutes)'),
      
      RATE_LIMIT_MAX_REQUESTS: Joi.number()
        .integer()
        .min(10)
        .max(1000)
        .default(100)
        .description('Maximum requests per rate limit window (10-1000)'),
      
      // Enhanced Instance Listing Configuration
      ENABLE_COMPREHENSIVE_LISTING: Joi.boolean()
        .default(true)
        .description('Enable comprehensive instance listing with Novita.ai integration'),
      
      DEFAULT_INCLUDE_NOVITA_ONLY: Joi.boolean()
        .default(true)
        .description('Default value for including Novita-only instances in comprehensive listing'),
      
      DEFAULT_SYNC_LOCAL_STATE: Joi.boolean()
        .default(false)
        .description('Default value for syncing local state with Novita.ai data'),
      
      COMPREHENSIVE_CACHE_TTL: Joi.number()
        .integer()
        .min(10)
        .max(600)
        .default(30)
        .description('Cache TTL for comprehensive instance results in seconds (10-600)'),
      
      NOVITA_API_CACHE_TTL: Joi.number()
        .integer()
        .min(30)
        .max(1800)
        .default(60)
        .description('Cache TTL for Novita.ai API responses in seconds (30-1800)'),
      
      ENABLE_FALLBACK_TO_LOCAL: Joi.boolean()
        .default(true)
        .description('Enable fallback to local data when Novita.ai API is unavailable'),
      
      NOVITA_API_TIMEOUT: Joi.number()
        .integer()
        .min(5000)
        .max(60000)
        .default(15000)
        .description('Timeout for Novita.ai API calls in milliseconds (5000-60000)'),
      
      // Health Check Configuration
      HEALTH_CHECK_TIMEOUT_MS: Joi.number()
        .integer()
        .min(1000)
        .max(60000)
        .default(10000)
        .description('Health check HTTP request timeout in milliseconds (1000-60000)'),
      
      HEALTH_CHECK_RETRY_ATTEMPTS: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .default(3)
        .description('Number of retry attempts for failed health checks (1-10)'),
      
      HEALTH_CHECK_RETRY_DELAY_MS: Joi.number()
        .integer()
        .min(500)
        .max(30000)
        .default(2000)
        .description('Delay between health check retry attempts in milliseconds (500-30000)'),
      
      HEALTH_CHECK_MAX_WAIT_TIME_MS: Joi.number()
        .integer()
        .min(30000)
        .max(1800000)
        .default(300000)
        .description('Maximum total wait time for health checks in milliseconds (30000-1800000)'),
      
      // Migration Configuration
      MIGRATION_ENABLED: Joi.boolean()
        .default(true)
        .description('Enable automatic spot instance migration'),
      
      MIGRATION_INTERVAL_MINUTES: Joi.number()
        .integer()
        .min(1)
        .max(60)
        .default(15)
        .description('Migration job schedule interval in minutes (1-60)'),
      
      MIGRATION_JOB_TIMEOUT_MS: Joi.number()
        .integer()
        .min(60000)
        .max(1800000)
        .default(600000)
        .description('Migration job timeout in milliseconds (60000-1800000)'),
      
      MIGRATION_MAX_CONCURRENT: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(5)
        .description('Maximum concurrent migration operations (1-20)'),
      
      MIGRATION_DRY_RUN: Joi.boolean()
        .default(false)
        .description('Enable dry run mode for migration (logs actions without executing)'),
      
      MIGRATION_RETRY_FAILED: Joi.boolean()
        .default(true)
        .description('Enable retry for failed migration attempts'),
      
      MIGRATION_LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug')
        .default('info')
        .description('Migration-specific log level'),
      
      MIGRATION_ELIGIBILITY_INTERVAL_HOURS: Joi.number()
        .integer()
        .min(1)
        .max(168)
        .default(4)
        .description('Hours after last migration before instance becomes eligible again (1-168)'),
      
      // Instance Startup Configuration
      INSTANCE_STARTUP_MAX_WAIT_TIME: Joi.number()
        .integer()
        .min(60000)
        .max(1800000)
        .default(600000)
        .description('Default maximum wait time for instance startup in milliseconds (60000-1800000)'),
      
      INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS: Joi.number()
        .integer()
        .min(1000)
        .max(60000)
        .default(10000)
        .description('Default health check timeout for startup operations in milliseconds (1000-60000)'),
      
      INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .default(3)
        .description('Default number of health check retry attempts during startup (1-10)'),
      
      INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS: Joi.number()
        .integer()
        .min(500)
        .max(30000)
        .default(2000)
        .description('Default delay between health check retries during startup in milliseconds (500-30000)'),
      
      INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS: Joi.number()
        .integer()
        .min(30000)
        .max(1800000)
        .default(300000)
        .description('Default maximum wait time for health checks during startup in milliseconds (30000-1800000)'),
      
      INSTANCE_STARTUP_ENABLE_NAME_LOOKUP: Joi.boolean()
        .default(true)
        .description('Enable instance lookup by name for startup operations'),
      
      INSTANCE_STARTUP_OPERATION_TIMEOUT_MS: Joi.number()
        .integer()
        .min(60000)
        .max(3600000)
        .default(900000)
        .description('Timeout for startup operations in milliseconds (60000-3600000)'),
      
      // Redis Configuration
      UPSTASH_REDIS_REST_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .required()
        .description('Upstash Redis REST URL (required)'),
      
      UPSTASH_REDIS_REST_TOKEN: Joi.string()
        .required()
        .min(10)
        .description('Upstash Redis REST token (required)'),
      
      REDIS_CONNECTION_TIMEOUT_MS: Joi.number()
        .integer()
        .min(1000)
        .max(60000)
        .default(10000)
        .description('Redis connection timeout in milliseconds (1000-60000)'),
      
      REDIS_COMMAND_TIMEOUT_MS: Joi.number()
        .integer()
        .min(1000)
        .max(30000)
        .default(5000)
        .description('Redis command timeout in milliseconds (1000-30000)'),
      
      REDIS_RETRY_ATTEMPTS: Joi.number()
        .integer()
        .min(0)
        .max(10)
        .default(3)
        .description('Number of retry attempts for Redis operations (0-10)'),
      
      REDIS_RETRY_DELAY_MS: Joi.number()
        .integer()
        .min(100)
        .max(10000)
        .default(1000)
        .description('Delay between Redis retry attempts in milliseconds (100-10000)'),
      
      REDIS_KEY_PREFIX: Joi.string()
        .pattern(/^[a-zA-Z0-9_-]+$/)
        .min(1)
        .max(50)
        .default('novita_api')
        .description('Prefix for Redis keys (1-50 characters, alphanumeric, underscore, and dash allowed)'),
      
      REDIS_ENABLE_FALLBACK: Joi.boolean()
        .default(true)
        .description('Enable fallback to in-memory storage when Redis is unavailable'),
    }).unknown(true); // Allow unknown environment variables
  }

  /**
   * Validate configuration without loading
   */
  public validateEnvironment(env: NodeJS.ProcessEnv): { isValid: boolean; errors?: string[] } {
    const schema = this.getValidationSchema();
    const { error } = schema.validate(env, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message),
      };
    }
    
    return { isValid: true };
  }

  /**
   * Get configuration summary for logging (excludes sensitive data)
   */
  public getConfigSummary(): Record<string, any> {
    const config = this.getConfig();
    return {
      nodeEnv: config.nodeEnv,
      port: config.port,
      logLevel: config.logLevel,
      novitaBaseUrl: config.novita.baseUrl,
      novitaInternalBaseUrl: config.novita.internalBaseUrl,
      hasApiKey: !!config.novita.apiKey,
      hasInternalApiKey: !!config.novita.internalApiKey,
      hasWebhookUrl: !!config.webhook.url,
      hasWebhookSecret: !!config.webhook.secret,
      defaults: config.defaults,
      security: config.security,
      instanceListing: config.instanceListing,
      healthCheck: config.healthCheck,
      migration: config.migration,
      instanceStartup: config.instanceStartup,
      redis: {
        hasUrl: !!config.redis.url,
        hasToken: !!config.redis.token,
        connectionTimeoutMs: config.redis.connectionTimeoutMs,
        commandTimeoutMs: config.redis.commandTimeoutMs,
        retryAttempts: config.redis.retryAttempts,
        retryDelayMs: config.redis.retryDelayMs,
        keyPrefix: config.redis.keyPrefix,
        enableFallback: config.redis.enableFallback,
      },
    };
  }
}

// Create singleton instance
const configLoader = ConfigLoader.getInstance();

/**
 * Load and validate configuration
 * This function implements fail-fast behavior for invalid configuration
 */
export function loadConfig(envPath?: string): Config {
  try {
    return configLoader.loadConfig(envPath);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      // Only exit process in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('❌ Configuration validation failed:');
        error.details.forEach(detail => {
          console.error(`  - ${detail.message}`);
        });
        console.error('\n💡 Please check your environment variables and .env file');
        process.exit(1);
      }
    }
    throw error;
  }
}

/**
 * Get current configuration
 */
export function getConfig(): Config {
  return configLoader.getConfig();
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configLoader.reset();
}

/**
 * Validate environment without loading
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): { isValid: boolean; errors?: string[] } {
  return configLoader.validateEnvironment(env);
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(): Record<string, any> {
  return configLoader.getConfigSummary();
}

// Load configuration immediately (fail-fast behavior) - except in test environment
export const config = process.env.NODE_ENV === 'test' && process.env.FORCE_CONFIG_VALIDATION !== 'true' ? 
  createTestConfig() : 
  loadConfig();

/**
 * Create a default test configuration
 */
function createTestConfig(): Config {
  return {
    nodeEnv: 'test',
    port: 3000,
    logLevel: 'error',
    novita: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.novita.ai',
      internalApiKey: 'test-internal-api-key',
      internalBaseUrl: 'https://api-server.novita.ai',
    },
    webhook: {},
    defaults: {
      region: 'CN-HK-01',
      pollInterval: 30,
      maxRetryAttempts: 3,
      requestTimeout: 30000,
      webhookTimeout: 10000,
      cacheTimeout: 300,
      maxConcurrentJobs: 10,
    },
    security: {
      enableCors: true,
      enableHelmet: true,
      rateLimitWindowMs: 900000,
      rateLimitMaxRequests: 100,
    },
    instanceListing: {
      enableComprehensiveListing: true,
      defaultIncludeNovitaOnly: true,
      defaultSyncLocalState: false,
      comprehensiveCacheTtl: 30,
      novitaApiCacheTtl: 60,
      enableFallbackToLocal: true,
      novitaApiTimeout: 15000,
    },
    healthCheck: {
      defaultTimeoutMs: 10000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 2000,
      defaultMaxWaitTimeMs: 300000,
    },
    migration: {
      enabled: true,
      scheduleIntervalMs: 15 * 60 * 1000, // 15 minutes
      jobTimeoutMs: 600000 * 12, // 120 minutes
      maxConcurrentMigrations: 5,
      dryRunMode: false,
      retryFailedMigrations: true,
      logLevel: 'info',
      eligibilityIntervalHours: 4,
    },
    instanceStartup: {
      defaultMaxWaitTime: 600000, // 10 minutes
      defaultHealthCheckConfig: {
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 300000,
      },
      enableNameBasedLookup: true,
      operationTimeoutMs: 900000, // 15 minutes
    },
    redis: {
      url: 'https://test-redis.upstash.io',
      token: 'test-redis-token',
      connectionTimeoutMs: 10000,
      commandTimeoutMs: 5000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      keyPrefix: 'novita_api',
      enableFallback: true,
    },
  };
}