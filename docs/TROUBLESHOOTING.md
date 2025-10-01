# Troubleshooting Guide

## Overview

This guide helps diagnose and resolve common issues with the Novita GPU Instance API. Issues are organized by category with step-by-step resolution instructions.

## Quick Diagnostics

### Health Check

First, always check the service health:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "dependencies": {
    "novitaApi": "healthy",
    "cache": "healthy"
  }
}
```

### Service Status

Check if the service is running:

```bash
# Docker Compose
docker-compose ps

# Docker
docker ps | grep novita

# System logs
docker-compose logs --tail=50 novita-api
```

## Startup Issues

### Service Won't Start

**Symptoms:**
- Container exits immediately
- Health check fails
- No response on configured port

**Diagnosis:**
```bash
# Check container logs
docker-compose logs novita-api

# Check configuration
docker-compose config

# Verify environment variables
docker-compose exec novita-api env | grep NOVITA
```

**Common Causes & Solutions:**

1. **Missing API Key**
   ```
   Error: NOVITA_API_KEY is required
   ```
   **Solution:** Set the API key in your `.env` file:
   ```bash
   echo "NOVITA_API_KEY=your_api_key_here" >> .env
   ```

2. **Invalid Configuration**
   ```
   Error: Configuration validation failed
   ```
   **Solution:** Check configuration values against the [Configuration Reference](../deployment/configuration.md)

3. **Port Already in Use**
   ```
   Error: EADDRINUSE: address already in use :::3000
   ```
   **Solution:** Change the port or stop the conflicting service:
   ```bash
   # Change port
   echo "PORT=3001" >> .env
   
   # Or find and stop conflicting service
   lsof -i :3000
   ```

4. **Insufficient Memory**
   ```
   Error: JavaScript heap out of memory
   ```
   **Solution:** Increase Docker memory limits:
   ```yaml
   # docker-compose.yml
   services:
     novita-api:
       deploy:
         resources:
           limits:
             memory: 1G
   ```

### Configuration Validation Errors

**Symptoms:**
- Service fails to start with validation errors
- Environment variable warnings

**Diagnosis:**
```bash
# Test configuration loading
docker-compose run --rm novita-api node -e "
  try {
    const config = require('./dist/config/config').default;
    console.log('Configuration valid:', Object.keys(config));
  } catch (error) {
    console.error('Configuration error:', error.message);
  }
"
```

**Solutions:**

1. **Check Required Variables**
   ```bash
   # Verify all required variables are set
   grep -E '^[A-Z_]+=.+' .env
   ```

2. **Validate Value Types**
   ```bash
   # Numbers should be numeric
   PORT=3000          # ✓ Correct
   PORT=three-thousand # ✗ Invalid
   
   # Booleans should be true/false
   HELMET_ENABLED=true  # ✓ Correct
   HELMET_ENABLED=yes   # ✗ Invalid
   ```

3. **Check Value Ranges**
   ```bash
   # Port range: 1-65535
   PORT=80     # ✓ Valid
   PORT=70000  # ✗ Invalid
   
   # Timeout range: 1000-60000ms
   WEBHOOK_TIMEOUT=5000   # ✓ Valid
   WEBHOOK_TIMEOUT=100    # ✗ Too low
   ```

## API Connection Issues

### Novita.ai API Authentication

**Symptoms:**
- 401 Unauthorized responses
- Authentication failed errors
- API key validation failures

**Diagnosis:**
```bash
# Test API key directly
curl -H "Authorization: Bearer $NOVITA_API_KEY" \
     https://api.novita.ai/v1/products

# Check API key format
echo $NOVITA_API_KEY | grep -E '^nv_[a-zA-Z0-9]{32,}$'
```

**Solutions:**

1. **Verify API Key**
   - Ensure the API key is active in your Novita.ai account
   - Check for extra spaces or characters
   - Regenerate the key if necessary

2. **Check API Key Format**
   ```bash
   # Correct format
   NOVITA_API_KEY=nv_1234567890abcdef1234567890abcdef
   
   # Incorrect formats
   NOVITA_API_KEY=1234567890abcdef  # Missing prefix
   NOVITA_API_KEY="nv_123..."       # Quoted (remove quotes)
   ```

### Network Connectivity

**Symptoms:**
- Connection timeout errors
- DNS resolution failures
- Network unreachable errors

**Diagnosis:**
```bash
# Test network connectivity
docker-compose exec novita-api ping -c 3 api.novita.ai

