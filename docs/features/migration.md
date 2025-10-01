# Migration Features Documentation

This document describes the migration features of the Novita GPU Instance API, including the system for recreating instances after failed migrations and the time-based eligibility system.

## Overview

The migration system enables automatic handling of GPU instance migrations with two key components:
1. **Failed Migration Recovery**: Automatic recreation of instances after failed migrations
2. **Time-Based Eligibility**: Configurable schedule for when instances can be migrated

## Failed Migration Recreation Fix

### Problem

When recreating instances after failed migrations, the system was trying to fetch template details using `templateId` to get configuration data like:
- `imageUrl`
- `imageAuth` / `imageAuthId`
- `ports`
- `envs`
- `kind`
- `billingMode`

However, this approach had several issues:
1. **Template Not Available**: The `templateId` might not be available or accessible
2. **Unnecessary API Call**: We already have all the required data from the deleted instance
3. **Potential Failure Point**: Template fetching could fail and prevent instance recreation

### Solution

Modified the `handleFailedMigration` method in `src/services/instanceMigrationService.ts` to use instance data directly instead of fetching template details.

#### Before (Problematic Approach)
```typescript
// Get the template to extract configuration
const template = await novitaApiService.getTemplate(templateId);

const createRequest: NovitaCreateInstanceRequest = {
  name: `${name}-recreated-${Date.now()}`,
  productId: product.id,
  gpuNum: instance.gpuNum || 1,
  rootfsSize: instance.rootfsSize || 50,
  imageUrl: template.imageUrl,                    // From template
  ...(template.imageAuth && { imageAuth: template.imageAuth }), // From template
  ports: template.ports.map(p => `${p.port}:${p.type}`).join(','), // From template
  envs: template.envs,                           // From template
  kind: (instance.kind as 'gpu' | 'cpu') || 'gpu',
  billingMode: instance.billingMode as 'onDemand' | 'monthly' | 'spot' || 'spot'
};
```

#### After (Direct Instance Data Usage)
```typescript
// Use existing productId if available, otherwise get optimal product
let productId = instance.productId;
if (!productId && productName) {
  const product = await novitaApiService.getOptimalProduct(productName, instance.region || 'CN-HK-01');
  productId = product.id;
}

// Build ports string from portMappings if available
let portsString = '';
if (instance.portMappings && instance.portMappings.length > 0) {
  portsString = instance.portMappings
    .map(pm => `${pm.port}:${pm.type || 'tcp'}`)
    .join(',');
}

const createRequest: NovitaCreateInstanceRequest = {
  name: `${name}-recreated-${Date.now()}`,
  productId,                                     // From instance or optimal product
  gpuNum: instance.gpuNum || 1,                  // From instance
  rootfsSize: instance.rootfsSize || 50,         // From instance
  imageUrl: instance.imageUrl,                   // From instance
  ...(instance.imageAuthId && { imageAuthId: instance.imageAuthId }), // From instance
  ...(portsString && { ports: portsString }),    // From instance portMappings
  ...(instance.envs && { envs: instance.envs }), // From instance
  ...(instance.command && { command: instance.command }), // From instance
  ...(instance.clusterId && { clusterId: instance.clusterId }), // From instance
  kind: (instance.kind as 'gpu' | 'cpu') || 'gpu',
  billingMode: instance.billingMode as 'onDemand' | 'monthly' | 'spot' || 'spot'
};
```

### Benefits

1. **No Template Dependency**: Eliminates the need to fetch template data
2. **Faster Recreation**: Removes an unnecessary API call
3. **More Reliable**: Uses data that's guaranteed to be available from the instance
4. **Exact Configuration**: Recreates the instance with the exact same configuration it had before

### Data Mapping

The following instance fields are now used directly for recreation:

| Instance Field | Usage | Fallback |
|----------------|-------|----------|
| `imageUrl` | Docker image URL | Required - throws error if missing |
| `imageAuthId` | Image authentication ID | Optional |
| `productId` | Product identifier | Falls back to optimal product lookup |
| `gpuNum` | Number of GPUs | Defaults to 1 |
| `rootfsSize` | Root filesystem size | Defaults to 50GB |
| `portMappings` | Port configurations | Converted to ports string |
| `envs` | Environment variables | Used as-is |
| `command` | Startup command | Optional |
| `clusterId` | Cluster identifier | Optional |
| `kind` | Instance type (gpu/cpu) | Defaults to 'gpu' |
| `billingMode` | Billing mode | Defaults to 'spot' |

