# Configuration Management

This module provides comprehensive configuration management for the Novita GPU Instance API service with validation, fail-fast behavior, and environment variable support.

## Features

- ✅ **Environment Variable Loading**: Automatic loading from `.env` files
- ✅ **Comprehensive Validation**: Joi-based schema validation with detailed error messages
- ✅ **Fail-Fast Behavior**: Application exits immediately on invalid configuration
- ✅ **Type Safety**: Full TypeScript support with strict typing
- ✅ **Security**: Sensitive data exclusion from logs and summaries
- ✅ **Singleton Pattern**: Consistent configuration across the application
- ✅ **Testing Support**: Easy configuration reset and mocking for tests

## Usage

### Basic Usage

```typescript
import { config, loadConfig, getConfig } from './config/config';

// Configuration is automatically loaded on import
console.log(`Server starting on port ${config.port}`);

// Or load explicitly with custom path
const customConfig = loadConfig('.env.production');

// Get configuration anywhere in the application
const currentConfig = getConfig();
```

### Validation

```typescript
import { validateEnvironment } from './config/config';

// Validate environment without loading
const validation = validateEnvironment(process.env);
if (!validation.isValid) {
  console.error('Configuration errors:', validation.errors);
}
```

### Configuration Summary (for logging)

```typescript
import { getConfigSummary } from './config/config';

// Get safe configuration summary (excludes sensitive data)
const summary = getConfigSummary();
console.log('Configuration loaded:', summary);
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NOVITA_API_KEY` | Novita.ai API key (minimum 10 characters) | `nv-1234567890abcdef` |

### Optional Variables

#### Application Settings

| Variable | Default | Description | Valid Values |
|----------|---------|-------------|--------------|
| `NODE_ENV` | `development` | Application environment | `development`, `production`, `test` |
| `PORT` | `3000` | Server port number | `1-65535` |
| `LOG_LEVEL` | `info` | Logging level | `error`, `warn`, `info`, `debug` |

#### Novita.ai API Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NOVITA_API_BASE_URL` | `https://api.novita.ai` | Novita.ai API base URL |

#### Webhook Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_URL` | `undefined` | Optional webhook URL for notifications |
| `WEBHOOK_SECRET` | `undefined` | Optional webhook signing secret (min 8 chars) |

#### Default Operational Settings

| Variable | Default | Description | Range |
|----------|---------|-------------|-------|
| `DEFAULT_REGION` | `CN-HK-01` | Default region for instance creation | Any string |
| `INSTANCE_POLL_INTERVAL` | `30` | Instance status polling interval (seconds) | `10-300` |
| `MAX_RETRY_ATTEMPTS` | `3` | Maximum retry attempts for API calls | `1-10` |
| `REQUEST_TIMEOUT` | `30000` | HTTP request timeout (milliseconds) | `5000-120000` |
| `WEBHOOK_TIMEOUT` | `10000` | Webhook request timeout (milliseconds) | `1000-30000` |
| `CACHE_TIMEOUT` | `300` | Cache timeout (seconds) | `60-3600` |
| `MAX_CONCURRENT_JOBS` | `10` | Maximum concurrent background jobs | `1-100` |

#### Security Settings

| Variable | Default | Description | Range |
|----------|---------|-------------|-------|
| `ENABLE_CORS` | `true` | Enable CORS middleware | `true`, `false` |
| `ENABLE_HELMET` | `true` | Enable Helmet security middleware | `true`, `false` |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (milliseconds) | `60000-3600000` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per rate limit window | `10-1000` |

## Configuration Files

### .env File Structure

Create a `.env` file in your project root:

```bash
# Required
NOVITA_API_KEY=your_actual_api_key_here

# Optional - Application
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Optional - Webhooks
WEBHOOK_URL=https://your-app.com/webhook
WEBHOOK_SECRET=your-webhook-secret-here

# Optional - Operational
DEFAULT_REGION=US-WEST-01
INSTANCE_POLL_INTERVAL=45
MAX_RETRY_ATTEMPTS=5
REQUEST_TIMEOUT=45000
WEBHOOK_TIMEOUT=15000
CACHE_TIMEOUT=600
MAX_CONCURRENT_JOBS=20

# Optional - Security
ENABLE_CORS=true
ENABLE_HELMET=true
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX_REQUESTS=200
```