# Test DNS resolution
docker-compose exec novita-api nslookup api.novita.ai

# Test HTTPS connectivity
docker-compose exec novita-api curl -I https://api.novita.ai
```

**Solutions:**

1. **Firewall Issues**
   - Ensure outbound HTTPS (port 443) is allowed
   - Check corporate firewall settings
   - Verify proxy configuration if applicable

2. **DNS Issues**
   ```yaml
   # docker-compose.yml - Add DNS servers
   services:
     novita-api:
       dns:
         - 8.8.8.8
         - 8.8.4.4
   ```

3. **Proxy Configuration**
   ```bash
   # Add to .env if behind proxy
   HTTP_PROXY=http://proxy.company.com:8080
   HTTPS_PROXY=http://proxy.company.com:8080
   NO_PROXY=localhost,127.0.0.1
   ```

### Rate Limiting

**Symptoms:**
- 429 Too Many Requests responses
- Requests being throttled
- Circuit breaker opening

**Diagnosis:**
```bash
# Check rate limit headers in logs
docker-compose logs novita-api | grep -i "rate.limit"

# Monitor request frequency
docker-compose logs novita-api | grep -E "POST|GET" | tail -20
```

**Solutions:**

1. **Adjust Polling Intervals**
   ```bash
   # Increase polling interval
   echo "INSTANCE_POLL_INTERVAL=60000" >> .env  # 1 minute
   ```

2. **Configure Circuit Breaker**
   ```bash
   # Increase threshold before circuit opens
   echo "CIRCUIT_BREAKER_THRESHOLD=10" >> .env
   echo "CIRCUIT_BREAKER_TIMEOUT=120000" >> .env  # 2 minutes
   ```

3. **Implement Backoff Strategy**
   ```bash
   # Increase retry delays
   echo "RETRY_DELAY=5000" >> .env      # 5 seconds
   echo "MAX_RETRIES=2" >> .env         # Reduce retries
   ```

## Instance Management Issues

### Instance Creation Failures

**Symptoms:**
- Instances stuck in "creating" status
- Creation timeout errors
- Invalid product/template errors

**Diagnosis:**
```bash
# Check recent instance creation attempts
curl http://localhost:3000/api/instances | jq '.instances[] | select(.status == "creating")'

# Check logs for creation errors
docker-compose logs novita-api | grep -i "create.*instance"
```

**Solutions:**

1. **Invalid Product Name**
   ```bash
   # List available products
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/v1/products | jq '.products[].name'
   
   # Use exact product name
   curl -X POST http://localhost:3000/api/instances \
        -H "Content-Type: application/json" \
        -d '{"name": "test", "productName": "RTX 4090 24GB", "templateId": "template-123"}'
   ```

2. **Invalid Template ID**
   ```bash
   # Verify template exists
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/v1/templates/template-123
   ```

3. **Insufficient Quota**
   ```bash
   # Check account limits
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/v1/account/limits
   ```

### Instance Startup Issues

**Symptoms:**
- Instances stuck in "starting" status
- Startup timeout errors
- Instance fails to reach "running" state

**Diagnosis:**
```bash
# Check instance status directly with Novita.ai
curl -H "Authorization: Bearer $NOVITA_API_KEY" \
     https://api.novita.ai/v1/instances/INSTANCE_ID

