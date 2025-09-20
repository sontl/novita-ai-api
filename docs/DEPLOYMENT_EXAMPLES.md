# Deployment Examples

This document provides comprehensive deployment examples for different scenarios with Redis persistence.

## Table of Contents

- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Docker Compose Examples](#docker-compose-examples)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Migration Scenarios](#migration-scenarios)
- [Monitoring Setup](#monitoring-setup)

## Development Setup

### Local Development with Redis

```bash
# .env.development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Novita.ai API
NOVITA_API_KEY=dev-api-key-here

# Redis configuration (optional for development)
UPSTASH_REDIS_REST_URL=https://dev-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=dev-redis-token
REDIS_ENABLE_FALLBACK=true
REDIS_KEY_PREFIX=novita_api_dev

# Development optimizations
CACHE_TIMEOUT=60
COMPREHENSIVE_CACHE_TTL=30
INSTANCE_POLL_INTERVAL=10
```

### Local Development without Redis

```bash
# .env.development.local
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Novita.ai API
NOVITA_API_KEY=dev-api-key-here

# No Redis configuration - uses in-memory storage
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# Development settings
CACHE_TIMEOUT=30
INSTANCE_POLL_INTERVAL=5
```

## Production Deployment

### Production with Redis

```bash
# .env.production
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Novita.ai API
NOVITA_API_KEY=prod-api-key-here
NOVITA_API_BASE_URL=https://api.novita.ai

# Redis configuration (required for production)
UPSTASH_REDIS_REST_URL=https://prod-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=prod-redis-token
REDIS_ENABLE_FALLBACK=false  # Strict Redis mode
REDIS_CONNECTION_TIMEOUT_MS=15000
REDIS_COMMAND_TIMEOUT_MS=10000
REDIS_RETRY_ATTEMPTS=5
REDIS_KEY_PREFIX=novita_api_prod

# Production optimizations
CACHE_TIMEOUT=600
COMPREHENSIVE_CACHE_TTL=300
MAX_CONCURRENT_JOBS=20
REQUEST_TIMEOUT=45000
INSTANCE_POLL_INTERVAL=30

# Webhook configuration
WEBHOOK_URL=https://your-production-webhook.com/webhook
WEBHOOK_SECRET=prod-webhook-secret

# Security settings
CORS_ORIGIN=https://your-frontend.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### High Availability Production

```bash
# .env.production.ha
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Novita.ai API
NOVITA_API_KEY=prod-api-key-here

# Redis with fallback for high availability
UPSTASH_REDIS_REST_URL=https://prod-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=prod-redis-token
REDIS_ENABLE_FALLBACK=true  # Enable fallback for HA
REDIS_CONNECTION_TIMEOUT_MS=10000
REDIS_COMMAND_TIMEOUT_MS=5000
REDIS_RETRY_ATTEMPTS=3
REDIS_KEY_PREFIX=novita_api_ha

# Aggressive caching for performance
CACHE_TIMEOUT=300
COMPREHENSIVE_CACHE_TTL=120
MAX_CONCURRENT_JOBS=30

# Health check optimizations
HEALTH_CHECK_INTERVAL=15000
HEALTH_CHECK_TIMEOUT=5000
```

## Docker Compose Examples

### Development with Redis

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  novita-api:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - NOVITA_API_KEY=${NOVITA_API_KEY}
      - UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
      - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
      - REDIS_ENABLE_FALLBACK=true
      - REDIS_KEY_PREFIX=novita_api_dev
    volumes:
      - .:/app
      - /app/node_modules
      - ./logs:/app/logs
    command: npm run dev
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # Optional: Local Redis for development
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  redis_data:
```

### Production with Redis

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  novita-api:
    image: novita-gpu-api:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - NOVITA_API_KEY=${NOVITA_API_KEY}
      - UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
      - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
      - REDIS_ENABLE_FALLBACK=${REDIS_ENABLE_FALLBACK:-false}
      - REDIS_KEY_PREFIX=novita_api_prod
      - CACHE_TIMEOUT=600
      - WEBHOOK_URL=${WEBHOOK_URL}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
    volumes:
      - ./logs:/app/logs
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"

  # Load balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - novita-api
    restart: unless-stopped
```

### Multi-Environment Setup

```yaml
# docker-compose.override.yml (for development)
version: '3.8'

services:
  novita-api:
    environment:
      - REDIS_ENABLE_FALLBACK=true
      - LOG_LEVEL=debug
      - CACHE_TIMEOUT=60
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
```

## Kubernetes Deployment

### Deployment with Redis

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
        - name: LOG_LEVEL
          value: "info"
        
        # Novita.ai API configuration
        - name: NOVITA_API_KEY
          valueFrom:
            secretKeyRef:
              name: novita-secret
              key: api-key
        
        # Redis configuration
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
        - name: REDIS_CONNECTION_TIMEOUT_MS
          value: "15000"
        - name: REDIS_COMMAND_TIMEOUT_MS
          value: "10000"
        
        # Application configuration
        - name: CACHE_TIMEOUT
          value: "600"
        - name: MAX_CONCURRENT_JOBS
          value: "20"
        
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      
      volumes:
      - name: logs
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: novita-api-service
spec:
  selector:
    app: novita-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer

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

### Horizontal Pod Autoscaler

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: novita-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: novita-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

## Migration Scenarios

### Scenario 1: New Deployment with Redis

```bash
#!/bin/bash
# deploy-new-with-redis.sh

set -e

echo "🚀 Deploying new instance with Redis..."

# Set up environment
export NODE_ENV=production
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-redis-token"
export REDIS_ENABLE_FALLBACK=true
export REDIS_KEY_PREFIX="novita_api_prod"

# Test Redis connectivity
echo "🔍 Testing Redis connectivity..."
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"

# Deploy application
echo "📦 Building and deploying application..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Wait for health check
echo "⏳ Waiting for application to be healthy..."
timeout 300 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'

# Verify Redis integration
echo "✅ Verifying Redis integration..."
curl -s http://localhost:3000/health | jq '.redis'

echo "🎉 Deployment completed successfully!"
```

### Scenario 2: Migration from In-Memory to Redis

```bash
#!/bin/bash
# migrate-to-redis.sh

set -e

echo "🔄 Migrating from in-memory to Redis..."

# Backup current state
echo "📦 Creating backup..."
mkdir -p backups
curl -s http://localhost:3000/api/cache/stats > "backups/cache-backup-$(date +%Y%m%d-%H%M%S).json"

# Configure Redis
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-redis-token"
export REDIS_ENABLE_FALLBACK=true

# Test Redis connectivity
echo "🔍 Testing Redis connectivity..."
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"

# Run migration script (dry run first)
echo "🧪 Running migration dry run..."
docker-compose exec novita-api node scripts/redis-migration.js --dry-run

# Confirm migration
read -p "Proceed with actual migration? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Running actual migration..."
    docker-compose exec novita-api node scripts/redis-migration.js
else
    echo "❌ Migration cancelled"
    exit 1
fi

# Update environment and restart
echo "🔄 Updating configuration and restarting..."
echo "REDIS_ENABLE_FALLBACK=true" >> .env
docker-compose restart novita-api

# Verify migration
echo "✅ Verifying migration..."
timeout 120 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'
curl -s http://localhost:3000/health | jq '.redis'

echo "🎉 Migration completed successfully!"
```

### Scenario 3: Rollback from Redis to In-Memory

```bash
#!/bin/bash
# rollback-to-memory.sh

set -e

echo "⏪ Rolling back from Redis to in-memory storage..."

# Backup Redis data
echo "📦 Backing up Redis data..."
mkdir -p backups
docker-compose exec novita-api node scripts/redis-migration.js --dry-run > "backups/redis-backup-$(date +%Y%m%d-%H%M%S).log"

# Remove Redis configuration
echo "🔧 Removing Redis configuration..."
sed -i '/UPSTASH_REDIS/d' .env
sed -i '/REDIS_/d' .env

# Restart with in-memory storage
echo "🔄 Restarting with in-memory storage..."
docker-compose restart novita-api

# Verify rollback
echo "✅ Verifying rollback..."
timeout 120 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'
curl -s http://localhost:3000/health | jq '.redis // "Redis not configured"'

echo "🎉 Rollback completed successfully!"
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'novita-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
    scrape_timeout: 10s

  - job_name: 'novita-api-health'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/health'
    scrape_interval: 15s
    scrape_timeout: 5s
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Novita API with Redis",
    "panels": [
      {
        "title": "Redis Health",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"novita-api-health\"}",
            "legendFormat": "API Health"
          }
        ]
      },
      {
        "title": "Cache Hit Ratio",
        "type": "graph",
        "targets": [
          {
            "expr": "cache_hit_ratio",
            "legendFormat": "Hit Ratio"
          }
        ]
      },
      {
        "title": "Redis Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "redis_response_time_ms",
            "legendFormat": "Response Time (ms)"
          }
        ]
      }
    ]
  }
}
```

### Health Check Monitoring Script

```bash
#!/bin/bash
# monitor-health.sh

