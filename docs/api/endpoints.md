# API Endpoints Reference

Detailed documentation for all REST API endpoints in the Novita GPU Instance API.

## Base URL

```
http://localhost:3000  # Development
https://your-domain.com  # Production
```

## Health and System Endpoints

### Health Check

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

## Instance Management Endpoints

### Create Instance

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

### Get Instance Status

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

### List Instances

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

### Comprehensive Instance Listing

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

## Instance Control Endpoints

### Start Instance by ID

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

### Start Instance by Name

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

### Stop Instance by ID

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

### Stop Instance by Name

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

## Instance Maintenance Endpoints

### Update Last Used Time

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

## Auto-Stop Management Endpoints

### Auto-Stop Statistics

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

### Trigger Auto-Stop Check

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

## Cache Management Endpoints

### Cache Statistics

Get comprehensive cache statistics.

#### `GET /api/cache/stats`

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

### Clear Cache

Clear all caches or a specific cache.

#### `POST /api/cache/clear`

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

## Metrics Endpoints

### Application Metrics

Get comprehensive application metrics.

#### `GET /api/metrics`

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

### Metrics Summary

Get summarized metrics for monitoring.

#### `GET /api/metrics/summary`

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

## Error Response Format

All endpoints return consistent error responses:

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

## Common HTTP Status Codes

| Status Code | Description | When Used |
|-------------|-------------|-----------|
| 200 | OK | Successful GET, PUT, DELETE operations |
| 201 | Created | Successful POST operations (instance creation) |
| 202 | Accepted | Asynchronous operations (start/stop instance) |
| 400 | Bad Request | Validation errors, malformed requests |
| 404 | Not Found | Instance not found, endpoint not found |
| 409 | Conflict | Instance name already exists |
| 429 | Too Many Requests | Rate limiting exceeded |
| 500 | Internal Server Error | Unexpected server errors |
| 502 | Bad Gateway | External API errors (Novita.ai) |
| 503 | Service Unavailable | Service unhealthy, circuit breaker open |