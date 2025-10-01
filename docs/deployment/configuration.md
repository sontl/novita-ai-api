# Configuration Reference

## Overview

The Novita GPU Instance API uses environment variables for configuration. This document provides a comprehensive reference for all available configuration options.

## Environment Variables

### Required Configuration

#### NOVITA_API_KEY
- **Type**: String
- **Required**: Yes
- **Description**: Your Novita.ai API key for authentication
- **Example**: `NOVITA_API_KEY=nv_1234567890abcdef`
- **Security**: Keep this secret and never commit to version control

### Server Configuration

#### PORT
- **Type**: Number
- **Required**: No
- **Default**: `3000`
- **Description**: Port number for the HTTP server
- **Example**: `PORT=8080`
- **Range**: 1-65535

#### NODE_ENV
- **Type**: String
- **Required**: No
- **Default**: `development`
- **Description**: Node.js environment mode
- **Options**: `development`, `production`, `test`
- **Example**: `NODE_ENV=production`

#### HOST
- **Type**: String
- **Required**: No
- **Default**: `0.0.0.0`
- **Description**: Host address to bind the server
- **Example**: `HOST=127.0.0.1`

### Webhook Configuration

#### WEBHOOK_URL
- **Type**: String (URL)
- **Required**: No
- **Description**: Default webhook URL for instance notifications
- **Example**: `WEBHOOK_URL=https://your-app.com/webhook`
- **Validation**: Must be a valid HTTP/HTTPS URL

#### WEBHOOK_SECRET
- **Type**: String
- **Required**: No
- **Description**: Secret for webhook signature validation
- **Example**: `WEBHOOK_SECRET=your_webhook_secret_here`
- **Security**: Use a strong, random secret

#### WEBHOOK_TIMEOUT
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `10000`
- **Description**: Timeout for webhook HTTP requests
- **Example**: `WEBHOOK_TIMEOUT=15000`
- **Range**: 1000-60000

#### WEBHOOK_RETRIES
- **Type**: Number
- **Required**: No
- **Default**: `3`
- **Description**: Number of retry attempts for failed webhooks
- **Example**: `WEBHOOK_RETRIES=5`
- **Range**: 0-10

### Instance Management

#### INSTANCE_POLL_INTERVAL
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `30000`
- **Description**: Interval for polling instance status
- **Example**: `INSTANCE_POLL_INTERVAL=15000`
- **Range**: 5000-300000

#### INSTANCE_STARTUP_TIMEOUT
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `600000` (10 minutes)
- **Description**: Maximum time to wait for instance startup
- **Example**: `INSTANCE_STARTUP_TIMEOUT=900000`
- **Range**: 60000-1800000

#### DEFAULT_REGION
- **Type**: String
- **Required**: No
- **Default**: `CN-HK-01`
- **Description**: Default region for instance creation
- **Example**: `DEFAULT_REGION=US-WEST-01`
- **Options**: Valid Novita.ai region codes

#### DEFAULT_GPU_COUNT
- **Type**: Number
- **Required**: No
- **Default**: `1`
- **Description**: Default number of GPUs per instance
- **Example**: `DEFAULT_GPU_COUNT=2`
- **Range**: 1-8

#### DEFAULT_ROOTFS_SIZE
- **Type**: Number (GB)
- **Required**: No
- **Default**: `60`
- **Description**: Default root filesystem size
- **Example**: `DEFAULT_ROOTFS_SIZE=100`
- **Range**: 20-500

### API Client Configuration

#### NOVITA_API_BASE_URL
- **Type**: String (URL)
- **Required**: No
- **Default**: `https://api.novita.ai`
- **Description**: Base URL for Novita.ai API
- **Example**: `NOVITA_API_BASE_URL=https://api-staging.novita.ai`

#### API_TIMEOUT
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `30000`
- **Description**: Timeout for Novita.ai API requests
- **Example**: `API_TIMEOUT=45000`
- **Range**: 5000-120000

#### MAX_RETRIES
- **Type**: Number
- **Required**: No
- **Default**: `3`
- **Description**: Maximum retry attempts for failed API calls
- **Example**: `MAX_RETRIES=5`
- **Range**: 0-10

#### RETRY_DELAY
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `1000`
- **Description**: Base delay between retry attempts
- **Example**: `RETRY_DELAY=2000`
- **Range**: 100-10000

#### CIRCUIT_BREAKER_THRESHOLD
- **Type**: Number
- **Required**: No
- **Default**: `5`
- **Description**: Number of failures before circuit breaker opens
- **Example**: `CIRCUIT_BREAKER_THRESHOLD=10`
- **Range**: 1-50

