# Instance Management API

This document describes the instance management API endpoints that allow you to manage GPU instances, including stopping and deleting them from both the local service and Novita.ai.

## Overview

The instance management API provides endpoints for managing instances:

1. **Stopping instances:**
   - `POST /api/instances/:instanceId/stop` - Stop by instance ID
   - `POST /api/instances/stop` - Stop by instance name

2. **Deleting instances:**
   - `DELETE /api/instances/:instanceId` - Delete by instance ID
   - `POST /api/instances/delete` - Delete by instance name

Stopping an instance pauses its execution, while deleting permanently removes it from Novita.ai and the local service state.

## Stop API Endpoints

### 1. Stop Instance by ID

**Endpoint:** `POST /api/instances/:instanceId/stop`

**Description:** Stop a specific instance using its unique instance ID.

**Request Body:**
```json
{
  "webhookUrl": "https://example.com/webhook" // optional
}
```

**Request Headers:**
- `Content-Type: application/json`
- `x-request-id: string` (optional, for request tracking)
- `x-correlation-id: string` (optional, for correlation tracking)

**Response (200 OK):**
```json
{
  "instanceId": "inst_1234567890_abc123",
  "novitaInstanceId": "novita-instance-id",
  "status": "stopped",
  "message": "Instance stopped successfully",
  "operationId": "stop_1234567890_xyz789"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/instances/inst_1234567890_abc123/stop" \
  -H "Content-Type: application/json" \
  -H "x-request-id: stop-req-123" \
  -d '{
    "webhookUrl": "https://example.com/webhook"
  }'
```

### 2. Stop Instance by Name

**Endpoint:** `POST /api/instances/stop`

**Description:** Stop an instance using its name instead of ID.

**Request Body:**
```json
{
  "instanceName": "my-gpu-instance", // required
  "webhookUrl": "https://example.com/webhook" // optional
}
```

**Request Headers:**
- `Content-Type: application/json`
- `x-request-id: string` (optional, for request tracking)
- `x-correlation-id: string` (optional, for correlation tracking)

**Response (200 OK):**
```json
{
  "instanceId": "inst_1234567890_abc123",
  "novitaInstanceId": "novita-instance-id", 
  "status": "stopped",
  "message": "Instance stopped successfully",
  "operationId": "stop_1234567890_xyz789"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/instances/stop" \
  -H "Content-Type: application/json" \
  -H "x-request-id: stop-name-req-123" \
  -d '{
    "instanceName": "my-gpu-instance",
    "webhookUrl": "https://example.com/webhook"
  }'
```

## Delete API Endpoints

### 1. Delete Instance by ID

**Endpoint:** `DELETE /api/instances/:instanceId`

**Description:** Delete a specific instance using its unique instance ID.

**Request Body:**
```json
{
  "webhookUrl": "https://example.com/webhook"  // Optional
}
```

**Request Headers:**
- `Content-Type: application/json`
- `x-request-id: string` (optional, for request tracking)
- `x-correlation-id: string` (optional, for correlation tracking)

**Response (200 OK):**
```json
{
  "instanceId": "inst_1234567890_abc123",
  "novitaInstanceId": "novita-instance-456",
  "status": "deleted",
  "message": "Instance deleted successfully",
  "operationId": "startup_1234567890_def456"
}
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:3000/api/instances/inst_1234567890_abc123" \
  -H "Content-Type: application/json" \
  -H "x-request-id: delete-req-123" \
  -d '{
    "webhookUrl": "https://example.com/webhook"
  }'
```

### 2. Delete Instance by Name

**Endpoint:** `POST /api/instances/delete`

**Description:** Delete an instance using its name instead of ID.

**Request Body:**
```json
{
  "instanceName": "my-gpu-instance",     // Required
  "webhookUrl": "https://example.com/webhook"  // Optional
}
```

**Request Headers:**
- `Content-Type: application/json`
- `x-request-id: string` (optional, for request tracking)
- `x-correlation-id: string` (optional, for correlation tracking)

**Response (200 OK):**
```json
{
  "instanceId": "inst_1234567890_abc123",
  "novitaInstanceId": "novita-instance-456", 
  "status": "deleted",
  "message": "Instance deleted successfully",
  "operationId": "startup_1234567890_def456"
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/instances/delete" \
  -H "Content-Type: application/json" \
  -H "x-request-id: delete-name-req-123" \
  -d '{
    "instanceName": "my-gpu-instance",
    "webhookUrl": "https://example.com/webhook"
  }'
```

## Request Validation

### Instance ID Validation
- Must contain only alphanumeric characters, hyphens, and underscores
- Cannot be empty

### Instance Name Validation  
- Must be 1-100 characters long
- Must contain only alphanumeric characters, hyphens, and underscores
- Required when using name-based operations

### Webhook URL Validation
- Must be a valid HTTP or HTTPS URL
- Optional parameter

## Error Responses

