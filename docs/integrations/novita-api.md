# Novita.ai API Integration

## Overview

This document provides a comprehensive guide to the Novita GPU Instance API service, which acts as an intermediary between clients and the Novita.ai platform. The service provides enhanced functionality including automatic instance lifecycle management, auto-stop features, and comprehensive caching.

## Base URL

```
http://localhost:3000  # Development
https://your-domain.com  # Production
```

## Authentication

All API requests require authentication via API key:

```bash
# Set your API keys in environment
export NOVITA_API_KEY="your_api_key_here"
export NOVITA_INTERNAL_API_KEY="your_internal_api_key_here"
```

The service uses two different Novita.ai API keys for backend operations:

- **NOVITA_API_KEY**: For standard GPU instance operations (create, start, stop, delete)
- **NOVITA_INTERNAL_API_KEY**: For internal API operations (job queries, migration status)

### API Endpoints Configuration

The service connects to two different Novita.ai API endpoints:

- **Standard API**: `https://api.novita.ai/gpu-instance/openapi` - For instance management
- **Internal API**: `https://api-server.novita.ai` - For job queries and internal operations

No additional authentication is required for the API endpoints themselves.

## Request Headers

Include these headers in all requests:

```http
Content-Type: application/json
X-Request-ID: unique-request-identifier  # Optional but recommended
X-Correlation-ID: correlation-identifier  # Optional for request tracing
```

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "data": { /* response data */ },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Error Response
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional error details",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_123456789"
  }
}
```

## API Endpoints

### 1. Health Check

Check service health and connectivity.

#### `GET /health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "novitaApi": "up",
    "jobQueue": "up",
    "cache": "up",
    "migrationService": "up"
  },
  "uptime": 3600,
  "performance": {
    "requestsPerMinute": 45.2,
    "averageResponseTime": 120,
    "errorRate": 0.02,
    "jobProcessingRate": 12.5
  },
  "system": {
    "memory": {
      "usedMB": 256,
      "totalMB": 512,
      "externalMB": 64,
      "rss": 320
    },
    "cpu": {
      "usage": 15.5,
      "loadAverage": [0.8, 0.9, 1.1]
    }
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "novitaApi": "down",
    "jobQueue": "up",
    "cache": "up",
    "migrationService": "down"
  },
  "uptime": 3600
}
```

### 2. Create Instance

Create a new GPU instance with automated lifecycle management.

#### `POST /api/instances`

**Request Body:**
```json
{
  "name": "my-gpu-instance",
  "productName": "RTX 4090 24GB",
  "templateId": "pytorch-jupyter",
  "gpuNum": 1,
  "rootfsSize": 60,
  "region": "CN-HK-01",
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Schema:**
- `name` (string, required): Instance name (1-100 chars, alphanumeric + hyphens/underscores)
- `productName` (string, required): GPU product name (1-200 chars)
- `templateId` (string, required): Template identifier
- `gpuNum` (number, optional): Number of GPUs (1-8, default: 1)
- `rootfsSize` (number, optional): Root filesystem size in GB (20-1000, default: 60)
- `region` (string, optional): Region code (default: "CN-HK-01")
  - Valid regions: `CN-HK-01`, `US-WEST-01`, `EU-WEST-01`, `AS-SGP-02`
- `webhookUrl` (string, optional): Webhook URL for status notifications

**Response (201 Created):**
```json
{
  "instanceId": "inst_abc123def456",
  "status": "creating",
  "message": "Instance creation initiated successfully",
  "estimatedReadyTime": "2024-01-15T10:35:00.000Z"
}
```

**Response (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "name",
        "message": "Name must contain only alphanumeric characters, hyphens, and underscores",
        "value": "invalid@name"
      }
    ],
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_123456789"
  }
}
```

### 3. Get Instance Status

Retrieve current status and details of a specific instance.

#### `GET /api/instances/{instanceId}`

**Path Parameters:**
- `instanceId` (string, required): Instance identifier

**Response (200 OK):**
```json
{
  "id": "inst_abc123def456",
  "name": "my-gpu-instance",
  "status": "running",
  "gpuNum": 1,
  "region": "CN-HK-01",
  "portMappings": [
    {
      "port": 8888,
      "endpoint": "https://abc123.novita.ai:8888",
      "type": "jupyter"
    },
    {
      "port": 22,
      "endpoint": "ssh://abc123.novita.ai:22",
      "type": "ssh"
    }
  ],
  "connectionDetails": {
    "ssh": "ssh root@abc123.novita.ai -p 22",
    "jupyter": "https://abc123.novita.ai:8888",
    "webTerminal": "https://abc123.novita.ai:7681"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "readyAt": "2024-01-15T10:35:00.000Z",
  "lastUsedAt": "2024-01-15T10:40:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance not found",
    "details": "Instance with ID 'inst_invalid' does not exist",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_123456789"
  }
}
```

### 4. List Instances

List all managed instances with their current status.

#### `GET /api/instances`

**Query Parameters:**
- `source` (string, optional): Data source (`all`, `local`, `novita`, default: `all`)
- `includeNovitaOnly` (boolean, optional): Include Novita-only instances (default: `false`)
- `syncLocalState` (boolean, optional): Sync local state with Novita (default: `false`)

**Response (200 OK):**
```json
{
  "instances": [
    {
      "id": "inst_abc123def456",
      "name": "my-gpu-instance-1",
      "status": "running",
      "gpuNum": 1,
      "region": "CN-HK-01",
      "portMappings": [
        {
          "port": 8888,
          "endpoint": "https://abc123.novita.ai:8888",
          "type": "jupyter"
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "readyAt": "2024-01-15T10:35:00.000Z",
      "lastUsedAt": "2024-01-15T10:40:00.000Z"
    },
    {
      "id": "inst_def456ghi789",
      "name": "my-gpu-instance-2",
      "status": "creating",
      "gpuNum": 2,
      "region": "US-WEST-01",
      "portMappings": [],
      "createdAt": "2024-01-15T10:45:00.000Z"
    }
  ],
  "total": 2
}
```

### 5. Comprehensive Instance Listing

Get comprehensive instance data from both local state and Novita.ai API.

#### `GET /api/instances/comprehensive`

**Query Parameters:**
- `includeNovitaOnly` (boolean, optional): Include Novita-only instances (default: `true`)
- `syncLocalState` (boolean, optional): Sync local state with Novita (default: `false`)

**Response (200 OK):**
```json
{
  "instances": [
    {
      "id": "inst_abc123def456",
      "name": "my-gpu-instance",
      "status": "running",
      "source": "merged",
      "dataConsistency": "consistent",
      "gpuNum": 1,
      "region": "CN-HK-01",
      "clusterId": "cluster_123",
      "clusterName": "HK Cluster 1",
      "productName": "RTX 4090 24GB",
      "cpuNum": "8",
      "memory": "32GB",
      "imageUrl": "pytorch/pytorch:latest",
      "portMappings": [
        {
          "port": 8888,
          "endpoint": "https://abc123.novita.ai:8888",
          "type": "jupyter"
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "lastSyncedAt": "2024-01-15T10:45:00.000Z"
    }
  ],
  "total": 1,
  "sources": {
    "local": 0,
    "novita": 0,
    "merged": 1
  },
  "performance": {
    "totalRequestTime": 1250,
    "novitaApiTime": 800,
    "localDataTime": 50,
    "mergeProcessingTime": 400,
    "cacheHitRatio": 0.75
  }
}
```

### 6. Start Instance by ID

Start an existing instance using its ID.

#### `POST /api/instances/{instanceId}/start`

**Path Parameters:**
- `instanceId` (string, required): Instance identifier

**Request Body:**
```json
{
  "healthCheckConfig": {
    "timeoutMs": 30000,
    "retryAttempts": 3,
    "retryDelayMs": 2000,
    "maxWaitTimeMs": 600000,
    "targetPort": 8888
  },
  "targetPort": 8888,
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Schema:**
- `healthCheckConfig` (object, optional): Health check configuration
  - `timeoutMs` (number): Timeout per check (1000-300000ms, default: 30000)
  - `retryAttempts` (number): Retry attempts (0-10, default: 3)
  - `retryDelayMs` (number): Delay between retries (100-30000ms, default: 2000)
  - `maxWaitTimeMs` (number): Maximum wait time (30000-1800000ms, default: 600000)
  - `targetPort` (number, optional): Specific port to check (1-65535)
- `targetPort` (number, optional): Target port for health checks (1-65535)
- `webhookUrl` (string, optional): Webhook URL for notifications

**Response (202 Accepted):**
```json
{
  "instanceId": "inst_abc123def456",
  "novitaInstanceId": "novita_xyz789",
  "operationId": "op_start_123456",
  "status": "starting",
  "message": "Instance start initiated successfully",
  "estimatedReadyTime": "2024-01-15T10:35:00.000Z"
}
```

### 7. Start Instance by Name

Start an instance using its name.

#### `POST /api/instances/start`

**Request Body:**
```json
{
  "instanceName": "my-gpu-instance",
  "healthCheckConfig": {
    "timeoutMs": 30000,
    "retryAttempts": 3,
    "retryDelayMs": 2000,
    "maxWaitTimeMs": 600000
  },
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Schema:**
- `instanceName` (string, required): Instance name for name-based starting
- `healthCheckConfig` (object, optional): Health check configuration (same as above)
- `webhookUrl` (string, optional): Webhook URL for notifications

**Response (202 Accepted):**
```json
{
  "instanceId": "inst_abc123def456",
  "novitaInstanceId": "novita_xyz789",
  "operationId": "op_start_123456",
  "status": "starting",
  "message": "Instance start initiated successfully",
  "estimatedReadyTime": "2024-01-15T10:35:00.000Z"
}
```

### 8. Stop Instance by ID

Stop a running instance using its ID.

#### `POST /api/instances/{instanceId}/stop`

**Path Parameters:**
- `instanceId` (string, required): Instance identifier

**Request Body:**
```json
{
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Schema:**
- `webhookUrl` (string, optional): Webhook URL for notifications

**Response (200 OK):**
```json
{
  "instanceId": "inst_abc123def456",
  "novitaInstanceId": "novita_xyz789",
  "operationId": "op_stop_123456",
  "status": "stopping",
  "message": "Instance stop completed successfully"
}
```

### 9. Stop Instance by Name

Stop an instance using its name.

#### `POST /api/instances/stop`

**Request Body:**
```json
{
  "instanceName": "my-gpu-instance",
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Schema:**
- `instanceName` (string, required): Instance name for name-based stopping
- `webhookUrl` (string, optional): Webhook URL for notifications

**Response (200 OK):**
```json
{
  "instanceId": "inst_abc123def456",
  "novitaInstanceId": "novita_xyz789",
  "operationId": "op_stop_123456",
  "status": "stopped",
  "message": "Instance stop completed successfully"
}
```

### 10. Update Last Used Time

Update the last used timestamp for an instance to prevent auto-stop.

#### `PUT /api/instances/{instanceId}/last-used`

**Path Parameters:**
- `instanceId` (string, required): Instance identifier

**Request Body:**
```json
{
  "lastUsedAt": "2024-01-15T10:30:00.000Z"  // Optional, defaults to current time
}
```

**Request Schema:**
- `lastUsedAt` (string, optional): ISO date string for last used time (defaults to current time)

**Response (200 OK):**
```json
{
  "instanceId": "inst_abc123def456",
  "lastUsedAt": "2024-01-15T10:30:00.000Z",
  "message": "Last used time updated successfully"
}
```

**Response (404 Not Found):**
```json
{
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance not found",
    "details": "Instance with ID 'inst_invalid' does not exist",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_123456789"
  }
}
```

### 11. Auto-Stop Statistics

Get auto-stop service statistics and configuration.

#### `GET /api/instances/auto-stop/stats`

**Response (200 OK):**
```json
{
  "schedulerRunning": true,
  "checkIntervalMinutes": 5,
  "defaultInactivityThresholdMinutes": 20
}
```

### 12. Trigger Auto-Stop Check

Manually trigger an auto-stop check for testing purposes.

#### `POST /api/instances/auto-stop/trigger`

**Request Body:**
```json
{
  "dryRun": true  // Optional, defaults to true for safety
}
```

**Request Schema:**
- `dryRun` (boolean, optional): Whether to perform a dry run without actually stopping instances (default: true)

**Response (200 OK):**
```json
{
  "message": "Auto-stop check queued successfully",
  "dryRun": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 13. Cache Management

Manage service caches for performance optimization.

#### `GET /api/cache/stats`

Get comprehensive cache statistics.

**Response (200 OK):**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "cacheManager": {
    "cacheNames": ["instances", "products", "templates"],
    "stats": {
      "instances": {
        "size": 150,
        "hitRatio": 0.85,
        "hits": 1200,
        "misses": 200
      }
    }
  },
  "services": {
    "instance": {
      "instanceDetailsCache": {
        "size": 50,
        "hitRatio": 0.90
      }
    }
  },
  "summary": {
    "totalCaches": 3,
    "totalEntries": 200,
    "totalHits": 1500,
    "totalMisses": 300,
    "overallHitRatio": 0.83
  }
}
```

#### `POST /api/cache/clear`

Clear all caches or a specific cache.

**Request Body:**
```json
{
  "cacheName": "instances"  // Optional: clear specific cache
}
```

**Response (200 OK):**
```json
{
  "message": "Cache 'instances' cleared successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 14. Metrics

Get application performance metrics.

#### `GET /api/metrics`

Get comprehensive application metrics.

**Response (200 OK):**
```json
{
  "status": "success",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "requests": {
      "total": {
        "count": 1500,
        "rate": 45.2
      },
      "byStatus": {
        "2xx": 1350,
        "4xx": 100,
        "5xx": 50
      }
    },
    "jobs": {
      "total": {
        "processed": 250,
        "rate": 12.5
      },
      "byType": {
        "create_instance": 100,
        "monitor_instance": 120,
        "send_webhook": 30
      }
    },
    "system": {
      "memory": {
        "heapUsed": 268435456,
        "heapTotal": 536870912,
        "external": 67108864,
        "rss": 335544320
      },
      "cpu": {
        "usage": 15.5,
        "loadAverage": [0.8, 0.9, 1.1]
      },
      "uptime": 3600
    },
    "cache": {
      "hitRatio": 0.83,
      "totalSize": 200
    }
  }
}
```

#### `GET /api/metrics/summary`

Get summarized metrics for monitoring.

**Response (200 OK):**
```json
{
  "status": "success",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "performance": {
      "requestsPerMinute": 45.2,
      "averageResponseTimeMs": 120,
      "errorRatePercent": 6.67
    },
    "jobs": {
      "processingRatePerMinute": 12.5
    },
    "system": {
      "memoryUsageMB": 256,
      "cpuUsagePercent": 15.5,
      "uptimeSeconds": 3600
    },
    "cache": {
      "hitRatePercent": 83,
      "totalSize": 200
    }
  }
}
```

## Instance Status Values

Instances can have the following status values:

- `creating` - Instance is being created
- `created` - Instance created but not started
- `starting` - Instance is starting up
- `running` - Instance is running but may not be ready
- `health_checking` - Health checks are in progress
- `ready` - Instance is ready and healthy
- `stopping` - Instance is being stopped
- `stopped` - Instance is stopped
- `failed` - Instance creation or operation failed
- `terminated` - Instance has been terminated
- `exited` - Instance has exited

## Auto-Stop Feature

The API includes an automatic instance shutdown feature that stops running instances when they haven't been used for a configurable period (default: 20 minutes).

### How It Works

1. **Last Used Tracking**: Clients update the last used time via `PUT /api/instances/{instanceId}/last-used`
2. **Background Monitoring**: Service checks for inactive instances every 5 minutes
3. **Automatic Shutdown**: Instances inactive for over 20 minutes are automatically stopped
4. **Cost Optimization**: Prevents instances from running idle and incurring unnecessary costs

### Client Integration

Update the last used time whenever actively using an instance:

```javascript
// Mark instance as used
async function markInstanceAsUsed(instanceId) {
  await fetch(`/api/instances/${instanceId}/last-used`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  });
}

// For long-running tasks, update periodically
setInterval(() => markInstanceAsUsed(instanceId), 10 * 60 * 1000); // Every 10 minutes
```

### Monitoring Auto-Stop

- Check auto-stop statistics: `GET /api/instances/auto-stop/stats`
- Trigger manual checks: `POST /api/instances/auto-stop/trigger`
- Instance details include `lastUsedAt` timestamp

## Webhook Notifications

When a `webhookUrl` is provided, the service will send HTTP POST notifications for status changes:

### Webhook Payload
```json
{
  "instanceId": "inst_abc123def456",
  "status": "ready",
  "timestamp": "2024-01-15T10:35:00.000Z",
  "data": {
    "id": "inst_abc123def456",
    "name": "my-gpu-instance",
    "status": "ready",
    "portMappings": [
      {
        "port": 8888,
        "endpoint": "https://abc123.novita.ai:8888",
        "type": "jupyter"
      }
    ],
    "connectionDetails": {
      "jupyter": "https://abc123.novita.ai:8888"
    }
  }
}
```

### Webhook Security

If `WEBHOOK_SECRET` is configured, webhooks include a signature header:
```http
X-Signature-SHA256: sha256=<hmac_signature>
```

## Error Codes

Common error codes and their meanings:

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Request validation failed | 400 |
| `INSTANCE_NOT_FOUND` | Instance does not exist | 404 |
| `INSTANCE_ALREADY_EXISTS` | Instance name already in use | 409 |
| `NOVITA_API_ERROR` | Novita.ai API error | 502 |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | 429 |
| `CIRCUIT_BREAKER_OPEN` | Circuit breaker is open | 503 |
| `REQUEST_TIMEOUT` | Request timeout | 408 |
| `INTERNAL_SERVER_ERROR` | Internal server error | 500 |
| `FEATURE_DISABLED` | Feature is disabled | 404 |
| `CACHE_ERROR` | Cache operation failed | 500 |

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default Limits**: 100 requests per minute per IP
- **Headers**: Rate limit information is included in response headers:
  ```http
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1642248600
  ```

## Best Practices

### 1. Request IDs
Always include `X-Request-ID` headers for better debugging:
```http
X-Request-ID: req_$(date +%s)_$(uuidgen)
```

### 2. Error Handling
Implement proper error handling with retries:
```javascript
const maxRetries = 3;
let attempt = 0;

while (attempt < maxRetries) {
  try {
    const response = await fetch('/api/instances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': `req_${Date.now()}_${Math.random()}`
      },
      body: JSON.stringify(instanceConfig)
    });
    
    if (response.ok) {
      return await response.json();
    }
    
    if (response.status === 429) {
      // Rate limited - wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
      attempt++;
      continue;
    }
    
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  } catch (error) {
    if (attempt === maxRetries - 1) throw error;
    attempt++;
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  }
}
```

### 3. Polling for Status
When waiting for instance readiness, use exponential backoff:
```javascript
async function waitForInstanceReady(instanceId, maxWaitTime = 600000) {
  const startTime = Date.now();
  let delay = 2000; // Start with 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`/api/instances/${instanceId}`);
    const instance = await response.json();
    
    if (instance.status === 'ready') {
      return instance;
    }
    
    if (instance.status === 'failed') {
      throw new Error('Instance failed to start');
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 30000); // Max 30 seconds
  }
  
  throw new Error('Timeout waiting for instance to be ready');
}
```

### 4. Webhook Verification
Verify webhook signatures when using webhook secrets:
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

## Client Libraries

### Node.js/JavaScript
```bash
npm install axios  # For HTTP requests
```

### Python
```bash
pip install requests  # For HTTP requests
pip install httpx     # Alternative async HTTP client
```

### cURL Examples
```bash
# Create instance
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: req_$(date +%s)" \
  -d '{
    "name": "test-instance",
    "productName": "RTX 4090 24GB",
    "templateId": "pytorch-jupyter"
  }'

# Get instance status
curl -X GET http://localhost:3000/api/instances/inst_abc123def456 \
  -H "X-Request-ID: req_$(date +%s)"

# List instances
curl -X GET http://localhost:3000/api/instances \
  -H "X-Request-ID: req_$(date +%s)"
```

## Health and Monitoring

### Health Check

Monitor service health and Redis status.

#### `GET /health`

**Response (200 OK - Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "novitaApi": "up",
    "jobQueue": "up",
    "cache": "up",
    "migrationService": "up",
    "redis": "up"
  },
  "uptime": 3600,
  "performance": {
    "requestsPerMinute": 45.2,
    "averageResponseTime": 120,
    "errorRate": 0.01,
    "jobProcessingRate": 2.5
  },
  "system": {
    "memory": {
      "usedMB": 256,
      "totalMB": 512,
      "externalMB": 45,
      "rss": 280
    },
    "cpu": {
      "usage": 15.5,
      "loadAverage": [0.8, 0.9, 1.1]
    }
  },
  "redis": {
    "available": true,
    "healthy": true,
    "cacheManager": {
      "available": true,
      "configuration": {
        "defaultBackend": "fallback",
        "enableFallback": true,
        "cacheCount": 3,
        "redisConnected": true
      }
    }
  },
  "dependencies": {
    "redis": {
      "status": "up",
      "responseTime": 45,
      "pingResult": "PONG",
      "isHealthy": true,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    "novitaApi": {
      "status": "up",
      "responseTime": 250,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    "jobQueue": {
      "status": "up",
      "queueSize": 5,
      "processing": 2,
      "completed": 150,
      "failed": 3,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    "cache": {
      "status": "up",
      "instanceCache": {
        "size": 25,
        "hitRatio": 85
      },
      "instanceStatesCache": {
        "size": 30,
        "hitRatio": 92
      },
      "totalStates": 25,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Response (503 Service Unavailable - Unhealthy):**
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "novitaApi": "down",
    "jobQueue": "up",
    "cache": "up",
    "migrationService": "up",
    "redis": "down"
  },
  "uptime": 3600
}
```