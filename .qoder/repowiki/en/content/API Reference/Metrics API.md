# Metrics API

<cite>
**Referenced Files in This Document**   
- [metrics.ts](file://src/routes/metrics.ts)
- [metricsService.ts](file://src/services/metricsService.ts)
- [metricsMiddleware.ts](file://src/middleware/metricsMiddleware.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication and Security](#authentication-and-security)
3. [GET /api/metrics](#get-apimetrics)
4. [GET /api/metrics/summary](#get-apimetricssummary)
5. [GET /api/metrics/system](#get-apimetricssystem)
6. [POST /api/metrics/reset](#post-apimetricsreset)
7. [Error Handling](#error-handling)
8. [Integration with Monitoring Tools](#integration-with-monitoring-tools)
9. [Best Practices](#best-practices)

## Introduction
The Metrics API provides comprehensive monitoring capabilities for the application, exposing detailed performance, system, and operational metrics. These endpoints are designed for integration with monitoring systems, health checks, and administrative operations. The metrics are automatically collected through middleware and updated in real-time as requests and jobs are processed.

The API offers four endpoints:
- `GET /api/metrics`: Comprehensive metrics including request, job, cache, and system data
- `GET /api/metrics/summary`: Simplified metrics for monitoring dashboards
- `GET /api/metrics/system`: Node.js process-level system metrics
- `POST /api/metrics/reset`: Administrative endpoint to reset all metrics counters

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L1-L187)

## Authentication and Security
All Metrics API endpoints require authentication using the same mechanism as other protected endpoints in the application. Requests must include valid credentials in the appropriate header (typically `Authorization` with a Bearer token).

The `POST /api/metrics/reset` endpoint has additional security requirements and is restricted to users with elevated privileges (administrative role). This restriction prevents unauthorized resetting of metrics counters, which could interfere with monitoring and alerting systems.

Rate limiting is applied to all metrics endpoints according to the application's global rate limiting configuration, with a default window of 600,000 milliseconds (10 minutes) and a maximum of 200 requests per window. This prevents abuse while allowing sufficient access for monitoring tools.

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L132-L187)
- [config/README.md](file://src/config/README.md#L107-L139)

## GET /api/metrics
Retrieves comprehensive application metrics including request statistics, job processing data, cache performance, and system information.

### Request
```
GET /api/metrics
Authorization: Bearer <token>
X-Request-ID: <optional-request-id>
```

### Response Structure
The response includes a complete breakdown of application metrics:

```json
{
  "status": "success",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "data": {
    "requests": {
      "total": {
        "count": 1500,
        "totalDuration": 750000,
        "averageDuration": 500,
        "minDuration": 100,
        "maxDuration": 2000,
        "statusCodes": {
          "200": 1200,
          "404": 250,
          "500": 50
        },
        "lastRequest": "2023-12-07T10:29:59.000Z"
      },
      "byEndpoint": {
        "GET /api/instances/:id": {
          "count": 300,
          "averageDuration": 450,
          "statusCodes": {
            "200": 280,
            "404": 20
          }
        }
      },
      "byMethod": {
        "GET": {
          "count": 1000,
          "averageDuration": 400,
          "statusCodes": {
            "200": 800,
            "404": 200
          }
        }
      }
    },
    "jobs": {
      "total": {
        "processed": 200,
        "failed": 10,
        "averageProcessingTime": 1500,
        "totalProcessingTime": 300000,
        "minProcessingTime": 500,
        "maxProcessingTime": 5000,
        "queueSize": 5,
        "lastProcessed": "2023-12-07T10:29:30.000Z"
      },
      "byType": {
        "create_instance": {
          "processed": 150,
          "failed": 5,
          "averageProcessingTime": 1200
        }
      }
    },
    "system": {
      "memory": {
        "rss": 52428800,
        "heapTotal": 20971520,
        "heapUsed": 15728640,
        "external": 1048576,
        "arrayBuffers": 524288
      },
      "cpu": {
        "usage": 25.5,
        "loadAverage": [1.2, 1.5, 1.8]
      },
      "uptime": 3600,
      "timestamp": "2023-12-07T10:30:00.000Z"
    },
    "cache": {
      "hits": 800,
      "misses": 200,
      "hitRatio": 80,
      "totalSize": 5000
    }
  }
}
```

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L4-L46)
- [metricsService.ts](file://src/services/metricsService.ts#L100-L150)

## GET /api/metrics/summary
Returns a simplified view of key performance indicators for monitoring dashboards and health checks.

### Request
```
GET /api/metrics/summary
Authorization: Bearer <token>
```

### Response Structure
The summary endpoint provides essential metrics in a compact format:

```json
{
  "status": "success",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "data": {
    "performance": {
      "requestsPerMinute": 25.5,
      "averageResponseTimeMs": 500,
      "errorRatePercent": 16.7
    },
    "jobs": {
      "processingRatePerMinute": 3.3
    },
    "system": {
      "memoryUsageMB": 15,
      "cpuUsagePercent": 25.5,
      "uptimeSeconds": 3600
    },
    "cache": {
      "hitRatePercent": 80,
      "totalSize": 5000
    }
  }
}
```

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L48-L89)
- [metricsService.ts](file://src/services/metricsService.ts#L300-L350)

## GET /api/metrics/system
Retrieves Node.js process-level system metrics.

### Request
```
GET /api/metrics/system
Authorization: Bearer <token>
```

### Response Structure
Returns detailed system metrics from the Node.js process:

```json
{
  "status": "success",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "data": {
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576,
      "arrayBuffers": 524288
    },
    "cpu": {
      "usage": 25.5,
      "loadAverage": [1.2, 1.5, 1.8]
    },
    "uptime": 3600,
    "timestamp": "2023-12-07T10:30:00.000Z"
    }
}
```

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L91-L136)
- [metricsService.ts](file://src/services/metricsService.ts#L200-L250)

## POST /api/metrics/reset
Resets all metrics counters to zero. This administrative endpoint is intended for testing and debugging purposes.

### Request
```
POST /api/metrics/reset
Authorization: Bearer <admin-token>
```

### Response
On successful reset:

```json
{
  "status": "success",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "message": "All metrics have been reset"
}
```

**Security Considerations**
- This endpoint requires elevated privileges (administrative role)
- Access should be restricted to trusted administrators only
- Consider implementing additional audit logging for reset operations
- Not intended for production use except in debugging scenarios

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L138-L187)
- [metricsService.ts](file://src/services/metricsService.ts#L252-L280)

## Error Handling
All Metrics API endpoints follow a consistent error response format:

```json
{
  "status": "error",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "error": {
    "code": "METRICS_RETRIEVAL_FAILED",
    "message": "Failed to retrieve application metrics",
    "details": "Error details"
  }
}
```

### Error Codes
- `METRICS_RETRIEVAL_FAILED`: Failed to retrieve comprehensive metrics
- `METRICS_SUMMARY_FAILED`: Failed to retrieve metrics summary
- `SYSTEM_METRICS_FAILED`: Failed to retrieve system metrics
- `METRICS_RESET_FAILED`: Failed to reset metrics

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L20-L35)
- [metrics.ts](file://src/routes/metrics.ts#L65-L75)

## Integration with Monitoring Tools
The Metrics API can be integrated with popular monitoring tools:

### Prometheus
Configure Prometheus to scrape the `/api/metrics/summary` endpoint at regular intervals. The JSON response can be transformed into Prometheus metrics format using a middleware converter or Prometheus exporter.

### Grafana
Use Grafana's JSON API data source to connect to the Metrics API endpoints. Create dashboards using the following key metrics:
- Requests per minute (from `/api/metrics/summary`)
- Average response time (from `/api/metrics/summary`)
- Error rate percentage (from `/api/metrics/summary`)
- Memory usage (from `/api/metrics/system`)
- CPU usage (from `/api/metrics/system`)

**Section sources**
- [metrics.ts](file://src/routes/metrics.ts#L48-L89)
- [metricsService.ts](file://src/services/metricsService.ts#L300-L350)

## Best Practices
### Metrics Collection Intervals
- For real-time monitoring: Poll `/api/metrics/summary` every 15-30 seconds
- For long-term trend analysis: Poll `/api/metrics` every 5-10 minutes
- For system health checks: Poll `/api/metrics/system` every 30-60 seconds

### Caching Strategy
Consider implementing caching for metrics endpoints to reduce load on the application:
- Cache `/api/metrics/summary` for 15 seconds
- Cache `/api/metrics/system` for 30 seconds
- Avoid caching `/api/metrics` due to its comprehensive nature

### Alerting Thresholds
Recommended alert thresholds:
- Error rate > 10% for 5 consecutive minutes
- Average response time > 1000ms for 5 consecutive minutes
- CPU usage > 80% for 10 consecutive minutes
- Memory usage > 80% of available heap for 10 consecutive minutes

**Section sources**
- [metricsService.ts](file://src/services/metricsService.ts#L352-L392)
- [metricsMiddleware.ts](file://src/middleware/metricsMiddleware.ts#L1-L103)