# Operational Runbook

## Overview

This runbook provides operational procedures for monitoring, maintaining, and troubleshooting the Novita GPU Instance API in production environments.

## Daily Operations

### Health Monitoring

#### Service Health Check
```bash
#!/bin/bash
# scripts/health-check.sh

# Check service health
HEALTH_URL="http://localhost:3000/health"
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health.json "$HEALTH_URL")
HTTP_CODE="${RESPONSE: -3}"

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✓ Service is healthy"
    cat /tmp/health.json | jq .
else
    echo "✗ Service health check failed (HTTP $HTTP_CODE)"
    cat /tmp/health.json 2>/dev/null || echo "No response body"
    exit 1
fi

# Check dependencies
DEPENDENCIES=$(cat /tmp/health.json | jq -r '.dependencies | to_entries[] | select(.value != "healthy") | .key')
if [ -n "$DEPENDENCIES" ]; then
    echo "⚠️  Unhealthy dependencies: $DEPENDENCIES"
    exit 1
fi

echo "✓ All dependencies healthy"
```

#### Metrics Collection
```bash
#!/bin/bash
# scripts/collect-metrics.sh

METRICS_URL="http://localhost:3000/api/metrics"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Collecting metrics at $TIMESTAMP"

# Get current metrics
curl -s "$METRICS_URL" | jq . > "/var/log/metrics/metrics-$(date +%Y%m%d-%H%M%S).json"

# Extract key metrics
METRICS=$(curl -s "$METRICS_URL")
TOTAL_REQUESTS=$(echo "$METRICS" | jq -r '.requests.total')
SUCCESS_RATE=$(echo "$METRICS" | jq -r '.requests.successful / .requests.total * 100')
AVG_RESPONSE_TIME=$(echo "$METRICS" | jq -r '.requests.averageResponseTime')
ACTIVE_INSTANCES=$(echo "$METRICS" | jq -r '.instances.total')

echo "📊 Key Metrics:"
echo "  Total Requests: $TOTAL_REQUESTS"
echo "  Success Rate: ${SUCCESS_RATE}%"
echo "  Avg Response Time: ${AVG_RESPONSE_TIME}ms"
echo "  Active Instances: $ACTIVE_INSTANCES"

# Alert thresholds
if (( $(echo "$SUCCESS_RATE < 95" | bc -l) )); then
    echo "🚨 ALERT: Success rate below 95%"
fi

if (( $(echo "$AVG_RESPONSE_TIME > 5000" | bc -l) )); then
    echo "🚨 ALERT: Average response time above 5 seconds"
fi
```

### Log Management

#### Log Rotation
```bash
#!/bin/bash
# scripts/rotate-logs.sh

LOG_DIR="/var/log/novita-api"
RETENTION_DAYS=30

echo "Rotating logs in $LOG_DIR"

# Compress logs older than 1 day
find "$LOG_DIR" -name "*.log" -mtime +1 -exec gzip {} \;

# Remove compressed logs older than retention period
find "$LOG_DIR" -name "*.log.gz" -mtime +$RETENTION_DAYS -delete

# Restart service to reopen log files
docker-compose restart novita-api

echo "Log rotation complete"
```

#### Log Analysis
```bash
#!/bin/bash
# scripts/analyze-logs.sh

LOG_FILE="/var/log/novita-api/application.log"
HOURS=${1:-24}

echo "Analyzing logs from last $HOURS hours"

# Error analysis
echo "📊 Error Summary:"
grep -E "ERROR|FATAL" "$LOG_FILE" | \
    grep "$(date -d "$HOURS hours ago" '+%Y-%m-%d')" | \
    awk '{print $4}' | sort | uniq -c | sort -nr

# Request analysis
echo "📊 Request Summary:"
grep "HTTP" "$LOG_FILE" | \
    grep "$(date -d "$HOURS hours ago" '+%Y-%m-%d')" | \
    awk '{print $6, $7}' | sort | uniq -c | sort -nr | head -10

# Performance analysis
echo "📊 Slow Requests (>5s):"
grep "responseTime" "$LOG_FILE" | \
    grep "$(date -d "$HOURS hours ago" '+%Y-%m-%d')" | \
    awk -F'responseTime":' '{print $2}' | \
    awk -F',' '{if($1 > 5000) print}' | wc -l
```

## Weekly Operations

### System Maintenance

