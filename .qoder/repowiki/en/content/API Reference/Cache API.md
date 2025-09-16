# Cache API

<cite>
**Referenced Files in This Document**   
- [cache.ts](file://src/routes/cache.ts)
- [cacheService.ts](file://src/services/cacheService.ts)
- [instanceService.ts](file://src/services/instanceService.ts)
- [productService.ts](file://src/services/productService.ts)
- [templateService.ts](file://src/services/templateService.ts)
- [api.ts](file://src/types/api.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication Requirements](#authentication-requirements)
3. [API Endpoints](#api-endpoints)
   - [GET /api/cache/stats](#get-apicachestats)
   - [POST /api/cache/clear](#post-apicacheclear)
   - [POST /api/cache/cleanup](#post-apicachecleanup)
   - [GET /api/cache/:cacheName/stats](#get-apicachecachenamestats)
   - [DELETE /api/cache/:cacheName/:key](#delete-apicachecachenamekey)
4. [Error Responses](#error-responses)
5. [Performance Impact and Best Practices](#performance-impact-and-best-practices)
6. [Appendices](#appendices)

## Introduction
The Cache API provides comprehensive management and monitoring capabilities for the application's caching system. This API enables administrators and monitoring systems to retrieve cache statistics, clear caches, clean up expired entries, and manage specific cache keys. The caching system is built on a centralized CacheManager that manages multiple named cache instances used across various services including instance management, product data, and template configurations.

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L1-L265)
- [cacheService.ts](file://src/services/cacheService.ts#L1-L490)

## Authentication Requirements
All Cache API endpoints require authentication. The API uses standard authentication mechanisms enforced by the application's middleware stack. Users must provide valid authentication credentials (typically via API key or token in the Authorization header) to access these endpoints. Unauthorized requests will receive a 401 Unauthorized response.

## API Endpoints

### GET /api/cache/stats
Retrieves comprehensive cache statistics across the entire system, including cache manager stats, service-specific statistics, and summary metrics.

**Request**
```
GET /api/cache/stats
Authorization: Bearer <token>
```

**Response**
```json
{
  "timestamp": "2023-12-07T10:30:00.000Z",
  "cacheManager": {
    "cacheNames": ["instance-details", "instance-states", "products", "optimal-products", "templates"],
    "stats": {
      "instance-details": {
        "metrics": {
          "hits": 1250,
          "misses": 75,
          "sets": 50,
          "deletes": 5,
          "evictions": 2,
          "totalSize": 48
        },
        "entries": {
          "inst_123": {
            "size": 256,
            "ttl": 30000,
            "age": 15000,
            "accessCount": 25,
            "lastAccessed": 1699321800000
          }
        }
      }
    },
    "metrics": {
      "instance-details": {
        "hits": 1250,
        "misses": 75,
        "sets": 50,
        "deletes": 5,
        "evictions": 2,
        "totalSize": 48
      }
    }
  },
  "services": {
    "instance": {
      "instanceDetailsCache": {
        "size": 48,
        "hitRatio": 0.943,
        "metrics": {
          "hits": 1250,
          "misses": 75,
          "sets": 50,
          "deletes": 5,
          "evictions": 2,
          "totalSize": 48
        }
      },
      "instanceStatesCache": {
        "size": 52,
        "hitRatio": 0.892,
        "metrics": {
          "hits": 850,
          "misses": 100,
          "sets": 60,
          "deletes": 8,
          "evictions": 3,
          "totalSize": 52
        }
      },
      "instanceStatesSize": 55,
      "cachedInstanceIds": ["inst_123", "inst_456"]
    },
    "product": {
      "productCache": {
        "size": 25,
        "hitRatio": 0.962,
        "metrics": {
          "hits": 520,
          "misses": 20,
          "sets": 15,
          "deletes": 2,
          "evictions": 1,
          "totalSize": 25
        }
      },
      "optimalProductCache": {
        "size": 18,
        "hitRatio": 0.875,
        "metrics": {
          "hits": 140,
          "misses": 20,
          "sets": 10,
          "deletes": 1,
          "evictions": 0,
          "totalSize": 18
      }
      },
      "totalCacheSize": 43
    },
    "template": {
      "size": 35,
      "hitRatio": 0.923,
      "metrics": {
        "hits": 360,
        "misses": 30,
        "sets": 20,
        "deletes": 3,
        "evictions": 1,
        "totalSize": 35
      },
      "cachedTemplateIds": ["1", "2", "3"]
    }
  },
  "summary": {
    "totalCaches": 5,
    "totalEntries": 173,
    "totalHits": 3020,
    "totalMisses": 245,
    "overallHitRatio": 0.925
  }
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L6-L58)
- [cacheService.ts](file://src/services/cacheService.ts#L248-L280)
- [instanceService.ts](file://src/services/instanceService.ts#L458-L492)
- [productService.ts](file://src/services/productService.ts#L234-L258)
- [templateService.ts](file://src/services/templateService.ts#L241-L259)

### POST /api/cache/clear
Clears all caches or a specific cache by name.

**Request - Clear All Caches**
```
POST /api/cache/clear
Authorization: Bearer <token>
Content-Type: application/json
```

**Response - Clear All Caches**
```json
{
  "message": "All caches cleared successfully",
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

**Request - Clear Specific Cache**
```json
{
  "cacheName": "instance-details"
}
```

**Response - Clear Specific Cache**
```json
{
  "message": "Cache 'instance-details' cleared successfully",
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L61-L104)
- [cacheService.ts](file://src/services/cacheService.ts#L178-L188)
- [cacheService.ts](file://src/services/cacheService.ts#L358-L374)

### POST /api/cache/cleanup
Cleans up expired entries from all caches.

**Request**
```
POST /api/cache/cleanup
Authorization: Bearer <token>
```

**Response**
```json
{
  "message": "Cache cleanup completed successfully",
  "entriesRemoved": 7,
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L107-L142)
- [cacheService.ts](file://src/services/cacheService.ts#L208-L228)
- [cacheService.ts](file://src/services/cacheService.ts#L376-L393)

### GET /api/cache/:cacheName/stats
Retrieves statistics for a specific cache.

**Request**
```
GET /api/cache/instance-details/stats
Authorization: Bearer <token>
```

**Response**
```json
{
  "cacheName": "instance-details",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "size": 48,
  "hitRatio": 0.943,
  "stats": {
    "metrics": {
      "hits": 1250,
      "misses": 75,
      "sets": 50,
      "deletes": 5,
      "evictions": 2,
      "totalSize": 48
    },
    "entries": {
      "inst_123": {
        "size": 256,
        "ttl": 30000,
        "age": 15000,
        "accessCount": 25,
        "lastAccessed": 1699321800000
      }
    }
  },
  "metrics": {
    "hits": 1250,
    "misses": 75,
    "sets": 50,
    "deletes": 5,
    "evictions": 2,
    "totalSize": 48
  }
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L145-L194)
- [cacheService.ts](file://src/services/cacheService.ts#L190-L206)

### DELETE /api/cache/:cacheName/:key
Deletes a specific key from a named cache.

**Request**
```
DELETE /api/cache/instance-details/inst_123
Authorization: Bearer <token>
```

**Response - Success**
```json
{
  "message": "Key 'inst_123' deleted from cache 'instance-details'",
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

**Response - Key Not Found**
```json
{
  "error": {
    "code": "CACHE_KEY_NOT_FOUND",
    "message": "Key 'inst_123' not found in cache 'instance-details'",
    "timestamp": "2023-12-07T10:30:00.000Z"
  }
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L197-L265)
- [cacheService.ts](file://src/services/cacheService.ts#L158-L176)

## Error Responses
The Cache API returns standardized error responses for various error conditions. All error responses follow the format defined in the ErrorResponse interface.

**Common Error Codes:**
- `INVALID_CACHE_NAME`: Returned when cache name is missing or invalid
- `INVALID_KEY`: Returned when key is missing or invalid
- `CACHE_STATS_ERROR`: Returned when statistics retrieval fails
- `CACHE_CLEAR_ERROR`: Returned when cache clearing fails
- `CACHE_CLEANUP_ERROR`: Returned when cleanup operation fails
- `CACHE_DELETE_ERROR`: Returned when key deletion fails
- `CACHE_KEY_NOT_FOUND`: Returned when attempting to delete a non-existent key

**Error Response Format:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descriptive error message",
    "timestamp": "2023-12-07T10:30:00.000Z"
  }
}
```

**Section sources**
- [cache.ts](file://src/routes/cache.ts#L43-L56)
- [cache.ts](file://src/routes/cache.ts#L85-L102)
- [cache.ts](file://src/routes/cache.ts#L123-L140)
- [cache.ts](file://src/routes/cache.ts#L170-L192)
- [cache.ts](file://src/routes/cache.ts#L235-L263)
- [api.ts](file://src/types/api.ts#L248-L268)

## Performance Impact and Best Practices
Cache operations have significant implications for system performance and should be used judiciously.

**Performance Impact:**
- **GET /api/cache/stats**: Low impact, reads current statistics without modifying cache state
- **POST /api/cache/clear**: High impact, removes cache entries which will increase database/API load until cache is repopulated
- **POST /api/cache/cleanup**: Medium impact, removes only expired entries with minimal performance impact
- **DELETE /api/cache/:cacheName/:key**: Low impact, removes a single entry

**Best Practices:**
1. **Monitoring**: Regularly monitor cache hit ratios and sizes using GET /api/cache/stats to identify potential performance issues
2. **Clear Operations**: Use targeted cache clearing (by name) rather than clearing all caches when possible to minimize system impact
3. **Deployment**: Consider clearing relevant caches after deployment to ensure consistency, but avoid clearing all caches simultaneously
4. **Troubleshooting**: Use cache cleanup operations to remove expired entries during troubleshooting, but avoid frequent full cache clears
5. **Instance Retrieval Latency**: After clearing instance caches, expect increased latency for instance retrieval operations until the cache is warmed
6. **Scheduled Cleanup**: The system automatically performs periodic cleanup of expired entries; manual cleanup should only be performed when necessary

**Operational Guidelines:**
- Avoid clearing caches during peak usage periods
- Monitor system performance after cache operations
- Use specific cache names rather than clearing all caches when possible
- Regularly review cache statistics to identify underperforming caches
- Consider the impact on dependent services when clearing shared caches

**Section sources**
- [cacheService.ts](file://src/services/cacheService.ts#L400-L490)
- [instanceService.ts](file://src/services/instanceService.ts#L458-L492)
- [productService.ts](file://src/services/productService.ts#L234-L258)
- [templateService.ts](file://src/services/templateService.ts#L241-L259)

## Appendices

### Cache Configuration Defaults
| Cache Parameter | Default Value | Description |
|----------------|-------------|-------------|
| maxSize | 1000 | Maximum number of entries before LRU eviction |
| defaultTtl | 300000 (5 minutes) | Default time-to-live for cache entries |
| cleanupIntervalMs | 60000 (1 minute) | Interval for periodic cleanup of expired entries |

### Service Cache Details
| Service | Cache Name | Purpose | TTL |
|--------|-----------|---------|-----|
| Instance | instance-details | Caches instance status and details | 30 seconds |
| Instance | instance-states | Caches internal instance state | 60 seconds |
| Product | products | Caches product listings | 5 minutes |
| Product | optimal-products | Caches optimal product selections | 5 minutes |
| Template | templates | Caches template configurations | 10 minutes |

**Section sources**
- [cacheService.ts](file://src/services/cacheService.ts#L58-L64)
- [instanceService.ts](file://src/services/instanceService.ts#L15-L28)
- [productService.ts](file://src/services/productService.ts#L13-L22)
- [templateService.ts](file://src/services/templateService.ts#L13-L18)