HEALTH_URL="http://localhost:3000/health"
ALERT_WEBHOOK="https://your-alert-webhook.com"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Check overall health
    HEALTH_STATUS=$(curl -s "$HEALTH_URL" | jq -r '.status // "unknown"')
    
    # Check Redis specifically
    REDIS_HEALTHY=$(curl -s "$HEALTH_URL" | jq -r '.redis.healthy // false')
    REDIS_AVAILABLE=$(curl -s "$HEALTH_URL" | jq -r '.redis.available // false')
    
    echo "$TIMESTAMP - Health: $HEALTH_STATUS, Redis Healthy: $REDIS_HEALTHY, Redis Available: $REDIS_AVAILABLE"
    
    # Alert on unhealthy status
    if [ "$HEALTH_STATUS" != "healthy" ]; then
        curl -X POST "$ALERT_WEBHOOK" \
             -H "Content-Type: application/json" \
             -d "{\"message\":\"Novita API unhealthy at $TIMESTAMP\",\"status\":\"$HEALTH_STATUS\"}"
    fi
    
    # Alert on Redis issues
    if [ "$REDIS_AVAILABLE" = "true" ] && [ "$REDIS_HEALTHY" != "true" ]; then
        curl -X POST "$ALERT_WEBHOOK" \
             -H "Content-Type: application/json" \
             -d "{\"message\":\"Redis unhealthy at $TIMESTAMP\",\"redis_healthy\":\"$REDIS_HEALTHY\"}"
    fi
    
    sleep 60
done
```

## Best Practices

### Environment Management

1. **Use separate Redis instances** for different environments
2. **Enable fallback mode** in production for high availability
3. **Set appropriate timeouts** based on network conditions
4. **Use consistent key prefixes** to avoid conflicts
5. **Monitor Redis performance** and adjust settings accordingly

### Security

1. **Use strong Redis tokens** and rotate them regularly
2. **Restrict Redis access** to application networks only
3. **Enable TLS** for Redis connections when possible
4. **Use secrets management** for sensitive configuration
5. **Audit Redis access** and monitor for unusual activity

### Performance

1. **Tune cache TTL values** based on data freshness requirements
2. **Monitor cache hit ratios** and optimize accordingly
3. **Use appropriate Redis regions** close to your application
4. **Implement circuit breakers** for Redis operations
5. **Scale Redis instances** based on usage patterns

### Reliability

1. **Always enable fallback mode** unless Redis is absolutely required
2. **Implement proper retry logic** with exponential backoff
3. **Monitor Redis health** continuously
4. **Have rollback procedures** ready
5. **Test disaster recovery** scenarios regularly