#### Update Dependencies
```bash
#!/bin/bash
# scripts/update-dependencies.sh

echo "🔄 Starting dependency update process"

# Backup current deployment
echo "📦 Creating backup"
docker tag novita-gpu-instance-api:latest novita-gpu-instance-api:backup-$(date +%Y%m%d)

# Update base images
echo "🐳 Updating base images"
docker pull node:18-alpine
docker pull nginx:alpine

# Update npm dependencies
echo "📦 Updating npm dependencies"
npm audit
npm update

# Rebuild and test
echo "🔨 Rebuilding application"
docker-compose build --no-cache

echo "🧪 Running tests"
npm test

if [ $? -eq 0 ]; then
    echo "✅ Tests passed, deploying update"
    docker-compose up -d
    
    # Wait for health check
    sleep 30
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Update successful"
    else
        echo "❌ Health check failed, rolling back"
        docker tag novita-gpu-instance-api:backup-$(date +%Y%m%d) novita-gpu-instance-api:latest
        docker-compose up -d
    fi
else
    echo "❌ Tests failed, update aborted"
    exit 1
fi
```

#### Performance Optimization
```bash
#!/bin/bash
# scripts/optimize-performance.sh

echo "🚀 Running performance optimization"

# Analyze memory usage
echo "📊 Memory Analysis:"
docker stats --no-stream novita-api | tail -n +2

# Check cache hit rates
CACHE_METRICS=$(curl -s http://localhost:3000/api/metrics | jq '.cache')
HIT_RATE=$(echo "$CACHE_METRICS" | jq -r '.hitRate')

echo "📊 Cache Hit Rate: $(echo "$HIT_RATE * 100" | bc)%"

if (( $(echo "$HIT_RATE < 0.7" | bc -l) )); then
    echo "⚠️  Cache hit rate below 70%, consider tuning cache settings"
fi

# Analyze response times
echo "📊 Response Time Analysis:"
curl -s http://localhost:3000/api/metrics | jq '.requests | {
    total: .total,
    averageResponseTime: .averageResponseTime,
    successRate: (.successful / .total * 100)
}'

# Check for memory leaks
echo "📊 Memory Leak Detection:"
MEMORY_USAGE=$(docker stats --no-stream --format "{{.MemUsage}}" novita-api)
echo "Current memory usage: $MEMORY_USAGE"

# Restart if memory usage is high
MEMORY_MB=$(echo "$MEMORY_USAGE" | sed 's/MiB.*//' | sed 's/.*\///')
if [ "$MEMORY_MB" -gt 400 ]; then
    echo "⚠️  High memory usage detected, restarting service"
    docker-compose restart novita-api
fi
```

## Monthly Operations

### Capacity Planning

#### Usage Analysis
```bash
#!/bin/bash
# scripts/usage-analysis.sh

DAYS=${1:-30}
echo "📊 Usage analysis for last $DAYS days"

# Instance creation trends
echo "📈 Instance Creation Trends:"
grep "Instance created" /var/log/novita-api/application.log | \
    grep "$(date -d "$DAYS days ago" '+%Y-%m')" | \
    awk '{print $1}' | sort | uniq -c

# Popular GPU types
echo "📊 Popular GPU Types:"
grep "productName" /var/log/novita-api/application.log | \
    grep "$(date -d "$DAYS days ago" '+%Y-%m')" | \
    sed 's/.*productName":\s*"\([^"]*\)".*/\1/' | \
    sort | uniq -c | sort -nr

# Peak usage times
echo "📊 Peak Usage Times:"
grep "Instance created" /var/log/novita-api/application.log | \
    grep "$(date -d "$DAYS days ago" '+%Y-%m')" | \
    awk '{print $2}' | cut -d: -f1 | sort | uniq -c | sort -nr

# Resource utilization
echo "📊 Resource Utilization:"
curl -s http://localhost:3000/api/metrics | jq '{
    totalInstances: .instances.total,
    runningInstances: .instances.running,
    failedInstances: .instances.failed,
    jobQueueDepth: .jobs.pending
}'
```

