# Startup Synchronization and Web UI

This document describes the startup synchronization feature and web management UI added to the Novita GPU Instance API.

## Startup Synchronization

### Overview

The application now automatically synchronizes instance data between Novita.ai and Redis cache on startup. This ensures data consistency and removes stale cache entries.

### Features

- **Automatic Sync on Startup**: Fetches all instances from Novita.ai and updates Redis cache
- **Orphan Cleanup**: Removes instances from cache that no longer exist in Novita.ai
- **Concurrent Protection**: Uses Redis locks to prevent multiple sync operations
- **Error Handling**: Graceful error handling with detailed logging
- **Performance Optimized**: Paginated API calls to handle large instance counts

### Implementation

#### StartupSyncService

Located in `src/services/startupSyncService.ts`, this service:

1. Acquires a Redis lock to prevent concurrent synchronization
2. Fetches all instances from Novita.ai using pagination
3. Retrieves all cached instances from Redis
4. Synchronizes data by updating existing instances and adding new ones
5. Removes orphaned instances that no longer exist in Novita.ai
6. Records sync statistics and timestamps

#### Service Integration

The sync service is integrated into the application startup process in `src/services/serviceInitializer.ts`:

- Creates instance cache service with Redis backend
- Initializes Novita API service
- Runs synchronization automatically if Redis is available
- Logs detailed sync results

### Configuration

No additional configuration is required. The sync service uses existing Redis and Novita API configurations.

### Monitoring

Sync status is available through:
- Health check endpoint (`/health`) includes sync information
- Logs contain detailed sync statistics
- Manual sync endpoint (`POST /api/instances/sync`)

## Web Management UI

### Overview

A clean, responsive web interface for managing GPU instances and monitoring system health.

### Features

- **Dashboard Overview**: Real-time statistics and system health
- **Instance Management**: View, start, stop, and manage instances
- **Sync Control**: Manual synchronization with Novita.ai
- **Cache Management**: Clear cache and view cache statistics
- **Bulk Operations**: Stop all running instances
- **Auto-refresh**: Automatic data refresh every 30 seconds

### Access

The web UI is available at the root URL of your application:
```
http://localhost:3000/
```

### UI Components

#### Dashboard Stats
- Total instances count
- Running instances count
- Redis connection status
- Last synchronization time

#### Actions Panel
- **Refresh Data**: Manual data refresh
- **Sync with Novita.ai**: Trigger instance synchronization
- **Clear Cache**: Clear Redis cache
- **Stop All Instances**: Emergency stop for all running instances

#### Instance Table
- Instance name, status, region, GPU type
- Creation date
- Individual start/stop actions

### API Endpoints

The UI uses these API endpoints:

#### Instance Management
```
GET /api/instances          # List all instances
POST /api/instances/sync    # Synchronize with Novita.ai
POST /api/instances/stop-all # Stop all running instances
POST /api/instances/:id/start # Start specific instance
POST /api/instances/:id/stop  # Stop specific instance
```

#### System Health
```
GET /health                 # System health and sync status
```

#### Cache Management
```
POST /api/cache/clear       # Clear cache
```

### Implementation Details

#### Frontend
- Pure HTML/CSS/JavaScript (no framework dependencies)
- External JavaScript file (CSP compliant)
- Responsive design with modern styling
- Error handling and user feedback
- Auto-refresh functionality

#### Backend Routes
- `src/routes/ui.ts`: Serves the web interface
- `src/routes/instances.ts`: Extended with sync and bulk operations
- `src/routes/health.ts`: Enhanced with sync status

#### Static Files
- `src/public/index.html`: Main UI file
- `src/public/app.js`: JavaScript functionality
- Served via Express static middleware
- CSP compliant (no inline scripts)

## Usage Examples

### Manual Synchronization

```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/instances/sync

# Response
{
  "success": true,
  "message": "Synchronization completed successfully",
  "novitaInstances": 5,
  "redisInstances": 3,
  "synchronized": 5,
  "deleted": 1,
  "errors": [],
  "timestamp": "2024-01-15T10:30:00Z",
  "duration": 2500
}
```

### Stop All Instances

```bash
# Stop all running instances
curl -X POST http://localhost:3000/api/instances/stop-all \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://example.com/webhook"}'

# Response
{
  "success": true,
  "message": "Stop initiated for 3 of 3 running instances",
  "count": 3,
  "total": 3,
  "results": [...],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### Health Check with Sync Status

```bash
# Get system health including sync status
curl http://localhost:3000/health

# Response includes sync information
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:40:00Z",
  "services": {...},
  "sync": {
    "available": true,
    "lastSync": "2024-01-15T10:30:00Z",
    "isLocked": false,
    "cacheSize": 5
  }
}
```

## Benefits

### Data Consistency
- Eliminates stale cache entries
- Ensures Redis cache reflects actual Novita.ai state
- Prevents issues with orphaned instance references

### Operational Efficiency
- Web UI provides quick overview and management
- Bulk operations for emergency scenarios
- Real-time monitoring and health checks

### Reliability
- Automatic sync on startup prevents data drift
- Concurrent protection prevents race conditions
- Comprehensive error handling and logging

## Troubleshooting

### Sync Issues
- Check Redis connectivity in health endpoint
- Review application logs for sync errors
- Verify Novita API credentials and connectivity

### UI Access Issues
- Ensure application is running on expected port
- Check that static files are properly served
- Verify no firewall blocking access
- If seeing CSP errors, ensure JavaScript is in external file (not inline)
- Check browser console for any script loading errors

### Performance Considerations
- Large instance counts may increase sync time
- UI auto-refresh can be disabled if needed
- Redis cache size should be monitored

## Testing

The startup sync service includes comprehensive tests:
```bash
npm test -- startupSyncService.test.ts
```

Tests cover:
- Successful synchronization scenarios
- Error handling (API failures, cache errors)
- Lock acquisition and release
- Orphan cleanup functionality