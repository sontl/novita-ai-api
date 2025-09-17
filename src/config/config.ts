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
    if (this._config) {
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

    this._config = this.validateAndTransform(process.env);
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
      hasApiKey: !!config.novita.apiKey,
      hasWebhookUrl: !!config.webhook.url,
      hasWebhookSecret: !!config.webhook.secret,
      defaults: config.defaults,
      security: config.security,
      instanceListing: config.instanceListing,
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
export const config = process.env.NODE_ENV === 'test' ? 
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
  };
}