#### Scaling Recommendations
```bash
#!/bin/bash
# scripts/scaling-analysis.sh

echo "📊 Scaling Analysis"

# Get current metrics
METRICS=$(curl -s http://localhost:3000/api/metrics)
TOTAL_REQUESTS=$(echo "$METRICS" | jq -r '.requests.total')
AVG_RESPONSE_TIME=$(echo "$METRICS" | jq -r '.requests.averageResponseTime')
QUEUE_DEPTH=$(echo "$METRICS" | jq -r '.jobs.pending')

echo "Current load:"
echo "  Total requests: $TOTAL_REQUESTS"
echo "  Avg response time: ${AVG_RESPONSE_TIME}ms"
echo "  Queue depth: $QUEUE_DEPTH"

# Scaling recommendations
if (( $(echo "$AVG_RESPONSE_TIME > 3000" | bc -l) )); then
    echo "🔄 RECOMMENDATION: Consider horizontal scaling"
    echo "   - Deploy additional API instances"
    echo "   - Implement load balancing"
fi

if [ "$QUEUE_DEPTH" -gt 10 ]; then
    echo "🔄 RECOMMENDATION: Increase job processing capacity"
    echo "   - Increase JOB_CONCURRENCY setting"
    echo "   - Consider dedicated worker instances"
fi

# Resource recommendations
MEMORY_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" novita-api | sed 's/%//')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    echo "💾 RECOMMENDATION: Increase memory allocation"
    echo "   - Current usage: ${MEMORY_USAGE}%"
    echo "   - Consider increasing container memory limits"
fi
```

## Incident Response

### Service Outage Response

#### Immediate Response (0-15 minutes)
```bash
#!/bin/bash
# scripts/incident-response.sh

echo "🚨 INCIDENT RESPONSE ACTIVATED"
INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"
echo "Incident ID: $INCIDENT_ID"

# Step 1: Assess service status
echo "1️⃣ Assessing service status..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Service responding to health checks"
else
    echo "❌ Service not responding"
    
    # Check if container is running
    if docker-compose ps | grep -q "Up"; then
        echo "🐳 Container is running but not responding"
        echo "📋 Checking recent logs..."
        docker-compose logs --tail=50 novita-api
    else
        echo "🐳 Container is not running"
        echo "🔄 Attempting to restart service..."
        docker-compose up -d
        
        # Wait for startup
        sleep 30
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            echo "✅ Service restored after restart"
        else
            echo "❌ Service still not responding after restart"
        fi
    fi
fi

# Step 2: Check dependencies
echo "2️⃣ Checking dependencies..."
if curl -f https://api.novita.ai > /dev/null 2>&1; then
    echo "✅ Novita.ai API accessible"
else
    echo "❌ Novita.ai API not accessible"
fi

# Step 3: Collect diagnostic information
echo "3️⃣ Collecting diagnostic information..."
mkdir -p "/tmp/incident-$INCIDENT_ID"
docker-compose logs > "/tmp/incident-$INCIDENT_ID/service-logs.txt"
docker stats --no-stream > "/tmp/incident-$INCIDENT_ID/resource-usage.txt"
curl -s http://localhost:3000/api/metrics > "/tmp/incident-$INCIDENT_ID/metrics.json" 2>/dev/null || echo "Metrics unavailable"

echo "📁 Diagnostic information saved to /tmp/incident-$INCIDENT_ID/"
echo "🔔 Incident response complete. Escalate if service is still unavailable."
```

#### Performance Degradation Response
```bash
#!/bin/bash
# scripts/performance-incident.sh

echo "⚡ PERFORMANCE INCIDENT RESPONSE"

# Check current performance metrics
METRICS=$(curl -s http://localhost:3000/api/metrics)
AVG_RESPONSE_TIME=$(echo "$METRICS" | jq -r '.requests.averageResponseTime')
SUCCESS_RATE=$(echo "$METRICS" | jq -r '.requests.successful / .requests.total * 100')

echo "Current performance:"
echo "  Avg response time: ${AVG_RESPONSE_TIME}ms"
echo "  Success rate: ${SUCCESS_RATE}%"

# Performance thresholds
if (( $(echo "$AVG_RESPONSE_TIME > 5000" | bc -l) )); then
    echo "🐌 High response time detected"
    
    # Check resource usage
    MEMORY_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" novita-api)
    CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" novita-api)
    
    echo "Resource usage: CPU $CPU_USAGE, Memory $MEMORY_USAGE"
    
    # Mitigation actions
    echo "🔧 Applying performance mitigations..."
    
    # Restart service if high resource usage
    if (( $(echo "${MEMORY_USAGE%\%} > 90" | bc -l) )); then
        echo "💾 High memory usage, restarting service..."
        docker-compose restart novita-api
    fi
    
    # Clear cache
    echo "🗑️ Clearing cache..."
    # This would require a cache clear endpoint
    
fi

if (( $(echo "$SUCCESS_RATE < 95" | bc -l) )); then
    echo "❌ Low success rate detected"
    
    # Check error patterns
    echo "🔍 Analyzing recent errors..."
    docker-compose logs --tail=100 novita-api | grep -i error | tail -10
fi
```

