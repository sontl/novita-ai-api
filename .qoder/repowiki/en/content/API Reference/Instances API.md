# Instances API

<cite>
**Referenced Files in This Document**   
- [instances.ts](file://src/routes/instances.ts)
- [api.ts](file://src/types/api.ts)
- [validation.ts](file://src/types/validation.ts)
- [errorHandler.ts](file://src/middleware/errorHandler.ts)
- [webhookClient.ts](file://src/clients/webhookClient.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [POST /api/instances](#post-ap-instances)
5. [GET /api/instances/:instanceId](#get-ap-instancesinstanceid)
6. [GET /api/instances](#get-ap-instances)
7. [Webhook Integration](#webhook-integration)
8. [Error Handling](#error-handling)
9. [Examples](#examples)

## Introduction
The Instances API provides endpoints for managing GPU instances within the Novita platform. This API allows users to create, retrieve, and list GPU instances with various configuration options. The API follows RESTful principles and returns JSON responses with appropriate HTTP status codes.

The core functionality revolves around instance lifecycle management, from creation through to monitoring and retrieval of instance details. The API supports webhook notifications for asynchronous status updates and implements comprehensive error handling with detailed validation feedback.

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L1-L132)

## Authentication
All API requests require authentication via an API key sent in the Authorization header using the Bearer scheme. The API key must be included in every request to access protected endpoints.

```http
Authorization: Bearer YOUR_API_KEY_HERE
```

The API key should be kept confidential and not exposed in client-side code or public repositories. Unauthorized requests without a valid API key will receive a 401 Unauthorized response.

**Section sources**
- [errorHandler.ts](file://src/middleware/errorHandler.ts#L1-L286)

## Rate Limiting
The API implements rate limiting to ensure fair usage and prevent abuse. Clients are subject to request limits based on their account type and subscription level.

When a client exceeds the rate limit, the API returns a 429 Too Many Requests status code with a Retry-After header indicating when the client can make another request. The Retry-After header value is in seconds.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

Rate limiting is applied per API key, allowing for consistent tracking of usage across requests. Clients should implement exponential backoff strategies when encountering rate limit responses to improve success rates for subsequent requests.

**Section sources**
- [errorHandler.ts](file://src/middleware/errorHandler.ts#L1-L286)
- [api.ts](file://src/types/api.ts#L1-L308)

## POST /api/instances
Creates a new GPU instance with the specified configuration. Returns a 201 Created response with instance details upon successful creation.

### Request Body Schema (CreateInstanceRequest)
The request body must be a JSON object with the following properties:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| name | string | Yes | - | Instance name (1-100 chars, alphanumeric, hyphens, underscores only) |
| productName | string | Yes | - | Product name specifying GPU type and configuration |
| templateId | string | Yes | - | Template ID for the instance configuration |
| gpuNum | number | No | 1 | Number of GPUs (1-8) |
| rootfsSize | number | No | 60 | Root filesystem size in GB (20-1000) |
| region | string | No | CN-HK-01 | Region for instance deployment |
| webhookUrl | string | No | - | Webhook URL for instance ready notifications |

### Response (201 Created)
Returns a CreateInstanceResponse object with the following schema:

```json
{
  "instanceId": "string",
  "status": "creating",
  "message": "Instance creation initiated successfully",
  "estimatedReadyTime": "string (ISO 8601)"
}
```

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L1-L132)
- [validation.ts](file://src/types/validation.ts#L1-L224)
- [api.ts](file://src/types/api.ts#L1-L308)

## GET /api/instances/:instanceId
Retrieves detailed information about a specific instance by its ID.

### Path Parameter
- **instanceId**: The unique identifier of the instance (alphanumeric, hyphens, underscores only)

### Response Schema (InstanceDetails)
Returns an InstanceDetails object with complete instance information:

```json
{
  "id": "string",
  "name": "string",
  "status": "string",
  "gpuNum": "number",
  "region": "string",
  "portMappings": [
    {
      "port": "number",
      "endpoint": "string",
      "type": "string"
    }
  ],
  "connectionDetails": {
    "ssh": "string",
    "jupyter": "string"
  },
  "createdAt": "string (ISO 8601)",
  "readyAt": "string (ISO 8601)"
}
```

### Polling Pattern for Instance Readiness
Clients should implement a polling mechanism to track instance status from 'creating' to 'running':

1. Immediately after instance creation, status is 'creating'
2. Poll GET /api/instances/:instanceId every 5-10 seconds
3. Continue polling while status is 'creating' or 'starting'
4. When status changes to 'running', instance is ready for use
5. If status becomes 'failed', instance creation encountered an error

The estimatedReadyTime field in the creation response provides guidance on when the instance is expected to be ready.

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L1-L132)
- [api.ts](file://src/types/api.ts#L1-L308)

## GET /api/instances
Lists all managed instances with basic information.

### Query Parameters
- **page**: Page number (default: 1)
- **pageSize**: Number of items per page (default: 20, max: 100)
- **status**: Filter by status (creating, starting, running, failed, stopped)

### Response Schema (ListInstancesResponse)
Returns a list of instances with pagination information:

```json
{
  "instances": [
    {
      "id": "string",
      "name": "string",
      "status": "string",
      "gpuNum": "number",
      "region": "string",
      "portMappings": [],
      "createdAt": "string (ISO 8601)"
    }
  ],
  "total": "number"
}
```

Instances are sorted by creation time (newest first). The total field indicates the total number of instances across all pages.

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L1-L132)
- [api.ts](file://src/types/api.ts#L1-L308)

## Webhook Integration
The API supports webhook notifications for instance lifecycle events. When an instance becomes ready, a webhook can be sent to the specified URL.

### Webhook Configuration
Include the webhookUrl parameter in the CreateInstanceRequest:

```json
{
  "name": "my-instance",
  "productName": "RTX 4090 24GB",
  "templateId": "template-123",
  "webhookUrl": "https://your-service.com/webhook"
}
```

### Webhook Payload
When the instance status changes to 'running', a POST request is sent to the webhook URL with the following payload:

```json
{
  "instanceId": "string",
  "status": "running",
  "timestamp": "string (ISO 8601)",
  "novitaInstanceId": "string",
  "elapsedTime": "number",
  "data": "object"
}
```

### Security
Webhook requests include signature headers for verification:
- X-Webhook-Signature: HMAC-SHA256 signature of the payload
- X-Webhook-Timestamp: Unix timestamp of the request

The signature can be verified using the shared secret configured in the system.

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L1-L242)
- [instances.ts](file://src/routes/instances.ts#L1-L132)

## Error Handling
The API returns standardized error responses for all error conditions.

### Error Response Schema
All errors follow the ErrorResponse format:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "timestamp": "string (ISO 8601)",
    "requestId": "string"
  }
}
```

### Validation Errors (400)
Returned when request validation fails. Includes detailed validation error information:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "requestId": "req-123",
    "validationErrors": [
      {
        "field": "name",
        "message": "Name must contain only alphanumeric characters, hyphens, and underscores"
      }
    ]
  }
}
```

### Not Found Errors (404)
Returned when requesting a non-existent instance:

```json
{
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance not found: inst_999",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "requestId": "req-123"
  }
}
```

### Other Error Codes
- **401 Unauthorized**: Missing or invalid API key
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Internal server error
- **503 Service Unavailable**: Service temporarily unavailable

**Section sources**
- [errorHandler.ts](file://src/middleware/errorHandler.ts#L1-L286)
- [api.ts](file://src/types/api.ts#L1-L308)

## Examples
### Create Instance (Success)
**Request:**
```http
POST /api/instances
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "name": "cuda-dev-instance",
  "productName": "RTX 4090 24GB",
  "templateId": "template-cuda-dev",
  "gpuNum": 1,
  "rootfsSize": 60,
  "region": "CN-HK-01",
  "webhookUrl": "https://example.com/webhook"
}
```

**Response (201 Created):**
```json
{
  "instanceId": "inst_123",
  "status": "creating",
  "message": "Instance creation initiated successfully",
  "estimatedReadyTime": "2023-01-01T00:05:00.000Z"
}
```

### Get Instance Status (Success)
**Request:**
```http
GET /api/instances/inst_123
Authorization: Bearer YOUR_API_KEY
```

**Response (200 OK):**
```json
{
  "id": "inst_123",
  "name": "cuda-dev-instance",
  "status": "running",
  "gpuNum": 1,
  "region": "CN-HK-01",
  "portMappings": [
    {
      "port": 8080,
      "endpoint": "https://example.com:8080",
      "type": "http"
    }
  ],
  "connectionDetails": {
    "ssh": "ssh user@example.com",
    "jupyter": "https://example.com:8888"
  },
  "createdAt": "2023-01-01T00:00:00.000Z",
  "readyAt": "2023-01-01T00:05:00.000Z"
}
```

### Validation Error (400)
**Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "requestId": "req-123",
    "validationErrors": [
      {
        "field": "name",
        "message": "Name must contain only alphanumeric characters, hyphens, and underscores"
      }
    ]
  }
}
```

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L1-L132)
- [api.ts](file://src/types/api.ts#L1-L308)
- [validation.ts](file://src/types/validation.ts#L1-L224)