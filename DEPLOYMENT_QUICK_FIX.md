# Quick Fix Guide - Production Deployment

## TL;DR - What Was Fixed

1. **Health check timing** - Increased from 40s to 120s start period
2. **Restart policy** - Ensured `restart: always` is properly applied
3. **Retry tolerance** - Increased from 3 to 5 retries

## Deploy the Fix

```bash
# Stop current deployment
make prod-stop

# Deploy with fixes
make prod

# Verify (wait 2 minutes for health check)
make verify
```

## Verify It's Working

```bash
# 1. Check container is running and healthy
docker ps | grep novita-gpu-instance-api
# Should show: (healthy)

# 2. Check restart policy
docker inspect novita-gpu-instance-api | jq '.[0].HostConfig.RestartPolicy.Name'
# Should show: "always"

# 3. Test auto-restart
docker kill novita-gpu-instance-api && sleep 30 && docker ps | grep novita-gpu-instance-api
# Should show container running again
```

## What Changed

### docker-compose.prod.yml
```yaml
services:
  novita-gpu-api:
    restart: always  # ← This ensures auto-restart
    healthcheck:
      start_period: 120s  # ← Increased from 40s
      retries: 5          # ← Increased from 3
```

## Common Issues

### "Still showing unhealthy"
**Wait 2 minutes** - Aiven Redis connection takes time

### "Container not restarting"
```bash
# Redeploy to apply restart policy
make prod-stop && make prod
```

### "Health check failing"
```bash
# Check logs
docker logs --tail 50 novita-gpu-instance-api

# Check Redis connection
curl -s http://localhost:3003/health | jq '.services.redis'
```

## Monitoring

```bash
# Watch status
watch -n 30 'make status-prod'

# View logs
make logs-prod

# Check health
make health
```

## Rollback

```bash
make prod-stop
git checkout HEAD~1 docker-compose.yml docker-compose.prod.yml
make prod
```

---

**For detailed docs**: See `DEPLOYMENT_FIX_SUMMARY.md` or `PRODUCTION_DEPLOYMENT_FIX.md`
