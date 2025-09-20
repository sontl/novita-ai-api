# Redis Troubleshooting Guide

This guide helps diagnose and resolve common Redis-related issues in the Novita GPU Instance API.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Connection Issues](#connection-issues)
- [Performance Problems](#performance-problems)
- [Data Consistency Issues](#data-consistency-issues)
- [Fallback Behavior](#fallback-behavior)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [Emergency Procedures](#emergency-procedures)

## Quick Diagnostics

### Health Check Commands

```bash
# Basic health check
curl http://localhost:3000/health | jq '.redis'

# Detailed Redis status
curl http://localhost:3000/health | jq '.dependencies.redis'

# Full health report
curl http://localhost:3000/health | jq '.'
```

### Environment Validation

```bash
# Check Redis configuration
echo "Redis URL: $UPSTASH_REDIS_REST_URL"
echo "Redis Token: ${UPSTASH_REDIS_REST_TOKEN:0:10}..."
echo "Key Prefix: $REDIS_KEY_PREFIX"
echo "Fallback Enabled: $REDIS_ENABLE_FALLBACK"

# Test Redis connectivity
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"
```

### Log Analysis

```bash
# Monitor Redis-related logs
tail -f logs/app.log | grep -i redis

# Check for connection errors
grep -i "redis.*error\|redis.*failed\|redis.*timeout" logs/app.log

# Monitor fallback usage
grep -i "fallback\|degraded" logs/app.log
```

## Connection Issues

### Issue: Redis Connection Failed

**Symptoms:**
- Application fails to start
- Health check shows `redis.available: false`
- Error logs: "Redis connection failed"

**Diagnostic Steps:**

1. **Verify Credentials**
   ```bash
   # Check environment variables
   env | grep REDIS
   
   # Test manual connection
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/ping"
   ```

2. **Check Network Connectivity**
   ```bash
   # Test DNS resolution
   nslookup $(echo $UPSTASH_REDIS_REST_URL | sed 's|https://||' | sed 's|/.*||')
   
   # Test HTTPS connectivity
   curl -I "$UPSTASH_REDIS_REST_URL/ping"
   ```

3. **Validate Configuration**
   ```bash
   # Check URL format
   echo $UPSTASH_REDIS_REST_URL | grep -E '^https://.*\.upstash\.io$'
   
   # Check token format
   echo $UPSTASH_REDIS_REST_TOKEN | wc -c
   ```

**Solutions:**

```bash
# Fix common URL issues
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"  # No trailing slash

# Fix token issues
export UPSTASH_REDIS_REST_TOKEN="your-complete-token"  # No quotes in token

# Enable fallback for immediate recovery
export REDIS_ENABLE_FALLBACK=true

# Restart application
npm restart
```

### Issue: Connection Timeouts

**Symptoms:**
- Intermittent Redis failures
- Timeout errors in logs
- Slow API responses

**Diagnostic Steps:**

1. **Check Timeout Settings**
   ```bash
   echo "Connection Timeout: $REDIS_CONNECTION_TIMEOUT_MS"
   echo "Command Timeout: $REDIS_COMMAND_TIMEOUT_MS"
   ```

2. **Test Response Times**
   ```bash
   # Measure Redis response time
   time curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
             "$UPSTASH_REDIS_REST_URL/ping"
   ```

3. **Monitor Network Latency**
   ```bash
   # Ping Redis server
   ping $(echo $UPSTASH_REDIS_REST_URL | sed 's|https://||' | sed 's|/.*||')
   ```

**Solutions:**

```bash
# Increase timeouts
export REDIS_CONNECTION_TIMEOUT_MS=15000
export REDIS_COMMAND_TIMEOUT_MS=10000

# Adjust retry settings
export REDIS_RETRY_ATTEMPTS=5
export REDIS_RETRY_DELAY_MS=2000

# Restart application
npm restart
```

### Issue: Authentication Errors

**Symptoms:**
- HTTP 401/403 errors
- "Unauthorized" in logs
- Redis operations fail consistently

**Diagnostic Steps:**

1. **Verify Token**
   ```bash
   # Test authentication
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/ping"
   ```

2. **Check Token Permissions**
   ```bash
   # Test basic operations
   curl -X POST \
        -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '["SET", "test", "value"]' \
        "$UPSTASH_REDIS_REST_URL"
   ```

**Solutions:**

```bash
# Regenerate Redis token in Upstash console
# Update environment variable
export UPSTASH_REDIS_REST_TOKEN="new-token"

# Restart application
npm restart
```

## Performance Problems

### Issue: High Redis Latency

**Symptoms:**
- Slow API responses
- High response times in health checks
- Performance degradation

**Diagnostic Steps:**

1. **Measure Redis Performance**
   ```bash
   # Test Redis response times
   for i in {1..10}; do
     time curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
               "$UPSTASH_REDIS_REST_URL/ping" > /dev/null
   done
   ```

2. **Check Cache Hit Ratios**
   ```bash
   # Get cache statistics
   curl http://localhost:3000/api/cache/stats | jq '.hitRatio'
   ```

3. **Monitor Redis Usage**
   ```bash
   # Check Redis memory usage (if available)
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/info"
   ```

**Solutions:**

```bash
# Optimize cache settings
export CACHE_TIMEOUT=300  # Reduce TTL
export COMPREHENSIVE_CACHE_TTL=60
export NOVITA_API_CACHE_TTL=120

# Implement cache size limits
export MAX_CACHE_SIZE=1000

# Consider Redis region proximity
# Move Redis instance closer to application

# Restart application
npm restart
```

### Issue: Memory Usage Problems

**Symptoms:**
- High memory consumption
- Redis storage limits exceeded
- Out of memory errors

**Diagnostic Steps:**

1. **Check Cache Sizes**
   ```bash
   # Get cache statistics
   curl http://localhost:3000/api/cache/stats
   ```

2. **Monitor Redis Keys**
   ```bash
   # Count Redis keys
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/dbsize"
   
   # List key patterns
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/keys/novita_api:*"
   ```

**Solutions:**

```bash
# Reduce cache TTL
export CACHE_TIMEOUT=180
export COMPREHENSIVE_CACHE_TTL=30

# Implement cache cleanup
# (This would be done in application code)

# Clear Redis cache if needed
curl -X POST \
     -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     -d '["FLUSHDB"]' \
     "$UPSTASH_REDIS_REST_URL"

# Restart application
npm restart
```

## Data Consistency Issues

### Issue: Cache Misses After Restart

**Symptoms:**
- All cache entries return misses after restart
- Performance degradation after deployment
- Data not persisting

**Diagnostic Steps:**

1. **Check Redis Key Prefix**
   ```bash
   echo "Key Prefix: $REDIS_KEY_PREFIX"
   
   # List keys with current prefix
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/keys/$REDIS_KEY_PREFIX:*"
   ```

2. **Verify Data Persistence**
   ```bash
   # Set a test key
   curl -X POST \
        -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        -d '["SET", "test-key", "test-value"]' \
        "$UPSTASH_REDIS_REST_URL"
   
   # Restart application and check if key exists
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/get/test-key"
   ```

**Solutions:**

```bash
# Ensure consistent key prefix
export REDIS_KEY_PREFIX=novita_api

# Check for key prefix changes in deployment
# Verify environment variables are correctly set

# Run migration script if needed
node scripts/redis-migration.js

# Restart application
npm restart
```

### Issue: Stale Data

**Symptoms:**
- Outdated information in responses
- Cache not updating
- Inconsistent data between requests

**Diagnostic Steps:**

1. **Check TTL Settings**
   ```bash
   echo "Cache Timeout: $CACHE_TIMEOUT"
   echo "Comprehensive Cache TTL: $COMPREHENSIVE_CACHE_TTL"
   ```

2. **Verify Cache Updates**
   ```bash
   # Check cache statistics
   curl http://localhost:3000/api/cache/stats | jq '.metrics'
   ```

**Solutions:**

```bash
# Reduce cache TTL for more frequent updates
export CACHE_TIMEOUT=120
export COMPREHENSIVE_CACHE_TTL=30

# Clear specific cache entries
curl -X DELETE http://localhost:3000/api/cache/clear

# Restart application
npm restart
```

## Fallback Behavior

### Issue: Unexpected Fallback Usage

**Symptoms:**
- Application using in-memory cache despite Redis being available
- Logs showing fallback messages
- Inconsistent performance

**Diagnostic Steps:**

1. **Check Fallback Configuration**
   ```bash
   echo "Fallback Enabled: $REDIS_ENABLE_FALLBACK"
   ```

2. **Monitor Fallback Events**
   ```bash
   # Check logs for fallback usage
   grep -i "fallback\|degraded" logs/app.log | tail -20
   ```

3. **Test Redis Health**
   ```bash
   # Check Redis health status
   curl http://localhost:3000/health | jq '.redis.healthy'
   ```

**Solutions:**

```bash
# If Redis should be primary, ensure it's healthy
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"

# Disable fallback if Redis is required
export REDIS_ENABLE_FALLBACK=false

# Or fix Redis issues and keep fallback enabled
export REDIS_ENABLE_FALLBACK=true

# Restart application
npm restart
```

### Issue: Fallback Not Working

**Symptoms:**
- Application crashes when Redis is unavailable
- No graceful degradation
- Service unavailable errors

**Diagnostic Steps:**

1. **Verify Fallback Configuration**
   ```bash
   echo "Fallback Enabled: $REDIS_ENABLE_FALLBACK"
   ```

2. **Test Fallback Behavior**
   ```bash
   # Temporarily break Redis connection
   export UPSTASH_REDIS_REST_TOKEN="invalid-token"
   
   # Start application and check if it uses fallback
   npm start
   ```

**Solutions:**

```bash
# Enable fallback mode
export REDIS_ENABLE_FALLBACK=true

# Ensure proper error handling in application
# (This would be verified in code)

# Restart application
npm restart
```

## Monitoring and Alerts

### Health Check Monitoring

```bash
# Continuous health monitoring
watch -n 30 'curl -s http://localhost:3000/health | jq ".redis, .dependencies.redis"'

# Log health status
while true; do
  echo "$(date): $(curl -s http://localhost:3000/health | jq -r '.redis.healthy')"
  sleep 60
done
```

### Performance Monitoring

```bash
# Monitor Redis response times
while true; do
  start=$(date +%s%N)
  curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
       "$UPSTASH_REDIS_REST_URL/ping" > /dev/null
  end=$(date +%s%N)
  echo "$(date): Redis ping: $((($end - $start) / 1000000))ms"
  sleep 30
done
```

### Alert Conditions

Set up alerts for:
- Redis connection failures
- High response times (>1000ms)
- Fallback mode activation
- Cache hit ratio below threshold (<80%)
- Memory usage above threshold

## Emergency Procedures

### Redis Complete Failure

1. **Immediate Response**
   ```bash
   # Enable fallback mode immediately
   export REDIS_ENABLE_FALLBACK=true
   
   # Restart application
   npm restart
   
   # Verify application is running
   curl http://localhost:3000/health
   ```

2. **Investigate and Fix**
   ```bash
   # Check Redis service status
   curl -I "$UPSTASH_REDIS_REST_URL/ping"
   
   # Check Upstash console for service status
   # Verify credentials and configuration
   
   # Test with new Redis instance if needed
   ```

3. **Recovery**
   ```bash
   # Once Redis is restored, test connection
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/ping"
   
   # Restart application to resume Redis usage
   npm restart
   ```

### Data Loss Recovery

1. **Assess Data Loss**
   ```bash
   # Check what data is missing
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
        "$UPSTASH_REDIS_REST_URL/keys/novita_api:*"
   ```

2. **Restore from Backup**
   ```bash
   # If migration backup exists
   node scripts/redis-migration.js
   
   # Or restore from application backup
   # (Implementation depends on backup strategy)
   ```

3. **Rebuild Cache**
   ```bash
   # Clear existing cache
   curl -X DELETE http://localhost:3000/api/cache/clear
   
   # Restart application to rebuild cache
   npm restart
   ```

### Performance Degradation

1. **Immediate Mitigation**
   ```bash
   # Reduce cache TTL to reduce Redis load
   export CACHE_TIMEOUT=60
   export COMPREHENSIVE_CACHE_TTL=15
   
   # Restart application
   npm restart
   ```

2. **Investigate Root Cause**
   ```bash
   # Monitor Redis performance
   time curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
             "$UPSTASH_REDIS_REST_URL/ping"
   
   # Check application metrics
   curl http://localhost:3000/api/cache/stats
   ```

3. **Long-term Solutions**
   - Upgrade Redis instance
   - Optimize cache usage patterns
   - Implement cache partitioning
   - Consider Redis clustering

## Support Escalation

When escalating Redis issues, include:

1. **Environment Information**
   ```bash
   # Collect environment details
   echo "Node Version: $(node --version)"
   echo "Environment: $NODE_ENV"
   echo "Redis URL: $UPSTASH_REDIS_REST_URL"
   echo "Fallback Enabled: $REDIS_ENABLE_FALLBACK"
   ```

2. **Health Status**
   ```bash
   # Current health status
   curl http://localhost:3000/health > health-status.json
   ```

3. **Recent Logs**
   ```bash
   # Last 100 lines of logs
   tail -100 logs/app.log > recent-logs.txt
   
   # Redis-specific logs
   grep -i redis logs/app.log | tail -50 > redis-logs.txt
   ```

4. **Configuration**
   ```bash
   # Sanitized configuration (remove sensitive data)
   env | grep -E "(REDIS|CACHE|TIMEOUT)" | sed 's/TOKEN=.*/TOKEN=***/' > config.txt
   ```

Include all these files when contacting support for faster resolution.