# Check startup monitoring logs
docker-compose logs novita-api | grep -i "monitor.*instance"
```

**Solutions:**

1. **Increase Startup Timeout**
   ```bash
   # Allow more time for startup (15 minutes)
   echo "INSTANCE_STARTUP_TIMEOUT=900000" >> .env
   ```

2. **Check Instance Logs**
   ```bash
   # Get instance logs from Novita.ai API
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/v1/instances/INSTANCE_ID/logs
   ```

3. **Verify Template Configuration**
   - Ensure the template image is valid
   - Check that required ports are properly configured
   - Verify environment variables are correct

### Status Polling Issues

**Symptoms:**
- Outdated instance status
- Polling errors in logs
- Status not updating

**Diagnosis:**
```bash
# Check polling job status
curl http://localhost:3000/api/metrics | jq '.jobs'

# Monitor polling frequency
docker-compose logs novita-api | grep -i "poll" | tail -10
```

**Solutions:**

1. **Adjust Polling Interval**
   ```bash
   # More frequent polling (15 seconds)
   echo "INSTANCE_POLL_INTERVAL=15000" >> .env
   
   # Less frequent polling (2 minutes)
   echo "INSTANCE_POLL_INTERVAL=120000" >> .env
   ```

2. **Clear Cache**
   ```bash
   # Restart service to clear cache
   docker-compose restart novita-api
   ```

## Webhook Issues

### Webhook Delivery Failures

**Symptoms:**
- Webhooks not being received
- Webhook timeout errors
- Retry exhaustion messages

**Diagnosis:**
```bash
# Check webhook configuration
echo $WEBHOOK_URL

# Test webhook endpoint
curl -X POST $WEBHOOK_URL \
     -H "Content-Type: application/json" \
     -d '{"test": "webhook"}'

# Check webhook logs
docker-compose logs novita-api | grep -i webhook
```

**Solutions:**

1. **Verify Webhook URL**
   ```bash
   # Ensure URL is accessible
   curl -I $WEBHOOK_URL
   
   # Check for HTTPS certificate issues
   curl -k -I $WEBHOOK_URL
   ```

2. **Increase Timeout**
   ```bash
   # Allow more time for webhook delivery
   echo "WEBHOOK_TIMEOUT=30000" >> .env  # 30 seconds
   ```

3. **Configure Retries**
   ```bash
   # Increase retry attempts
   echo "WEBHOOK_RETRIES=5" >> .env
   ```

4. **Test with ngrok (Development)**
   ```bash
   # Install ngrok and expose local webhook
   ngrok http 8080
   # Use the ngrok URL as WEBHOOK_URL
   ```

### Webhook Authentication

**Symptoms:**
- Webhook signature validation failures
- Authentication errors from webhook endpoint

**Solutions:**

1. **Configure Webhook Secret**
   ```bash
   echo "WEBHOOK_SECRET=your_secret_here" >> .env
   ```

2. **Verify Signature Calculation**
   ```javascript
   // Example webhook signature verification
   const crypto = require('crypto');
   const signature = crypto
     .createHmac('sha256', process.env.WEBHOOK_SECRET)
     .update(JSON.stringify(payload))
     .digest('hex');
   ```

## Performance Issues

### High Memory Usage

**Symptoms:**
- Container running out of memory
- Slow response times
- Memory leak warnings

**Diagnosis:**
```bash
# Check memory usage
docker stats novita-api

# Check Node.js heap usage
curl http://localhost:3000/api/metrics | jq '.system.memoryUsage'
```

**Solutions:**

1. **Increase Memory Limits**
   ```yaml
   # docker-compose.yml
   services:
     novita-api:
       deploy:
         resources:
           limits:
             memory: 1G
   ```

2. **Optimize Cache Settings**
   ```bash
   # Reduce cache size and TTL
   echo "CACHE_MAX_SIZE=500" >> .env
   echo "CACHE_TTL=180000" >> .env  # 3 minutes
   ```

3. **Enable Garbage Collection**
   ```yaml
   # docker-compose.yml
   services:
     novita-api:
       environment:
         - NODE_OPTIONS=--max-old-space-size=512
   ```

### Slow Response Times

**Symptoms:**
- API requests taking too long
- Timeout errors from clients
- High response time metrics

**Diagnosis:**
```bash
# Check response time metrics
curl http://localhost:3000/api/metrics | jq '.requests.averageResponseTime'

