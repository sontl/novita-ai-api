# Time-Based Migration Eligibility

## Overview

The migration eligibility system has been simplified to use a time-based approach instead of checking GPU IDs, spot status, and reclaim times. This provides a more predictable and configurable migration schedule.

## How It Works

### Eligibility Criteria

1. **Instance Status**: Instance must have "exited" status
2. **Time Since Last Migration**: Must be at least X hours since the last migration (configurable)

### Configuration

- **Environment Variable**: `MIGRATION_ELIGIBILITY_INTERVAL_HOURS`
- **Default Value**: 4 hours
- **Range**: 1-168 hours (1 week maximum)

### Migration Tracking

- Migration times are stored in Redis cache with 7-day TTL
- Each successful migration (including dry runs) records the timestamp
- Cache key format: `migration-times:{instanceId}`

## Benefits

1. **Predictable**: Migrations happen on a regular schedule
2. **Configurable**: Easy to adjust the migration frequency
3. **Simple**: No complex logic based on GPU types or spot status
4. **Reliable**: Uses persistent storage to track migration history

## Configuration Example

```bash
# Migrate every 4 hours (default)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=4

# More frequent migrations (every 2 hours)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=2

# Less frequent migrations (every 12 hours)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=12
```

## Migration Process

1. **Fetch Instances**: Get all instances from Novita API
2. **Filter by Status**: Only consider "exited" instances
3. **Check Time Eligibility**: For each exited instance:
   - Get last migration time from cache
   - Calculate hours since last migration
   - Mark as eligible if enough time has passed or no previous migration
4. **Migrate Eligible Instances**: Process migrations for eligible instances
5. **Record Migration Time**: Store successful migration timestamp in cache

## Logging

The system provides detailed logging for migration eligibility:

```
Instance eligible for migration - time-based check passed
Instance not eligible for migration - insufficient time elapsed
No previous migration found - eligible for migration
```

## Backward Compatibility

This change removes the previous logic that checked:
- GPU IDs (gpuIds array)
- Spot status (spotStatus field)
- Spot reclaim time (spotReclaimTime field)

All exited instances are now eligible based purely on time since last migration.