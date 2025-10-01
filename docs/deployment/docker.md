# Docker Deployment Guide

## Overview

This guide covers deploying the Novita GPU Instance API using Docker Compose for production and development environments. The deployment includes comprehensive production-ready features with security hardening, monitoring, and automation.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Novita.ai API key
- At least 512MB RAM and 1 CPU core
- Network access to api.novita.ai
- Valid `.env` file with required configuration

## Files Created/Updated

### Core Docker Files
- **Dockerfile**: Multi-stage build with security hardening
- **docker-compose.yml**: Main service configuration
- **docker-compose.override.yml**: Development overrides
- **docker-compose.prod.yml**: Production-specific configuration
- **docker-compose.example.yml**: Example customizations
- **.dockerignore**: Optimized build context

### Deployment Scripts
- **scripts/deploy-dev.sh**: Development deployment automation
- **scripts/deploy-prod.sh**: Production deployment automation
- **scripts/health-check.sh**: Service health verification
- **scripts/backup.sh**: Backup and recovery automation

### Documentation
- **Makefile**: Common operations automation

## Quick Start Commands

### Development
```bash
# Setup and start development
make setup
make dev

# View logs
make logs

# Run health check
make health
```

### Production
```bash
# Deploy to production
make prod

# View production logs
make prod-logs

# Create backup
make backup
```

### Traditional Commands
```bash
# Clone and Setup
git clone <repository-url>
cd novita-gpu-instance-api
cp .env.example .env

# Configure Environment
# Edit .env file with your settings
NOVITA_API_KEY=your_api_key_here
WEBHOOK_URL=https://your-app.com/webhook
```

### 3. Development Deployment
```bash
# Start in development mode with hot reload
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. Production Deployment
```bash
# Build and start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or use the production script
./scripts/deploy-prod.sh
```

### 5. Verify Deployment
```bash
curl http://localhost:3000/health
```

## Deployment Scripts

The deployment includes several automation scripts for common operations:

### Production Deployment Script

**scripts/deploy-prod.sh**
```bash
#!/bin/bash
# scripts/deploy-prod.sh

set -e

echo "🚀 Starting production deployment..."

# Backup current deployment
if [ -f docker-compose.prod.yml ]; then
    echo "📦 Creating backup..."
    docker-compose -f docker-compose.prod.yml down
    docker tag novita-gpu-instance-api:latest novita-gpu-instance-api:backup-$(date +%Y%m%d-%H%M%S) || true
fi

# Build and deploy
echo "🔨 Building application..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 30

# Verify deployment
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Deployment successful!"
    echo "🌐 API available at: http://localhost:3000"
    echo "📊 Health check: http://localhost:3000/health"
    echo "📈 Metrics: http://localhost:3000/api/metrics"
else
    echo "❌ Deployment failed - health check failed"
    echo "📋 Checking logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "🎉 Production deployment complete!"
```

### Development Setup Script

**scripts/setup-dev.sh**
```bash
#!/bin/bash
# scripts/setup-dev.sh

set -e

echo "🛠️ Setting up development environment..."

# Copy environment template
if [ ! -f .env ]; then
    cp .env.example .env
    echo "📝 Created .env file - please configure your API keys"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build and start development environment
echo "🔨 Building development environment..."
docker-compose build

echo "🚀 Starting development services..."
docker-compose up -d

# Wait for services
sleep 10

# Run tests
echo "🧪 Running tests..."
npm test

echo "✅ Development environment ready!"
echo "🌐 API available at: http://localhost:3000"
echo "📊 Health check: http://localhost:3000/health"
```

### Backup Script

**scripts/backup.sh**
```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup configuration
cp .env "$BACKUP_DIR/"
cp docker-compose*.yml "$BACKUP_DIR/"

# Backup logs
docker-compose logs > "$BACKUP_DIR/application.log"

# Create archive
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

## Configuration Validation

Both development and production configurations have been validated:

✅ **Development Configuration**
- Hot reload support
- Debug logging enabled
- Source code mounting
- Relaxed security for debugging
- Generous resource limits

✅ **Production Configuration**
- Optimized image build
- Security hardening enabled
- Resource limits enforced
- Health checks configured
- Log management setup

## Environment Configuration

### Required Variables