# Test specific endpoints
time curl http://localhost:3000/api/instances
```

**Solutions:**

1. **Enable Caching**
   ```bash
   # Optimize cache settings
   echo "CACHE_TTL=300000" >> .env      # 5 minutes
   echo "PRODUCT_CACHE_TTL=1800000" >> .env  # 30 minutes
   ```

2. **Reduce API Timeouts**
   ```bash
   # Faster timeouts for quicker failures
   echo "API_TIMEOUT=15000" >> .env     # 15 seconds
   ```

3. **Optimize Concurrent Processing**
   ```bash
   # Increase job concurrency
   echo "JOB_CONCURRENCY=10" >> .env
   ```

## Logging and Monitoring Issues

### Missing Logs

**Symptoms:**
- No log output
- Logs not being written to files
- Missing error information

**Solutions:**

1. **Check Log Level**
   ```bash
   # Enable debug logging
   echo "LOG_LEVEL=debug" >> .env
   ```

2. **Configure Log Output**
   ```bash
   # Enable file logging
   echo "LOG_FILE=/var/log/novita-api.log" >> .env
   
   # Mount log directory
   # Add to docker-compose.yml volumes:
   # - ./logs:/var/log
   ```

3. **Verify Log Format**
   ```bash
   # Use simple format for debugging
   echo "LOG_FORMAT=simple" >> .env
   ```

### Health Check Failures

**Symptoms:**
- Container marked as unhealthy
- Health endpoint returning errors
- Monitoring alerts firing

**Diagnosis:**
```bash
# Test health endpoint directly
curl -v http://localhost:3000/health

# Check health check configuration
docker inspect novita-api | jq '.[0].Config.Healthcheck'
```

**Solutions:**

1. **Increase Health Check Timeout**
   ```yaml
   # docker-compose.yml
   services:
     novita-api:
       healthcheck:
         timeout: 30s
         interval: 60s
   ```

2. **Check Dependencies**
   ```bash
   # Test Novita.ai API connectivity
   docker-compose exec novita-api curl -I https://api.novita.ai
   ```

## Migration Service Issues

### Migration Jobs Not Running

**Symptoms:**
- No migration activity in logs
- Migration status shows "never executed"
- Spot instances remain in "exited" state

**Diagnosis:**
```bash
# Check migration service status
curl http://localhost:3000/api/migration/status

# Check migration configuration
docker-compose exec novita-api env | grep MIGRATION

# Check scheduler logs
docker-compose logs novita-api | grep -i migration
```

**Solutions:**

1. **Migration Disabled**
   ```bash
   # Enable migration in configuration
   echo "MIGRATION_ENABLED=true" >> .env
   docker-compose restart novita-api
   ```

2. **Invalid Configuration**
   ```bash
   # Check configuration validation
   docker-compose logs novita-api | grep -i "migration.*config"
   
   # Fix common configuration issues
   echo "MIGRATION_INTERVAL_MINUTES=15" >> .env  # Must be 1-60
   echo "MIGRATION_MAX_CONCURRENT=5" >> .env     # Must be 1-20
   ```

3. **Scheduler Not Starting**
   ```bash
   # Check for scheduler initialization errors
   docker-compose logs novita-api | grep -i "scheduler"
   
   # Restart service to reinitialize scheduler
   docker-compose restart novita-api
   ```

### Migration Jobs Failing

**Symptoms:**
- Migration jobs start but fail consistently
- High error count in migration metrics
- Instances not being migrated despite being eligible

**Diagnosis:**
```bash
# Check recent migration execution history
curl http://localhost:3000/api/migration/history | jq '.executions[0]'

# Check for API errors
docker-compose logs novita-api | grep -E "migration.*error|migration.*fail"

# Test Novita API connectivity
curl -H "Authorization: Bearer $NOVITA_API_KEY" \
     https://api.novita.ai/gpu-instance/openapi/v1/gpu/instances
