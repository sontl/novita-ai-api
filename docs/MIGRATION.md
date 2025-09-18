# Spot Instance Auto-Migration Guide

## Overview

The Spot Instance Auto-Migration system automatically detects and migrates Novita GPU instances that have been reclaimed due to spot pricing changes. This system runs as a scheduled background service, ensuring minimal downtime for spot instances that have been terminated.

## How It Works

### Migration Process

1. **Scheduled Execution**: The migration job runs every 15 minutes (configurable)
2. **Instance Discovery**: Fetches all current instances directly from Novita API
3. **Eligibility Check**: Identifies instances with status "exited" that are eligible for migration
4. **Migration Execution**: Calls the Novita migrate instance API for eligible instances
5. **Logging & Metrics**: Records all activities for monitoring and troubleshooting

### Migration Eligibility Criteria

An instance is eligible for migration when:
- Instance status is "exited"
- `spotReclaimTime` field is not "0" (indicating spot reclaim)
- `spotStatus` field is present

Instances are skipped when:
- Status is not "exited"
- `spotReclaimTime` is "0" (normal termination)
- `spotStatus` is empty (not a spot instance)

## Configuration

### Environment Variables

```bash
# Enable/disable migration service
MIGRATION_ENABLED=true

# Schedule interval (1-60 minutes)
MIGRATION_INTERVAL_MINUTES=15

# Job timeout (1-30 minutes)
MIGRATION_JOB_TIMEOUT_MS=600000

# Maximum concurrent migrations (1-20)
MIGRATION_MAX_CONCURRENT=5

# Dry run mode (test without executing)
MIGRATION_DRY_RUN=false

# Retry failed migrations
MIGRATION_RETRY_FAILED=true

# Migration-specific log level
MIGRATION_LOG_LEVEL=info
```

### Configuration Examples

#### Production Configuration
```bash
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=15
MIGRATION_MAX_CONCURRENT=5
MIGRATION_LOG_LEVEL=info
MIGRATION_RETRY_FAILED=true
```

#### High-Frequency Environment
```bash
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=5
MIGRATION_MAX_CONCURRENT=10
MIGRATION_JOB_TIMEOUT_MS=300000
```

#### Development/Testing
```bash
MIGRATION_ENABLED=true
MIGRATION_DRY_RUN=true
MIGRATION_LOG_LEVEL=debug
MIGRATION_INTERVAL_MINUTES=5
```

## API Endpoints

### Migration Status
```bash
GET /api/migration/status
```

Returns current migration service status, statistics, and configuration.

### Manual Migration Trigger
```bash
POST /api/migration/trigger
Content-Type: application/json

{
  "dryRun": false,
  "maxMigrations": 10
}
```

Manually triggers a migration job execution.

### Migration History
```bash
GET /api/migration/history?limit=20&offset=0
```

Returns history of recent migration job executions.

## Monitoring

### Health Check Integration

The migration service status is included in the main health check endpoint:

```bash
curl http://localhost:3000/health
```

Response includes:
```json
{
  "migrationService": {
    "enabled": true,
    "lastExecution": "2024-01-15T10:15:00.000Z",
    "nextExecution": "2024-01-15T10:30:00.000Z",
    "status": "healthy",
    "recentErrors": 0
  }
}
```

### Key Metrics to Monitor

1. **Execution Frequency**: Ensure jobs run on schedule
2. **Success Rate**: Monitor for consistent failures
3. **Migration Rate**: Track how many instances are being migrated
4. **Execution Time**: Watch for performance degradation
5. **Error Count**: Monitor for API or network issues

### Monitoring Scripts

#### Check Migration Service Health
```bash
#!/bin/bash
# Check if migration service is healthy
MIGRATION_STATUS=$(curl -s http://localhost:3000/api/migration/status)
ENABLED=$(echo "$MIGRATION_STATUS" | jq -r '.enabled')
LAST_STATUS=$(echo "$MIGRATION_STATUS" | jq -r '.lastExecution.status')

if [ "$ENABLED" = "true" ] && [ "$LAST_STATUS" = "completed" ]; then
    echo "✅ Migration service is healthy"
else
    echo "❌ Migration service needs attention"
    echo "Enabled: $ENABLED, Last status: $LAST_STATUS"
fi
```

#### Monitor Migration Performance
```bash
#!/bin/bash
# Monitor migration performance metrics
curl -s http://localhost:3000/api/migration/status | jq '{
    success_rate: (.statistics.successfulExecutions / .statistics.totalExecutions * 100),
    avg_execution_time_minutes: (.statistics.averageExecutionTime / 60000),
    total_migrations: .statistics.totalMigrations,
    migration_rate: (.statistics.totalMigrations / .statistics.totalInstancesProcessed * 100)
}'
```

## Troubleshooting

### Common Issues

#### Migration Jobs Not Running
**Symptoms**: No migration activity in logs, status shows "never executed"

**Solutions**:
1. Check if migration is enabled: `MIGRATION_ENABLED=true`
2. Verify configuration is valid
3. Restart service to reinitialize scheduler
4. Check logs for scheduler initialization errors

