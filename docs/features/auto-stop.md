# Auto-Stop Feature Documentation

## Overview

The Auto-Stop feature automatically monitors running GPU instances and stops them when they haven't been used for a configurable period (default: 20 minutes). This helps optimize costs by preventing instances from running idle.

## Features

- **Last Used Time Tracking**: Clients can update when an instance was last used
- **Automatic Monitoring**: Background service checks for inactive instances every 5 minutes
- **Configurable Thresholds**: Default 20-minute inactivity threshold (configurable)
- **Dry Run Mode**: Test auto-stop logic without actually stopping instances
- **Manual Triggers**: Manually trigger auto-stop checks for testing
- **Comprehensive Logging**: Detailed logs for monitoring and debugging

## API Endpoints

### Update Last Used Time

Update the last used timestamp for an instance to prevent it from being auto-stopped.

```http
PUT /api/instances/{instanceId}/last-used
Content-Type: application/json

{
  "lastUsedAt": "2024-01-15T10:30:00.000Z"  // Optional, defaults to current time
}
```

**Response:**
```json
{
  "instanceId": "inst_1234567890_abc123",
  "lastUsedAt": "2024-01-15T10:30:00.000Z",
  "message": "Last used time updated successfully"
}
```

### Get Auto-Stop Statistics

Get current auto-stop service statistics and configuration.

```http
GET /api/instances/auto-stop/stats
```

**Response:**
```json
{
  "schedulerRunning": true,
  "checkIntervalMinutes": 5,
  "defaultInactivityThresholdMinutes": 20
}
```

### Trigger Manual Auto-Stop Check

Manually trigger an auto-stop check (useful for testing).

```http
POST /api/instances/auto-stop/trigger
Content-Type: application/json

{
  "dryRun": true  // Optional, defaults to true for safety
}
```

**Response:**
```json
{
  "message": "Auto-stop check queued successfully",
  "dryRun": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## How It Works

### 1. Last Used Time Tracking

- Clients call `PUT /api/instances/{instanceId}/last-used` whenever they use an instance
- If no `lastUsedAt` is provided, the current timestamp is used
- The timestamp is stored in the instance state and included in instance details

### 2. Auto-Stop Monitoring

- Background scheduler runs every 5 minutes
- Checks all running instances for inactivity
- Uses the following priority for determining last activity:
  1. `lastUsedAt` timestamp (if set by client)
  2. `readyAt` timestamp (when instance became ready)
  3. `startedAt` timestamp (when instance started)

### 3. Auto-Stop Logic

- Instances are eligible for auto-stop if:
  - Status is `running`
  - Last activity time > inactivity threshold (default: 20 minutes)
- Eligible instances are automatically stopped
- Comprehensive logging tracks all auto-stop activities

## Client Integration

### Basic Usage

```javascript
// Update last used time when starting work on an instance
async function markInstanceAsUsed(instanceId) {
  try {
    const response = await fetch(`/api/instances/${instanceId}/last-used`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lastUsedAt: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      console.log('Instance marked as used');
    }
  } catch (error) {
    console.error('Failed to update last used time:', error);
  }
}

// Call this whenever the instance is actively being used
markInstanceAsUsed('inst_1234567890_abc123');
```

### Periodic Updates

For long-running tasks, update the last used time periodically:

```javascript
// Update every 10 minutes during active use
setInterval(() => {
  markInstanceAsUsed(instanceId);
}, 10 * 60 * 1000);
```

## Configuration

The auto-stop feature uses the following default configuration:

- **Check Interval**: 5 minutes
- **Inactivity Threshold**: 20 minutes
- **Scheduler**: Automatically started with the application

These values are currently hardcoded but can be made configurable in future versions.

## Monitoring and Logging

### Log Events

The auto-stop feature generates detailed logs for monitoring:

```
INFO: Auto-stop scheduler started
INFO: Found instances eligible for auto-stop (count: 2)
INFO: Instance auto-stopped due to inactivity (instanceId: inst_123, inactiveMinutes: 25)
WARN: Auto-stop check completed with errors (errorCount: 1)
```

### Metrics

Monitor auto-stop activity through:
- Instance details include `lastUsedAt` timestamp
- Auto-stop statistics endpoint
- Application logs with structured data

## Error Handling

### Common Scenarios

1. **Instance Not Found**: Returns 404 error when updating last used time for non-existent instance
2. **Invalid Timestamp**: Returns 400 error for malformed `lastUsedAt` values
3. **Stop Failures**: Logged as errors but don't prevent other instances from being processed

### Graceful Degradation

- Auto-stop continues working even if some instances fail to stop
- Scheduler automatically restarts after errors
- Fallback to instance ready/start times if no last used time is set

## Testing

### Manual Testing

1. **Create a test instance**
2. **Let it run for over 20 minutes without updating last used time**
3. **Trigger manual auto-stop check**: `POST /api/instances/auto-stop/trigger`
4. **Verify instance is stopped**

### Dry Run Testing

Use dry run mode to test without actually stopping instances:

```bash
curl -X POST http://localhost:3000/api/instances/auto-stop/trigger \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

### Test Script

Run the included test script:

```bash
node test-auto-stop.js
```

## Best Practices

### For Clients

1. **Update Regularly**: Call the last used endpoint whenever actively using an instance
2. **Handle Errors**: Implement retry logic for failed updates
3. **Monitor Logs**: Watch for auto-stop events in your monitoring system

### For Operations

1. **Monitor Logs**: Watch auto-stop logs for unusual patterns
2. **Adjust Thresholds**: Consider workload patterns when setting inactivity thresholds
3. **Test Regularly**: Use dry run mode to verify auto-stop logic

## Future Enhancements

Potential improvements for future versions:

1. **Configurable Thresholds**: Per-instance or per-template inactivity thresholds
2. **Grace Periods**: Configurable grace periods before stopping
3. **Notification System**: Warnings before auto-stopping instances
4. **Usage Analytics**: Detailed usage patterns and cost savings reports
5. **Smart Scheduling**: ML-based prediction of usage patterns

## Troubleshooting

### Instance Not Auto-Stopping

1. Check if last used time is being updated too frequently
2. Verify instance status is `running`
3. Check auto-stop scheduler is running: `GET /api/instances/auto-stop/stats`
4. Review logs for errors during auto-stop checks

### Unexpected Auto-Stops

1. Verify clients are updating last used time correctly
2. Check if inactivity threshold is too low
3. Review auto-stop logs for the specific instance

### Performance Issues

1. Monitor auto-stop check execution time in logs
2. Consider reducing check frequency if needed
3. Optimize instance queries if large numbers of instances exist