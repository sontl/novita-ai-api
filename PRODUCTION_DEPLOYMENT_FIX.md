# Production Deployment Fix

## Issues Identified

### 1. Health Check Timing Issues
**Problem**: Health check was too aggressive with insufficient startup time.

**Impact**: 
- Container marked unhealthy before services fully initialize
- Aiven Redis connection not established in time
- Premature container restarts

**Solution**: 
- Increased `start_period` from 40s to 120s in production
- Increased `retries` from 3 to 5 for more tolerance
- Health endpoint already skips external API calls in production

### 2. Restart Policy Not Working
**Problem**: Container doesn't automatically restart when it crashes or becomes unhealthy.

**Impact**:
- Service stays down after crashes
- Manual intervention required
- Poor production reliability

**Solution**: 
- Ensured `restart: always` is set in `docker-compose.prod.yml`
- Removed conflicting `deploy` configurations that don't work with Docker Compose
- Verified restart policy is applied correctly

## Changes Made

### docker-compose.yml (Development)
```yaml
services:
  novita-gpu-api:
    restart: unless-stopped  # Auto-restart except when manually stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s  # Give service 60s to start
```

### docker-compose.prod.yml (Production)
```yaml
services:
  novita-gpu-api:
    restart: always  # CRITICAL: Always restart on failure
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s  # Give service 120s to start (Aiven Redis connection)
```

**Key Points:**
- Using `restart: always` instead of `deploy` section (which is for Docker Swarm, not Compose)
- Longer `start_period` to allow Aiven Redis connection to establish
- More retries for tolerance

## Deployment Instructions

### 1. Stop Current Deployment
```bash
make prod-stop
# Or manually:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### 2. Deploy with Fixed Configuration
```bash
make prod
# Or manually:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 3. Verify Deployment
```bash
# Run comprehensive verification
make verify

# Or check manually:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl http://localhost:3003/health | jq
```

### 4. Verify Restart Policy
```bash
# Check restart policy is set correctly
docker inspect novita-gpu-instance-api | jq '.[0].HostConfig.RestartPolicy'

# Should show:
# {
#   "Name": "always",
#   "MaximumRetryCount": 0
# }
```

## Testing Auto-Restart

### Test 1: Kill Container
```bash
# Kill the container
docker kill novita-gpu-instance-api

# Watch it restart automatically (should take ~2 minutes to be healthy)
watch -n 5 'docker ps | grep novita-gpu-instance-api'

# Check logs
docker logs -f novita-gpu-instance-api
```

### Test 2: Simulate Crash
```bash
# Stop the container (simulating a crash)
docker stop novita-gpu-instance-api

# It should restart automatically
docker ps | grep novita-gpu-instance-api
```

### Test 3: Check Health Recovery
```bash
# Monitor health status
watch -n 10 'curl -s http://localhost:3003/health | jq ".status, .services"'

# Should show:
# "healthy"
# {
#   "novitaApi": "up",
#   "jobQueue": "up",
#   "cache": "up",
#   "redis": "up"
# }
```

## Health Check Behavior

### Development Mode
- Start period: 60s
- Interval: 30s
- Timeout: 10s
- Retries: 5
- Restart: unless-stopped

### Production Mode
- Start period: 120s (allows Aiven Redis connection)
- Interval: 30s
- Timeout: 10s
- Retries: 5 (more tolerant)
- Restart: always (CRITICAL for auto-restart)

## Troubleshooting

### Container Shows Unhealthy
```bash
# Check detailed health status
curl -s http://localhost:3003/health | jq

# Common issues:
# 1. Aiven Redis connection timeout
# 2. Service still initializing (wait for start_period)
# 3. External API issues (should be skipped in production)

# Check logs for errors
docker logs --tail 100 novita-gpu-instance-api
```

### Container Not Restarting
```bash
# 1. Verify restart policy
docker inspect novita-gpu-instance-api | jq '.[0].HostConfig.RestartPolicy'

# Should show: {"Name": "always", "MaximumRetryCount": 0}

# 2. If not set correctly, redeploy:
make prod-stop
make prod

# 3. Check container exit code
docker ps -a | grep novita-gpu-instance-api
```

### Aiven Redis Connection Issues
```bash
# Check if Redis credentials are set
docker exec novita-gpu-instance-api env | grep REDIS

# Should show:
# REDIS_URL=rediss://default:...@valkey-c9254f9-sms-novita.k.aivencloud.com:13345
# REDIS_HOST=valkey-c9254f9-sms-novita.k.aivencloud.com
# REDIS_PORT=13345
# REDIS_PASSWORD=...

# Test connection from container
docker exec novita-gpu-instance-api sh -c 'apk add redis && redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD --tls ping'
```

### Health Check Taking Too Long
```bash
# If health check consistently fails, increase start_period
# Edit docker-compose.prod.yml:
healthcheck:
  start_period: 180s  # Increase to 3 minutes

# Redeploy
make prod
```

## Performance Considerations

### Startup Time
- Expected: 60-120 seconds to "healthy" status
- Aiven Redis connection: ~5-10 seconds
- Service initialization: ~30-60 seconds
- Health check stabilization: ~30 seconds

### Resource Limits
- **API Container**: 512MB RAM, 0.5 CPU (production)
- **Aiven Redis**: Managed by Aiven (no local resources)

## Monitoring Recommendations

### Immediate (First 24 Hours)
```bash
# Watch container status
watch -n 30 'make status-prod'

# Monitor logs
make logs-prod

# Check health periodically
watch -n 60 'make health'
```

### Ongoing
1. Set up external monitoring (UptimeRobot, Datadog, etc.)
2. Configure alerts for:
   - Container down
   - Health check failures
   - High error rates
   - Memory/CPU issues
3. Set up log aggregation (ELK, Loki, Axiom, etc.)

## Rollback Procedure

If issues occur:
```bash
# 1. Stop new deployment
make prod-stop

# 2. Restore previous configuration
git checkout HEAD~1 docker-compose.yml docker-compose.prod.yml

# 3. Redeploy
make prod

# 4. Verify
make verify
```

## Verification Checklist

After deployment:
- [ ] Container running: `docker ps | grep novita-gpu-instance-api`
- [ ] Health check passing: `make health`
- [ ] Restart policy set to "always": `docker inspect novita-gpu-instance-api | jq '.[0].HostConfig.RestartPolicy.Name'`
- [ ] Aiven Redis connected: `curl -s http://localhost:3003/health | jq '.services.redis'`
- [ ] API accessible: `curl http://localhost:3003/health`
- [ ] Logs accessible: `make logs-prod`
- [ ] Auto-restart works: `docker kill novita-gpu-instance-api && sleep 30 && docker ps | grep novita-gpu-instance-api`

## Success Criteria

✅ Container starts successfully within 120 seconds
✅ Health checks pass consistently
✅ Auto-restart works on container failure
✅ Aiven Redis connectivity stable
✅ No data loss on restart
✅ Performance within acceptable range

## Next Steps

1. Monitor logs for first 24 hours
2. Set up external monitoring
3. Configure automated backups (Aiven handles Redis backups)
4. Document any custom configurations
5. Set up CI/CD pipeline for automated deployments

---

**Note**: This deployment uses **Aiven Cloud's managed Redis** (Valkey), not a local Redis container. All Redis data is stored and managed by Aiven.