#### Migration Jobs Failing
**Symptoms**: Jobs start but fail consistently

**Solutions**:
1. Verify Novita API key is valid and active
2. Check network connectivity to Novita API
3. Review API rate limiting settings
4. Check for authentication or authorization issues

#### Incorrect Migration Behavior
**Symptoms**: Wrong instances being migrated or eligible instances skipped

**Solutions**:
1. Enable debug logging: `MIGRATION_LOG_LEVEL=debug`
2. Use dry run mode to test logic: `MIGRATION_DRY_RUN=true`
3. Manually trigger migration to see detailed logs
4. Verify instance status directly with Novita API

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Enable debug logging
MIGRATION_LOG_LEVEL=debug
LOG_LEVEL=debug

# Restart service
docker-compose restart novita-api

# Trigger test migration
curl -X POST http://localhost:3000/api/migration/trigger \
     -H "Content-Type: application/json" \
     -d '{"dryRun": true}'

# Check logs
docker-compose logs novita-api | grep -i migration
```

### Performance Tuning

#### High Load Environments
```bash
# Increase concurrent migrations
MIGRATION_MAX_CONCURRENT=10

# Reduce interval for faster response
MIGRATION_INTERVAL_MINUTES=10

# Increase timeout for large batches
MIGRATION_JOB_TIMEOUT_MS=900000
```

#### Conservative Environments
```bash
# Reduce concurrent migrations
MIGRATION_MAX_CONCURRENT=3

# Increase interval to reduce API load
MIGRATION_INTERVAL_MINUTES=30

# Enable retry for reliability
MIGRATION_RETRY_FAILED=true
```

## Webhook Notifications

When instances are successfully migrated, webhook notifications are sent (if configured):

```json
{
  "event": "instance.migrated",
  "instanceId": "inst-new123",
  "originalInstanceId": "inst-old456",
  "status": "running",
  "timestamp": "2024-01-15T10:45:00.000Z",
  "migration": {
    "reason": "spot_reclaim",
    "triggeredBy": "automatic_migration",
    "migrationTime": 45000
  },
  "instance": {
    "id": "inst-new123",
    "name": "migrated-gpu-instance",
    "connectionDetails": {
      "ssh": "ssh root@inst-new123.novita.ai",
      "jupyter": "https://inst-new123.novita.ai:8888"
    }
  }
}
```

## Best Practices

### Production Deployment

1. **Start with dry run mode** to validate migration logic
2. **Monitor closely** during initial deployment
3. **Set appropriate intervals** based on your workload patterns
4. **Configure alerts** for migration failures
5. **Test webhook integrations** if using notifications

### Operational Guidelines

1. **Regular monitoring** of migration metrics and logs
2. **Alert on high failure rates** or execution delays
3. **Review migration patterns** to optimize configuration
4. **Keep API credentials secure** and rotate regularly
5. **Test disaster recovery** procedures periodically

### Security Considerations

1. **Secure API keys** with proper access controls
2. **Monitor API usage** for unusual patterns
3. **Use HTTPS** for all webhook notifications
4. **Implement webhook signature verification**
5. **Log security events** for audit purposes

## Migration Workflow Integration

### CI/CD Integration

The migration service can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Check Migration Service
  run: |
    # Verify migration service is healthy
    curl -f http://localhost:3000/api/migration/status
    
    # Trigger test migration in dry run mode
    curl -X POST http://localhost:3000/api/migration/trigger \
         -H "Content-Type: application/json" \
         -d '{"dryRun": true}'
```

### Infrastructure as Code

Include migration configuration in your infrastructure templates:

```yaml
# Docker Compose example
environment:
  - MIGRATION_ENABLED=true
  - MIGRATION_INTERVAL_MINUTES=15
  - MIGRATION_MAX_CONCURRENT=5
  - MIGRATION_LOG_LEVEL=info
```

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly**: Review migration statistics and performance
2. **Monthly**: Analyze migration patterns and optimize configuration
3. **Quarterly**: Update dependencies and review security settings
4. **As needed**: Investigate and resolve migration failures

### Logging and Auditing

Migration activities are logged with structured information:

```json
{
  "timestamp": "2024-01-15T10:15:00.000Z",
  "level": "info",
  "message": "Migration job completed",
  "jobId": "migration-job-abc123",
  "duration": 90000,
  "summary": {
    "totalInstances": 45,
    "eligibleInstances": 2,
    "migratedInstances": 2,
    "errorCount": 0
  }
}
```

### Performance Metrics

Key performance indicators to track:

- **Migration Success Rate**: Target >95%
- **Average Execution Time**: Target <2 minutes
- **Migration Rate**: Monitor for unusual spikes
- **API Error Rate**: Target <1%
- **Schedule Adherence**: Jobs should run within 1 minute of schedule

For additional support, refer to the [Troubleshooting Guide](./TROUBLESHOOTING.md) and [Operations Runbook](./OPERATIONS.md).