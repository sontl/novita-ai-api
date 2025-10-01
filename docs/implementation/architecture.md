# System Architecture

This document provides an overview of the Novita GPU Instance API system architecture, covering the structure, components, and data flow of the service.

## High-Level Architecture

The Novita GPU Instance API is a Node.js/TypeScript service that provides automated lifecycle management for Novita.ai GPU instances. The architecture is designed to be scalable, resilient, and production-ready.

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Client Apps   │    │     Web UI       │    │   API Gateway    │
│                 │    │                  │    │                  │
└─────────┬───────┘    └────────┬─────────┘    └────────┬─────────┘
          │                     │                       │
          │                     │                       │
          │         ┌───────────▼───────────┐           │
          │         │   Express.js Server   │           │
          │         │                       │           │
          │         │ ┌───────────────────┐ │           │
          │         │ │   API Routes      │ │           │
          │         │ └─────────┬─────────┘ │           │
          │         │           │           │           │
          │         │ ┌─────────▼─────────┐ │           │
          │         │ │   Services Layer  │ │           │
          │         │ └─────────┬─────────┘ │           │
          │         │           │           │           │
          │         │    ┌──────▼──────┐   │           │
          │         │    │    Cache    │   │           │
          │         │    │ (Redis/Mem) │   │           │
          │         │    └──────┬──────┘   │           │
          │         │           │           │           │
          │         └───────────┼───────────┘           │
          │                     │                       │
          └─────────────────────┼───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Novita.ai API      │
                    │                       │
                    └───────────────────────┘
```

## Core Components

### 1. API Layer
The API layer is built with Express.js and handles all HTTP requests and responses.

#### Key Endpoints:
- **Instance Management**: Create, start, stop, delete GPU instances
- **Status Monitoring**: Get instance status and comprehensive instance data
- **Auto-stop**: Update last-used time, trigger auto-stop checks, view statistics
- **Synchronization**: Manual sync operations, bulk operations
- **Health Checks**: System health and metrics

#### Request Processing:
- Input validation and sanitization
- Authentication/authorization (API key)
- Rate limiting
- CORS handling
- Request/response logging

### 2. Services Layer
The core business logic is implemented in a set of TypeScript services that handle specific concerns:

#### Instance Service
- Manages instance state and lifecycle
- Handles instance creation with template selection
- Coordinates with Novita.ai API
- Manages local state synchronization

#### Novita API Service
- Abstracts communication with Novita.ai API
- Implements retry logic with exponential backoff
- Handles authentication and error propagation
- Provides circuit breaker patterns for resilience

#### Auto-Stop Service
- Monitors running instances for inactivity
- Implements configurable auto-stop thresholds
- Provides dry-run functionality for testing
- Integrates with job queue for background processing

#### Job Worker Service
- Processes background jobs asynchronously
- Handles startup monitoring and health checks
- Manages auto-stop scheduling
- Implements error recovery and retry mechanisms

#### Startup Sync Service
- Synchronizes instance data between Novita.ai and local cache
- Handles orphaned instance cleanup
- Provides concurrency protection with Redis locks
- Manages data consistency on application startup

### 3. Data Management Layer
The system uses multiple data storage mechanisms:

#### In-Memory Cache
- Primary storage for instance states
- Fast access for frequently used data
- Used when Redis is unavailable

#### Redis Cache
- Persistent storage for instance states
- Distributed cache for scalability
- Job queue persistence
- Cross-restart data persistence
- Redis locks for concurrency control

#### Job Queue
- Persistent background job processing
- Reliable execution of long-running operations
- Retry mechanisms for failed jobs
- Job status tracking and monitoring

### 4. Web UI
A modern, responsive web interface for management:

#### Features:
- Real-time dashboard with system metrics
- Instance management controls
- Manual sync operations
- Bulk operations (stop all running instances)
- Auto-refresh functionality
- Health status monitoring

#### Frontend:
- Pure HTML/CSS/JavaScript (no framework dependencies)
- Responsive design for mobile/desktop
- Real-time updates via polling
- User-friendly error handling and notifications

## Data Flow

### Instance Creation Flow
```
Client Request → API Validation → Instance Service → Novita API Service → 
Novita.ai API → Instance Service → Local Cache (Redis/In-Memory) → 
Response to Client → Webhook Notification (if configured)
```

### Instance Monitoring Flow
```
Health Check → Instance Service → Novita API Service → 
Instance Status Polling → Instance Service → Local Cache Update →
Auto-Stop Evaluation → Job Queue (if needed) → 
Notification (if status changed)
```

### Startup Synchronization Flow
```
Application Startup → Startup Sync Service → Redis Lock Acquisition →
Fetch All Novita Instances (with pagination) → Fetch Cached Instances →
Compare and Update Local State → Cleanup Orphaned Instances → 
Release Lock → Update Sync Status
```

## Configuration and Environment Variables

The system uses environment variables for configuration:

### Core Configuration
- `NOVITA_API_KEY`: Authentication with Novita.ai
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

### Instance Management
- `INSTANCE_POLL_INTERVAL`: Status polling interval (default: 30s)
- `INSTANCE_STARTUP_TIMEOUT`: Maximum startup time (default: 10 min)
- `DEFAULT_REGION`: Default Novita.ai region (default: CN-HK-01)

### Redis Configuration
- `UPSTASH_REDIS_REST_URL`: Redis connection URL
- `UPSTASH_REDIS_REST_TOKEN`: Redis authentication token
- `REDIS_ENABLE_FALLBACK`: Fallback to in-memory (default: true)

### Auto-Stop Configuration
- `AUTO_STOP_INTERVAL`: Check interval (default: 5 min)
- `AUTO_STOP_THRESHOLD`: Inactivity threshold (default: 20 min)

### Migration Configuration
- `MIGRATION_ENABLED`: Enable auto-migration (default: true)
- `MIGRATION_INTERVAL_MINUTES`: Migration check interval (default: 15)

## Security Model

### Authentication
- API key-based authentication with Bearer tokens
- Secure storage of credentials in environment variables
- No hardcoded credentials in source code

### Authorization
- API key required for all endpoints
- Rate limiting to prevent abuse
- Input validation for all parameters

### Data Protection
- No sensitive data stored in logs
- Proper error handling without exposing system details
- Secure transmission with HTTPS in production

## Error Handling and Resilience

### Circuit Breaker Pattern
- Prevents cascade failures
- Automatic recovery when services become available
- Configurable thresholds and timeouts

### Retry Logic
- Exponential backoff for failed API calls
- Intelligent retry decisions based on error types
- Configurable retry attempts and delays

### Graceful Degradation
- Fallback to in-memory storage when Redis fails
- Continued operation with reduced functionality
- Detailed error logging for debugging

### Health Monitoring
- Comprehensive health check endpoint
- Validation of all external dependencies
- Real-time status monitoring
- Automated recovery mechanisms

## Deployment Architecture

### Containerized Deployment
- Multi-stage Docker builds for production security
- Health checks built into container images
- Resource limits and reservations
- Non-root user execution for security

### Scaling Considerations
- Stateless service design for horizontal scaling
- Redis for shared state across instances  
- Job queue for reliable background processing
- Load balancing support for high availability

### Production Features
- Structured JSON logging
- Health check endpoints for orchestration
- Metrics collection and monitoring
- Configuration validation on startup