```

**Solutions:**

1. **API Authentication Issues**
   ```bash
   # Verify API key is valid
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/gpu-instance/openapi/v1/gpu/instances
   
   # Update API key if expired
   echo "NOVITA_API_KEY=new_api_key_here" >> .env
   ```

2. **API Rate Limiting**
   ```bash
   # Reduce migration frequency
   echo "MIGRATION_INTERVAL_MINUTES=30" >> .env
   
   # Reduce concurrent migrations
   echo "MIGRATION_MAX_CONCURRENT=3" >> .env
   ```

3. **Network Connectivity Issues**
   ```bash
   # Test network connectivity to Novita API
   docker-compose exec novita-api ping -c 3 api.novita.ai
   
   # Check for proxy configuration if needed
   echo "HTTP_PROXY=http://proxy.company.com:8080" >> .env
   ```

### Migration Performance Issues

**Symptoms:**
- Migration jobs taking too long to complete
- Job timeouts occurring frequently
- High resource usage during migration

**Diagnosis:**
```bash
# Check migration execution times
curl http://localhost:3000/api/migration/history | \
  jq '.executions[] | {jobId, duration, instanceCount: .summary.totalInstances}'

# Monitor resource usage during migration
docker stats novita-api

# Check for concurrent job conflicts
curl http://localhost:3000/api/metrics | jq '.jobs'
```

**Solutions:**

1. **Increase Job Timeout**
   ```bash
   # Allow more time for migration jobs
   echo "MIGRATION_JOB_TIMEOUT_MS=1200000" >> .env  # 20 minutes
   ```

2. **Optimize Concurrency**
   ```bash
   # Reduce concurrent migrations to avoid overwhelming API
   echo "MIGRATION_MAX_CONCURRENT=3" >> .env
   
   # Or increase if system can handle more
   echo "MIGRATION_MAX_CONCURRENT=8" >> .env
   ```

3. **Batch Size Optimization**
   ```bash
   # Process fewer instances per job (if supported)
   # This would require application-level configuration
   ```

### Incorrect Migration Behavior

**Symptoms:**
- Instances being migrated when they shouldn't be
- Eligible instances being skipped
- Migration logic not following expected rules

**Diagnosis:**
```bash
# Enable debug logging for migration
echo "MIGRATION_LOG_LEVEL=debug" >> .env
docker-compose restart novita-api

# Trigger a test migration to see detailed logs
curl -X POST http://localhost:3000/api/migration/trigger \
     -H "Content-Type: application/json" \
     -d '{"dryRun": true}'

# Check migration decision logic in logs
docker-compose logs novita-api | grep -A 5 -B 5 "eligibility"
```

**Solutions:**

1. **Use Dry Run Mode for Testing**
   ```bash
   # Enable dry run to test logic without actual migrations
   echo "MIGRATION_DRY_RUN=true" >> .env
   docker-compose restart novita-api
   
   # Trigger test migration
   curl -X POST http://localhost:3000/api/migration/trigger
   ```

2. **Verify Instance Status Logic**
   ```bash
   # Check instance status directly from Novita API
   curl -H "Authorization: Bearer $NOVITA_API_KEY" \
        https://api.novita.ai/gpu-instance/openapi/v1/gpu/instances/INSTANCE_ID
   
   # Compare with migration service logic
   docker-compose logs novita-api | grep "INSTANCE_ID"
   ```

3. **Review Migration Criteria**
   ```bash
   # Check that instances meet migration criteria:
   # - status: "exited"
   # - spotReclaimTime: not "0"
   # - spotStatus: present
   ```

### Migration Monitoring Issues

**Symptoms:**
- Missing migration metrics
- Inaccurate migration status
- No visibility into migration operations

**Diagnosis:**
```bash
# Check migration service status endpoint
curl http://localhost:3000/api/migration/status

# Verify metrics collection
curl http://localhost:3000/api/metrics | jq '.migration // "Migration metrics not found"'

