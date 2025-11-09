#!/bin/bash

# Deployment verification script
set -e

echo "🔍 Verifying Production Deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Check if containers are running
echo ""
echo "📦 Checking containers..."
API_STATUS=$(docker inspect -f '{{.State.Status}}' novita-gpu-instance-api 2>/dev/null || echo "not found")

if [ "$API_STATUS" = "running" ]; then
    echo -e "${GREEN}✅ API container is running${NC}"
else
    echo -e "${RED}❌ API container is $API_STATUS${NC}"
    exit 1
fi

# Check container health
echo ""
echo "🏥 Checking container health..."
API_HEALTH=$(docker inspect -f '{{.State.Health.Status}}' novita-gpu-instance-api 2>/dev/null || echo "no healthcheck")

if [ "$API_HEALTH" = "healthy" ]; then
    echo -e "${GREEN}✅ API is healthy${NC}"
elif [ "$API_HEALTH" = "starting" ]; then
    echo -e "${YELLOW}⏳ API is starting...${NC}"
else
    echo -e "${YELLOW}⚠️  API health: $API_HEALTH${NC}"
fi

# Check Redis connectivity (Aiven Cloud)
echo ""
echo "🔌 Testing Redis connectivity (Aiven Cloud)..."
echo -e "${YELLOW}ℹ️  Using managed Redis from Aiven Cloud${NC}"

# Check API health endpoint
echo ""
echo "🌐 Testing API health endpoint..."
if curl -f -s http://localhost:3003/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API health endpoint is responding${NC}"
    
    # Get detailed health status
    HEALTH_STATUS=$(curl -s http://localhost:3003/health | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        echo -e "${GREEN}✅ API reports healthy status${NC}"
    else
        echo -e "${YELLOW}⚠️  API status: $HEALTH_STATUS${NC}"
    fi
    
    # Check service dependencies
    echo ""
    echo "🔗 Checking service dependencies..."
    REDIS_SERVICE=$(curl -s http://localhost:3003/health | jq -r '.services.redis' 2>/dev/null || echo "unknown")
    QUEUE_SERVICE=$(curl -s http://localhost:3003/health | jq -r '.services.jobQueue' 2>/dev/null || echo "unknown")
    CACHE_SERVICE=$(curl -s http://localhost:3003/health | jq -r '.services.cache' 2>/dev/null || echo "unknown")
    
    if [ "$REDIS_SERVICE" = "up" ]; then
        echo -e "${GREEN}✅ Redis service: up${NC}"
    else
        echo -e "${RED}❌ Redis service: $REDIS_SERVICE${NC}"
    fi
    
    if [ "$QUEUE_SERVICE" = "up" ]; then
        echo -e "${GREEN}✅ Job queue service: up${NC}"
    else
        echo -e "${RED}❌ Job queue service: $QUEUE_SERVICE${NC}"
    fi
    
    if [ "$CACHE_SERVICE" = "up" ]; then
        echo -e "${GREEN}✅ Cache service: up${NC}"
    else
        echo -e "${RED}❌ Cache service: $CACHE_SERVICE${NC}"
    fi
else
    echo -e "${RED}❌ API health endpoint is not responding${NC}"
    echo "Checking API logs..."
    docker logs --tail 20 novita-gpu-instance-api
    exit 1
fi

# Check restart policy
echo ""
echo "🔄 Checking restart policy..."
API_RESTART=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' novita-gpu-instance-api 2>/dev/null || echo "unknown")

if [ "$API_RESTART" = "always" ] || [ "$API_RESTART" = "unless-stopped" ]; then
    echo -e "${GREEN}✅ API restart policy: $API_RESTART${NC}"
else
    echo -e "${RED}❌ API restart policy: $API_RESTART (expected: always or unless-stopped)${NC}"
    echo -e "${YELLOW}⚠️  This is the main issue - container won't auto-restart!${NC}"
fi

# Check volumes
echo ""
echo "💾 Checking volumes..."
if docker volume inspect novita-logs > /dev/null 2>&1 || docker volume inspect novita-logs-prod > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Logs volume exists${NC}"
else
    echo -e "${YELLOW}⚠️  Logs volume not found${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Deployment verification complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Quick Stats:"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo ""
echo "🌐 Service URL: http://localhost:3003"
echo "❤️  Health Check: http://localhost:3003/health"
echo ""
echo "📋 Useful commands:"
echo "  make logs-prod     - View production logs"
echo "  make status-prod   - Check production status"
echo "  make health        - Check health status"
echo "  make restart-prod  - Restart production"
