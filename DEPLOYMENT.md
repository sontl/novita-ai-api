# Deployment Guide

This guide covers deploying the Novita GPU Instance API using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Valid Novita.ai API key

## Quick Start

### 1. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required: Your Novita.ai API key
NOVITA_API_KEY=your_actual_api_key_here

# Optional: Redis configuration for data persistence
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token
REDIS_ENABLE_FALLBACK=true

# Optional: Webhook configuration
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook
WEBHOOK_SECRET=your_webhook_signing_secret

# Optional: Customize other settings
LOG_LEVEL=info
DEFAULT_REGION=CN-HK-01
```

### 2. Development Deployment

For development with hot reload and debugging:

```bash
# Start in development mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 3. Production Deployment

For production deployment with optimized settings:

```bash
# Build and start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or use the production script
./scripts/deploy-prod.sh
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOVITA_API_KEY` | Yes | - | Your Novita.ai API key |
| `NODE_ENV` | No | `production` | Node.js environment |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `WEBHOOK_URL` | No | - | Webhook endpoint for notifications |
| `WEBHOOK_SECRET` | No | - | Webhook signing secret |
| `DEFAULT_REGION` | No | `CN-HK-01` | Default Novita.ai region |
| `INSTANCE_POLL_INTERVAL` | No | `30` | Instance status polling interval (seconds) |
| `MAX_RETRY_ATTEMPTS` | No | `3` | Maximum API retry attempts |
| `REQUEST_TIMEOUT` | No | `30000` | API request timeout (milliseconds) |

#### Redis Configuration (Optional)

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

### Volume Mounts

The service uses the following volumes:

- **Logs**: `./logs:/app/logs` - Application logs (persistent)
- **Config**: `./config:/app/config:ro` - Custom configuration files (optional)

### Resource Limits

Default resource limits:

- **Memory**: 512MB limit, 256MB reservation
- **CPU**: 0.5 cores limit, 0.25 cores reservation

Adjust in `docker-compose.yml` based on your requirements.

## Health Checks

The service includes comprehensive health checks:

- **Endpoint**: `GET /health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3 attempts
- **Start Period**: 40 seconds

Health check validates:
- Service responsiveness
- Novita.ai API connectivity
- Internal service health
- Redis connectivity (when configured)
- Cache service availability

## Monitoring

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

### Metrics

Access metrics endpoint:

```bash
curl http://localhost:3000/metrics
```

### Health Status

Check service health:

```bash
curl http://localhost:3000/health
```

## Security

### Container Security

The deployment includes several security measures:

- **Non-root user**: Runs as `nodejs` user (UID 1001)
- **Read-only filesystem**: Root filesystem is read-only
- **No new privileges**: Prevents privilege escalation
- **Resource limits**: Memory and CPU limits prevent resource exhaustion
- **Temporary filesystems**: `/tmp` and `/var/tmp` are mounted as tmpfs

### Network Security

- **Isolated network**: Services run in dedicated Docker network
- **Port exposure**: Only necessary ports are exposed
- **CORS configuration**: Configurable CORS settings
- **Rate limiting**: Built-in rate limiting protection

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

### Debug Mode

Enable debug logging:

```bash
# Set debug log level
echo "LOG_LEVEL=debug" >> .env

# Restart with debug logging
docker-compose restart novita-gpu-api
```

## Scaling

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

## Backup and Recovery

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

## Updates and Maintenance

### Update Process

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

### Redis Troubleshooting

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

For detailed Redis troubleshooting, see [Redis Troubleshooting Guide](docs/REDIS_TROUBLESHOOTING.md).

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

## Support

For issues and questions:

1. Check the logs: `docker-compose logs -f`
2. Verify configuration: `docker-compose config`
3. Test connectivity: `curl http://localhost:3000/health`
4. Review this documentation
5. Check the API documentation:
   - [API Quick Start](./API_QUICK_START.md) - Get started quickly
   - [API Client Reference](./API_CLIENT_REFERENCE.md) - Complete API documentation