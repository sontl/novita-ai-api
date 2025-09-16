#!/bin/bash

# Health check script for Novita GPU Instance API
set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-10}"

echo "🏥 Performing health check on $SERVICE_URL..."

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "  Checking $description... "
    
    if curl -f -s --max-time $TIMEOUT "$SERVICE_URL$endpoint" > /dev/null; then
        echo "✅ OK"
        return 0
    else
        echo "❌ FAILED"
        return 1
    fi
}

# Function to check endpoint with JSON response
check_json_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "  Checking $description... "
    
    response=$(curl -f -s --max-time $TIMEOUT "$SERVICE_URL$endpoint" 2>/dev/null || echo "")
    
    if [ -n "$response" ] && echo "$response" | jq . > /dev/null 2>&1; then
        echo "✅ OK"
        return 0
    else
        echo "❌ FAILED"
        return 1
    fi
}

# Perform health checks
failed=0

check_endpoint "/health" "Health endpoint" || failed=$((failed + 1))
check_json_endpoint "/metrics" "Metrics endpoint" || failed=$((failed + 1))

# Additional checks
echo "  Checking service responsiveness..."
start_time=$(date +%s%N)
if curl -f -s --max-time $TIMEOUT "$SERVICE_URL/health" > /dev/null; then
    end_time=$(date +%s%N)
    response_time=$(( (end_time - start_time) / 1000000 ))
    echo "  Response time: ${response_time}ms"
    
    if [ $response_time -gt 5000 ]; then
        echo "  ⚠️  Warning: Response time is high (>${response_time}ms)"
    fi
else
    echo "  ❌ Service not responding"
    failed=$((failed + 1))
fi

# Check Docker container status if running in Docker
if command -v docker > /dev/null 2>&1; then
    echo "  Checking Docker container status..."
    
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "novita-gpu-instance-api"; then
        container_status=$(docker ps --format "{{.Status}}" --filter "name=novita-gpu-instance-api")
        echo "  Container status: $container_status"
        
        if echo "$container_status" | grep -q "healthy"; then
            echo "  ✅ Container is healthy"
        elif echo "$container_status" | grep -q "unhealthy"; then
            echo "  ❌ Container is unhealthy"
            failed=$((failed + 1))
        else
            echo "  ⚠️  Container health status unknown"
        fi
    else
        echo "  ⚠️  Container not found or not running"
    fi
fi

# Summary
echo ""
if [ $failed -eq 0 ]; then
    echo "🎉 All health checks passed!"
    exit 0
else
    echo "❌ $failed health check(s) failed!"
    exit 1
fi