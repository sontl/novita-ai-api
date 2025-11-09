# Quick Start Guide

## Prerequisites
- Docker and Docker Compose installed
- `.env` file configured with API keys

## Initial Setup

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env and set your API keys
# Required: NOVITA_API_KEY, NOVITA_INTERNAL_API_KEY
# Redis is pre-configured for Docker Compose

# 3. Create logs directory
mkdir -p logs
```

## Development

```bash
# Start development environment
make dev

# View logs
make logs-all

# Check status
make status

# Stop
make down
```

## Production Deployment

```bash
# Deploy to production
make prod

# Verify deployment
make verify

# Check status
make status-prod

# View logs
make prod-logs

# Stop
make prod-stop
```

## Common Commands

### Service Management
```bash
make dev              # Start development
make prod             # Deploy production
make restart          # Restart development
make restart-prod     # Restart production
make down             # Stop development
make prod-stop        # Stop production
```

### Monitoring
```bash
make status           # Show service status
make status-prod      # Show production status
make health           # Check API health
make health-redis     # Check Redis health
make verify           # Comprehensive verification
make logs             # View API logs
make logs-redis       # View Redis logs
make logs-all         # View all logs
```



### Maintenance
```bash
make clean            # Clean up containers and volumes
make docker-clean     # Clean Docker resources
make docker-reset     # Complete Docker reset
make build            # Build application
make build-docker     # Build Docker image
```

## Health Check

The service exposes a health endpoint at `/health`:

```bash
# Quick check
curl http://localhost:3003/health

# Detailed check with formatting
curl -s http://localhost:3003/health | jq

# Check specific service
curl -s http://localhost:3003/health | jq '.services'
```

## Troubleshooting

### Container shows unhealthy
```bash
# Check detailed health
make health

# View recent logs
docker logs --tail 50 novita-gpu-instance-api

# Check Redis connection
make health-redis
```

### Redis connection issues (Aiven Cloud)
```bash
# Check Redis environment variables
docker exec novita-gpu-instance-api env | grep REDIS

# Check health endpoint for Redis status
curl -s http://localhost:3003/health | jq '.services.redis'

# Verify Aiven Redis is accessible (from your machine)
# Contact Aiven support if Redis is down
```

### Container not restarting
```bash
# Check restart policy
docker inspect novita-gpu-instance-api | jq '.[0].HostConfig.RestartPolicy'

# Should show: {"Name": "always", ...}

# Force restart
make restart-prod
```

### Complete reset
```bash
# Stop everything
make prod-stop

# Clean up
make clean

# Redeploy
make prod
```

## Environment Variables

### Required
- `NOVITA_API_KEY` - Your Novita.ai API key
- `NOVITA_INTERNAL_API_KEY` - Your Novita.ai internal API key

### Redis (Aiven Cloud - Managed)
- `REDIS_URL` - Redis connection URL from Aiven
- `REDIS_HOST` - Redis host from Aiven
- `REDIS_PORT` - Redis port from Aiven
- `REDIS_PASSWORD` - Redis password from Aiven
- `REDIS_USERNAME` - Redis username (default: default)

### Optional
- `NODE_ENV` - Environment (development/production)
- `PORT` - API port (default: 3003)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- See `.env.example` for full list

## Service URLs

- **API**: http://localhost:3003
- **Health Check**: http://localhost:3003/health
- **Metrics**: http://localhost:3003/api/metrics
- **Redis**: localhost:6379 (internal only)

## Production Checklist

- [ ] `.env` file configured with production API keys
- [ ] Aiven Redis credentials configured in `.env`
- [ ] Logs directory created and writable
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured (if needed)
- [ ] Monitoring set up (optional)
- [ ] Aiven Redis backup strategy verified

## Next Steps

1. Deploy: `make prod`
2. Verify: `make verify`
3. Monitor: `make status-prod`
4. Check logs: `make prod-logs`

For detailed troubleshooting, see `PRODUCTION_DEPLOYMENT_FIX.md`
