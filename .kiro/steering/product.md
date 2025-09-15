# Product Overview

## Novita GPU Instance API

A TypeScript/Node.js API service for managing Novita.ai GPU instances with automated lifecycle management. The service provides RESTful endpoints for creating, monitoring, and managing GPU instances with optimal pricing selection.

## Key Features

- **Automated GPU Instance Management**: Create, start, stop, and monitor GPU instances
- **Optimal Pricing Selection**: Automatically selects the lowest spot price for requested configurations
- **Webhook Notifications**: Optional webhook support for instance status updates
- **Comprehensive Error Handling**: Robust error handling with circuit breaker patterns
- **Production Ready**: Docker containerization with health checks and graceful shutdown

## Target Use Cases

- GPU workload orchestration for AI/ML applications
- Cost-optimized GPU resource provisioning
- Automated instance lifecycle management
- Integration with existing CI/CD pipelines requiring GPU resources

## API Endpoints

- Health monitoring (`/health`)
- Instance management (`/api/instances/*`)
- Product catalog access for pricing optimization