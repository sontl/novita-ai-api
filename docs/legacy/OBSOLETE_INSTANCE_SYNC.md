# Obsolete Instance Synchronization

## Overview

The Novita GPU Instance API now includes enhanced synchronization capabilities to handle instances that exist in Redis but no longer exist in Novita.ai. This ensures data consistency and prevents stale instance data from accumulating.

## How It Works

When syncing with Novita.ai, the system identifies "obsolete instances" - instances that exist in the local Redis cache but are no longer present in Novita.ai's API response. This can happen when:

- Instances are deleted directly through Novita.ai's interface
- Instances are terminated by Novita.ai due to resource constraints
- Network issues caused missed deletion notifications
- Manual cleanup operations on Novita.ai's side

## Configuration Options

Add these environment variables to control obsolete instance handling:

```bash
# Whether to remove obsolete instances from Redis (true) or mark as terminated (false)
SYNC_REMOVE_OBSOLETE_INSTANCES=false

# Number of days to retain obsolete instances before removal (1-365)
SYNC_OBSOLETE_INSTANCE_RETENTION_DAYS=7

# Whether to enable automatic periodic synchronization
SYNC_ENABLE_AUTOMATIC_SYNC=true

# Interval in minutes for automatic synchronization (5-1440)
SYNC_INTERVAL_MINUTES=30
```

## Sync Strategies

### Strategy 1: Mark as Terminated (Default)
- **Configuration**: `SYNC_REMOVE_OBSOLETE_INSTANCES=false`
- **Behavior**: Obsolete instances are marked with `status: TERMINATED` and a termination timestamp
- **Benefits**: Preserves historical data, allows for audit trails, enables recovery if needed
- **Use Case**: Production environments where data retention is important

### Strategy 2: Remove Completely
- **Configuration**: `SYNC_REMOVE_OBSOLETE_INSTANCES=true`
- **Behavior**: Obsolete instances are completely removed from Redis
- **Benefits**: Keeps Redis clean, reduces memory usage
- **Use Case**: Development environments or when storage optimization is critical

## Retention Policy

For terminated instances, the system applies a retention policy:

- Instances in `PENDING` or `STARTING` status are always removed (never successfully started)
- Instances marked as `TERMINATED` are removed after the retention period
- Running/stopped instances are marked as terminated rather than removed to preserve data

## API Endpoints

### Enhanced Sync Endpoint

```http
POST /api/instances/sync
Content-Type: application/json

{
  "forceSync": false,
  "handleObsoleteInstances": true,
  "dryRun": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Instances synchronized successfully",
  "data": {
    "beforeSync": 5,
    "afterSync": 3,
    "novitaInstances": 3,
    "localInstances": 5,
    "mergedInstances": 3,
    "totalInstances": 3,
    "instancesRemoved": 2,
    "duration": 1250,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "options": {
      "forceSync": false,
      "handleObsoleteInstances": true,
      "dryRun": false
    }
  }
}
```

### Comprehensive Listing with Sync

```http
GET /api/instances/comprehensive?syncLocalState=true&includeNovitaOnly=true
```

This automatically triggers the sync process during the listing operation.

## Logging and Monitoring

The sync process provides detailed logging:

```
INFO: Instance sync completed
{
  "updated": 2,
  "removed": 1,
  "markedObsolete": 3,
  "totalNovitaInstances": 5,
  "totalLocalInstances": 9
}
```

Individual instance actions are logged:

```
INFO: Removed obsolete instance from Redis
{
  "instanceId": "local-123",
  "novitaInstanceId": "novita-456",
  "lastStatus": "running",
  "reason": "Instance no longer exists in Novita"
}
```

## Best Practices

1. **Production Setup**: Use `SYNC_REMOVE_OBSOLETE_INSTANCES=false` to preserve historical data
2. **Development Setup**: Use `SYNC_REMOVE_OBSOLETE_INSTANCES=true` for cleaner state
3. **Monitoring**: Monitor sync logs to identify patterns in instance obsolescence
4. **Retention**: Adjust retention days based on your audit and compliance requirements
5. **Frequency**: Set sync intervals based on your workload patterns (more frequent for dynamic workloads)

## Error Handling

The sync process is resilient to failures:

- Individual instance sync failures don't stop the overall process
- Network errors with Novita.ai fall back to local-only data
- Redis errors are logged but don't crash the application
- Partial sync results are still returned with error details

## Migration from Previous Versions

Existing installations will automatically use the new sync behavior with default settings:
- Obsolete instances will be marked as terminated (not removed)
- 7-day retention policy for old terminated instances
- Automatic sync enabled with 30-minute intervals

No manual migration is required.