# Check health check integration
curl http://localhost:3000/health | jq '.migrationService // "Migration service not in health check"'
```

**Solutions:**

1. **Enable Migration Metrics**
   ```bash
   # Ensure migration service is properly integrated
   docker-compose restart novita-api
   
   # Check for metrics initialization errors
   docker-compose logs novita-api | grep -i "metrics"
   ```

2. **Configure Monitoring Integration**
   ```bash
   # Enable detailed logging for monitoring
   echo "MIGRATION_LOG_LEVEL=info" >> .env
   echo "LOG_LEVEL=info" >> .env
   ```

3. **Verify Service Integration**
   ```bash
   # Check that migration service is registered in health checks
   curl http://localhost:3000/health | jq '.migrationService'
   
   # If missing, restart service to reinitialize
   docker-compose restart novita-api
   ```

## Docker and Container Issues

### Container Build Failures

**Symptoms:**
- Docker build errors
- Missing dependencies
- Build context issues

**Solutions:**

1. **Clear Docker Cache**
   ```bash
   docker-compose build --no-cache
   docker system prune -f
   ```

2. **Check Dockerfile**
   ```bash
   # Verify Dockerfile syntax
   docker build --dry-run .
   ```

3. **Update Base Image**
   ```bash
   # Pull latest base image
   docker pull node:18-alpine
   ```

### Volume Mount Issues

**Symptoms:**
- Configuration not loading
- Log files not persisting
- Permission errors

**Solutions:**

1. **Check Volume Mounts**
   ```yaml
   # docker-compose.yml
   services:
     novita-api:
       volumes:
         - ./.env:/app/.env:ro
         - ./logs:/var/log
   ```

2. **Fix Permissions**
   ```bash
   # Ensure proper ownership
   sudo chown -R 1000:1000 ./logs
   chmod 755 ./logs
   ```

## Emergency Procedures

### Service Recovery

1. **Quick Restart**
   ```bash
   docker-compose restart novita-api
   ```

2. **Full Rebuild**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

3. **Rollback to Previous Version**
   ```bash
   docker tag novita-gpu-instance-api:backup-20240115 novita-gpu-instance-api:latest
   docker-compose up -d
   ```

### Data Recovery

1. **Backup Current State**
   ```bash
   docker-compose logs > backup-$(date +%Y%m%d-%H%M%S).log
   cp .env .env.backup
   ```

2. **Reset to Clean State**
   ```bash
   docker-compose down -v  # Remove volumes
   docker-compose up -d
   ```

## Getting Help

### Collecting Diagnostic Information

Before seeking help, collect this information:

```bash
#!/bin/bash
# diagnostic-info.sh

echo "=== System Information ==="
uname -a
docker --version
docker-compose --version

echo "=== Service Status ==="
docker-compose ps

echo "=== Configuration ==="
docker-compose config

echo "=== Recent Logs ==="
docker-compose logs --tail=100 novita-api

echo "=== Health Check ==="
curl -s http://localhost:3000/health | jq .

echo "=== Metrics ==="
curl -s http://localhost:3000/api/metrics | jq .

echo "=== Migration Status ==="
curl -s http://localhost:3000/api/migration/status | jq .

echo "=== Recent Migration History ==="
curl -s http://localhost:3000/api/migration/history?limit=5 | jq .

echo "=== Environment Variables ==="
docker-compose exec novita-api env | grep -E '^(NOVITA|PORT|LOG|WEBHOOK|MIGRATION)'

echo "=== Migration-Specific Logs ==="
docker-compose logs novita-api | grep -i migration | tail -20
```

### Support Channels

1. **GitHub Issues**: Report bugs and feature requests
2. **Documentation**: Check the complete documentation set
3. **Community Forums**: Ask questions and share solutions
4. **Enterprise Support**: Contact for commercial support options

### Useful Commands Reference

```bash
# Service management
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose restart        # Restart services
docker-compose logs -f        # Follow logs

# Debugging
docker-compose exec novita-api sh    # Shell access
docker-compose run --rm novita-api node -e "console.log('test')"

# Monitoring
docker stats                  # Resource usage
docker-compose ps            # Service status
curl http://localhost:3000/health    # Health check
```

For additional help, refer to the [API Documentation](./API.md) and [Configuration Reference](../deployment/configuration.md).