### Data Recovery Procedures

#### Configuration Recovery
```bash
#!/bin/bash
# scripts/config-recovery.sh

BACKUP_DATE=${1:-$(date -d "1 day ago" +%Y%m%d)}
echo "🔄 Recovering configuration from backup: $BACKUP_DATE"

BACKUP_DIR="/backups/$BACKUP_DATE"
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi

# Stop service
echo "⏹️ Stopping service..."
docker-compose down

# Restore configuration
echo "📁 Restoring configuration files..."
cp "$BACKUP_DIR/.env" .env
cp "$BACKUP_DIR/docker-compose"*.yml .

# Validate configuration
echo "✅ Validating configuration..."
docker-compose config

if [ $? -eq 0 ]; then
    echo "✅ Configuration valid, starting service..."
    docker-compose up -d
    
    # Wait for health check
    sleep 30
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Service restored successfully"
    else
        echo "❌ Service failed to start with restored configuration"
    fi
else
    echo "❌ Configuration validation failed"
    exit 1
fi
```

## Migration Service Monitoring

### Migration-Specific Monitoring

#### Migration Service Health Monitoring
```bash
#!/bin/bash
# scripts/migration-health-check.sh

echo "🔄 Migration Service Health Check"

# Check migration service status
MIGRATION_STATUS=$(curl -s http://localhost:3000/api/migration/status)
ENABLED=$(echo "$MIGRATION_STATUS" | jq -r '.enabled')
LAST_EXECUTION=$(echo "$MIGRATION_STATUS" | jq -r '.lastExecution.status')

echo "Migration enabled: $ENABLED"
echo "Last execution status: $LAST_EXECUTION"

if [ "$ENABLED" = "true" ]; then
    # Check if migration is running on schedule
    NEXT_EXECUTION=$(echo "$MIGRATION_STATUS" | jq -r '.nextExecution')
    CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo "Next execution: $NEXT_EXECUTION"
    echo "Current time: $CURRENT_TIME"
    
    # Check for overdue executions (more than 20 minutes past schedule)
    if [ "$NEXT_EXECUTION" != "null" ]; then
        NEXT_EPOCH=$(date -d "$NEXT_EXECUTION" +%s 2>/dev/null || echo "0")
        CURRENT_EPOCH=$(date +%s)
        DELAY=$((CURRENT_EPOCH - NEXT_EPOCH))
        
        if [ $DELAY -gt 1200 ]; then  # 20 minutes
            echo "⚠️  Migration execution is overdue by $((DELAY / 60)) minutes"
        fi
    fi
    
    # Check recent execution success rate
    SUCCESS_RATE=$(echo "$MIGRATION_STATUS" | jq -r '.statistics.successfulExecutions / .statistics.totalExecutions * 100')
    if (( $(echo "$SUCCESS_RATE < 90" | bc -l) )); then
        echo "⚠️  Migration success rate is low: ${SUCCESS_RATE}%"
    fi
else
    echo "ℹ️  Migration service is disabled"
fi
```