#### CIRCUIT_BREAKER_TIMEOUT
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `60000`
- **Description**: Time before circuit breaker attempts recovery
- **Example**: `CIRCUIT_BREAKER_TIMEOUT=120000`
- **Range**: 10000-600000

### Logging Configuration

#### LOG_LEVEL
- **Type**: String
- **Required**: No
- **Default**: `info`
- **Description**: Minimum log level to output
- **Options**: `error`, `warn`, `info`, `debug`
- **Example**: `LOG_LEVEL=debug`

#### LOG_FORMAT
- **Type**: String
- **Required**: No
- **Default**: `json`
- **Description**: Log output format
- **Options**: `json`, `simple`, `combined`
- **Example**: `LOG_FORMAT=simple`

#### LOG_FILE
- **Type**: String
- **Required**: No
- **Description**: Path to log file (if not set, logs to stdout)
- **Example**: `LOG_FILE=/var/log/novita-api.log`

#### LOG_MAX_SIZE
- **Type**: String
- **Required**: No
- **Default**: `10m`
- **Description**: Maximum size of log files before rotation
- **Example**: `LOG_MAX_SIZE=50m`

#### LOG_MAX_FILES
- **Type**: Number
- **Required**: No
- **Default**: `5`
- **Description**: Maximum number of log files to keep
- **Example**: `LOG_MAX_FILES=10`
- **Range**: 1-100

### Cache Configuration

#### CACHE_TTL
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `300000` (5 minutes)
- **Description**: Time-to-live for cached data
- **Example**: `CACHE_TTL=600000`
- **Range**: 10000-3600000

#### CACHE_MAX_SIZE
- **Type**: Number
- **Required**: No
- **Default**: `1000`
- **Description**: Maximum number of items in cache
- **Example**: `CACHE_MAX_SIZE=5000`
- **Range**: 100-50000

#### PRODUCT_CACHE_TTL
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `1800000` (30 minutes)
- **Description**: Cache TTL for product data
- **Example**: `PRODUCT_CACHE_TTL=3600000`
- **Range**: 60000-86400000

#### TEMPLATE_CACHE_TTL
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `3600000` (1 hour)
- **Description**: Cache TTL for template data
- **Example**: `TEMPLATE_CACHE_TTL=7200000`
- **Range**: 300000-86400000

### Rate Limiting

#### RATE_LIMIT_WINDOW
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `60000` (1 minute)
- **Description**: Time window for rate limiting
- **Example**: `RATE_LIMIT_WINDOW=300000`
- **Range**: 1000-3600000

#### RATE_LIMIT_MAX_REQUESTS
- **Type**: Number
- **Required**: No
- **Default**: `100`
- **Description**: Maximum requests per window
- **Example**: `RATE_LIMIT_MAX_REQUESTS=500`
- **Range**: 1-10000

#### RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS
- **Type**: Boolean
- **Required**: No
- **Default**: `false`
- **Description**: Whether to skip counting successful requests
- **Example**: `RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=true`

### Job Queue Configuration

#### JOB_CONCURRENCY
- **Type**: Number
- **Required**: No
- **Default**: `5`
- **Description**: Maximum concurrent job processing
- **Example**: `JOB_CONCURRENCY=10`
- **Range**: 1-50

#### JOB_MAX_ATTEMPTS
- **Type**: Number
- **Required**: No
- **Default**: `3`
- **Description**: Maximum retry attempts for failed jobs
- **Example**: `JOB_MAX_ATTEMPTS=5`
- **Range**: 1-10

#### JOB_BACKOFF_DELAY
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `5000`
- **Description**: Base delay for job retry backoff
- **Example**: `JOB_BACKOFF_DELAY=10000`
- **Range**: 1000-60000

### Security Configuration

#### CORS_ORIGIN
- **Type**: String
- **Required**: No
- **Default**: `*`
- **Description**: Allowed CORS origins
- **Example**: `CORS_ORIGIN=https://your-frontend.com`

#### CORS_METHODS
- **Type**: String
- **Required**: No
- **Default**: `GET,POST,PUT,DELETE,OPTIONS`
- **Description**: Allowed HTTP methods for CORS
- **Example**: `CORS_METHODS=GET,POST`

#### HELMET_ENABLED
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable Helmet security middleware
- **Example**: `HELMET_ENABLED=false`

#### REQUEST_SIZE_LIMIT
- **Type**: String
- **Required**: No
- **Default**: `10mb`
- **Description**: Maximum request body size
- **Example**: `REQUEST_SIZE_LIMIT=50mb`

### Health Check Configuration

