# Redis Configuration Guide

This guide covers how to configure and deploy the Novita GPU Instance API with Redis persistence using Upstash.

## Table of Contents

- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Deployment Scenarios](#deployment-scenarios)
- [Migration from In-Memory](#migration-from-in-memory)
- [Monitoring and Health Checks](#monitoring-and-health-checks)
- [Troubleshooting](#troubleshooting)

## Overview

The application requires Redis for all persistent storage:
- **Cache Services**: Instance details, product information, and API responses
- **Job Queue Services**: Background job processing and persistence

Redis provides:
- ✅ Data persistence across application restarts
- ✅ Distributed deployment support
- ✅ Improved scalability
- ✅ Required for application operation (no fallback available)

## Environment Variables

### Required Redis Configuration

```bash
# Upstash Redis connection (REQUIRED - application will not start without Redis)
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Optional Redis settings
REDIS_CONNECTION_TIMEOUT_MS=10000      # Connection timeout (default: 10000)
REDIS_COMMAND_TIMEOUT_MS=5000          # Command timeout (default: 5000)
REDIS_RETRY_ATTEMPTS=3                 # Retry attempts (default: 3)
REDIS_RETRY_DELAY_MS=1000             # Retry delay (default: 1000)
REDIS_KEY_PREFIX=novita_api           # Key prefix (default: novita_api)
```

### Application Configuration

```bash
# Core application settings
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Novita.ai API
NOVITA_API_KEY=your-novita-api-key
NOVITA_API_BASE_URL=https://api.novita.ai

# Optional webhook configuration
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook
WEBHOOK_SECRET=your-webhook-secret
```

## Configuration Examples

### Development Environment

```bash
# .env.development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Novita.ai API
NOVITA_API_KEY=dev-api-key
NOVITA_API_BASE_URL=https://api.novita.ai

# Redis (optional for development)
UPSTASH_REDIS_REST_URL=https://dev-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=dev-token
REDIS_ENABLE_FALLBACK=true
REDIS_KEY_PREFIX=novita_api_dev
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Novita.ai API
NOVITA_API_KEY=prod-api-key
NOVITA_API_BASE_URL=https://api.novita.ai

# Redis (required for production)
UPSTASH_REDIS_REST_URL=https://prod-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=prod-token
REDIS_ENABLE_FALLBACK=false
REDIS_CONNECTION_TIMEOUT_MS=15000
REDIS_COMMAND_TIMEOUT_MS=10000
REDIS_RETRY_ATTEMPTS=5
REDIS_KEY_PREFIX=novita_api_prod

# Production optimizations
CACHE_TIMEOUT=600
MAX_CONCURRENT_JOBS=20
REQUEST_TIMEOUT=45000
```

### Docker Compose Example

```yaml
# docker-compose.yml
version: '3.8'

services:
  novita-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - LOG_LEVEL=info
      
      # Novita.ai API
      - NOVITA_API_KEY=${NOVITA_API_KEY}
      - NOVITA_API_BASE_URL=https://api.novita.ai
      
      # Redis configuration
      - UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
      - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
      - REDIS_ENABLE_FALLBACK=true
      - REDIS_KEY_PREFIX=novita_api
      
      # Performance settings
      - CACHE_TIMEOUT=300
      - MAX_CONCURRENT_JOBS=15
      
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    restart: unless-stopped
    
    # Optional: Use secrets for sensitive data
    secrets:
      - redis_token
      - novita_api_key

secrets:
  redis_token:
    external: true
  novita_api_key:
    external: true
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: novita-api
  labels:
    app: novita-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: novita-api
  template:
    metadata:
      labels:
        app: novita-api
    spec:
      containers:
      - name: novita-api
        image: novita-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: LOG_LEVEL
          value: "info"
        
        # Redis configuration from ConfigMap
        - name: UPSTASH_REDIS_REST_URL
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: url
        - name: UPSTASH_REDIS_REST_TOKEN
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: token
        - name: REDIS_ENABLE_FALLBACK
          value: "true"
        - name: REDIS_KEY_PREFIX
          value: "novita_api_k8s"
        
        # Novita.ai API from Secret
        - name: NOVITA_API_KEY
          valueFrom:
            secretKeyRef:
              name: novita-secret
              key: api-key
        
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 5
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
data:
  url: "https://prod-redis.upstash.io"

---
apiVersion: v1
kind: Secret
metadata:
  name: redis-secret
type: Opaque
data:
  token: <base64-encoded-redis-token>

---
apiVersion: v1
kind: Secret
metadata:
  name: novita-secret
type: Opaque
data:
  api-key: <base64-encoded-novita-api-key>
```

## Deployment Scenarios

### Scenario 1: New Deployment with Redis

For new deployments, simply configure Redis environment variables:

```bash
# Set up environment
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-token"
export REDIS_ENABLE_FALLBACK="true"

# Deploy application
npm run build
npm start
```

### Scenario 2: Migration from In-Memory to Redis

For existing deployments, use the migration utility:

```bash
# 1. Prepare Redis configuration
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-token"

# 2. Run migration in dry-run mode first
MIGRATION_DRY_RUN=true node scripts/redis-migration.js

# 3. Run actual migration
node scripts/redis-migration.js

# 4. Update application configuration
export REDIS_ENABLE_FALLBACK="true"

# 5. Restart application
npm restart
```

### Scenario 3: Fallback Mode

Enable fallback mode for high availability:

```bash
# Enable fallback to in-memory storage
export REDIS_ENABLE_FALLBACK="true"

# Application will automatically fall back if Redis is unavailable
npm start
```

### Scenario 4: Redis-Only Mode

For production deployments requiring Redis:

```bash
# Disable fallback (Redis required)
export REDIS_ENABLE_FALLBACK="false"

# Application will fail to start if Redis is unavailable
npm start
```

## Migration from In-Memory

### Using the Migration Script

The included migration script (`scripts/redis-migration.js`) helps migrate existing data:

```bash
# Basic migration
node scripts/redis-migration.js

# Dry run (recommended first)
MIGRATION_DRY_RUN=true node scripts/redis-migration.js

# Verbose logging
MIGRATION_VERBOSE=true node scripts/redis-migration.js

# Help
node scripts/redis-migration.js --help
```

### Manual Migration Steps

1. **Backup Current Data**
   ```bash
   # Create backup directory
   mkdir -p backups
   
   # Export current application state (if applicable)
   curl http://localhost:3000/api/cache/stats > backups/cache-backup.json
   ```

2. **Configure Redis**
   ```bash
   # Set Redis environment variables
   export UPSTASH_REDIS_REST_URL="your-redis-url"
   export UPSTASH_REDIS_REST_TOKEN="your-redis-token"
   export REDIS_ENABLE_FALLBACK="true"
   ```

3. **Test Redis Connection**
   ```bash
   # Test configuration
   npm run test -- --testPathPattern=redis
   ```

4. **Deploy with Fallback**
   ```bash
   # Deploy with fallback enabled
   npm run build
   npm start
   ```

5. **Verify Migration**
   ```bash
   # Check health endpoint
   curl http://localhost:3000/health
   
   # Verify Redis status
   curl http://localhost:3000/health | jq '.redis'
   ```

## Monitoring and Health Checks

### Health Check Endpoint

The `/health` endpoint provides Redis status information:

```bash
curl http://localhost:3000/health | jq '.redis'
```

Example response:
```json
{
  "redis": {
    "available": true,
    "healthy": true,
    "cacheManager": {
      "available": true,
      "configuration": {
        "defaultBackend": "fallback",
        "enableFallback": true,
        "cacheCount": 3,
        "redisConnected": true
      }
    }
  }
}
```

### Monitoring Metrics

Key metrics to monitor:

- **Redis Connection Status**: `redis.healthy`
- **Cache Hit Ratio**: Available via cache stats
- **Fallback Usage**: Check logs for fallback events
- **Error Rates**: Monitor Redis operation failures

### Logging

Redis operations are logged with appropriate levels:

```bash
# Enable debug logging for Redis operations
export LOG_LEVEL=debug

# Monitor logs
tail -f logs/app.log | grep -i redis
```

## Troubleshooting

### Common Issues

#### 1. Redis Connection Failed

**Symptoms:**
- Application fails to start (if fallback disabled)
- Health check shows `redis.healthy: false`
- Logs show connection errors

**Solutions:**
```bash
# Check Redis credentials
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN

# Test Redis connection manually
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"

# Enable fallback mode
export REDIS_ENABLE_FALLBACK=true
```

#### 2. High Redis Latency

**Symptoms:**
- Slow API responses
- Timeout errors in logs
- High response times in health checks

**Solutions:**
```bash
# Increase timeouts
export REDIS_CONNECTION_TIMEOUT_MS=15000
export REDIS_COMMAND_TIMEOUT_MS=10000

# Check Redis region/location
# Ensure Redis instance is in same region as application

# Monitor Redis performance
curl http://localhost:3000/health | jq '.dependencies.redis'
```

#### 3. Cache Misses After Restart

**Symptoms:**
- All cache entries return misses after restart
- Performance degradation after deployment

**Solutions:**
```bash
# Check Redis key prefix
export REDIS_KEY_PREFIX=novita_api

# Verify Redis data persistence
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/keys/novita_api:*"

# Check TTL settings
export CACHE_TIMEOUT=600
```

#### 4. Memory Usage Issues

**Symptoms:**
- High memory usage
- Redis storage limits exceeded
- Performance degradation

**Solutions:**
```bash
# Configure cache cleanup
export CACHE_TIMEOUT=300  # Shorter TTL

# Monitor cache sizes
curl http://localhost:3000/api/cache/stats

# Implement cache size limits (in application configuration)
```

### Debug Commands

```bash
# Test Redis connectivity
node -e "
const { RedisClient } = require('./dist/utils/redisClient');
const client = new RedisClient({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});
client.ping().then(console.log).catch(console.error);
"

# Check Redis keys
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/keys/*"

# Monitor application logs
tail -f logs/app.log | grep -E "(redis|cache|error)"

# Check application health
watch -n 5 'curl -s http://localhost:3000/health | jq ".redis, .dependencies.redis"'
```

### Performance Tuning

```bash
# Optimize Redis settings
export REDIS_CONNECTION_TIMEOUT_MS=5000
export REDIS_COMMAND_TIMEOUT_MS=3000
export REDIS_RETRY_ATTEMPTS=2
export REDIS_RETRY_DELAY_MS=500

# Optimize cache settings
export CACHE_TIMEOUT=300
export COMPREHENSIVE_CACHE_TTL=60
export NOVITA_API_CACHE_TTL=120

# Monitor and adjust based on usage patterns
```

## Best Practices

1. **Always enable fallback in production** for high availability
2. **Use appropriate TTL values** to balance performance and data freshness
3. **Monitor Redis metrics** regularly
4. **Test Redis connectivity** before deployment
5. **Use migration scripts** for data migration
6. **Implement proper error handling** for Redis operations
7. **Configure appropriate timeouts** based on network conditions
8. **Use Redis key prefixes** to avoid conflicts in shared instances

## Support

For additional support:
- Check application logs for detailed error messages
- Use the health check endpoint for real-time status
- Run migration scripts in dry-run mode first
- Monitor Redis performance metrics
- Contact support with specific error messages and configuration details