#### Migration Performance Monitoring
```bash
#!/bin/bash
# scripts/migration-performance.sh

echo "📊 Migration Performance Analysis"

# Get migration statistics
MIGRATION_STATUS=$(curl -s http://localhost:3000/api/migration/status)
STATS=$(echo "$MIGRATION_STATUS" | jq '.statistics')

echo "Migration Statistics:"
echo "$STATS" | jq '{
    total_executions: .totalExecutions,
    success_rate: (.successfulExecutions / .totalExecutions * 100),
    total_instances_processed: .totalInstancesProcessed,
    total_migrations_performed: .totalMigrations,
    avg_execution_time_seconds: (.averageExecutionTime / 1000)
}'

# Check recent execution history for trends
HISTORY=$(curl -s http://localhost:3000/api/migration/history?limit=10)
echo "Recent Execution Trends:"
echo "$HISTORY" | jq '.executions[] | {
    jobId: .jobId,
    status: .status,
    duration_seconds: (.duration / 1000),
    migrations_performed: .summary.migratedInstances,
    error_count: .summary.errorCount
}'

# Alert on performance issues
AVG_DURATION=$(echo "$STATS" | jq -r '.averageExecutionTime')
if [ "$AVG_DURATION" != "null" ] && (( $(echo "$AVG_DURATION > 300000" | bc -l) )); then
    echo "⚠️  Average execution time is high: $((AVG_DURATION / 1000)) seconds"
fi

MIGRATION_RATE=$(echo "$STATS" | jq -r '.totalMigrations / .totalInstancesProcessed * 100')
if [ "$MIGRATION_RATE" != "null" ] && (( $(echo "$MIGRATION_RATE > 10" | bc -l) )); then
    echo "⚠️  High migration rate detected: ${MIGRATION_RATE}% of instances are being migrated"
fi
```

#### Spot Instance Monitoring
```bash
#!/bin/bash
# scripts/spot-instance-monitoring.sh

echo "🖥️ Spot Instance Status Monitoring"

# Check for instances in exited state that might need migration
INSTANCES=$(curl -s http://localhost:3000/api/instances)
EXITED_COUNT=$(echo "$INSTANCES" | jq '[.instances[] | select(.status == "exited")] | length')

echo "Instances in 'exited' state: $EXITED_COUNT"

if [ "$EXITED_COUNT" -gt 0 ]; then
    echo "Exited instances details:"
    echo "$INSTANCES" | jq '.instances[] | select(.status == "exited") | {
        id: .id,
        name: .name,
        region: .region,
        exitedAt: .exitedAt
    }'
    
    # Check if migration service is handling these
    LAST_MIGRATION=$(curl -s http://localhost:3000/api/migration/status | jq -r '.lastExecution.completedAt')
    if [ "$LAST_MIGRATION" != "null" ]; then
        echo "Last migration execution: $LAST_MIGRATION"
        
        # Check if there are old exited instances that haven't been processed
        CURRENT_TIME=$(date +%s)
        LAST_MIGRATION_TIME=$(date -d "$LAST_MIGRATION" +%s 2>/dev/null || echo "0")
        TIME_DIFF=$((CURRENT_TIME - LAST_MIGRATION_TIME))
        
        if [ $TIME_DIFF -gt 1800 ] && [ "$EXITED_COUNT" -gt 0 ]; then  # 30 minutes
            echo "⚠️  Exited instances detected but no recent migration activity"
        fi
    fi
fi
```

### Migration Metrics Dashboard

#### Key Migration Metrics
```bash
#!/bin/bash
# scripts/migration-dashboard.sh

echo "🔄 Migration Service Dashboard"
echo "=============================="

# Service status
MIGRATION_STATUS=$(curl -s http://localhost:3000/api/migration/status)
echo "Service Status:"
echo "$MIGRATION_STATUS" | jq '{
    enabled: .enabled,
    last_execution_status: .lastExecution.status,
    next_execution: .nextExecution,
    configuration: {
        interval_minutes: .configuration.intervalMinutes,
        max_concurrent: .configuration.maxConcurrent,
        dry_run_mode: .configuration.dryRunMode
    }
}'

echo ""
echo "Performance Metrics:"
echo "$MIGRATION_STATUS" | jq '{
    total_executions: .statistics.totalExecutions,
    success_rate_percent: (.statistics.successfulExecutions / .statistics.totalExecutions * 100),
    total_instances_processed: .statistics.totalInstancesProcessed,
    total_migrations_performed: .statistics.totalMigrations,
    migration_rate_percent: (.statistics.totalMigrations / .statistics.totalInstancesProcessed * 100),
    avg_execution_time_minutes: (.statistics.averageExecutionTime / 60000)
}'

# Recent activity
echo ""
echo "Recent Activity (Last 5 executions):"
curl -s http://localhost:3000/api/migration/history?limit=5 | jq '.executions[] | {
    job_id: .jobId,
    started_at: .startedAt,
    status: .status,
    duration_minutes: (.duration / 60000),
    summary: .summary
}'

# Current instance status
echo ""
echo "Current Instance Status:"
curl -s http://localhost:3000/api/instances | jq '{
    total_instances: (.instances | length),
    by_status: (.instances | group_by(.status) | map({status: .[0].status, count: length}) | from_entries)
}'
```