#### HEALTH_CHECK_TIMEOUT_MS
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `10000`
- **Description**: Timeout for dependency health checks
- **Example**: `HEALTH_CHECK_TIMEOUT_MS=15000`
- **Range**: 1000-60000

#### HEALTH_CHECK_RETRY_ATTEMPTS
- **Type**: Number
- **Required**: No
- **Default**: `3`
- **Description**: Number of retry attempts for failed health checks
- **Example**: `HEALTH_CHECK_RETRY_ATTEMPTS=5`
- **Range**: 1-10

#### HEALTH_CHECK_RETRY_DELAY_MS
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `2000`
- **Description**: Delay between health check retry attempts
- **Example**: `HEALTH_CHECK_RETRY_DELAY_MS=5000`
- **Range**: 500-30000

#### HEALTH_CHECK_MAX_WAIT_TIME_MS
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `300000` (5 minutes)
- **Description**: Maximum total wait time for health checks
- **Example**: `HEALTH_CHECK_MAX_WAIT_TIME_MS=600000`
- **Range**: 30000-1800000

### Migration Configuration

#### MIGRATION_ENABLED
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable automatic spot instance migration
- **Example**: `MIGRATION_ENABLED=false`
- **Note**: When disabled, no migration jobs will be scheduled

#### MIGRATION_INTERVAL_MINUTES
- **Type**: Number (minutes)
- **Required**: No
- **Default**: `15`
- **Description**: Migration job schedule interval in minutes
- **Example**: `MIGRATION_INTERVAL_MINUTES=30`
- **Range**: 1-60

#### MIGRATION_JOB_TIMEOUT_MS
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `600000` (10 minutes)
- **Description**: Migration job timeout in milliseconds
- **Example**: `MIGRATION_JOB_TIMEOUT_MS=900000`
- **Range**: 60000-1800000

#### MIGRATION_MAX_CONCURRENT
- **Type**: Number
- **Required**: No
- **Default**: `5`
- **Description**: Maximum concurrent migration operations
- **Example**: `MIGRATION_MAX_CONCURRENT=10`
- **Range**: 1-20

#### MIGRATION_DRY_RUN
- **Type**: Boolean
- **Required**: No
- **Default**: `false`
- **Description**: Enable dry run mode (logs actions without executing)
- **Example**: `MIGRATION_DRY_RUN=true`
- **Note**: Useful for testing migration logic without actual API calls

#### MIGRATION_RETRY_FAILED
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable retry for failed migration attempts
- **Example**: `MIGRATION_RETRY_FAILED=false`

#### MIGRATION_LOG_LEVEL
- **Type**: String
- **Required**: No
- **Default**: `info`
- **Description**: Migration-specific log level
- **Options**: `error`, `warn`, `info`, `debug`
- **Example**: `MIGRATION_LOG_LEVEL=debug`

## Configuration Validation

The application validates all configuration on startup and will fail to start with invalid values. Validation includes:

- **Type checking**: Ensures values are correct types (string, number, boolean)
- **Range validation**: Checks numeric values are within acceptable ranges
- **Format validation**: Validates URLs, file paths, and other formatted strings
- **Required field validation**: Ensures all required fields are present

### Validation Examples

```bash
# Valid configuration
NOVITA_API_KEY=nv_1234567890abcdef
PORT=3000
LOG_LEVEL=info

# Invalid configuration (will cause startup failure)
PORT=abc123                    # Invalid type
LOG_LEVEL=invalid             # Invalid option
INSTANCE_POLL_INTERVAL=1000   # Below minimum range
```

## Environment-Specific Configurations

### Development Environment

```bash
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=simple
CACHE_TTL=60000
INSTANCE_POLL_INTERVAL=10000
```

### Production Environment

```bash
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/novita-api.log
CACHE_TTL=300000
INSTANCE_POLL_INTERVAL=30000
RATE_LIMIT_MAX_REQUESTS=100
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=15
MIGRATION_LOG_LEVEL=info
```

### Testing Environment

```bash
NODE_ENV=test
LOG_LEVEL=error
CACHE_TTL=1000
INSTANCE_POLL_INTERVAL=5000
WEBHOOK_TIMEOUT=1000
MIGRATION_ENABLED=false
MIGRATION_DRY_RUN=true
```

## Configuration File Examples

### .env.example