### Error Handling

The fix includes improved error handling:

1. **Missing Image URL**: Clear error message if `imageUrl` is not available
2. **Product ID Resolution**: Attempts to use existing `productId`, falls back to optimal product lookup
3. **Enhanced Logging**: Better logging to track what data is being used for recreation

### Testing

To test the fix:

1. **Create an instance** with specific configuration
2. **Simulate a failed migration** (or wait for one to occur naturally)
3. **Trigger failed migration check**: `POST /api/instances/migration/check-failed`
4. **Verify recreation** uses the original instance data without template fetching

### Monitoring

Enhanced logging provides visibility into the recreation process:

```
[INFO] Handling failed migration: instanceId=inst_123, hasImageUrl=true, hasProductId=true
[DEBUG] Creating new instance with configuration from deleted instance
[INFO] Successfully recreated instance after failed migration: usedExistingData=true
```

### Impact

- **Reduced API Calls**: Eliminates template fetching during recreation
- **Improved Reliability**: Removes potential failure point
- **Faster Recovery**: Quicker instance recreation after failed migrations
- **Better Resource Utilization**: Less load on template API endpoints

### Backward Compatibility

This change is fully backward compatible:
- No changes to public APIs
- No changes to configuration requirements
- Existing migration workflows continue to work
- Only internal recreation logic is optimized

## Time-Based Migration Eligibility

### Overview

The migration eligibility system has been simplified to use a time-based approach instead of checking GPU IDs, spot status, and reclaim times. This provides a more predictable and configurable migration schedule.

### How It Works

#### Eligibility Criteria

1. **Instance Status**: Instance must have "exited" status
2. **Time Since Last Migration**: Must be at least X hours since the last migration (configurable)

#### Configuration

- **Environment Variable**: `MIGRATION_ELIGIBILITY_INTERVAL_HOURS`
- **Default Value**: 4 hours
- **Range**: 1-168 hours (1 week maximum)

#### Migration Tracking

- Migration times are stored in Redis cache with 7-day TTL
- Each successful migration (including dry runs) records the timestamp
- Cache key format: `migration-times:{instanceId}`

### Benefits

1. **Predictable**: Migrations happen on a regular schedule
2. **Configurable**: Easy to adjust the migration frequency
3. **Simple**: No complex logic based on GPU types or spot status
4. **Reliable**: Uses persistent storage to track migration history

### Configuration Example

```bash
# Migrate every 4 hours (default)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=4

# More frequent migrations (every 2 hours)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=2

# Less frequent migrations (every 12 hours)
MIGRATION_ELIGIBILITY_INTERVAL_HOURS=12
```

### Migration Process

1. **Fetch Instances**: Get all instances from Novita API
2. **Filter by Status**: Only consider "exited" instances
3. **Check Time Eligibility**: For each exited instance:
   - Get last migration time from cache
   - Calculate hours since last migration
   - Mark as eligible if enough time has passed or no previous migration
4. **Migrate Eligible Instances**: Process migrations for eligible instances
5. **Record Migration Time**: Store successful migration timestamp in cache

### Logging

The system provides detailed logging for migration eligibility:

```
Instance eligible for migration - time-based check passed
Instance not eligible for migration - insufficient time elapsed
No previous migration found - eligible for migration
```

### Backward Compatibility

This change removes the previous logic that checked:
- GPU IDs (gpuIds array)
- Spot status (spotStatus field)
- Spot reclaim time (spotReclaimTime field)

All exited instances are now eligible based purely on time since last migration.

## Related Documentation

- [API Client Reference](../API_CLIENT_REFERENCE.md)
- [API Endpoints Summary](../API_ENDPOINTS_SUMMARY.md)
- [Error Handling Guide](../ERROR_HANDLING_GUIDE.md)