## Monitoring and Alerting

### Alert Definitions

#### Critical Alerts
```yaml
# monitoring/alerts.yml
alerts:
  - name: service_down
    condition: health_check_failed
    threshold: 2_consecutive_failures
    severity: critical
    action: page_oncall
    
  - name: high_error_rate
    condition: error_rate > 5%
    window: 5_minutes
    severity: critical
    action: page_oncall
    
  - name: response_time_high
    condition: avg_response_time > 10000ms
    window: 5_minutes
    severity: critical
    action: page_oncall

  - name: novita_api_unavailable
    condition: novita_api_health_check_failed
    threshold: 3_consecutive_failures
    severity: critical
    action: page_oncall
    
  - name: migration_service_down
    condition: migration_service_status != "healthy"
    threshold: 2_consecutive_failures
    severity: critical
    action: page_oncall
    
  - name: migration_jobs_failing
    condition: migration_failure_rate > 50%
    window: 30_minutes
    severity: critical
    action: page_oncall
```

#### Warning Alerts
```yaml
  - name: high_response_time
    condition: avg_response_time > 5000ms
    window: 10_minutes
    severity: warning
    action: notify_team
    
  - name: high_memory_usage
    condition: memory_usage > 80%
    window: 15_minutes
    severity: warning
    action: notify_team
    
  - name: cache_hit_rate_low
    condition: cache_hit_rate < 70%
    window: 30_minutes
    severity: warning
    action: notify_team
    
  - name: queue_depth_high
    condition: job_queue_depth > 50
    window: 10_minutes
    severity: warning
    action: notify_team
    
  - name: migration_execution_delayed
    condition: time_since_last_migration > 20_minutes
    severity: warning
    action: notify_team
    
  - name: migration_execution_slow
    condition: avg_migration_execution_time > 300000ms
    window: 1_hour
    severity: warning
    action: notify_team
    
  - name: spot_instances_not_migrating
    condition: exited_instances_count > 5 AND time_since_last_migration > 30_minutes
    severity: warning
    action: notify_team
```

### Monitoring Dashboard

#### Key Metrics to Monitor
```bash
#!/bin/bash
# scripts/dashboard-metrics.sh

# Service availability
echo "🟢 Service Availability:"
curl -s http://localhost:3000/health | jq -r '.status'

# Request metrics
echo "📊 Request Metrics:"
curl -s http://localhost:3000/api/metrics | jq '{
    total_requests: .requests.total,
    success_rate: (.requests.successful / .requests.total * 100),
    avg_response_time: .requests.averageResponseTime,
    failed_requests: .requests.failed
}'

# Instance metrics
echo "🖥️ Instance Metrics:"
curl -s http://localhost:3000/api/metrics | jq '{
    total_instances: .instances.total,
    running_instances: .instances.running,
    creating_instances: .instances.creating,
    failed_instances: .instances.failed
}'

# Job queue metrics
echo "⚙️ Job Queue Metrics:"
curl -s http://localhost:3000/api/metrics | jq '{
    pending_jobs: .jobs.pending,
    processing_jobs: .jobs.processing,
    completed_jobs: .jobs.completed,
    failed_jobs: .jobs.failed
}'

# Migration metrics
echo "🔄 Migration Metrics:"
curl -s http://localhost:3000/api/migration/status | jq '{
    enabled: .enabled,
    last_execution: .lastExecution.status,
    next_execution: .nextExecution,
    total_executions: .statistics.totalExecutions,
    success_rate: (.statistics.successfulExecutions / .statistics.totalExecutions * 100),
    total_migrations: .statistics.totalMigrations,
    avg_execution_time: .statistics.averageExecutionTime
}'

# System metrics
echo "💻 System Metrics:"
curl -s http://localhost:3000/api/metrics | jq '{
    uptime: .system.uptime,
    memory_usage: .system.memoryUsage,
    cache_hit_rate: .cache.hitRate
}'
```

## Security Operations

