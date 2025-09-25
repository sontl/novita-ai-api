#!/bin/bash

# Development deployment script for Novita GPU Instance API
set -e

echo "🚀 Starting development deployment..."

# Check if .env file exists, create from example if not
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file and set your NOVITA_API_KEY before continuing."
    echo "Press Enter when ready..."
    read
fi

# Create logs directory if it doesn't exist
mkdir -p logs
chmod 755 logs

# Start development services
echo "🔄 Starting development services..."
docker-compose up -d

# Wait for service to be ready
echo "⏳ Waiting for service to be ready..."
timeout=30
counter=0

while [ $counter -lt $timeout ]; do
    if curl -f http://localhost:3003/health > /dev/null 2>&1; then
        echo "✅ Service is ready!"
        break
    fi
    
    echo "⏳ Waiting for service... ($counter/$timeout)"
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Service failed to start within $timeout seconds"
    echo "📋 Checking logs..."
    docker-compose logs --tail=20
    exit 1
fi

# Show deployment status
echo "📊 Development Status:"
docker-compose ps

echo "🎉 Development deployment completed successfully!"
echo "🌐 Service available at: http://localhost:3003"
echo "❤️  Health check: http://localhost:3003/health"
echo "📊 Metrics: http://localhost:3003/metrics"
echo ""
echo "📋 To view logs: docker-compose logs -f"
echo "🛑 To stop: docker-compose down"
echo "🔄 To restart: docker-compose restart"