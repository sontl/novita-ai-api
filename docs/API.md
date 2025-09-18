# Novita GPU Instance API Documentation

## Overview

The Novita GPU Instance API provides a simplified interface for creating and managing Novita.ai GPU instances with automated lifecycle management, optimal pricing selection, and webhook notifications.

## Base URL

```
http://localhost:3000
```

## Authentication

The API uses Novita.ai API keys for authentication. Configure your API key in the environment:

```bash
NOVITA_API_KEY=your_novita_api_key_here
```

## API Endpoints

### Health Check

#### GET /health

Returns the health status of the API service and its dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "dependencies": {
    "novitaApi": "healthy",
    "cache": "healthy"
  },
  "migrationService": {
    "enabled": true,
    "lastExecution": "2024-01-15T10:15:00.000Z",
    "nextExecution": "2024-01-15T10:30:00.000Z",
    "status": "healthy",
    "recentErrors": 0
  },
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK` - Service is healthy
- `503 Service Unavailable` - Service or dependencies are unhealthy

---

### Instance Management

#### POST /api/instances

Creates a new GPU instance with automatic lifecycle management.

**Request Body:**
```json
{
  "name": "my-gpu-instance",
  "productName": "RTX 4090 24GB",
  "templateId": "template-123",
  "gpuNum": 1,
  "rootfsSize": 60,
  "region": "CN-HK-01",
  "webhookUrl": "https://your-app.com/webhook"
}
```

**Request Parameters:**
- `name` (string, required) - Instance name
- `productName` (string, required) - GPU product name (e.g., "RTX 4090 24GB")
- `templateId` (string, required) - Template ID for configuration
- `gpuNum` (number, optional) - Number of GPUs (default: 1)
- `rootfsSize` (number, optional) - Root filesystem size in GB (default: 60)
- `region` (string, optional) - Preferred region (default: "CN-HK-01")
- `webhookUrl` (string, optional) - Notification webhook URL

**Response:**
```json
{
  "instanceId": "inst-abc123",
  "status": "creating",
  "message": "Instance creation initiated",
  "estimatedReadyTime": "2024-01-15T10:35:00.000Z"
}
```

**Status Codes:**
- `201 Created` - Instance creation initiated
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Invalid API key
- `500 Internal Server Error` - Server error

---

#### GET /api/instances/{instanceId}

Retrieves current status and details of a specific instance.

**Path Parameters:**
- `instanceId` (string, required) - The instance ID

**Response:**
```json
{
  "id": "inst-abc123",
  "name": "my-gpu-instance",
  "status": "running",
  "gpuNum": 1,
  "region": "CN-HK-01",
  "portMappings": [
    {
      "port": 8888,
      "endpoint": "https://inst-abc123.novita.ai:8888",
      "type": "jupyter"
    },
    {
      "port": 22,
      "endpoint": "ssh://inst-abc123.novita.ai:22",
      "type": "ssh"
    }
  ],
  "connectionDetails": {
    "ssh": "ssh root@inst-abc123.novita.ai",
    "jupyter": "https://inst-abc123.novita.ai:8888",
    "webTerminal": "https://inst-abc123.novita.ai:7681"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "readyAt": "2024-01-15T10:33:45.000Z"
}
```

**Status Codes:**
- `200 OK` - Instance details retrieved
- `404 Not Found` - Instance not found
- `500 Internal Server Error` - Server error

---

#### GET /api/instances

Lists all managed instances with their current status.

**Query Parameters:**
- `status` (string, optional) - Filter by status (creating, starting, running, failed, stopped)
- `limit` (number, optional) - Maximum number of instances to return (default: 50)
- `offset` (number, optional) - Number of instances to skip (default: 0)

**Response:**
```json
{
  "instances": [
    {
      "id": "inst-abc123",
      "name": "my-gpu-instance",
      "status": "running",
      "gpuNum": 1,
      "region": "CN-HK-01",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "readyAt": "2024-01-15T10:33:45.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Status Codes:**
- `200 OK` - Instances retrieved
- `500 Internal Server Error` - Server error

---

### Metrics

#### GET /api/metrics

Returns operational metrics for monitoring and observability.

**Response:**
```json
{
  "requests": {
    "total": 1250,
    "successful": 1180,
    "failed": 70,
    "averageResponseTime": 245
  },
  "instances": {
    "total": 15,
    "creating": 2,
    "running": 10,
    "failed": 3
  },
  "jobs": {
    "pending": 5,
    "processing": 2,
    "completed": 1200,
    "failed": 48
  },
  "cache": {
    "hits": 850,
    "misses": 400,
    "hitRate": 0.68
  },
  "system": {
    "uptime": 86400,
    "memoryUsage": {
      "used": 256,
      "total": 512,
      "percentage": 50
    }
  }
}
```

**Status Codes:**
- `200 OK` - Metrics retrieved
- `500 Internal Server Error` - Server error

---

### Migration Management

#### GET /api/migration/status

Returns the current status of the spot instance migration service.

**Response:**
```json
{
  "enabled": true,
  "lastExecution": {
    "startedAt": "2024-01-15T10:15:00.000Z",
    "completedAt": "2024-01-15T10:16:30.000Z",
    "duration": 90000,
    "status": "completed"
  },
  "nextExecution": "2024-01-15T10:30:00.000Z",
  "statistics": {
    "totalExecutions": 48,
    "successfulExecutions": 46,
    "failedExecutions": 2,
    "totalInstancesProcessed": 1250,
    "totalMigrations": 23,
    "averageExecutionTime": 85000
  },
  "configuration": {
    "intervalMinutes": 15,
    "maxConcurrent": 5,
    "dryRunMode": false,
    "retryFailed": true
  }
}
```

**Status Codes:**
- `200 OK` - Migration status retrieved
- `500 Internal Server Error` - Server error

---

#### POST /api/migration/trigger

Manually triggers a migration job execution (for testing or immediate migration needs).

**Request Body:**
```json
{
  "dryRun": false,
  "maxMigrations": 10
}
```

**Request Parameters:**
- `dryRun` (boolean, optional) - Run in dry-run mode without executing migrations
- `maxMigrations` (number, optional) - Limit the number of migrations in this execution

**Response:**
```json
{
  "jobId": "migration-job-abc123",
  "status": "queued",
  "message": "Migration job queued for execution",
  "estimatedStartTime": "2024-01-15T10:31:00.000Z"
}
```

**Status Codes:**
- `202 Accepted` - Migration job queued
- `400 Bad Request` - Invalid request parameters
- `409 Conflict` - Migration job already in progress
- `500 Internal Server Error` - Server error

---

#### GET /api/migration/history

Returns the history of recent migration job executions.

**Query Parameters:**
- `limit` (number, optional) - Maximum number of executions to return (default: 20, max: 100)
- `offset` (number, optional) - Number of executions to skip (default: 0)
- `status` (string, optional) - Filter by execution status (completed, failed, running)

**Response:**
```json
{
  "executions": [
    {
      "jobId": "migration-job-abc123",
      "startedAt": "2024-01-15T10:15:00.000Z",
      "completedAt": "2024-01-15T10:16:30.000Z",
      "status": "completed",
      "duration": 90000,
      "summary": {
        "totalInstances": 45,
        "exitedInstances": 3,
        "eligibleInstances": 2,
        "migratedInstances": 2,
        "skippedInstances": 1,
        "errorCount": 0
      },
      "errors": []
    }
  ],
  "total": 48,
  "limit": 20,
  "offset": 0
}
```

**Status Codes:**
- `200 OK` - Migration history retrieved
- `500 Internal Server Error` - Server error

---

## Instance Status Values

- `creating` - Instance is being created via Novita.ai API
- `starting` - Instance has been created and is starting up
- `running` - Instance is fully operational and ready for use
- `failed` - Instance creation or startup failed
- `stopped` - Instance has been stopped
- `exited` - Instance has been terminated (potentially eligible for migration)

## Webhook Notifications

When a webhook URL is provided, the service will send POST requests to notify about instance status changes.

### Webhook Payload - Success

```json
{
  "event": "instance.ready",
  "instanceId": "inst-abc123",
  "status": "running",
  "timestamp": "2024-01-15T10:33:45.000Z",
  "instance": {
    "id": "inst-abc123",
    "name": "my-gpu-instance",
    "connectionDetails": {
      "ssh": "ssh root@inst-abc123.novita.ai",
      "jupyter": "https://inst-abc123.novita.ai:8888"
    }
  }
}
```

### Webhook Payload - Failure

```json
{
  "event": "instance.failed",
  "instanceId": "inst-abc123",
  "status": "failed",
  "timestamp": "2024-01-15T10:40:00.000Z",
  "error": {
    "code": "STARTUP_TIMEOUT",
    "message": "Instance failed to start within 10 minutes"
  }
}
```

### Webhook Payload - Migration

```json
{
  "event": "instance.migrated",
  "instanceId": "inst-abc123",
  "originalInstanceId": "inst-xyz789",
  "status": "running",
  "timestamp": "2024-01-15T10:45:00.000Z",
  "migration": {
    "reason": "spot_reclaim",
    "triggeredBy": "automatic_migration",
    "migrationTime": 45000
  },
  "instance": {
    "id": "inst-abc123",
    "name": "migrated-gpu-instance",
    "connectionDetails": {
      "ssh": "ssh root@inst-abc123.novita.ai",
      "jupyter": "https://inst-abc123.novita.ai:8888"
    }
  }
}
```

## Error Responses

All error responses follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "productName",
      "reason": "Product name is required"
    },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req-xyz789"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` - Invalid request parameters
- `AUTHENTICATION_ERROR` - Invalid or missing API key
- `INSTANCE_NOT_FOUND` - Requested instance does not exist
- `NOVITA_API_ERROR` - Error from Novita.ai API
- `RATE_LIMIT_EXCEEDED` - API rate limit exceeded
- `MIGRATION_ERROR` - Error during instance migration
- `MIGRATION_JOB_CONFLICT` - Migration job already in progress
- `INTERNAL_ERROR` - Internal server error

## Rate Limiting

The API implements rate limiting to protect against abuse:

- **Instance Creation**: 10 requests per minute per IP
- **Status Queries**: 100 requests per minute per IP
- **General API**: 1000 requests per hour per IP

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1642248600
```

## Examples

See the [Usage Examples](./EXAMPLES.md) document for detailed code examples and common use cases.