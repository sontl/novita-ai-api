# Axiom Logging Integration

This document describes the Axiom logging integration for the Novita GPU Instance API, providing enhanced observability and structured logging capabilities.

## Overview

The application now supports streaming logs to [Axiom](https://axiom.co/), a modern observability platform that provides powerful log analytics, real-time monitoring, and alerting capabilities. The integration maintains backward compatibility with console logging while adding rich structured logging features.

## Features

- **Dual Transport**: Logs to both console (for development) and Axiom (when configured)
- **Structured Logging**: Consistent JSON format with rich metadata
- **Request Tracing**: Automatic correlation IDs and request tracking
- **Performance Monitoring**: Built-in performance metrics and slow operation detection
- **Security Events**: Specialized logging for security-related events
- **Business Events**: Track business logic events for analytics
- **Error Context**: Enhanced error logging with stack traces and context
- **Component Isolation**: Component-specific loggers with inherited context

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```bash
# Axiom Logging Configuration (Optional)
AXIOM_DATASET=your_axiom_dataset_name
AXIOM_TOKEN=your_axiom_api_token
AXIOM_ORG_ID=your_axiom_org_id  # Optional: only needed for personal tokens
```

### Getting Axiom Credentials

1. Sign up at [https://app.axiom.co/](https://app.axiom.co/)
2. Create a new dataset for your application logs
3. Generate an API token with write permissions
4. Copy the dataset name and token to your environment variables

### Optional Configuration

```bash
# Advanced Axiom Configuration
AXIOM_FLUSH_INTERVAL=5000      # Flush interval in milliseconds (default: 5000)
AXIOM_MAX_BATCH_SIZE=100       # Maximum batch size for log shipping (default: 100)
```

## Usage

### Basic Logging

```typescript
import { axiomLogger } from '../utils/axiomLogger';

// Simple info log
axiomLogger.info('Operation completed', {
  component: 'instance_service',
  feature: 'lifecycle',
  tags: ['instance', 'success']
});

// Error logging with context
axiomLogger.error('Operation failed', {
  component: 'instance_service',
  errorCode: 'INST_001',
  tags: ['instance', 'error']
}, error);
```

### Component-Specific Logging

```typescript
import { createComponentLogger } from '../utils/axiomLogger';

const logger = createComponentLogger('migration_service', 'sync');

logger.info('Starting sync operation', {
  action: 'sync_start',
  batchSize: 100,
  tags: ['sync', 'start']
});
```

### Request-Specific Logging

```typescript
import { createRequestLogger } from '../utils/axiomLogger';

const logger = createRequestLogger(requestId, correlationId);

logger.httpRequest('POST', '/api/instances', 201, 850, {
  customerId: 'cust-123',
  tags: ['api', 'success']
});
```

### Performance Monitoring

```typescript
const startTime = Date.now();
// ... perform operation
const duration = Date.now() - startTime;

logger.performance('database_query', duration, {
  operation: 'select_instances',
  recordCount: 150,
  tags: ['database', 'query']
});
```

### Business Events

```typescript
logger.businessEvent('instance_created', {
  instanceId: 'inst-123',
  customerId: 'cust-456',
  metadata: {
    instanceType: 'gpu-large',
    region: 'CN-HK-01'
  },
  tags: ['instance', 'creation']
});
```

### Security Events

```typescript
logger.security('authentication_failed', 'medium', {
  clientIp: '192.168.1.100',
  userAgent: 'Mozilla/5.0...',
  metadata: {
    attemptCount: 3,
    reason: 'invalid_credentials'
  },
  tags: ['security', 'auth', 'failure']
});
```

## Log Structure

All logs follow a consistent structure optimized for Axiom:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "service": "novita-gpu-instance-api",
  "version": "1.0.0",
  "environment": "production",
  "hostname": "api-server-01",
  "pid": 12345,
  "message": "Operation completed successfully",
  "component": "instance_service",
  "feature": "lifecycle",
  "action": "create_instance",
  "requestId": "req-abc123",
  "correlationId": "corr-xyz789",
  "instanceId": "inst-456",
  "customerId": "cust-789",
  "responseTime": 850,
  "httpMethod": "POST",
  "httpUrl": "/api/instances",
  "httpStatusCode": 201,
  "tags": ["instance", "creation", "success"],
  "metadata": {
    "instanceType": "gpu-large",
    "region": "CN-HK-01"
  }
}
```

## Automatic Request Logging

The application automatically logs all HTTP requests with:

- Request/response correlation
- Performance metrics
- Error tracking
- Security context

This is handled by the `axiomLoggingMiddleware` which adds a request-specific logger to each request.

## Health Check Integration

The `/health` endpoint now includes Axiom status:

```json
{
  "status": "healthy",
  "logging": {
    "axiom": {
      "enabled": true,
      "configured": true
    }
  }
}
```

## Querying Logs in Axiom

### Common Queries

**Find all errors:**
```
level == "ERROR"
```

**Find slow operations:**
```
responseTime > 1000 or duration > 1000
```

**Find specific component logs:**
```
component == "instance_service"
```

**Find business events:**
```
tags contains "business"
```

**Find security events:**
```
component == "security" or tags contains "security"
```

**Find logs for specific request:**
```
requestId == "req-abc123"
```

### Dashboard Suggestions

Create dashboards for:

1. **Error Rate**: Track error rates by component and time
2. **Performance**: Monitor response times and slow operations
3. **Business Metrics**: Track instance creation, deletion, and lifecycle events
4. **Security**: Monitor authentication failures and suspicious activity
5. **System Health**: Track memory usage, CPU usage, and system metrics

## Best Practices

### Tagging Strategy

Use consistent tags for better filtering:

- **Component tags**: `instance`, `migration`, `cache`, `security`
- **Action tags**: `create`, `update`, `delete`, `sync`
- **Status tags**: `success`, `error`, `warning`
- **Performance tags**: `slow`, `fast`, `timeout`

### Context Enrichment

Always include relevant context:

```typescript
logger.info('Instance operation', {
  instanceId: 'inst-123',
  customerId: 'cust-456',
  operation: 'start',
  region: 'CN-HK-01',
  tags: ['instance', 'lifecycle']
});
```

### Error Handling

Include error context and recovery information:

```typescript
logger.error('Operation failed', {
  operation: 'create_instance',
  errorCode: 'INST_001',
  retryAttempt: 2,
  maxRetries: 3,
  willRetry: true,
  tags: ['instance', 'error', 'retry']
}, error);
```

### Performance Logging

Log performance metrics for optimization:

```typescript
logger.performance('cache_operation', duration, {
  operation: 'bulk_get',
  cacheHit: true,
  itemCount: 50,
  tags: ['cache', 'performance']
});
```

## Troubleshooting

### Axiom Not Receiving Logs

1. Check environment variables are set correctly
2. Verify Axiom token has write permissions
3. Check network connectivity to Axiom
4. Review application logs for Axiom transport errors

### High Log Volume

1. Adjust log level in production (`LOG_LEVEL=warn` or `LOG_LEVEL=error`)
2. Use sampling for high-frequency events
3. Configure `AXIOM_FLUSH_INTERVAL` and `AXIOM_MAX_BATCH_SIZE`

### Missing Context

1. Ensure middleware is properly configured
2. Use component-specific loggers
3. Pass context through request chain

## Migration from Console Logging

The integration is backward compatible. Existing `logger.info()` calls will work unchanged, but you can enhance them:

**Before:**
```typescript
logger.info('Instance created', { instanceId: 'inst-123' });
```

**After:**
```typescript
axiomLogger.businessEvent('instance_created', {
  instanceId: 'inst-123',
  customerId: 'cust-456',
  component: 'instance_service',
  tags: ['instance', 'creation', 'business']
});
```

## Examples

See `src/examples/axiomLoggingExample.ts` for comprehensive usage examples covering all logging patterns and use cases.