### Environment-Specific Files

You can use different configuration files for different environments:

- `.env` - Default configuration
- `.env.local` - Local development overrides
- `.env.production` - Production configuration
- `.env.test` - Test configuration

## Error Handling

### Validation Errors

The configuration system implements fail-fast behavior. If validation fails, the application will:

1. Log detailed error messages to the console
2. Exit with code 1
3. Provide helpful hints for fixing configuration issues

Example error output:

```
❌ Configuration validation failed:
  - "NOVITA_API_KEY" is required
  - "PORT" must be a valid port
  - "LOG_LEVEL" must be one of [error, warn, info, debug]

💡 Please check your environment variables and .env file
```

### Custom Error Types

```typescript
import { ConfigValidationError } from './config/config';

try {
  loadConfig();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Validation failed:', error.details);
  }
}
```

## Testing

### Test Configuration

```typescript
import { loadConfig, resetConfig } from './config/config';

describe('My Service', () => {
  beforeEach(() => {
    resetConfig();
    process.env.NOVITA_API_KEY = 'test-key';
  });

  it('should work with test configuration', () => {
    const config = loadConfig();
    expect(config.novita.apiKey).toBe('test-key');
  });
});
```

### Mock Configuration

```typescript
// Mock environment for testing
const mockEnv = {
  NOVITA_API_KEY: 'test-key-123',
  NODE_ENV: 'test',
  PORT: '3001',
};

const config = loadConfig();
```

## Best Practices

### 1. Environment Variable Naming

- Use UPPERCASE with underscores
- Group related variables with prefixes
- Be descriptive but concise

### 2. Default Values

- Provide sensible defaults for optional settings
- Use production-safe defaults
- Document all defaults clearly

### 3. Validation

- Validate all configuration at startup
- Use appropriate data types and ranges
- Provide clear error messages

### 4. Security

- Never log sensitive configuration values
- Use environment variables for secrets
- Validate webhook URLs and secrets

### 5. Documentation

- Document all configuration options
- Provide examples for complex settings
- Keep documentation up to date

## Troubleshooting

### Common Issues

#### 1. Missing Required Configuration

```
Error: "NOVITA_API_KEY" is required
```

**Solution**: Set the `NOVITA_API_KEY` environment variable or add it to your `.env` file.

#### 2. Invalid Port Number

```
Error: "PORT" must be a valid port
```

**Solution**: Use a port number between 1 and 65535.

#### 3. Invalid URL Format

```
Error: "WEBHOOK_URL" must be a valid uri
```

**Solution**: Ensure URLs include the protocol (http:// or https://).

#### 4. Out of Range Values

```
Error: "INSTANCE_POLL_INTERVAL" must be greater than or equal to 10
```

**Solution**: Check the valid range for each configuration option in the table above.

### Debug Configuration

To debug configuration issues:

1. Enable debug logging: `LOG_LEVEL=debug`
2. Check configuration summary in logs
3. Validate environment before loading:

```typescript
import { validateEnvironment } from './config/config';

const validation = validateEnvironment();
if (!validation.isValid) {
  console.log('Configuration errors:', validation.errors);
}
```

## API Reference

### Functions

#### `loadConfig(envPath?: string): Config`

Loads and validates configuration from environment variables.

- `envPath` - Optional path to .env file
- Returns validated configuration object
- Throws `ConfigValidationError` on validation failure

#### `getConfig(): Config`

Gets the currently loaded configuration.

- Returns current configuration
- Throws error if configuration not loaded

#### `resetConfig(): void`

Resets configuration state (useful for testing).

#### `validateEnvironment(env?: NodeJS.ProcessEnv): ValidationResult`

Validates environment variables without loading configuration.

- `env` - Environment variables to validate (defaults to process.env)
- Returns validation result with errors if invalid

#### `getConfigSummary(): Record<string, any>`

Gets configuration summary excluding sensitive data.

- Returns safe configuration summary for logging

### Types

#### `Config`

Main configuration interface with all typed properties.

#### `ConfigValidationError`

Custom error class for configuration validation failures.

- `message` - Error message
- `details` - Array of Joi validation error details