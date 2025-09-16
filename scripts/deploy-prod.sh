#!/bin/bash

# Production deployment script for Novita GPU Instance API
set -e

echo "🚀 Starting production deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please copy .env.example and configure it."
    exit 1
fi

# Check if NOVITA_API_KEY is set
if ! grep -q "NOVITA_API_KEY=" .env || grep -q "NOVITA_API_KEY=your_novita_api_key_here" .env; then
    echo "❌ Error: NOVITA_API_KEY not configured in .env file."
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs
chmod 755 logs

# Build and start production services
echo "📦 Building production image..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

echo "🔄 Starting production services..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Wait for service to be healthy
echo "⏳ Waiting for service to be healthy..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T novita-gpu-api curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Service is healthy and ready!"
        break
    fi
    
    echo "⏳ Waiting for service... ($counter/$timeout)"
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Service failed to become healthy within $timeout seconds"
    echo "📋 Checking logs..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=20 novita-gpu-api
    exit 1
fi

# Show deployment status
echo "📊 Deployment Status:"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "🎉 Production deployment completed successfully!"
echo "🌐 Service available at: http://localhost:3000"
echo "❤️  Health check: http://localhost:3000/health"
echo "📊 Metrics: http://localhost:3000/metrics"
echo ""
echo "📋 To view logs: docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.yml -f docker-compose.prod.yml down"