### Security Monitoring
```bash
#!/bin/bash
# scripts/security-monitoring.sh

echo "🔒 Security Monitoring Report"

# Check for suspicious API usage
echo "🔍 Suspicious Activity Check:"
grep -E "401|403|429" /var/log/novita-api/application.log | \
    grep "$(date '+%Y-%m-%d')" | \
    awk '{print $1, $6}' | sort | uniq -c | sort -nr | head -10

# Check for unusual request patterns
echo "🔍 Unusual Request Patterns:"
grep "POST /api/instances" /var/log/novita-api/application.log | \
    grep "$(date '+%Y-%m-%d')" | \
    awk '{print $6}' | sort | uniq -c | sort -nr | head -5

# Verify webhook security
echo "🔍 Webhook Security Check:"
if [ -n "$WEBHOOK_SECRET" ]; then
    echo "✅ Webhook secret configured"
else
    echo "⚠️ Webhook secret not configured"
fi

# Check SSL/TLS configuration
echo "🔍 SSL/TLS Check:"
if curl -s https://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ HTTPS endpoint accessible"
else
    echo "⚠️ HTTPS endpoint not configured"
fi
```

### Access Control Audit
```bash
#!/bin/bash
# scripts/access-audit.sh

echo "👥 Access Control Audit"

# Check API key usage patterns
echo "🔑 API Key Usage:"
grep "Authorization" /var/log/novita-api/application.log | \
    grep "$(date '+%Y-%m-%d')" | \
    wc -l
echo "Total authenticated requests today"

# Check for failed authentication attempts
echo "🚫 Failed Authentication Attempts:"
grep "401" /var/log/novita-api/application.log | \
    grep "$(date '+%Y-%m-%d')" | \
    wc -l

# Check rate limiting effectiveness
echo "🚦 Rate Limiting:"
grep "429" /var/log/novita-api/application.log | \
    grep "$(date '+%Y-%m-%d')" | \
    wc -l
echo "Rate limited requests today"
```

## Backup and Recovery

### Automated Backup
```bash
#!/bin/bash
# scripts/automated-backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating automated backup: $BACKUP_DIR"

# Backup configuration
cp .env "$BACKUP_DIR/"
cp docker-compose*.yml "$BACKUP_DIR/"
cp -r docs/ "$BACKUP_DIR/"

# Backup logs (last 7 days)
find /var/log/novita-api -name "*.log*" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

# Backup metrics (if stored)
if [ -d "/var/log/metrics" ]; then
    cp -r /var/log/metrics "$BACKUP_DIR/"
fi

# Create archive
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

# Cleanup old backups (keep 30 days)
find /backups -name "*.tar.gz" -mtime +30 -delete

echo "✅ Backup complete: $BACKUP_DIR.tar.gz"
```

### Disaster Recovery Test
```bash
#!/bin/bash
# scripts/dr-test.sh

echo "🧪 Disaster Recovery Test"

# Create test backup
BACKUP_FILE="/tmp/dr-test-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP_FILE" .env docker-compose*.yml

# Simulate disaster by stopping service
echo "💥 Simulating disaster..."
docker-compose down
docker rmi novita-gpu-instance-api:latest

# Restore from backup
echo "🔄 Restoring from backup..."
tar -xzf "$BACKUP_FILE" -C /tmp/dr-restore/
cp /tmp/dr-restore/.env .
cp /tmp/dr-restore/docker-compose*.yml .

# Rebuild and start
docker-compose build
docker-compose up -d

# Wait and test
sleep 30
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Disaster recovery test successful"
else
    echo "❌ Disaster recovery test failed"
fi

# Cleanup
rm -rf /tmp/dr-restore "$BACKUP_FILE"
```

## Contact Information

### Escalation Matrix

| Severity | Contact | Response Time | Method |
|----------|---------|---------------|---------|
| Critical | On-call Engineer | 15 minutes | Page |
| High | Team Lead | 1 hour | Phone/Slack |
| Medium | Development Team | 4 hours | Slack/Email |
| Low | Development Team | Next business day | Email |

### Emergency Contacts

- **On-call Engineer**: +1-555-0123
- **Team Lead**: +1-555-0124
- **DevOps Team**: devops@company.com
- **Security Team**: security@company.com

### External Dependencies

- **Novita.ai Support**: support@novita.ai
- **Cloud Provider**: AWS Support (if applicable)
- **Monitoring Service**: monitoring@company.com

## Runbook Maintenance

This runbook should be reviewed and updated:
- **Monthly**: Update procedures based on operational experience
- **Quarterly**: Review alert thresholds and escalation procedures
- **After incidents**: Update procedures based on lessons learned
- **After major changes**: Update procedures for new features or infrastructure

Last updated: [Current Date]
Version: 1.0