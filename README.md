# Novita GPU Instance API

API service for managing Novita.ai GPU instances with automated lifecycle management.

## Features

- Automated GPU instance creation with optimal pricing selection
- Instance lifecycle management (create, start, monitor)
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
NOVITA_API_KEY=your_novita_api_key_here
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook  # Optional
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
- `POST /api/instances` - Create new GPU instance (coming soon)
- `GET /api/instances/{id}` - Get instance status (coming soon)
- `GET /api/instances` - List all instances (coming soon)

## Configuration

All configuration is done via environment variables. See `.env.example` for available options.

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

## License

MIT