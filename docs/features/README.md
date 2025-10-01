# Novita GPU Instance API - Features Overview

This document provides a comprehensive overview of all features available in the Novita GPU Instance API, with links to detailed documentation for each feature.

## Core Instance Management

### Instance Creation
- **API Endpoint**: `POST /api/instances`
- **Description**: Create new GPU instances with automated lifecycle management
- **Features**: 
  - GPU instance provisioning with specified product, template, and configuration
  - Automatic lifecycle state management
  - Webhook notifications for status changes
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md)

### Instance Start
- **API Endpoints**: `POST /api/instances/{instanceId}/start` and `POST /api/instances/start`
- **Description**: Start existing GPU instances by ID or name
- **Features**:
  - Support for both ID and name-based starting
  - Health check configuration with customizable parameters
  - Webhook notifications for status changes
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md)

### Instance Management (Stop and Delete)
- **API Endpoints**: `POST /api/instances/{instanceId}/stop`, `POST /api/instances/stop`, `DELETE /api/instances/{instanceId}`, `POST /api/instances/delete`
- **Description**: Stop or permanently delete GPU instances by ID or name
- **Features**:
  - Stop functionality with idempotent operations
  - Permanent deletion with validation
  - Support for both ID and name-based operations
  - Status tracking and transitions
  - Webhook notifications for operations
- **Documentation**: [Instance Management API](instance-management.md)

### Instance Status and Monitoring
- **API Endpoints**: `GET /api/instances/{instanceId}`, `GET /api/instances`, `GET /api/instances/comprehensive`
- **Description**: Retrieve current status and details of GPU instances
- **Features**:
  - Individual instance status retrieval
  - List all managed instances with current status
  - Comprehensive instance data from both local state and Novita.ai API
  - Connection details and port mappings
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md)

## Auto-Stop Feature

### Automatic Instance Stopping
- **API Endpoints**: `PUT /api/instances/{instanceId}/last-used`, `GET /api/instances/auto-stop/stats`, `POST /api/instances/auto-stop/trigger`
- **Description**: Automatically stops instances that have been inactive for a configurable period
- **Features**:
  - Last Used Time Tracking: Clients can update when an instance was last used
  - Automatic Monitoring: Background service checks for inactive instances every 5 minutes
  - Configurable Thresholds: Default 20-minute inactivity threshold (configurable)
  - Dry Run Mode: Test auto-stop logic without actually stopping instances
  - Manual Triggers: Manually trigger auto-stop checks for testing
  - Comprehensive Logging: Detailed logs for monitoring and debugging
- **Documentation**: [Auto-Stop Feature](auto-stop.md)

## Multi-Region Fallback

### Regional Instance Creation
- **Description**: Automatic fallback to alternative regions when creating GPU instances
- **Features**:
  - Predefined regions with priorities (AS-SGP-02, CN-HK-01, AS-IN-01)
  - Automatic failover when preferred region is unavailable
  - Support for custom region configuration
  - Comprehensive logging for debugging
- **Documentation**: [Region Fallback Implementation](../legacy/REGION_FALLBACK_IMPLEMENTATION.md)

## Migration Features

### Instance Migration and Recovery
- **Description**: Automated migration and recovery system for failed migrations with time-based eligibility
- **Features**:
  - Failed migration detection and handling
  - Instance recreation using original configuration data
  - Time-based migration eligibility (instead of complex GPU ID/spot checks)
  - Direct instance data usage instead of template fetching for recreation
  - Enhanced error handling and logging
- **Documentation**: [Migration Features](migration.md)

## Data Persistence

### Redis Integration
- **Description**: Data persistence using Upstash Redis for cache and job queue services
- **Features**:
  - Cache persistence for instance details and product data
  - Job queue persistence for background operations
  - Cross-restart persistence (data survives application restarts)
  - Distributed caching support
  - Automatic fallback to in-memory storage when Redis is unavailable
- **Documentation**: [Redis Configuration Guide](../integrations/redis.md), [API Client Reference](../api/client-reference.md#data-persistence)

### Startup Synchronization
- **Description**: Automatic synchronization of instance data between Novita.ai and Redis cache on startup
- **Features**:
  - Automatic sync on startup to ensure data consistency
  - Orphan cleanup to remove instances from cache that no longer exist in Novita.ai
  - Concurrent protection using Redis locks
  - Performance optimized with paginated API calls
- **Documentation**: [Startup Synchronization and Web UI](../legacy/STARTUP_SYNC_AND_UI.md)

## Web Management UI

### Web-based Instance Management
- **Description**: Clean, responsive web interface for managing GPU instances and monitoring system health
- **Features**:
  - Dashboard with real-time statistics and system health
  - Instance management (view, start, stop, manage instances)
  - Sync control for manual synchronization with Novita.ai
  - Cache management (clear cache, view cache statistics)
  - Bulk operations (stop all running instances)
  - Auto-refresh functionality
- **Documentation**: [Web UI Documentation](../legacy/STARTUP_SYNC_AND_UI.md#web-management-ui)

## Webhook Notifications

### Event Notifications
- **Description**: HTTP POST notifications for status changes when webhook URLs are provided
- **Features**:
  - Configurable webhook URLs for status notifications
  - Support for both request-specific and instance-configured webhook URLs
  - Structured webhook payloads with instance details
  - Webhook signature verification for security
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#webhook-notifications)

## Monitoring and Health

### Health Checks
- **API Endpoint**: `GET /health`
- **Description**: Comprehensive service health and system monitoring
- **Features**:
  - Service connectivity checks (Novita API, job queue, cache, migration service)
  - System performance metrics (requests per minute, response time, error rate)
  - Resource usage monitoring (memory, CPU)
  - Redis status indicators
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#health-check)

### Metrics
- **API Endpoints**: `GET /api/metrics`, `GET /api/metrics/summary`
- **Description**: Application performance metrics
- **Features**:
  - Request metrics (total, by status code)
  - Job processing metrics (processed, by type)
  - System metrics (memory, CPU, uptime)
  - Cache performance metrics (hit ratio, total size)
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#metrics)

### Cache Management
- **API Endpoints**: `GET /api/cache/stats`, `POST /api/cache/clear`
- **Description**: Cache performance and management utilities
- **Features**:
  - Cache statistics with hit ratios and performance metrics
  - Clear specific caches or all caches
  - Cache size and entry tracking
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#cache-management)

## Advanced Features

### Axiom Logging Integration
- **Description**: Structured logging with rich metadata for enhanced observability
- **Features**:
  - Dual transport (console and Axiom)
  - Structured JSON format with rich metadata
  - Request tracing with correlation IDs
  - Performance monitoring with slow operation detection
  - Security and business event tracking
- **Documentation**: [Axiom Logging Integration](../integrations/axiom.md)

## Error Handling and Reliability

### Circuit Breaker Pattern
- **Description**: Circuit breaker implementation for improved resilience
- **Features**:
  - Automatic failure detection and service isolation
  - Fallback mechanism when services are unavailable
  - Automatic recovery when services become available again
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#error-codes)

### Rate Limiting
- **Description**: Request rate limiting to prevent abuse
- **Features**:
  - Default limit of 100 requests per minute per IP
  - Response headers with rate limit information
  - Configurable limits based on deployment needs
- **Documentation**: [API Client Reference](../../API_CLIENT_REFERENCE.md#rate-limiting)