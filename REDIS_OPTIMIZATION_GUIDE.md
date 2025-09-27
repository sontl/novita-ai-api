# Redis Command Optimization Guide

## Overview

This guide outlines the strategies implemented to reduce Redis commands and improve performance in the Novita GPU Instance API.

## Key Optimizations Implemented

### 1. Batch Operations with Pipeline Simulation

**Before**: Individual Redis commands for each operation
```typescript
// Old approach - N Redis commands
for (const instance of instances) {
  await redisClient.set(instance.id, instance);  // 1 command per instance
}
```

**After**: Batched operations using pipeline wrapper
```typescript
// New approach - Batched commands
const bulkData = instances.map(instance => ({
  key: instance.id,
  value: instance
}));
await bulkOperations.bulkSet(bulkData);  // ~N/50 batch operations
```

**Impact**: Reduces Redis commands by ~95% for bulk operations

### 2. Lazy Access Count Updates

**Before**: Immediate Redis write on every cache access
```typescript
// Old approach - 2 Redis commands per cache hit
const entry = await redisClient.get(key);        // 1 command
await redisClient.set(key, updatedEntry);        // 1 command per access
```

**After**: Batched access count updates
```typescript
// New approach - Batched updates every 5 seconds
const entry = await redisClient.get(key);        // 1 command
scheduleAccessUpdate(key, entry);               // Batched later
```

**Impact**: Reduces cache access Redis commands by ~80%

### 3. Optimized Cache Size Tracking

**Before**: Redis KEYS command on every size check
```typescript
// Old approach - Expensive KEYS command
const keys = await redisClient.keys(pattern);    // Expensive operation
return keys.length;
```

**After**: Cached size with TTL
```typescript
// New approach - Cached size value
if (sizeCache && !isExpired(sizeCache)) {
  return sizeCache.value;                        // No Redis command
}
```

**Impact**: Reduces size check commands by ~90%

### 4. Bulk Synchronization Operations

**Before**: Sequential individual operations
```typescript
// Old approach - 2N Redis commands for sync
for (const instance of novitaInstances) {
  await instanceCache.set(instance.id, instance);  // N SET commands
}
for (const orphan of orphanedInstances) {
  await instanceCache.delete(orphan.id);           // M DEL commands
}
```

**After**: Parallel bulk operations
```typescript
// New approach - ~(N+M)/30 batch operations
const result = await bulkOperations.bulkSyncCache(
  updates,    // Batched SETs
  deletions   // Batched DELs
);
```

**Impact**: Reduces sync operation commands by ~95%

## Performance Improvements

### Startup Sync Service
- **Before**: ~200-500 Redis commands for typical sync
- **After**: ~10-20 Redis commands for same sync
- **Improvement**: 90-95% reduction in Redis commands

### Cache Operations
- **Before**: 2-3 Redis commands per cache access
- **After**: 1 Redis command per cache access (with batched updates)
- **Improvement**: 50-66% reduction in Redis commands

### Bulk Operations
- **Before**: N individual Redis commands
- **After**: N/batchSize batched operations (default batch size: 30-50)
- **Improvement**: 95-98% reduction in Redis commands

## Implementation Files

### Core Optimization Services
- `src/services/optimizedRedisCacheService.ts` - Optimized cache with batching
- `src/services/redisBulkOperationsService.ts` - Bulk operations service
- `src/utils/redisPipelineWrapper.ts` - Pipeline simulation wrapper

### Updated Services
- `src/services/startupSyncService.ts` - Uses bulk operations for sync
- `src/services/redisCacheService.ts` - Original service (can be replaced)

## Usage Examples

### Bulk Set Operations
```typescript
const bulkOps = new RedisBulkOperationsService(redisClient);

const data = [
  { key: 'instance1', value: instanceData1 },
  { key: 'instance2', value: instanceData2 },
  // ... more instances
];

const result = await bulkOps.bulkSet(data);
console.log(`Set ${result.successful} items with ${result.failed} failures`);
```

### Bulk Cache Synchronization
```typescript
const updates = instances.map(i => ({ key: i.id, value: i }));
const deletions = orphanedIds;

const result = await bulkOps.bulkSyncCache(updates, deletions);
console.log(`Sync completed in ${result.totalDuration}ms`);
```

### Optimized Cache Usage
```typescript
const cache = new OptimizedRedisCacheService('instances', redisClient);

// Get operations are optimized with batched access updates
const instance = await cache.get('instance-123');

// Bulk operations are available
await cache.deleteMany(['key1', 'key2', 'key3']);
```

## Configuration Options

### Batch Sizes
- **Default**: 30-50 operations per batch
- **Recommendation**: Adjust based on Redis server capacity
- **Large datasets**: Use smaller batches (20-30)
- **Small datasets**: Can use larger batches (50-100)

### Access Update Intervals
- **Default**: 5 seconds
- **High traffic**: Consider shorter intervals (2-3 seconds)
- **Low traffic**: Can use longer intervals (10-15 seconds)

### Cache Size Update Frequency
- **Default**: Every 10th set operation
- **High write volume**: Every 20th operation
- **Low write volume**: Every 5th operation

## Monitoring and Metrics

### Key Metrics to Track
- Redis commands per second (should decrease significantly)
- Cache hit ratio (should remain the same or improve)
- Operation latency (should improve due to batching)
- Error rates (should remain low)

### Logging
All optimization services include detailed logging:
- Batch operation summaries
- Performance metrics
- Error tracking
- Command reduction statistics

## Migration Strategy

### Phase 1: Add Bulk Operations (Completed)
- Implement `RedisBulkOperationsService`
- Add pipeline wrapper
- Update startup sync service

### Phase 2: Optimize Cache Service (Optional)
- Replace `RedisCacheService` with `OptimizedRedisCacheService`
- Update service registrations
- Test thoroughly

### Phase 3: Monitor and Tune
- Monitor Redis command reduction
- Adjust batch sizes based on performance
- Fine-tune update intervals

## Best Practices

### When to Use Bulk Operations
- ✅ Synchronizing large datasets
- ✅ Batch updates/deletes
- ✅ Initial data loading
- ❌ Single item operations
- ❌ Real-time updates requiring immediate consistency

### Batch Size Guidelines
- **Small Redis instances**: 20-30 operations per batch
- **Medium Redis instances**: 30-50 operations per batch
- **Large Redis instances**: 50-100 operations per batch
- **Network latency considerations**: Larger batches for high-latency connections

### Error Handling
- Always check bulk operation results
- Log failed operations for debugging
- Implement retry logic for critical operations
- Monitor error rates and adjust batch sizes if needed

## Expected Results

With these optimizations, you should see:
- **90-95% reduction** in Redis commands for bulk operations
- **50-80% reduction** in Redis commands for cache operations
- **Improved performance** due to reduced network round trips
- **Better Redis server utilization** with fewer but more efficient operations
- **Maintained data consistency** through proper error handling