### 400 Bad Request - Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req-123",
    "validationErrors": [
      {
        "field": "instanceName",
        "message": "Instance name is required for name-based operation",
        "value": undefined
      }
    ]
  }
}
```

### 404 Not Found - Instance Not Found
```json
{
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance not found: inst_1234567890_abc123",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req-123"
  }
}
```

### 400 Bad Request - Instance Not Operable
```json
{
  "error": {
    "code": "INSTANCE_NOT_OPERABLE", 
    "message": "Instance has not been created in Novita.ai yet and cannot be operated",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req-123"
  }
}
```

### 500 Internal Server Error - Novita.ai API Error
```json
{
  "error": {
    "code": "NOVITA_API_ERROR",
    "message": "Failed to perform operation via Novita.ai API",
    "timestamp": "2024-01-15T10:30:00.000Z", 
    "requestId": "req-123"
  }
}
```

## Webhook Notifications

If a webhook URL is provided (either in the request or stored with the instance), a notification will be sent after successful operations.

### Stop Operation Webhook Payload:
```json
{
  "instanceId": "inst_1234567890_abc123",
  "status": "stopped",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "novitaInstanceId": "novita-instance-456",
  "operationId": "stop_1234567890_xyz789",
  "reason": "Instance stopped successfully"
}
```

### Delete Operation Webhook Payload:
```json
{
  "instanceId": "inst_1234567890_abc123",
  "status": "deleted",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "novitaInstanceId": "novita-instance-456",
  "operationId": "startup_1234567890_def456",
  "reason": "Instance deleted successfully"
}
```

**Webhook Headers:**
- `Content-Type: application/json`
- `User-Agent: Novita-GPU-Instance-API/1.0`
- `X-Webhook-Signature: sha256=<signature>` (if webhook secret is configured)
- `X-Webhook-Timestamp: <unix_timestamp>` (if webhook secret is configured)

## Behavior and Side Effects

### What Happens During Stop Operations

1. **Instance Lookup**: The service finds the instance by ID or name
2. **Validation**: Checks if the instance exists and can be stopped
3. **Novita.ai API Call**: Calls the Novita.ai stop instance API
4. **Status Update**: Updates the instance status to 'stopped'
5. **Webhook Notification**: Sends webhook notification if configured

### What Happens During Delete Operations

1. **Instance Lookup**: The service finds the instance by ID or name
2. **Validation**: Checks if the instance exists and can be deleted
3. **Novita.ai API Call**: Calls the Novita.ai delete instance API
4. **Local State Cleanup**: Removes the instance from local service state
5. **Webhook Notification**: Sends webhook notification if configured

### State Changes

**For Stop:**
- Instance state is updated to 'stopped' in local service memory
- Instance cache entries are updated
- Instance resources are paused but not freed

**For Delete:**
- Instance is permanently removed from Novita.ai
- Instance state is removed from local service memory
- Instance cache entries are cleared
- Instance cannot be recovered after deletion

### Limitations

- Only instances that have been successfully created in Novita.ai can be operated on
- Instances in "creating" state that haven't been assigned a Novita instance ID cannot be stopped or deleted
- Deletion is permanent and cannot be undone

## Implementation Details

### Type Definitions Added
- `StopInstanceRequest` interface in `src/types/api.ts`
- `StopInstanceResponse` interface in `src/types/api.ts`
- Added `stopping` and `stopped` timestamps to `InstanceState`

### Validation Schema
- `stopInstanceSchema` in `src/types/validation.ts`
- `validateStopInstance()` function for request validation
- Validates instanceName pattern and webhook URL format

### Service Layer
- `stopInstance()` method in `src/services/instanceService.ts`
- Supports both ID and name-based stopping
- Handles status transitions (running → stopping → stopped)
- Prevents duplicate stop operations
- Integrates with Novita.ai API via `novitaApiService.stopInstance()`

### Webhook Integration
- Added `sendStopNotification()` method to `src/clients/webhookClient.ts`
- Sends structured webhook notifications when instances are stopped
- Supports both request-specific and instance-configured webhook URLs

## Features

✅ **Dual Access Patterns**: Stop/Deletion by instance ID or instance name  
✅ **Webhook Notifications**: Optional webhook notifications for operations  
✅ **Idempotent Operations**: Safe to call multiple times  
✅ **Comprehensive Logging**: Detailed logging with correlation IDs  
✅ **Error Recovery**: Graceful error handling and user feedback  
✅ **Type Safety**: Full TypeScript support with validation  
✅ **Status Tracking**: Proper state transitions and timestamps  

## Testing

Use the provided test scripts to verify the endpoints:

```bash
# Test stop functionality
node test-stop-api.js

# Test delete functionality
node test-delete-api.js inst_1234567890_abc123

# Set custom API base URL for delete tests
API_BASE_URL=http://localhost:3000 node test-delete-api.js inst_1234567890_abc123
```

## Integration Examples

### Node.js/JavaScript for Stop
```javascript
const axios = require('axios');

async function stopInstance(instanceId) {
  try {
    const response = await axios.post(`http://localhost:3000/api/instances/${instanceId}/stop`, {
      webhookUrl: 'https://myapp.com/webhook'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `stop-${Date.now()}`
      }
    });
    
    console.log('Instance stopped:', response.data);
    return response.data;
  } catch (error) {
    console.error('Stop failed:', error.response?.data || error.message);
    throw error;
  }
}
```

### Python for Delete
```python
import requests
import json

def delete_instance(instance_name):
    url = "http://localhost:3000/api/instances/delete"
    headers = {
        'Content-Type': 'application/json',
        'x-request-id': f'delete-{int(time.time())}'
    }
    data = {
        'instanceName': instance_name,
        'webhookUrl': 'https://myapp.com/webhook'
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        print('Instance deleted:', response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print('Delete failed:', e)
        raise
```

## Security Considerations

- Ensure proper authentication/authorization before allowing stop/delete operations
- Validate webhook URLs to prevent SSRF attacks
- Use webhook signatures to verify webhook authenticity
- Log all operations for audit purposes
- Consider implementing soft delete for critical instances

## Related Documentation

- [API Client Reference](../API_CLIENT_REFERENCE.md)
- [API Endpoints Summary](../API_ENDPOINTS_SUMMARY.md)
- [Webhook Documentation](../WEBHOOK_DOCUMENTATION.md)
- [Error Handling Guide](../ERROR_HANDLING_GUIDE.md)