# Deployment Guide

## Overview

This guide covers deploying the Novita GPU Instance API using Docker Compose for production and development environments.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Novita.ai API key
- At least 512MB RAM and 1 CPU core
- Network access to api.novita.ai

## Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd novita-gpu-instance-api
   cp .env.example .env
   ```

2. **Configure Environment**
   ```bash
   # Edit .env file with your settings
   NOVITA_API_KEY=your_api_key_here
   WEBHOOK_URL=https://your-app.com/webhook
   ```

3. **Deploy**
   ```bash
   docker-compose up -d
   ```

4. **Verify Deployment**
   ```bash
   curl http://localhost:3000/health
   ```

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

## Scaling and Load Balancing

### Horizontal Scaling

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  novita-api:
    # ... base configuration
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure

  nginx:
    # ... nginx configuration with load balancing
    depends_on:
      - novita-api
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

## Backup and Recovery

### Data Backup

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

### Disaster Recovery

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

## Troubleshooting

### Common Issues

1. **Service won't start**
   ```bash
   # Check logs
   docker-compose logs novita-api
   
   # Check configuration
   docker-compose config
   ```

2. **Health check failing**
   ```bash
   # Test health endpoint directly
   docker-compose exec novita-api curl http://localhost:3000/health
   
   # Check service status
   docker-compose ps
   ```

3. **API key issues**
   ```bash
   # Verify environment variables
   docker-compose exec novita-api env | grep NOVITA
   ```

4. **Memory issues**
   ```bash
   # Check resource usage
   docker stats
   
   # Increase memory limits in docker-compose.yml
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

## Security Considerations

### Environment Security

- Store sensitive data in `.env` files, never in code
- Use Docker secrets for production deployments
- Regularly rotate API keys and secrets
- Implement proper firewall rules

### Network Security

```yaml
# Secure network configuration
networks:
  novita-network:
    driver: bridge
    internal: true  # Prevent external access
  
  public:
    driver: bridge
```

### Container Security

```dockerfile
# Run as non-root user
USER node

# Remove unnecessary packages
RUN apt-get remove --purge -y curl wget && \
    apt-get autoremove -y && \
    apt-get clean
```

## Performance Optimization

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
    reservations:
      memory: 256M
      cpus: '0.5'
```

### Caching Strategy

- Enable response caching for frequently accessed data
- Configure appropriate TTL values
- Monitor cache hit rates

### Database Optimization

- Use connection pooling
- Implement proper indexing
- Monitor query performance

## Maintenance

### Regular Tasks

1. **Update Dependencies**
   ```bash
   npm audit
   npm update
   docker-compose build --no-cache
   ```

2. **Log Rotation**
   ```bash
   # Configure in docker-compose.yml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

3. **Health Monitoring**
   ```bash
   # Set up monitoring alerts
   curl -f http://localhost:3000/health || alert-system
   ```

### Upgrade Process

1. Backup current deployment
2. Test new version in staging
3. Deploy with rolling updates
4. Verify functionality
5. Monitor for issues

For additional support, see the [Troubleshooting Guide](./TROUBLESHOOTING.md).