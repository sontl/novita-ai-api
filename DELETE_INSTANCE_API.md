# Delete Instance API

This document describes the delete instance API endpoints that allow you to permanently delete GPU instances from both the local service and Novita.ai.

## Overview

The delete instance API provides two endpoints for deleting instances:
1. **DELETE /api/instances/:instanceId** - Delete by instance ID
2. **POST /api/instances/delete** - Delete by instance name

Both endpoints permanently delete the instance from Novita.ai and remove it from the local service state.

## API Endpoints

### 1. Delete Instance by ID

**Endpoint:** `DELETE /api/instances/:instanceId`

**Description:** Delete a specific instance using its unique instance ID.

**Parameters:**
- `instanceId` (path parameter): The unique identifier of the instance to delete

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
- Required when using name-based deletion

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
    "requestId": "delete-req-123",
    "validationErrors": [
      {
        "field": "instanceName",
        "message": "Instance name is required for name-based deletion",
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
    "requestId": "delete-req-123"
  }
}
```

### 400 Bad Request - Instance Not Deletable
```json
{
  "error": {
    "code": "INSTANCE_NOT_DELETABLE", 
    "message": "Instance has not been created in Novita.ai yet and cannot be deleted",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "delete-req-123"
  }
}
```

### 500 Internal Server Error - Novita.ai API Error
```json
{
  "error": {
    "code": "NOVITA_API_ERROR",
    "message": "Failed to delete instance via Novita.ai API",
    "timestamp": "2024-01-15T10:30:00.000Z", 
    "requestId": "delete-req-123"
  }
}
```

## Webhook Notifications

If a webhook URL is provided (either in the request or stored with the instance), a delete notification will be sent after successful deletion.

**Webhook Payload:**
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

### What Happens During Deletion

1. **Instance Lookup**: The service finds the instance by ID or name
2. **Validation**: Checks if the instance exists and can be deleted
3. **Novita.ai API Call**: Calls the Novita.ai delete instance API
4. **Local State Cleanup**: Removes the instance from local service state
5. **Webhook Notification**: Sends webhook notification if configured

### State Changes

- Instance is permanently removed from Novita.ai
- Instance state is removed from local service memory
- Instance cache entries are cleared
- Instance cannot be recovered after deletion

### Limitations

- Only instances that have been successfully created in Novita.ai can be deleted
- Instances in "creating" state that haven't been assigned a Novita instance ID cannot be deleted
- Deletion is permanent and cannot be undone

## Testing

Use the provided test script to verify the delete API:

```bash
# Test delete by ID
node test-delete-api.js inst_1234567890_abc123

# Set custom API base URL
API_BASE_URL=http://localhost:3000 node test-delete-api.js inst_1234567890_abc123
```

## Integration Examples

### Node.js/JavaScript
```javascript
const axios = require('axios');

async function deleteInstance(instanceId) {
  try {
    const response = await axios.delete(`http://localhost:3000/api/instances/${instanceId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `delete-${Date.now()}`
      },
      data: {
        webhookUrl: 'https://myapp.com/webhook'
      }
    });
    
    console.log('Instance deleted:', response.data);
    return response.data;
  } catch (error) {
    console.error('Delete failed:', error.response?.data || error.message);
    throw error;
  }
}
```

### Python
```python
import requests
import json

def delete_instance(instance_id):
    url = f"http://localhost:3000/api/instances/{instance_id}"
    headers = {
        'Content-Type': 'application/json',
        'x-request-id': f'delete-{int(time.time())}'
    }
    data = {
        'webhookUrl': 'https://myapp.com/webhook'
    }
    
    try:
        response = requests.delete(url, headers=headers, json=data)
        response.raise_for_status()
        
        print('Instance deleted:', response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print('Delete failed:', e)
        raise
```

### cURL
```bash
# Delete by ID
curl -X DELETE "http://localhost:3000/api/instances/inst_1234567890_abc123" \
  -H "Content-Type: application/json" \
  -H "x-request-id: delete-$(date +%s)" \
  -d '{"webhookUrl": "https://example.com/webhook"}'

# Delete by name  
curl -X POST "http://localhost:3000/api/instances/delete" \
  -H "Content-Type: application/json" \
  -H "x-request-id: delete-name-$(date +%s)" \
  -d '{
    "instanceName": "my-gpu-instance",
    "webhookUrl": "https://example.com/webhook"
  }'
```

## Security Considerations

- Ensure proper authentication/authorization before allowing delete operations
- Validate webhook URLs to prevent SSRF attacks
- Use webhook signatures to verify webhook authenticity
- Log all delete operations for audit purposes
- Consider implementing soft delete for critical instances

## Related Documentation

- [API Client Reference](./API_CLIENT_REFERENCE.md)
- [API Endpoints Summary](./API_ENDPOINTS_SUMMARY.md)
- [Webhook Documentation](./WEBHOOK_DOCUMENTATION.md)
- [Error Handling Guide](./ERROR_HANDLING_GUIDE.md)