# Axiom Logging Integration

## Overview

The application now supports streaming logs to [Axiom](https://axiom.co/), a modern observability platform that provides powerful log analytics, real-time monitoring, and alerting capabilities. The integration maintains backward compatibility with console logging while adding rich structured logging features.

## What Was Implemented

✅ **Complete Axiom logging integration** for the Novita GPU Instance API with enhanced observability features.

## Key Components Added

### 1. Core Logging Infrastructure
- **`src/utils/axiomLogger.ts`** - Enhanced logger with Axiom-optimized structured logging
- **`src/config/axiomConfig.ts`** - Configuration management and validation for Axiom settings
- **`src/middleware/axiomLoggingMiddleware.ts`** - Express middleware for automatic request/response logging

### 2. Enhanced Winston Logger
- **`src/utils/logger.ts`** - Updated to support dual transport (console + Axiom)
- Automatic Axiom transport when credentials are configured
- Maintains backward compatibility with existing logging

### 3. Application Integration
- **`src/index.ts`** - Integrated Axiom middleware and startup logging
- **`src/routes/health.ts`** - Added Axiom status to health checks
- **`src/types/api.ts`** - Extended health check response with logging status

### 4. Testing & Examples
- **`src/utils/__tests__/axiomLogger.test.ts`** - Comprehensive test suite
- **`src/config/__tests__/axiomConfig.test.ts`** - Configuration validation tests
- **`src/examples/axiomLoggingExample.ts`** - Usage examples and patterns

### 5. Documentation
- **Documentation**: See this file for complete integration guide
- **`.env.example`** - Updated with Axiom configuration variables

## Features Implemented

### 🚀 **Structured Logging**
- Consistent JSON format optimized for Axiom
- Rich metadata including request IDs, correlation IDs, performance metrics
- Automatic context enrichment (memory usage, timestamps, environment info)

### 🔍 **Request Tracing**
- Automatic correlation ID generation and propagation
- Request/response logging with performance metrics
- Slow request detection and alerting

### 📊 **Performance Monitoring**
- Built-in performance logging utilities
- Memory and CPU usage tracking
- Operation duration measurement and alerting

### 🔒 **Security Event Logging**
- Specialized security event logging with severity levels
- Automatic PII sanitization
- IP address and user agent tracking

### 📈 **Business Event Tracking**
- Structured business event logging for analytics
- Custom metadata support
- Tagging system for easy filtering

### 🏗️ **Component Architecture**
- Component-specific loggers with inherited context
- Child logger support for request-scoped logging
- Hierarchical context management

## Configuration

### Environment Variables Added
```bash
# Axiom Logging Configuration (Optional)
AXIOM_DATASET=your_axiom_dataset_name
AXIOM_TOKEN=your_axiom_api_token
AXIOM_ORG_ID=your_axiom_org_id  # Optional
AXIOM_FLUSH_INTERVAL=5000       # Optional
AXIOM_MAX_BATCH_SIZE=100        # Optional
```

### Getting Axiom Credentials

1. Sign up at [https://app.axiom.co/](https://app.axiom.co/)
2. Create a new dataset for your application logs
3. Generate an API token with write permissions
4. Copy the dataset name and token to your environment variables

### Health Check Integration
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

## Usage Examples

### Basic Logging
```typescript
import { axiomLogger } from '../utils/axiomLogger';

axiomLogger.info('Operation completed', {
  component: 'instance_service',
  instanceId: 'inst-123',
  tags: ['instance', 'success']
});
```

### Component-Specific Logging
```typescript
import { createComponentLogger } from '../utils/axiomLogger';

const logger = createComponentLogger('migration_service', 'sync');
logger.performance('sync_operation', 1250, {
  recordCount: 100,
  tags: ['sync', 'performance']
});
```

### Request-Specific Logging
```typescript
// Automatically available in request handlers via middleware
req.logger.httpRequest('POST', '/api/instances', 201, 850, {
  customerId: 'cust-123',
  tags: ['api', 'success']
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

### Axiom Column Limit Fix

Axiom has a column limit of 257 fields per dataset. To address this, we implemented a strict field limiting strategy:

#### Problem
The application was experiencing Axiom logging errors due to exceeding the column limit of 257 fields per dataset:

```
Error: adding 'metadata' to dataset fields would exceed the column limit of 257
Error: adding 'region' and one other field to dataset fields would exceed the column limit of 257
```

#### Root Cause
The Axiom transport was receiving too many individual fields from the logging system, causing field explosion in the Axiom dataset. Each unique field name in the log entries was being treated as a separate column in Axiom.

#### Solution
Implemented a strict field limiting strategy for Axiom logging:

##### 1. Ultra-Minimal Axiom Format
- Limited Axiom logs to only essential fields (10-12 core fields)
- Removed all metadata and complex object logging to Axiom
- Kept detailed logging in console for development

##### 2. Core Fields Sent to Axiom
- `timestamp`
- `level`
- `message`
- `service`
- `environment`
- `requestId`
- `correlationId`
- `component`
- `httpMethod`
- `httpUrl`
- `httpStatusCode`
- `responseTime`
- `instanceId`
- `errorType`
- `tags` (as comma-separated string)

##### 3. Removed Field Explosion Sources
- Eliminated `metadata` field completely from Axiom
- Removed complex object logging (request bodies, headers, etc.)
- Simplified all logging calls to use only essential fields
- Converted arrays to strings (e.g., tags array to comma-separated string)

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

The integration is **100% backward compatible**. Existing `logger.info()` calls will work unchanged, but you can enhance them:

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

## Benefits

### 🎯 **Enhanced Observability**
- Real-time log streaming to Axiom
- Rich structured data for analytics and alerting
- Correlation across distributed operations

### 🔧 **Developer Experience**
- Backward compatible with existing logging
- Type-safe logging interfaces
- Comprehensive examples and documentation

### 📊 **Operations & Monitoring**
- Performance bottleneck identification
- Error tracking and alerting
- Business metrics and analytics

### 🛡️ **Security & Compliance**
- Automatic PII sanitization
- Security event tracking
- Audit trail capabilities

## Testing

All components are fully tested:
```bash
npm test -- --testPathPattern="axiom"
```

- ✅ 17 tests for AxiomLogger functionality
- ✅ 14 tests for configuration validation
- ✅ Full TypeScript compilation
- ✅ Backward compatibility maintained

## Next Steps

1. **Configure Axiom Account**
   - Sign up at https://app.axiom.co/
   - Create dataset and generate API token
   - Add credentials to environment variables

2. **Deploy and Monitor**
   - Deploy with Axiom configuration
   - Create dashboards for key metrics
   - Set up alerts for errors and performance issues

3. **Optimize Usage**
   - Review log volume and adjust levels as needed
   - Create custom queries for business insights
   - Set up automated monitoring and alerting

## Support

- **Documentation**: See this file for complete integration guide
- **Examples**: `src/examples/axiomLoggingExample.ts`
- **Tests**: `src/**/__tests__/*axiom*.test.ts`
- **Health Check**: `/health` endpoint shows Axiom status