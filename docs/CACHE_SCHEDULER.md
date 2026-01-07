# Automated Cache Clearing

## Overview

The application now includes an automated cache clearing scheduler that runs every day at **11:00 PM** (Europe/Paris timezone).

## Features

### Automatic Daily Cache Clearing
- **Schedule**: Every day at 11:00 PM
- **Timezone**: Europe/Paris (configurable in `src/services/cacheClearScheduler.ts`)
- **What it clears**:
  - All cache manager caches
  - Template service cache
  - Any other service-specific caches

### How It Works

The scheduler is automatically started when the application initializes and runs in the background:

1. **Service Initialization** (`src/index.ts`):
   - The `cacheClearScheduler` is imported and started after all services are initialized
   - It runs alongside other schedulers like the auto-stop service

2. **Scheduled Task** (`src/services/cacheClearScheduler.ts`):
   - Uses `node-cron` library to schedule tasks
   - Cron expression: `0 23 * * *` (minute=0, hour=23, every day)
   - Automatically clears all caches at the scheduled time

3. **Graceful Shutdown**:
   - The scheduler is properly stopped when the application shuts down
   - Ensures clean resource cleanup

## API Endpoints

### Get Scheduler Status

**Endpoint**: `GET /api/cache/scheduler/status`

**Response**:
```json
{
  "scheduler": {
    "isRunning": true,
    "executionCount": 5,
    "lastExecution": "2026-01-07T22:00:00.000Z",
    "nextExecution": "2026-01-08T22:00:00.000Z",
    "schedule": "Daily at 11:00 PM"
  },
  "timestamp": "2026-01-07T10:30:00.000Z"
}
```

### Manually Trigger Cache Clear

**Endpoint**: `POST /api/cache/scheduler/trigger`

**Description**: Triggers an immediate cache clear without affecting the scheduled time.

**Response**:
```json
{
  "message": "Cache clear triggered successfully",
  "timestamp": "2026-01-07T10:30:00.000Z"
}
```

## Configuration

### Changing the Schedule Time

To change when the cache clearing runs, edit `src/services/cacheClearScheduler.ts`:

```typescript
// Current: Daily at 11 PM
this.scheduledTask = cron.schedule('0 23 * * *', async () => {
  await this.executeCacheClear();
}, {
  timezone: 'Europe/Paris'
});

// Examples of other schedules:
// Every day at 2 AM: '0 2 * * *'
// Every day at midnight: '0 0 * * *'
// Every 6 hours: '0 */6 * * *'
// Every Monday at 3 AM: '0 3 * * 1'
```

### Changing the Timezone

Update the `timezone` option in the scheduler configuration:

```typescript
{
  timezone: 'America/New_York'  // or any valid IANA timezone
}
```

## Monitoring

### Logs

The scheduler logs important events:

- **Startup**: When the scheduler starts
- **Execution**: Each time cache clearing runs
- **Completion**: Success/failure of each execution
- **Shutdown**: When the scheduler stops

Example log entries:
```
INFO: Cache clear scheduler started successfully
INFO: Starting scheduled cache clear operation
INFO: Scheduled cache clear completed successfully
```

### Metrics

Track the scheduler's performance:
- `executionCount`: Total number of times cache has been cleared
- `lastExecution`: Timestamp of the last execution
- `nextExecution`: When the next execution is scheduled

## Implementation Details

### Files Modified/Created

1. **New File**: `src/services/cacheClearScheduler.ts`
   - Contains the `CacheClearScheduler` class
   - Handles scheduling and execution logic

2. **Modified**: `src/index.ts`
   - Imports and starts the scheduler
   - Adds scheduler shutdown to graceful shutdown sequence

3. **Modified**: `src/routes/cache.ts`
   - Adds two new API endpoints for scheduler status and manual triggering

4. **Modified**: `package.json`
   - Added `node-cron` and `@types/node-cron` dependencies

### Dependencies

- **node-cron**: Cron-based task scheduler for Node.js
- **@types/node-cron**: TypeScript type definitions

## Troubleshooting

### Scheduler Not Running

Check the application logs on startup for:
```
INFO: Cache clear scheduler initialized
```

If missing, the scheduler failed to start. Check for errors in the logs.

### Wrong Time Zone

The cache is clearing at an unexpected time:
1. Verify your server's timezone: `date`
2. Update the `timezone` option in `cacheClearScheduler.ts`
3. Rebuild and restart the application

### Manual Testing

To test the scheduler without waiting:

1. **Check Status**:
   ```bash
   curl http://localhost:3000/api/cache/scheduler/status
   ```

2. **Manually Trigger**:
   ```bash
   curl -X POST http://localhost:3000/api/cache/scheduler/trigger
   ```

3. **Check Logs**:
   Look for execution logs to verify the cache was cleared

## Security Considerations

- The scheduler runs automatically without authentication
- API endpoints follow the same authentication as other cache endpoints
- Only authorized users should have access to trigger manual cache clearing
- Consider implementing rate limiting for the manual trigger endpoint

## Future Enhancements

Potential improvements:
- Configurable schedule via environment variables
- Multiple schedules (e.g., cleanup expired caches hourly, full clear daily)
- Email notifications on cache clear completion/failure
- Integration with monitoring services (Prometheus metrics)
- Web UI controls to enable/disable or modify the schedule