```bash
# Novita.ai API Configuration
NOVITA_API_KEY=your_novita_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Optional Variables

```bash
# Webhook Configuration
WEBHOOK_URL=https://your-app.com/webhook
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_TIMEOUT=10000

# Polling Configuration
INSTANCE_POLL_INTERVAL=30000
INSTANCE_STARTUP_TIMEOUT=600000

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY=1000
CIRCUIT_BREAKER_THRESHOLD=5

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json

# Cache Configuration
CACHE_TTL=300000
CACHE_MAX_SIZE=1000

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Redis Configuration (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPSTASH_REDIS_REST_URL` | No | - | Upstash Redis REST URL for persistence |
| `UPSTASH_REDIS_REST_TOKEN` | No | - | Upstash Redis authentication token |
| `REDIS_ENABLE_FALLBACK` | No | `true` | Enable fallback to in-memory storage |
| `REDIS_CONNECTION_TIMEOUT_MS` | No | `10000` | Redis connection timeout (milliseconds) |
| `REDIS_COMMAND_TIMEOUT_MS` | No | `5000` | Redis command timeout (milliseconds) |
| `REDIS_RETRY_ATTEMPTS` | No | `3` | Redis operation retry attempts |
| `REDIS_RETRY_DELAY_MS` | No | `1000` | Redis retry delay (milliseconds) |
| `REDIS_KEY_PREFIX` | No | `novita_api` | Redis key prefix for namespacing |

## Docker Compose Configurations

### Production Deployment

**docker-compose.prod.yml**
```yaml
version: '3.8'

services:
  novita-api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.5'
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - novita-network

  # Optional: Reverse proxy with SSL
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
    networks:
      - novita-network

networks:
  novita-network:
    driver: bridge
```

### Development Deployment

**docker-compose.yml**
```yaml
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
      - PORT=3000
      - LOG_LEVEL=debug
    env_file:
      - .env
    volumes:
      - .:/app
      - /app/node_modules
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - novita-network

networks:
  novita-network:
    driver: bridge
```

## Key Features Implemented

### 🔒 Security Hardening
- Non-root user execution (nodejs:1001)
- Read-only root filesystem
- No new privileges security option
- Temporary filesystems for /tmp and /var/tmp
- Security-optimized base image (Alpine Linux)
- Proper signal handling with dumb-init

### 🔐 Network Security
- **Isolated network**: Services run in dedicated Docker network
- **Port exposure**: Only necessary ports are exposed
- **CORS configuration**: Configurable CORS settings
- **Rate limiting**: Built-in rate limiting protection

## Deployment Scripts

### Production Deployment

```bash
#!/bin/bash
# scripts/deploy-prod.sh

set -e

echo "🚀 Starting production deployment..."

# Backup current deployment
if [ -f docker-compose.prod.yml ]; then
    echo "📦 Creating backup..."
    docker-compose -f docker-compose.prod.yml down
    docker tag novita-gpu-instance-api:latest novita-gpu-instance-api:backup-$(date +%Y%m%d-%H%M%S) || true
fi

# Build and deploy
echo "🔨 Building application..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 30

# Verify deployment
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Deployment successful!"
    echo "🌐 API available at: http://localhost:3000"
    echo "📊 Health check: http://localhost:3000/health"
    echo "📈 Metrics: http://localhost:3000/api/metrics"
else
    echo "❌ Deployment failed - health check failed"
    echo "📋 Checking logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "🎉 Production deployment complete!"
```

### Development Setup

```bash
#!/bin/bash
# scripts/setup-dev.sh

set -e

echo "🛠️ Setting up development environment..."

# Copy environment template
if [ ! -f .env ]; then
    cp .env.example .env
    echo "📝 Created .env file - please configure your API keys"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build and start development environment
echo "🔨 Building development environment..."
docker-compose build

echo "🚀 Starting development services..."
docker-compose up -d

# Wait for services
sleep 10

# Run tests
echo "🧪 Running tests..."
npm test

echo "✅ Development environment ready!"
echo "🌐 API available at: http://localhost:3000"
echo "📊 Health check: http://localhost:3000/health"
```

## Health Checks and Monitoring

### Health Check Endpoint

The service provides a comprehensive health check at `/health`:

```bash
curl http://localhost:3000/health
```

### Docker Health Check

The Docker container includes built-in health checks:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Monitoring with Docker Compose

```yaml
# Add to your docker-compose.yml
services:
  novita-api:
    # ... other configuration
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Metrics
Access metrics endpoint:
```bash
curl http://localhost:3000/metrics
```

### Logs
Application logs are available in multiple ways:
```bash
# View container logs
docker-compose logs -f novita-gpu-api

# View file logs (if volume mounted)
tail -f ./logs/app.log

# View structured logs
docker-compose logs --json novita-gpu-api | jq '.'
```

## SSL/TLS Configuration

### Using Nginx Reverse Proxy

**nginx.conf**
```nginx
events {
    worker_connections 1024;
}

http {
    upstream novita-api {
        server novita-api:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://novita-api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            proxy_pass http://novita-api/health;
            access_log off;
        }
    }
}
```

## Health Checks

- **Endpoint**: `GET /health`
- **Development**: 30s interval, 10s timeout, 3 retries
- **Production**: 15s interval, 5s timeout, 5 retries
- **Startup**: 40s grace period (60s in production)

## Volume Mounts

### Development
- `./src:/app/src:ro` - Source code (read-only)
- `./logs:/app/logs` - Application logs

### Production
- `novita-logs-prod:/app/logs` - Named volume for logs
- Optional custom configuration mount

### Default Volume Mounts
- **Logs**: `./logs:/app/logs` - Application logs (persistent)
- **Config**: `./config:/app/config:ro` - Custom configuration files (optional)

## Resource Limits

### Development
- Memory: 2GB limit, 256MB reservation
- CPU: 2.0 cores limit, 0.25 cores reservation

### Production
- Memory: 512MB limit, 256MB reservation
- CPU: 0.5 cores limit, 0.25 cores reservation

## Network Configuration

- **Network**: `novita-network` (bridge)
- **Port**: 3003 (configurable via PORT env var)
- **Bridge Name**: `novita-br0`

## Logging

### Development
- JSON format with 10MB max size
- 3 file rotation
- Debug level logging

### Production
- JSON format with 50MB max size
- 5 file rotation
- Info level logging
- Service and environment labels

## Scaling and Load Balancing

### Horizontal Scaling
Scale the service across multiple containers:
```bash
# Scale to 3 replicas
docker-compose up -d --scale novita-gpu-api=3

# Use load balancer (nginx example)
docker-compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

### Resource Scaling
Adjust resource limits in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 1G      # Increase memory
      cpus: '1.0'     # Increase CPU
```

### Load Balancer Configuration

```nginx
upstream novita-api-cluster {
    least_conn;
    server novita-api_1:3000;
    server novita-api_2:3000;
    server novita-api_3:3000;
}
```

## Redis Deployment

### New Deployment with Redis
For new deployments with Redis persistence:
```bash
# Set up Redis environment variables
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-redis-token"
export REDIS_ENABLE_FALLBACK="true"

# Deploy with Redis support
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Migration from In-Memory to Redis
For existing deployments migrating to Redis:
```bash
# 1. Configure Redis environment variables
export UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-redis-token"
export REDIS_ENABLE_FALLBACK="true"

# 2. Run migration script (dry run first)
docker-compose exec novita-gpu-api node scripts/redis-migration.js --dry-run

# 3. Run actual migration
docker-compose exec novita-gpu-api node scripts/redis-migration.js

# 4. Restart with Redis configuration
docker-compose restart novita-gpu-api

# 5. Verify Redis is working
curl http://localhost:3000/health | jq '.redis'
```

## Backup and Recovery

### Backup Script

```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup configuration
cp .env "$BACKUP_DIR/"
cp docker-compose*.yml "$BACKUP_DIR/"

# Backup logs
docker-compose logs > "$BACKUP_DIR/application.log"

# Create archive
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### Recovery Script

```bash
#!/bin/bash
# scripts/restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.tar.gz>"
    exit 1
fi

# Extract backup
tar -xzf "$BACKUP_FILE"
BACKUP_DIR=$(basename "$BACKUP_FILE" .tar.gz)

# Restore configuration
cp "$BACKUP_DIR/.env" .
cp "$BACKUP_DIR/docker-compose"*.yml .

# Restart services
docker-compose down
docker-compose up -d

echo "Recovery complete from: $BACKUP_FILE"
```

### Configuration Backup
```bash
# Backup environment configuration
cp .env .env.backup

# Backup custom configuration
tar -czf config-backup.tar.gz config/
```

### Log Backup
```bash
# Archive logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/

# Rotate logs
docker-compose exec novita-gpu-api logrotate /etc/logrotate.conf
```

## Troubleshooting

### Common Issues

#### 1. Container Won't Start
Check logs for configuration errors:
```bash
docker-compose logs novita-gpu-api
```

Common causes:
- Missing `NOVITA_API_KEY`
- Invalid environment configuration
- Port conflicts

#### 2. Health Check Failures
Verify service is responding:
```bash
# Check if service is listening
docker-compose exec novita-gpu-api netstat -tlnp

# Test health endpoint directly
docker-compose exec novita-gpu-api curl -f http://localhost:3000/health
```

#### 3. API Connection Issues
Test Novita.ai API connectivity:
```bash
# Check API key and connectivity
docker-compose exec novita-gpu-api curl -H "Authorization: Bearer $NOVITA_API_KEY" https://api.novita.ai/v1/products
```

#### 4. Permission Issues
Ensure proper file permissions:
```bash
# Fix log directory permissions
sudo chown -R 1001:1001 ./logs

# Fix volume mount permissions
sudo chmod 755 ./logs
```

#### 5. Redis Troubleshooting
Common Redis deployment issues:
```bash
# Test Redis connectivity
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     "$UPSTASH_REDIS_REST_URL/ping"

# Check Redis status in health endpoint
curl http://localhost:3000/health | jq '.redis, .dependencies.redis'

# Monitor Redis-related logs
docker-compose logs -f novita-gpu-api | grep -i redis

# Enable fallback mode for high availability
export REDIS_ENABLE_FALLBACK=true
docker-compose restart novita-gpu-api
```

### Debug Mode
Enable debug logging:
```bash
# Set debug log level
echo "LOG_LEVEL=debug" >> .env

# Restart with debug logging
docker-compose restart novita-gpu-api
```

### Log Analysis
```bash
# View real-time logs
docker-compose logs -f novita-api

# Search for errors
docker-compose logs novita-api | grep ERROR

# Export logs for analysis
docker-compose logs novita-api > application.log
```

## Update Process

### Zero Downtime Update
1. **Backup current configuration**:
   ```bash
   cp .env .env.backup
   docker-compose config > docker-compose.backup.yml
   ```

2. **Pull latest image**:
   ```bash
   docker-compose pull
   ```

3. **Update with zero downtime**:
   ```bash
   docker-compose up -d --no-deps --build novita-gpu-api
   ```

4. **Verify deployment**:
   ```bash
   curl http://localhost:3000/health
   ```

### Maintenance Tasks
```bash
# Clean up unused images
docker image prune -f

# Clean up unused volumes
docker volume prune -f

# View resource usage
docker stats novita-gpu-instance-api

# Update dependencies (rebuild required)
docker-compose build --no-cache
```

## Production Checklist

Before deploying to production:

- [ ] Configure all required environment variables
- [ ] Set up Redis instance (if using persistence)
- [ ] Test Redis connectivity and migration
- [ ] Set up proper log rotation
- [ ] Configure monitoring and alerting
- [ ] Set up backup procedures
- [ ] Test health checks and recovery
- [ ] Configure reverse proxy (nginx/traefik)
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Test scaling procedures
- [ ] Document operational procedures

## Makefile Integration

The deployment includes Makefile integration for common operations:

```makefile
# Development commands
dev:
	docker-compose up -d

logs:
	docker-compose logs -f

health:
	curl http://localhost:3000/health

# Production commands
prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-logs:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

backup:
	./scripts/backup.sh

# Cleanup commands
clean:
	docker-compose down
	docker system prune -f

docker-reset: clean
	docker volume prune -f
	docker image prune -f
```

## Support

For issues and questions:

1. Check the logs: `docker-compose logs -f`
2. Verify configuration: `docker-compose config`
3. Test connectivity: `curl http://localhost:3000/health`
4. Review this documentation
5. Check the API documentation:
   - [API Quick Start](../API_QUICK_START.md) - Get started quickly
   - [API Client Reference](../API_CLIENT_REFERENCE.md) - Complete API documentation

For detailed Redis troubleshooting, see [Redis Troubleshooting Guide](../integrations/redis.md).
For additional support, see the [Troubleshooting Guide](../troubleshooting.md).