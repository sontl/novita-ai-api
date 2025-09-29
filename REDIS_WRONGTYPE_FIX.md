# Redis WRONGTYPE Error Fix

## Problem Description

The application was experiencing frequent Redis `WRONGTYPE` errors with the message:
```
Redis GET operation failed {"command":"GET","key":"jobs:completed","error":"Command failed: WRONGTYPE Operation against a key holding the wrong kind of value"}
```

## Root Cause Analysis

The issue was caused by a conflict between different Redis data structures:

1. **Job Queue Service** uses `jobs:completed` as a **sorted set** (ZADD, ZCARD operations)
2. **Cache Services** were attempting to perform **GET operations** on keys that didn't belong to their cache namespace

The problem occurred in cache cleanup and LRU eviction operations where:
- Cache services scan for keys using patterns like `cache:{name}:*`
- Due to a bug or race condition, the SCAN operation was returning keys outside the expected pattern
- The cache service then tried to perform GET operations on these foreign keys
- When it tried to GET a sorted set key like `jobs:completed`, Redis returned a WRONGTYPE error

## Solution Implemented

### 1. Key Filtering Defense
Added defensive key filtering in all cache operations to ensure only keys matching the cache prefix are processed:

```typescript
// Filter keys to ensure they match our cache prefix (defense against SCAN bugs)
const validKeys = keys.filter(key => key.startsWith(this.keyPrefix + ':'));
```

### 2. WRONGTYPE Error Handling
Added specific error handling for WRONGTYPE errors to gracefully skip incompatible keys:

```typescript
} catch (error) {
  if (error instanceof Error && error.message.includes('WRONGTYPE')) {
    // Skip keys with wrong type (they don't belong to this cache)
    logger.warn('Skipping key with wrong type during cleanup', {
      cache: this.name,
      key: redisKey,
      error: error.message
    });
    continue;
  }
  throw error; // Re-throw other errors
}
```

### 3. Enhanced Logging
Added better error logging to help identify and debug similar issues in the future.

## Files Modified

1. **src/services/optimizedRedisCacheService.ts**
   - Fixed `cleanupExpired()` method
   - Fixed `size()` method  
   - Fixed `keys()` method

2. **src/services/redisCacheService.ts**
   - Fixed `evictLeastRecentlyUsed()` method
   - Fixed `cleanupExpired()` method
   - Fixed `keys()` method
   - Fixed `getCurrentSize()` method

## Impact

- ✅ Eliminates WRONGTYPE errors during cache operations
- ✅ Prevents cache services from accessing job queue keys
- ✅ Maintains cache functionality and performance
- ✅ Adds defensive programming against Redis SCAN edge cases
- ✅ Improves error logging and debugging capabilities

## Testing

The fix has been applied to both the regular `RedisCacheService` and the `OptimizedRedisCacheService`. All cache operations now include:

1. Key validation to ensure they belong to the cache namespace
2. Error handling for WRONGTYPE operations
3. Graceful degradation when encountering incompatible keys

## Prevention

This fix prevents similar issues by:
- Adding defensive key filtering in all SCAN-based operations
- Implementing proper error handling for Redis data type conflicts
- Providing better logging for debugging future issues
- Following defensive programming principles for Redis operations