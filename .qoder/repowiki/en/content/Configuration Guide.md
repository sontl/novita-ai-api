# Configuration Guide

<cite>
**Referenced Files in This Document**   
- [config.ts](file://src/config/config.ts) - *Updated in recent commit*
- [docker-compose.yml](file://docker-compose.yml)
- [docker-compose.override.yml](file://docker-compose.override.yml)
- [docker-compose.prod.yml](file://docker-compose.prod.yml)
- [README.md](file://src/config/README.md)
- [templateService.ts](file://src/services/templateService.ts) - *Updated in commit e324432*
- [registryAuthExample.ts](file://src/examples/registryAuthExample.ts) - *Added in commit 90d221d*
- [templateServiceExample.ts](file://src/examples/templateServiceExample.ts) - *Updated in commit e324432*
- [.env.example](file://.env.example) - *Updated in recent commit*
</cite>

## Update Summary
**Changes Made**   
- Added new section on instance startup configuration with timeout and health check settings
- Added new section on automated migration system configuration
- Updated environment variables reference table to include new migration and instance startup parameters
- Updated configuration hierarchy section to reflect new configuration sections
- Added new configuration injection examples for migration and instance startup services
- Updated startup validation section to include new validation rules
- Added troubleshooting guidance for new configuration parameters
- Updated section sources to reflect modified and new files

## Table of Contents
1. [Configuration System Overview](#configuration-system-overview)
2. [Configuration-as-Code with TypeScript and Joi](#configuration-as-code-with-typescript-and-joi)
3. [Environment Variables Reference](#environment-variables-reference)
4. [Configuration Hierarchy and Merging Strategy](#configuration-hierarchy-and-merging-strategy)
5. [Configuration Injection into Services and Middleware](#configuration-injection-into-services-and-middleware)
6. [Environment-Specific Configuration with Docker Compose](#environment-specific-configuration-with-docker-compose)
7. [Startup Validation and Failure Modes](#startup-validation-and-failure-modes)
8. [Extending the Configuration System](#extending-the-configuration-system)
9. [Troubleshooting Common Configuration Issues](#troubleshooting-common-configuration-issues)
10. [Registry Authentication Configuration](#registry-authentication-configuration)
11. [Instance Startup Configuration](#instance-startup-configuration)
12. [Migration System Configuration](#migration-system-configuration)

## Configuration System Overview

The Novitai application implements a robust configuration management system designed for reliability, security, and ease of use across different deployment environments. The system follows a configuration-as-code approach using TypeScript with Joi validation to ensure runtime safety and type correctness. Configuration values are loaded from environment variables with support for `.env` files, validated against a strict schema, and made available throughout the application via a singleton pattern.

The configuration system enforces fail-fast behavior, meaning the application will terminate immediately if invalid configuration is detected during startup. This prevents running with potentially dangerous or incorrect settings. Sensitive data such as API keys and secrets are handled securely and excluded from logging outputs to prevent accidental exposure.

**Section sources**
- [config.ts](file://src/config/config.ts#L0-L61)
- [README.md](file://src/config/README.md#L0-L52)

## Configuration-as-Code with TypeScript and Joi

The Novitai configuration system leverages TypeScript's type system combined with Joi validation to provide compile-time type safety and runtime validation. The core configuration is defined by the `Config` interface, which specifies the exact structure and types of all configuration values. This interface ensures that any code accessing configuration properties benefits from TypeScript's IntelliSense and compile-time type checking.

Joi validation is implemented through the `getValidationSchema()` method, which defines a comprehensive schema for all environment variables. Each variable has specific validation rules including required/optional status, data types, value ranges, and default values. For example, the `NOVITA_API_KEY` is required and must be at least 10 characters long, while the `PORT` must be a valid port number between 1 and 65535.

The validation process occurs in the `validateAndTransform()` method, which uses Joi's validation with `abortEarly: false` to collect all validation errors rather than stopping at the first one. This provides comprehensive feedback when configuration issues exist. The `stripUnknown: true` option removes any environment variables not defined in the schema, preventing accidental use of undefined configuration options.

```mermaid
flowchart TD
A["Load Environment Variables"] --> B["Apply Validation Schema"]
B --> C{"Validation Successful?"}
C --> |Yes| D["Transform to Config Object"]
C --> |No| E["Collect All Errors"]
E --> F["Format Error Messages"]
F --> G["Exit Process (non-test)"]
D --> H["Expose via Singleton"]
```

**Diagram sources**
- [config.ts](file://src/config/config.ts#L152-L303)

**Section sources**
- [config.ts](file://src/config/config.ts#L0-L390)
- [README.md](file://src/config/README.md#L0-L349)

## Environment Variables Reference

The following table provides a complete reference of all configurable parameters in the Novitai application, including their default values, allowed formats, and security considerations.

| Parameter | Environment Variable | Default Value | Required | Allowed Values/Format | Security Considerations |
|---------|---------------------|--------------|----------|----------------------|------------------------|
| Application Environment | `NODE_ENV` | `development` | No | `development`, `production`, `test` | Not sensitive, can be logged |
| Server Port | `PORT` | `3000` | No | Integer 1-65535 | Not sensitive, can be logged |
| Logging Level | `LOG_LEVEL` | `info` | No | `error`, `warn`, `info`, `debug` | Not sensitive, can be logged |
| Novita API Key | `NOVITA_API_KEY` | None | Yes | String, minimum 10 characters | **Sensitive** - Never log, mask in outputs |
| API Base URL | `NOVITA_API_BASE_URL` | `https://api.novita.ai` | No | Valid HTTP/HTTPS URL | Not sensitive, can be logged |
| Webhook URL | `WEBHOOK_URL` | None | No | Valid HTTP/HTTPS URL | Not sensitive, can be logged |
| Webhook Secret | `WEBHOOK_SECRET` | None | No | String, minimum 8 characters | **Sensitive** - Never log, mask in outputs |
| Default Region | `DEFAULT_REGION` | `CN-HK-01` | No | Any string | Not sensitive, can be logged |
| Poll Interval | `INSTANCE_POLL_INTERVAL` | `30` | No | Integer 10-300 seconds | Not sensitive, can be logged |
| Max Retry Attempts | `MAX_RETRY_ATTEMPTS` | `3` | No | Integer 1-10 | Not sensitive, can be logged |
| Request Timeout | `REQUEST_TIMEOUT` | `30000` | No | Integer 5000-120000 ms | Not sensitive, can be logged |
| Webhook Timeout | `WEBHOOK_TIMEOUT` | `10000` | No | Integer 1000-30000 ms | Not sensitive, can be logged |
| Cache Timeout | `CACHE_TIMEOUT` | `300` | No | Integer 60-3600 seconds | Not sensitive, can be logged |
| Max Concurrent Jobs | `MAX_CONCURRENT_JOBS` | `10` | No | Integer 1-100 | Not sensitive, can be logged |
| Enable CORS | `ENABLE_CORS` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Enable Helmet | `ENABLE_HELMET` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Rate Limit Window | `RATE_LIMIT_WINDOW_MS` | `900000` | No | Integer 60000-3600000 ms | Not sensitive, can be logged |
| Rate Limit Max Requests | `RATE_LIMIT_MAX_REQUESTS` | `100` | No | Integer 10-1000 | Not sensitive, can be logged |
| Comprehensive Listing | `ENABLE_COMPREHENSIVE_LISTING` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Default Include Novita Only | `DEFAULT_INCLUDE_NOVITA_ONLY` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Default Sync Local State | `DEFAULT_SYNC_LOCAL_STATE` | `false` | No | `true`, `false` | Not sensitive, can be logged |
| Comprehensive Cache TTL | `COMPREHENSIVE_CACHE_TTL` | `30` | No | Integer 10-600 seconds | Not sensitive, can be logged |
| Novita API Cache TTL | `NOVITA_API_CACHE_TTL` | `60` | No | Integer 30-1800 seconds | Not sensitive, can be logged |
| Enable Fallback to Local | `ENABLE_FALLBACK_TO_LOCAL` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Novita API Timeout | `NOVITA_API_TIMEOUT` | `15000` | No | Integer 5000-60000 ms | Not sensitive, can be logged |
| Health Check Timeout | `HEALTH_CHECK_TIMEOUT_MS` | `10000` | No | Integer 1000-60000 ms | Not sensitive, can be logged |
| Health Check Retry Attempts | `HEALTH_CHECK_RETRY_ATTEMPTS` | `3` | No | Integer 1-10 | Not sensitive, can be logged |
| Health Check Retry Delay | `HEALTH_CHECK_RETRY_DELAY_MS` | `2000` | No | Integer 500-30000 ms | Not sensitive, can be logged |
| Health Check Max Wait Time | `HEALTH_CHECK_MAX_WAIT_TIME_MS` | `300000` | No | Integer 30000-1800000 ms | Not sensitive, can be logged |
| Migration Enabled | `MIGRATION_ENABLED` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Migration Interval Minutes | `MIGRATION_INTERVAL_MINUTES` | `15` | No | Integer 1-60 minutes | Not sensitive, can be logged |
| Migration Job Timeout | `MIGRATION_JOB_TIMEOUT_MS` | `600000` | No | Integer 60000-1800000 ms | Not sensitive, can be logged |
| Migration Max Concurrent | `MIGRATION_MAX_CONCURRENT` | `5` | No | Integer 1-20 | Not sensitive, can be logged |
| Migration Dry Run | `MIGRATION_DRY_RUN` | `false` | No | `true`, `false` | Not sensitive, can be logged |
| Migration Retry Failed | `MIGRATION_RETRY_FAILED` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Migration Log Level | `MIGRATION_LOG_LEVEL` | `info` | No | `error`, `warn`, `info`, `debug` | Not sensitive, can be logged |
| Instance Startup Max Wait Time | `INSTANCE_STARTUP_MAX_WAIT_TIME` | `600000` | No | Integer 60000-1800000 ms | Not sensitive, can be logged |
| Instance Startup Health Check Timeout | `INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS` | `10000` | No | Integer 1000-60000 ms | Not sensitive, can be logged |
| Instance Startup Health Check Retry Attempts | `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS` | `3` | No | Integer 1-10 | Not sensitive, can be logged |
| Instance Startup Health Check Retry Delay | `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS` | `2000` | No | Integer 500-30000 ms | Not sensitive, can be logged |
| Instance Startup Health Check Max Wait Time | `INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS` | `300000` | No | Integer 30000-1800000 ms | Not sensitive, can be logged |
| Instance Startup Enable Name Lookup | `INSTANCE_STARTUP_ENABLE_NAME_LOOKUP` | `true` | No | `true`, `false` | Not sensitive, can be logged |
| Instance Startup Operation Timeout | `INSTANCE_STARTUP_OPERATION_TIMEOUT_MS` | `900000` | No | Integer 60000-3600000 ms | Not sensitive, can be logged |

**Section sources**
- [config.ts](file://src/config/config.ts#L152-L303)
- [.env.example](file://.env.example#L0-L50)
- [README.md](file://src/config/README.md#L54-L349)

## Configuration Hierarchy and Merging Strategy

The Novitai configuration system implements a hierarchical approach to configuration loading with a well-defined merging strategy across different environments. The system follows the principle of "specific overrides general," where more specific configuration sources take precedence over more general ones.

Configuration loading follows this priority order:
1. Process environment variables (highest priority)
2. Environment-specific `.env` file (e.g., `.env.production`)
3. Default `.env.local` file
4. Base `.env` file
5. Schema-defined default values (lowest priority)

The `ConfigLoader` class implements this hierarchy in the `loadConfig()` method, which first attempts to load from a specified path, then falls back to default locations (`.env` and `.env.local`). When multiple `.env` files are present, they are not merged automatically—only the first found file is loaded, preventing unexpected configuration interactions.

Environment-specific behavior is controlled primarily through the `NODE_ENV` variable, which influences both the default values applied and the application's runtime behavior. For example, in `production` mode, the application uses stricter resource limits and more conservative logging, while `development` mode enables debug logging and more permissive settings.

The configuration system also supports Docker environment variable substitution, as seen in the `docker-compose.yml` file where variables like `${PORT:-3000}` provide default values if the environment variable is not set. This allows for flexible deployment configurations while maintaining sensible defaults.

**Section sources**
- [config.ts](file://src/config/config.ts#L63-L115)
- [docker-compose.yml](file://docker-compose.yml#L0-L103)
- [docker-compose.override.yml](file://docker-compose.override.yml#L0-L30)

## Configuration Injection into Services and Middleware

Configuration values are injected into services and middleware through the singleton `config` object that is automatically loaded when the module is imported. This approach ensures consistent configuration access throughout the application without requiring dependency injection containers or service locators.

Services access configuration through the `getConfig()` function or the exported `config` constant. For example, the Novita client would use `config.novita.apiKey` to authenticate API requests, while the instance service would use `config.defaults.pollInterval` to determine how frequently to check instance status.

Middleware components leverage configuration to control their behavior. The security middleware uses `config.security.enableCors` and `config.security.enableHelmet` to determine whether to apply CORS and Helmet protections. The rate limiting middleware uses `config.security.rateLimitWindowMs` and `config.security.rateLimitMaxRequests` to configure its throttling parameters.

The configuration system also provides a `getConfigSummary()` function that returns a sanitized version of the configuration for logging purposes. This summary excludes sensitive data like API keys and secrets while including indicators of their presence, allowing operators to verify configuration without risking security.

```mermaid
classDiagram
class Config {
+string nodeEnv
+number port
+string logLevel
+NovitaConfig novita
+WebhookConfig webhook
+DefaultsConfig defaults
+SecurityConfig security
+InstanceListingConfig instanceListing
+HealthCheckConfig healthCheck
+MigrationConfig migration
+InstanceStartupConfig instanceStartup
}
class NovitaConfig {
+string apiKey
+string baseUrl
}
class WebhookConfig {
+string? url
+string? secret
}
class DefaultsConfig {
+string region
+number pollInterval
+number maxRetryAttempts
+number requestTimeout
+number webhookTimeout
+number cacheTimeout
+number maxConcurrentJobs
}
class SecurityConfig {
+boolean enableCors
+boolean enableHelmet
+number rateLimitWindowMs
+number rateLimitMaxRequests
}
class InstanceListingConfig {
+boolean enableComprehensiveListing
+boolean defaultIncludeNovitaOnly
+boolean defaultSyncLocalState
+number comprehensiveCacheTtl
+number novitaApiCacheTtl
+boolean enableFallbackToLocal
+number novitaApiTimeout
}
class HealthCheckConfig {
+number defaultTimeoutMs
+number defaultRetryAttempts
+number defaultRetryDelayMs
+number defaultMaxWaitTimeMs
}
class MigrationConfig {
+boolean enabled
+number scheduleIntervalMs
+number jobTimeoutMs
+number maxConcurrentMigrations
+boolean dryRunMode
+boolean retryFailedMigrations
+string logLevel
}
class InstanceStartupConfig {
+number defaultMaxWaitTime
+InstanceStartupHealthCheckConfig defaultHealthCheckConfig
+boolean enableNameBasedLookup
+number operationTimeoutMs
}
class InstanceStartupHealthCheckConfig {
+number timeoutMs
+number retryAttempts
+number retryDelayMs
+number maxWaitTimeMs
}
class ApiService {
-config : Config
+makeRequest()
}
class SecurityMiddleware {
-config : Config
+applySecurityHeaders()
+configureRateLimiting()
}
Config <|-- ApiService : "uses"
Config <|-- SecurityMiddleware : "uses"
```

**Diagram sources**
- [config.ts](file://src/config/config.ts#L0-L61)
- [config.ts](file://src/config/config.ts#L117-L150)

**Section sources**
- [config.ts](file://src/config/config.ts#L302-L354)
- [README.md](file://src/config/README.md#L0-L349)

## Environment-Specific Configuration with Docker Compose

The Novitai application uses Docker Compose with override files to manage environment-specific configurations. This approach allows for consistent deployment patterns while accommodating the different requirements of development, staging, and production environments.

The base `docker-compose.yml` file contains the common configuration shared across all environments, including the required `NOVITA_API_KEY` and default values for optional settings. This file also defines the container's resource limits, health checks, and security settings.

The `docker-compose.override.yml` file provides development-specific overrides, such as:
- Setting `NODE_ENV=development` and `LOG_LEVEL=debug`
- Disabling read-only filesystem and security restrictions for easier debugging
- Using local volume mounts for logs
- More generous resource limits for development workstations
- Faster restart policies for development iteration

The `docker-compose.prod.yml` file contains production-specific configurations:
- Using pre-built images with version tags
- Stricter resource limits to optimize costs
- More aggressive health checks with shorter intervals
- Production-grade logging configuration
- Deployment strategies with rollback capabilities
- Named volumes mounted to system log directories

This three-file pattern (base + override + prod) enables developers to work locally with minimal setup while ensuring production deployments follow strict security and performance standards. The override mechanism ensures that production settings take precedence over development defaults when deploying with the `-f docker-compose.yml -f docker-compose.prod.yml` flags.

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L0-L103)
- [docker-compose.override.yml](file://docker-compose.override.yml#L0-L30)
- [docker-compose.prod.yml](file://docker-compose.prod.yml#L0-L66)

## Startup Validation and Failure Modes

The Novitai configuration system implements a fail-fast validation strategy that prevents the application from starting with invalid configuration. During startup, the `loadConfig()` function validates all environment variables against the Joi schema and immediately terminates the process if validation fails—except in test environments where errors are thrown for test handling.

When validation fails, the system provides detailed error messages that list all validation issues, making it easy to identify and fix configuration problems. The error output includes:
- A clear "Configuration validation failed" header with a visual indicator (❌)
- Individual error messages for each invalid or missing field
- Helpful guidance on how to resolve the issues
- Process termination with exit code 1 to prevent deployment of misconfigured instances

The validation process checks multiple aspects of configuration:
- **Required fields**: Ensures mandatory variables like `NOVITA_API_KEY` are present
- **Data types**: Validates that values match expected types (numbers, booleans, etc.)
- **Value ranges**: Enforces minimum and maximum values for numeric settings
- **Format requirements**: Validates URL formats, string lengths, and other constraints
- **Enum values**: Ensures variables use only allowed values (e.g., `LOG_LEVEL`)

In test environments, the system allows invalid configurations to facilitate testing of error conditions, but in development and production, the fail-fast approach ensures configuration reliability.

```mermaid
sequenceDiagram
participant App as Application
participant Config as ConfigLoader
participant Joi as Joi Validator
participant Console as Console
participant Process as Process
App->>Config : loadConfig()
Config->>Config : Load .env files
Config->>Joi : validate(process.env)
Joi-->>Config : Return validation result
alt Validation Failed
Config->>Console : Log error details
Console->>Console : Display help message
Console->>Process : process.exit(1)
else Validation Successful
Config->>Config : Transform to Config object
Config-->>App : Return config
end
```

**Diagram sources**
- [config.ts](file://src/config/config.ts#L302-L354)
- [config.ts](file://src/config/config.ts#L117-L150)

**Section sources**
- [config.ts](file://src/config/config.ts#L302-L354)
- [README.md](file://src/config/README.md#L0-L349)

## Extending the Configuration System

To extend the Novitai configuration system with custom parameters, follow the established pattern in `config.ts`. First, add the new parameter to the `Config` interface with appropriate typing:

```typescript
export interface Config {
  // existing properties...
  readonly custom: {
    readonly featureFlag: boolean;
    readonly timeout: number;
  };
}
```

Next, add the corresponding environment variable to the Joi validation schema in `getValidationSchema()`:

```typescript
CUSTOM_FEATURE_FLAG: Joi.boolean()
  .default(false)
  .description('Enable custom feature'),
  
CUSTOM_TIMEOUT: Joi.number()
  .integer()
  .min(1000)
  .max(60000)
  .default(5000)
  .description('Custom operation timeout in milliseconds'),
```

Finally, map the environment variable to the configuration object in `validateAndTransform()`:

```typescript
return {
  // existing mappings...
  custom: {
    featureFlag: envVars.CUSTOM_FEATURE_FLAG,
    timeout: envVars.CUSTOM_TIMEOUT,
  },
};
```

When adding new parameters, consider the following best practices:
- Use consistent naming conventions (UPPER_CASE with underscores)
- Provide sensible default values that are safe for production
- Implement appropriate validation rules based on the parameter type
- Document the parameter in the README and configuration tables
- Consider security implications—mark sensitive data as optional and validate appropriately
- Test the new configuration in all environments (development, test, production)

The system's modular design makes it easy to extend while maintaining the integrity of the validation and type safety features.

**Section sources**
- [config.ts](file://src/config/config.ts#L0-L390)
- [README.md](file://src/config/README.md#L0-L349)

## Troubleshooting Common Configuration Issues

When encountering configuration issues with the Novitai application, follow this systematic troubleshooting approach:

### Missing Required Variables
**Symptom**: Application fails to start with "is required" error
**Solution**: Ensure all required variables (especially `NOVITA_API_KEY`) are set in your environment or `.env` file. Use the required variables table as a checklist.

### Type Mismatches
**Symptom**: Validation errors indicating "must be a number" or similar type issues
**Solution**: Verify that numeric variables are not quoted in your `.env` file. Environment variables are strings by default, but the validation system expects unquoted numbers for numeric fields.

### Environment Conflicts
**Symptom**: Application behaves differently than expected despite correct configuration
**Solution**: Check for environment variable conflicts. Use `console.log(process.env)` temporarily to verify which values are actually being loaded. Remember that process environment variables take precedence over `.env` files.

### Docker-Specific Issues
**Symptom**: Configuration works locally but fails in Docker
**Solution**: Ensure environment variables are properly exposed in your Docker Compose files. Check that variable names match exactly (case-sensitive). Verify that required variables marked with `:?` in Docker Compose are actually provided.

### Debugging Steps
1. Enable debug logging with `LOG_LEVEL=debug`
2. Use `validateEnvironment()` to check configuration before loading
3. Examine the configuration summary output at startup
4. Verify `.env` file loading by checking file paths and permissions
5. Test with minimal configuration to isolate issues

The configuration system's comprehensive error messages and validation feedback make most issues straightforward to diagnose and resolve.

**Section sources**
- [config.ts](file://src/config/config.ts#L302-L354)
- [README.md](file://src/config/README.md#L0-L349)

## Registry Authentication Configuration

The Novitai application now supports registry authentication for private Docker images through a secure credential management system. This feature allows users to create instances from private repositories without exposing credentials in templates or configuration files.

### Configuration Workflow

The registry authentication system follows a four-step workflow:

1. **Template Configuration**: Templates specify a registry authentication ID in the `imageAuth` field instead of storing credentials directly.
2. **Credential Resolution**: The system fetches all available registry credentials from the Novita.ai API endpoint `/v1/repository/auths`.
3. **Authentication Mapping**: The system matches the template's `imageAuth` ID with the corresponding credentials from the API response.
4. **Instance Creation**: The resolved credentials are formatted as `username:password` and included in the instance creation request.

### Environment Variable Configuration

No additional environment variables are required for registry authentication, as credentials are managed through the Novita.ai API. However, the following configuration parameters affect the authentication process:

- `NOVITA_API_KEY`: Required for accessing the registry authentication API
- `REQUEST_TIMEOUT`: Controls the timeout for fetching registry credentials (default: 30000ms)
- `LOG_LEVEL`: Set to `debug` to see detailed authentication workflow logs

### Code Implementation

The `TemplateService` validates that environment variables use the `key` property instead of `name`:

```typescript
if (!env.key || typeof env.key !== 'string' || env.key.trim() === '') {
  throw new NovitaApiClientError(
    `Template env at index ${index} has invalid name`,
    500,
    'INVALID_TEMPLATE_ENV_NAME'
  );
}
```

The `NovitaApiService` handles credential fetching:

```typescript
async getRegistryAuth(authId: string): Promise<{ username: string; password: string }> {
  const response = await novitaClient.get<RegistryAuthsResponse>('/v1/repository/auths');
  
  const authEntry = response.data.data.find(auth => auth.id === authId);
  
  if (!authEntry) {
    throw new NovitaApiClientError(
      `Registry authentication not found for ID: ${authId}`,
      404,
      'REGISTRY_AUTH_NOT_FOUND'
    );
  }
  
  return {
    username: authEntry.username,
    password: authEntry.password
  };
}
```

### Security Considerations

- Credentials are never stored in templates or configuration files
- Authentication IDs are used as references to securely stored credentials
- Passwords are masked in all logs and outputs
- The system uses HTTPS for all credential-related API calls
- Failed authentication attempts are logged without revealing credential details

### Example Usage

```typescript
// Template with registry authentication
const templateWithAuth = {
  id: 'custom-template',
  name: 'Private PyTorch Environment',
  imageUrl: 'registry.company.com/ai/pytorch:latest',
  imageAuth: 'registry_auth_123', // References stored credentials
  envs: [
    { key: 'JUPYTER_TOKEN', value: 'secure_token' } // Using 'key' instead of 'name'
  ]
};
```

**Section sources**
- [templateService.ts](file://src/services/templateService.ts#L183-L188)
- [novitaApiService.ts](file://src/services/novitaApiService.ts#L178-L222)
- [registryAuthExample.ts](file://src/examples/registryAuthExample.ts#L0-L97)
- [templateServiceExample.ts](file://src/examples/templateServiceExample.ts#L34)
- [api.ts](file://src/types/api.ts#L267-L344)

## Instance Startup Configuration

The Novitai application now supports configurable instance startup operations with timeout and health check settings. This feature enables users to customize the behavior of instance startup operations, including maximum wait times, health check configurations, and operation timeouts.

### Configuration Parameters

The instance startup configuration is controlled by the following environment variables:

- `INSTANCE_STARTUP_MAX_WAIT_TIME`: Default maximum wait time for instance startup operations (default: 600000ms/10 minutes)
- `INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS`: Default health check timeout during startup (default: 10000ms/10 seconds)
- `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS`: Default number of health check retry attempts during startup (default: 3)
- `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS`: Default delay between health check retries during startup (default: 2000ms/2 seconds)
- `INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS`: Default maximum wait time for health checks during startup (default: 300000ms/5 minutes)
- `INSTANCE_STARTUP_ENABLE_NAME_LOOKUP`: Enable instance lookup by name for startup operations (default: true)
- `INSTANCE_STARTUP_OPERATION_TIMEOUT_MS`: Timeout for startup operations (default: 900000ms/15 minutes)

### Usage in Services

The instance startup configuration is used by the `InstanceService` to manage startup operations. The service uses these configuration values to determine how long to wait for instances to start, how frequently to check their health, and when to consider a startup operation failed.

```typescript
// Example of configuration usage in InstanceService
const startupConfig = config.instanceStartup;
const operationTimeout = startupConfig.operationTimeoutMs;
const maxWaitTime = startupConfig.defaultMaxWaitTime;
const healthCheckConfig = startupConfig.defaultHealthCheckConfig;
```

### Validation Rules

The configuration system validates instance startup parameters with the following rules:
- `INSTANCE_STARTUP_MAX_WAIT_TIME`: Integer 60000-1800000ms (1-30 minutes)
- `INSTANCE_STARTUP_HEALTH_CHECK_TIMEOUT_MS`: Integer 1000-60000ms (1-60 seconds)
- `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_ATTEMPTS`: Integer 1-10
- `INSTANCE_STARTUP_HEALTH_CHECK_RETRY_DELAY_MS`: Integer 500-30000ms (0.5-30 seconds)
- `INSTANCE_STARTUP_HEALTH_CHECK_MAX_WAIT_TIME_MS`: Integer 30000-1800000ms (30 seconds-30 minutes)
- `INSTANCE_STARTUP_ENABLE_NAME_LOOKUP`: Boolean
- `INSTANCE_STARTUP_OPERATION_TIMEOUT_MS`: Integer 60000-3600000ms (1-60 minutes)

**Section sources**
- [config.ts](file://src/config/config.ts#L466-L492)
- [instanceService.ts](file://src/services/instanceService.ts#L975-L1084)
- [.env.example](file://.env.example#L40-L48)

## Migration System Configuration

The Novitai application now includes an automated spot instance migration system with configurable settings. This feature enables automatic migration of spot instances when they are about to be reclaimed, ensuring service continuity.

### Configuration Parameters

The migration system is configured through the following environment variables:

- `MIGRATION_ENABLED`: Enable automatic spot instance migration (default: true)
- `MIGRATION_INTERVAL_MINUTES`: Migration job schedule interval in minutes (default: 15)
- `MIGRATION_JOB_TIMEOUT_MS`: Migration job timeout in milliseconds (default: 600000ms/10 minutes)
- `MIGRATION_MAX_CONCURRENT`: Maximum concurrent migration operations (default: 5)
- `MIGRATION_DRY_RUN`: Enable dry run mode for migration (logs actions without executing) (default: false)
- `MIGRATION_RETRY_FAILED`: Enable retry for failed migration attempts (default: true)
- `MIGRATION_LOG_LEVEL`: Migration-specific log level (default: info)

### Usage in Services

The migration configuration is used by the `MigrationScheduler` and `InstanceMigrationService` to control the behavior of the automated migration system. The configuration values determine how frequently migration checks are performed, how many migrations can run concurrently, and how long migration jobs can run before timing out.

```typescript
// Example of configuration usage in MigrationScheduler
const migrationConfig = config.migration;
const isEnabled = migrationConfig.enabled;
const scheduleIntervalMs = migrationConfig.scheduleIntervalMs;
const maxConcurrent = migrationConfig.maxConcurrentMigrations;
```

### Validation Rules

The configuration system validates migration parameters with the following rules:
- `MIGRATION_ENABLED`: Boolean
- `MIGRATION_INTERVAL_MINUTES`: Integer 1-60 minutes
- `MIGRATION_JOB_TIMEOUT_MS`: Integer 60000-1800000ms (1-30 minutes)
- `MIGRATION_MAX_CONCURRENT`: Integer 1-20
- `MIGRATION_DRY_RUN`: Boolean
- `MIGRATION_RETRY_FAILED`: Boolean
- `MIGRATION_LOG_LEVEL`: String, one of 'error', 'warn', 'info', 'debug'

**Section sources**
- [config.ts](file://src/config/config.ts#L438-L465)
- [migrationScheduler.ts](file://src/services/migrationScheduler.ts#L388-L404)
- [instanceMigrationService.ts](file://src/services/instanceMigrationService.ts#L654-L684)
- [.env.example](file://.env.example#L34-L40)