```bash
# Required Configuration
NOVITA_API_KEY=your_novita_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=production

# Webhook Configuration (Optional)
WEBHOOK_URL=https://your-app.com/webhook
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_TIMEOUT=10000

# Instance Configuration
INSTANCE_POLL_INTERVAL=30000
INSTANCE_STARTUP_TIMEOUT=600000
DEFAULT_REGION=CN-HK-01

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json

# Cache Configuration
CACHE_TTL=300000
PRODUCT_CACHE_TTL=1800000

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW=60000

# Migration Configuration
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=15
MIGRATION_JOB_TIMEOUT_MS=600000
MIGRATION_MAX_CONCURRENT=5
MIGRATION_DRY_RUN=false
MIGRATION_RETRY_FAILED=true
MIGRATION_LOG_LEVEL=info
```

### docker-compose.override.yml

```yaml
version: '3.8'

services:
  novita-api:
    environment:
      - LOG_LEVEL=debug
      - INSTANCE_POLL_INTERVAL=15000
      - CACHE_TTL=60000
    volumes:
      - ./logs:/var/log
```

## Migration Service Configuration Examples

### Basic Migration Setup

For most use cases, the default migration settings work well:

```bash
# Enable migration with default 15-minute interval
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=15
MIGRATION_MAX_CONCURRENT=5
```

### High-Frequency Migration

For environments with frequent spot instance reclaims:

```bash
# More frequent migration checks
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=5
MIGRATION_MAX_CONCURRENT=10
MIGRATION_JOB_TIMEOUT_MS=300000  # 5 minutes
```

### Conservative Migration

For production environments requiring careful migration:

```bash
# Less frequent, more conservative migration
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=30
MIGRATION_MAX_CONCURRENT=3
MIGRATION_RETRY_FAILED=true
MIGRATION_LOG_LEVEL=info
```

### Development/Testing Migration

For development and testing environments:

```bash
# Dry run mode for testing
MIGRATION_ENABLED=true
MIGRATION_DRY_RUN=true
MIGRATION_LOG_LEVEL=debug
MIGRATION_INTERVAL_MINUTES=5
```

### Disabled Migration

To completely disable automatic migration:

```bash
# Disable all migration functionality
MIGRATION_ENABLED=false
```

### Migration Monitoring Configuration

For enhanced monitoring and observability:

```bash
# Detailed logging and monitoring
MIGRATION_ENABLED=true
MIGRATION_LOG_LEVEL=debug
MIGRATION_RETRY_FAILED=true
LOG_LEVEL=info  # Ensure general logging captures migration events
```

## Configuration Best Practices

### Security

1. **Never commit secrets**: Use `.env` files and add them to `.gitignore`
2. **Use strong secrets**: Generate random webhook secrets and API keys
3. **Rotate credentials**: Regularly update API keys and secrets
4. **Limit CORS origins**: Don't use `*` in production

### Performance

1. **Tune cache TTL**: Balance freshness with performance
2. **Adjust polling intervals**: Consider API rate limits
3. **Configure timeouts**: Set appropriate timeouts for your network
4. **Monitor resource usage**: Adjust limits based on actual usage

### Reliability

1. **Set appropriate retries**: Balance reliability with response time
2. **Configure circuit breakers**: Prevent cascade failures
3. **Use health checks**: Enable proper monitoring
4. **Plan for failures**: Set reasonable timeout values
5. **Configure migration properly**: Set appropriate intervals and timeouts
6. **Monitor migration jobs**: Enable detailed logging for migration operations

### Monitoring

1. **Enable structured logging**: Use JSON format in production
2. **Set appropriate log levels**: Avoid debug logs in production
3. **Configure log rotation**: Prevent disk space issues
4. **Monitor metrics**: Track performance and errors

## Troubleshooting Configuration Issues

### Common Problems

1. **Invalid API Key**
   ```
   Error: Authentication failed with Novita.ai API
   Solution: Verify NOVITA_API_KEY is correct and active
   ```

2. **Port Already in Use**
   ```
   Error: EADDRINUSE: address already in use :::3000
   Solution: Change PORT or stop conflicting service
   ```

3. **Invalid URL Format**
   ```
   Error: Invalid webhook URL format
   Solution: Ensure WEBHOOK_URL starts with http:// or https://
   ```

4. **Configuration Validation Failed**
   ```
   Error: Configuration validation failed
   Solution: Check all required fields and value ranges
   ```

5. **Migration Configuration Issues**
   ```
   Error: Migration interval out of range
   Solution: Set MIGRATION_INTERVAL_MINUTES between 1-60
   ```

### Debugging Configuration

```bash
# Check current configuration
docker-compose exec novita-api env | grep -E '^(NOVITA|PORT|LOG)'

# Validate configuration
docker-compose config

# Test with minimal configuration
docker-compose run --rm novita-api node -e "console.log(require('./dist/config/config').default)"
```

For more troubleshooting help, see the [Troubleshooting Guide](../TROUBLESHOOTING.md).