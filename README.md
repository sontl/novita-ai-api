# Novita GPU Instance API

API service for managing Novita.ai GPU instances with automated lifecycle management.

## Features

- Automated GPU instance creation with optimal pricing selection
- Instance lifecycle management (create, start, monitor)
- **Redis-backed data persistence** with graceful fallback to in-memory storage
- **Persistent job queue** for reliable background processing
- **Distributed cache** for improved performance and scalability
- Webhook notifications when instances are ready
- RESTful API with comprehensive error handling
- Docker Compose deployment ready
- TypeScript with full type safety

## Quick Start

### Prerequisites

- Node.js 18+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- Novita.ai API key

### Environment Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and set your configuration:
```bash
# Required
NOVITA_API_KEY=your_novita_api_key_here

# Optional
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook

# Redis Configuration (Optional - enables persistence)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
REDIS_ENABLE_FALLBACK=true
```

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### Docker Deployment

1. Build and start with Docker Compose:
```bash
docker-compose up -d
```

2. Check service health:
```bash
curl http://localhost:3000/health
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/instances` - Create new GPU instance
- `GET /api/instances/{id}` - Get instance status
- `GET /api/instances` - List all instances
- `POST /api/instances/{id}/start` - Start instance by ID
- `POST /api/instances/start` - Start instance by name
- `POST /api/instances/{id}/stop` - Stop instance by ID
- `POST /api/instances/stop` - Stop instance by name
- `GET /api/cache/stats` - Cache statistics
- `GET /api/metrics` - Service metrics

**📖 Complete API Reference:** [docs/api/client-reference.md](./docs/api/client-reference.md)

## Documentation

📚 **[Complete Documentation Index](./docs/README.md)** - Navigate all documentation

### Quick Start
- **[API Quick Start](./docs/api/quick-start.md)** - Get started in minutes
- **[Docker Deployment Guide](./docs/deployment/docker.md)** - Deploy with Docker Compose

### Core Documentation
- **[API Client Reference](./docs/api/client-reference.md)** - Complete API documentation
- **[Configuration Reference](./docs/deployment/configuration.md)** - Environment variables and settings
- **[Features Documentation](./docs/features/)** - Feature-specific guides
- **[Integration Guides](./docs/integrations/)** - Redis, Axiom, and other integrations

### Client Examples

See [client-examples/](./client-examples/) for ready-to-use client code in:
- Node.js/JavaScript
- Python
- Shell scripts (cURL)

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

## License

MIT