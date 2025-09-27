import { 
  loadConfig, 
  getConfig, 
  resetConfig, 
  validateEnvironment, 
  getConfigSummary,
  ConfigValidationError,
  Config 
} from '../config';

// Helper function to create base environment with required Redis config
const createBaseEnv = (overrides: Record<string, string> = {}): Record<string, string> => ({
  NOVITA_API_KEY: 'test-api-key-123',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
  ...overrides,
});

describe('Configuration Management', () => {
  const originalEnv = process.env;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    // Reset configuration before each test
    resetConfig();
    // Start with a clean environment for each test
    process.env = { 
      NODE_ENV: 'test', 
      FORCE_CONFIG_VALIDATION: 'true'
    };
    // Mock console.error to suppress output during tests
    console.error = jest.fn();
    // Mock process.exit to prevent test termination
    process.exit = jest.fn() as any;
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('loadConfig', () => {
    it('should load valid configuration with required environment variables', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv({ NODE_ENV: 'development' }),
      };

      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.novita.apiKey).toBe('test-api-key-123');
      expect(config.nodeEnv).toBe('development');
      expect(config.port).toBe(3000);
      expect(config.logLevel).toBe('info'); // Default log level
    });

    it('should apply default values for optional configuration', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv(),
      };

      const config = loadConfig();

      expect(config.defaults.region).toBe('CN-HK-01');
      expect(config.defaults.pollInterval).toBe(30);
      expect(config.defaults.maxRetryAttempts).toBe(3);
      expect(config.defaults.requestTimeout).toBe(30000);
      expect(config.defaults.webhookTimeout).toBe(10000);
      expect(config.defaults.cacheTimeout).toBe(300);
      expect(config.defaults.maxConcurrentJobs).toBe(10);
    });

    it('should use custom values when provided', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv({
          NODE_ENV: 'production',
          PORT: '8080',
          LOG_LEVEL: 'debug',
          WEBHOOK_URL: 'https://example.com/webhook',
          WEBHOOK_SECRET: 'secret123',
          DEFAULT_REGION: 'US-WEST-01',
          INSTANCE_POLL_INTERVAL: '60',
          MAX_RETRY_ATTEMPTS: '5',
          REQUEST_TIMEOUT: '45000',
        }),
      };

      const config = loadConfig();

      expect(config.nodeEnv).toBe('production');
      expect(config.port).toBe(8080);
      expect(config.logLevel).toBe('debug');
      expect(config.webhook.url).toBe('https://example.com/webhook');
      expect(config.webhook.secret).toBe('secret123');
      expect(config.defaults.region).toBe('US-WEST-01');
      expect(config.defaults.pollInterval).toBe(60);
      expect(config.defaults.maxRetryAttempts).toBe(5);
      expect(config.defaults.requestTimeout).toBe(45000);
    });

    it('should load Redis configuration with defaults', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv(),
      };

      const config = loadConfig();

      expect(config.redis.url).toBe('https://test-redis.upstash.io');
      expect(config.redis.token).toBe('test-redis-token');
      expect(config.redis.connectionTimeoutMs).toBe(10000);
      expect(config.redis.commandTimeoutMs).toBe(5000);
      expect(config.redis.retryAttempts).toBe(3);
      expect(config.redis.retryDelayMs).toBe(1000);
      expect(config.redis.keyPrefix).toBe('novita_api');
    });

    it('should load custom Redis configuration', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv({
          UPSTASH_REDIS_REST_URL: 'https://custom-redis.upstash.io',
          UPSTASH_REDIS_REST_TOKEN: 'custom-redis-token',
          REDIS_CONNECTION_TIMEOUT_MS: '15000',
          REDIS_COMMAND_TIMEOUT_MS: '8000',
          REDIS_RETRY_ATTEMPTS: '5',
          REDIS_RETRY_DELAY_MS: '2000',
          REDIS_KEY_PREFIX: 'custom_prefix',
          REDIS_ENABLE_FALLBACK: 'false',
        }),
      };

      const config = loadConfig();

      expect(config.redis.url).toBe('https://custom-redis.upstash.io');
      expect(config.redis.token).toBe('custom-redis-token');
      expect(config.redis.connectionTimeoutMs).toBe(15000);
      expect(config.redis.commandTimeoutMs).toBe(8000);
      expect(config.redis.retryAttempts).toBe(5);
      expect(config.redis.retryDelayMs).toBe(2000);
      expect(config.redis.keyPrefix).toBe('custom_prefix');
    });

    it('should throw ConfigValidationError when required NOVITA_API_KEY is missing', () => {
      process.env = {
        NODE_ENV: 'test',
        FORCE_CONFIG_VALIDATION: 'true',
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid NODE_ENV', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        NODE_ENV: 'invalid-env',
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid PORT', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        PORT: '99999', // Invalid port
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid LOG_LEVEL', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        LOG_LEVEL: 'invalid-level',
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid WEBHOOK_URL', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        WEBHOOK_URL: 'not-a-valid-url',
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for short WEBHOOK_SECRET', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        WEBHOOK_SECRET: '123', // Too short
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for out-of-range INSTANCE_POLL_INTERVAL', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_POLL_INTERVAL: '5', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for out-of-range MAX_RETRY_ATTEMPTS', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MAX_RETRY_ATTEMPTS: '15', // Above maximum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError when Redis URL is missing', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
        // Missing UPSTASH_REDIS_REST_URL
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError when Redis token is missing', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
        // Missing UPSTASH_REDIS_REST_TOKEN
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid Redis URL', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv({
          UPSTASH_REDIS_REST_URL: 'not-a-valid-url',
        }),
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for short Redis token', () => {
      process.env = {
        ...process.env,
        ...createBaseEnv({
          UPSTASH_REDIS_REST_TOKEN: '123', // Too short
        }),
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should return the same config instance on subsequent calls', () => {
      process.env = {
        NODE_ENV: 'test',
        FORCE_CONFIG_VALIDATION: 'true',
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const config1 = loadConfig();
      // Reset to force reload
      resetConfig();
      process.env.FORCE_CONFIG_VALIDATION = 'false';
      const config2 = loadConfig();

      expect(config1).toStrictEqual(config2);
    });
  });

  describe('getConfig', () => {
    it('should return loaded configuration', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const loadedConfig = loadConfig();
      const retrievedConfig = getConfig();

      expect(retrievedConfig).toBe(loadedConfig);
    });

    it('should throw error when configuration is not loaded', () => {
      expect(() => getConfig()).toThrow('Configuration not loaded. Call loadConfig() first.');
    });
  });

  describe('validateEnvironment', () => {
    it('should return valid result for correct environment', () => {
      const env = createBaseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
      });

      const result = validateEnvironment(env);

      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return invalid result with errors for incorrect environment', () => {
      const env = {
        NODE_ENV: 'invalid-env',
        PORT: 'not-a-number',
      };

      const result = validateEnvironment(env);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should return invalid result when required NOVITA_API_KEY is missing', () => {
      const env = {
        NODE_ENV: 'development',
      };

      const result = validateEnvironment(env);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('"NOVITA_API_KEY" is required');
    });
  });

  describe('getConfigSummary', () => {
    it('should return configuration summary without sensitive data', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        WEBHOOK_URL: 'https://example.com/webhook',
        WEBHOOK_SECRET: 'secret123',
        NODE_ENV: 'development',
      };

      loadConfig();
      const summary = getConfigSummary();

      expect(summary.hasApiKey).toBe(true);
      expect(summary.hasWebhookUrl).toBe(true);
      expect(summary.hasWebhookSecret).toBe(true);
      expect(summary.nodeEnv).toBe('development');
      expect(summary.port).toBe(3000);
      expect(summary.logLevel).toBe('info'); // Default log level
      
      // Ensure sensitive data is not included
      expect(summary).not.toHaveProperty('apiKey');
      expect(summary).not.toHaveProperty('webhookSecret');
    });

    it('should indicate missing optional configuration', () => {
      process.env = {
        NODE_ENV: 'test',
        FORCE_CONFIG_VALIDATION: 'true',
        NOVITA_API_KEY: 'test-api-key-123',
      };

      loadConfig();
      const summary = getConfigSummary();

      expect(summary.hasWebhookUrl).toBe(false);
      expect(summary.hasWebhookSecret).toBe(false);
    });
  });

  describe('resetConfig', () => {
    it('should reset configuration state', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      loadConfig();
      resetConfig();

      expect(() => getConfig()).toThrow('Configuration not loaded. Call loadConfig() first.');
    });
  });

  describe('ConfigValidationError', () => {
    it('should contain validation details', () => {
      process.env = {
        NODE_ENV: 'test',
        FORCE_CONFIG_VALIDATION: 'true',
      };

      try {
        loadConfig();
        fail('Expected ConfigValidationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).details).toBeDefined();
        expect((error as ConfigValidationError).details.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Security Configuration', () => {
    it('should load security settings with defaults', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const config = loadConfig();

      expect(config.security.enableCors).toBe(true);
      expect(config.security.enableHelmet).toBe(true);
      expect(config.security.rateLimitWindowMs).toBe(900000);
      expect(config.security.rateLimitMaxRequests).toBe(100);
    });

    it('should load custom security settings', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        ENABLE_CORS: 'false',
        ENABLE_HELMET: 'false',
        RATE_LIMIT_WINDOW_MS: '300000',
        RATE_LIMIT_MAX_REQUESTS: '50',
      };

      const config = loadConfig();

      expect(config.security.enableCors).toBe(false);
      expect(config.security.enableHelmet).toBe(false);
      expect(config.security.rateLimitWindowMs).toBe(300000);
      expect(config.security.rateLimitMaxRequests).toBe(50);
    });
  });

  describe('Health Check Configuration', () => {
    it('should load health check settings with defaults', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const config = loadConfig();

      expect(config.healthCheck.defaultTimeoutMs).toBe(10000);
      expect(config.healthCheck.defaultRetryAttempts).toBe(3);
      expect(config.healthCheck.defaultRetryDelayMs).toBe(2000);
      expect(config.healthCheck.defaultMaxWaitTimeMs).toBe(300000);
    });

    it('should load custom health check settings', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        HEALTH_CHECK_TIMEOUT_MS: '15000',
        HEALTH_CHECK_RETRY_ATTEMPTS: '5',
        HEALTH_CHECK_RETRY_DELAY_MS: '3000',
        HEALTH_CHECK_MAX_WAIT_TIME_MS: '600000',
      };

      const config = loadConfig();

      expect(config.healthCheck.defaultTimeoutMs).toBe(15000);
      expect(config.healthCheck.defaultRetryAttempts).toBe(5);
      expect(config.healthCheck.defaultRetryDelayMs).toBe(3000);
      expect(config.healthCheck.defaultMaxWaitTimeMs).toBe(600000);
    });

    it('should throw ConfigValidationError for invalid health check timeout', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        HEALTH_CHECK_TIMEOUT_MS: '500', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid health check retry attempts', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        HEALTH_CHECK_RETRY_ATTEMPTS: '15', // Above maximum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid health check retry delay', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        HEALTH_CHECK_RETRY_DELAY_MS: '100', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid health check max wait time', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        HEALTH_CHECK_MAX_WAIT_TIME_MS: '10000', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Migration Configuration', () => {
    it('should load migration settings with defaults', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const config = loadConfig();

      expect(config.migration.enabled).toBe(true);
      expect(config.migration.scheduleIntervalMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.migration.jobTimeoutMs).toBe(600000); // 10 minutes
      expect(config.migration.maxConcurrentMigrations).toBe(5);
      expect(config.migration.dryRunMode).toBe(false);
      expect(config.migration.retryFailedMigrations).toBe(true);
      expect(config.migration.logLevel).toBe('info');
    });

    it('should load custom migration settings', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MIGRATION_ENABLED: 'false',
        MIGRATION_INTERVAL_MINUTES: '30',
        MIGRATION_JOB_TIMEOUT_MS: '1200000',
        MIGRATION_MAX_CONCURRENT: '10',
        MIGRATION_DRY_RUN: 'true',
        MIGRATION_RETRY_FAILED: 'false',
        MIGRATION_LOG_LEVEL: 'debug',
      };

      const config = loadConfig();

      expect(config.migration.enabled).toBe(false);
      expect(config.migration.scheduleIntervalMs).toBe(30 * 60 * 1000); // 30 minutes
      expect(config.migration.jobTimeoutMs).toBe(1200000); // 20 minutes
      expect(config.migration.maxConcurrentMigrations).toBe(10);
      expect(config.migration.dryRunMode).toBe(true);
      expect(config.migration.retryFailedMigrations).toBe(false);
      expect(config.migration.logLevel).toBe('debug');
    });

    it('should throw ConfigValidationError for invalid migration interval', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MIGRATION_INTERVAL_MINUTES: '0', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid migration timeout', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MIGRATION_JOB_TIMEOUT_MS: '30000', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid max concurrent migrations', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MIGRATION_MAX_CONCURRENT: '25', // Above maximum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid migration log level', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        MIGRATION_LOG_LEVEL: 'invalid-level',
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Instance Startup Configuration', () => {
    it('should load instance startup settings with defaults', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
      };

      const config = loadConfig();

      expect(config.instanceStartup.defaultMaxWaitTime).toBe(600000); // 10 minutes
      expect(config.instanceStartup.defaultHealthCheckConfig.timeoutMs).toBe(10000);
      expect(config.instanceStartup.defaultHealthCheckConfig.retryAttempts).toBe(3);
      expect(config.instanceStartup.defaultHealthCheckConfig.retryDelayMs).toBe(2000);
      expect(config.instanceStartup.defaultHealthCheckConfig.maxWaitTimeMs).toBe(300000);
      expect(config.instanceStartup.enableNameBasedLookup).toBe(true);
      expect(config.instanceStartup.operationTimeoutMs).toBe(900000); // 15 minutes
    });

    it('should load custom instance startup settings', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_STARTUP_MAX_WAIT_TIME: '1200000',
        INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS: '15000',
        INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS: '5',
        INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS: '3000',
        INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS: '600000',
        INSTANCE_STARTUP_ENABLE_NAME_LOOKUP: 'false',
        INSTANCE_STARTUP_OPERATION_TIMEOUT_MS: '1800000',
      };

      const config = loadConfig();

      expect(config.instanceStartup.defaultMaxWaitTime).toBe(1200000);
      expect(config.instanceStartup.defaultHealthCheckConfig.timeoutMs).toBe(15000);
      expect(config.instanceStartup.defaultHealthCheckConfig.retryAttempts).toBe(5);
      expect(config.instanceStartup.defaultHealthCheckConfig.retryDelayMs).toBe(3000);
      expect(config.instanceStartup.defaultHealthCheckConfig.maxWaitTimeMs).toBe(600000);
      expect(config.instanceStartup.enableNameBasedLookup).toBe(false);
      expect(config.instanceStartup.operationTimeoutMs).toBe(1800000);
    });

    it('should throw ConfigValidationError for invalid startup max wait time', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_STARTUP_MAX_WAIT_TIME: '30000', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid startup health check timeout', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS: '500', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid startup health check retry attempts', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS: '15', // Above maximum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid startup operation timeout', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        INSTANCE_STARTUP_OPERATION_TIMEOUT_MS: '30000', // Below minimum
      };

      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle string boolean values correctly', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        ENABLE_CORS: 'true',
        ENABLE_HELMET: 'false',
      };

      const config = loadConfig();

      expect(config.security.enableCors).toBe(true);
      expect(config.security.enableHelmet).toBe(false);
    });

    it('should handle numeric string values correctly', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        PORT: '8080',
        INSTANCE_POLL_INTERVAL: '45',
      };

      const config = loadConfig();

      expect(config.port).toBe(8080);
      expect(config.defaults.pollInterval).toBe(45);
    });

    it('should allow unknown environment variables', () => {
      process.env = {
        ...process.env,
        NOVITA_API_KEY: 'test-api-key-123',
        UNKNOWN_VARIABLE: 'some-value',
        NODE_ENV: 'development',
      };

      expect(() => loadConfig()).not.toThrow();
      const config = loadConfig();
      expect(config.novita.apiKey).toBe('test-api-key-123');
    });
  });
});