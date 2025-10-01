# Novita GPU Instance API - Documentation Index

Welcome to the comprehensive documentation for the Novita GPU Instance API. This service provides automated lifecycle management for Novita.ai GPU instances with features including automated creation, monitoring, migration, and advanced management capabilities.

## 📚 Documentation Structure

The documentation is organized into several key sections:

### 🚀 **Getting Started**
- **[API Quick Start](./api/quick-start.md)** - Get up and running in minutes
- **[Complete API Reference](./api/client-reference.md)** - Full API documentation with examples
- **[API Endpoints Guide](./api/endpoints.md)** - Technical endpoint details
- **[Client Examples](./api/examples.md)** - Code examples in multiple languages

### 🛠️ **Deployment & Operations**
- **[Docker Deployment Guide](./deployment/docker.md)** - Complete Docker setup instructions
- **[Configuration Reference](./deployment/configuration.md)** - All environment variables and settings
- **[Operations Guide](./deployment/operations.md)** - Monitoring, maintenance, and runbooks
- **[Deployment Examples](./deployment/examples.md)** - Production scenarios and configurations
- **[Guide](./deployment/guide.md)** - General deployment information

### 🔧 **Features & Functionality**
- **[Auto-Stop Feature](./features/auto-stop.md)** - Automatic instance stopping for cost optimization
- **[Instance Management](./features/instance-management.md)** - Start, stop, delete operations
- **[Migration Features](./features/migration.md)** - Spot instance auto-migration system

### 🔗 **Integrations**
- **[Redis Integration](./integrations/redis.md)** - Data persistence and caching
- **[Axiom Integration](./integrations/axiom.md)** - Logging and observability
- **[Novita API Integration](./integrations/novita-api.md)** - Core API integration details

### 🏗️ **Implementation Details**
- **[Architecture Overview](./implementation/architecture.md)** - System architecture and components
- **[Implementation Changelog](./implementation/changelog.md)** - Feature history and changes

### 🛡️ **Support & Troubleshooting**
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[Migration Guide](./MIGRATION.md)** - Spot instance migration system
- **[API Documentation](./API.md)** - Core API reference
- **[Usage Examples](./EXAMPLES.md)** - Integration examples

### 🗄️ **Historical Documentation**
- **[Archived Implementation Summaries](./legacy/)** - Historical implementation details
- **[Duplicate Analysis](./DUPLICATE_ANALYSIS.md)** - Documentation overlap analysis
- **[Inventory](./INVENTORY.md)** - Complete documentation inventory
- **[Reorganization Summary](./REORGANIZATION_SUMMARY.md)** - Documentation structure changes

## 🎯 Quick Navigation

### For Developers
1. **Start Here**: [API Quick Start](./api/quick-start.md)
2. **Complete Reference**: [API Client Reference](./api/client-reference.md) 
3. **Code Examples**: [Client Examples](./api/examples.md)
4. **Integration Patterns**: [Usage Examples](./EXAMPLES.md)

### For DevOps/Deployment
1. **Deployment**: [Docker Deployment Guide](./deployment/docker.md)
2. **Configuration**: [Configuration Reference](./deployment/configuration.md)
3. **Operations**: [Operations Guide](./deployment/operations.md)
4. **Production Examples**: [Deployment Examples](./deployment/examples.md)

### For System Administrators
1. **Monitoring**: [Operations Guide](./deployment/operations.md)
2. **Troubleshooting**: [Troubleshooting Guide](./TROUBLESHOOTING.md)
3. **System Architecture**: [Architecture Overview](./implementation/architecture.md)
4. **Configuration**: [Configuration Reference](./deployment/configuration.md)

## 📋 Featured Guides

### Core Setup & Configuration
- [Quick Start Guide](./api/quick-start.md) - Deploy and configure in 10 minutes
- [Complete Configuration Reference](./deployment/configuration.md) - All settings explained
- [Docker Deployment](./deployment/docker.md) - Production deployment guide

### Advanced Features
- [Auto-Stop System](./features/auto-stop.md) - Cost optimization through automation
- [Spot Instance Migration](./features/migration.md) - Zero-downtime migration system
- [Instance Management](./features/instance-management.md) - Full lifecycle management

### Integration & Operations
- [Redis Setup & Management](./integrations/redis.md) - Data persistence solutions
- [Monitoring & Operations](./deployment/operations.md) - Production operations guide
- [Troubleshooting](./TROUBLESHOOTING.md) - Issue resolution guide

## 🏗️ System Overview

The Novita GPU Instance API is built with modern best practices:

- **TypeScript/Node.js** backend with full type safety
- **Redis persistence** with graceful fallback to in-memory storage
- **Docker containerization** with comprehensive health checks
- **RESTful API** design with consistent patterns
- **Comprehensive error handling** with retry logic and circuit breakers
- **Structured logging** with rich metadata for observability
- **Webhook notifications** for real-time status updates
- **Job queue system** for reliable background processing

## 🚦 Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/instances` | Create GPU instances |
| `GET /health` | Service health check |
| `GET /api/metrics` | System metrics |
| `GET /api/instances/{id}` | Instance status |
| `POST /api/instances/{id}/start` | Start instances |
| `POST /api/instances/{id}/stop` | Stop instances |
| `DELETE /api/instances/{id}` | Delete instances |

## 📈 Quick Start Commands

```bash
# Deploy with Docker
docker-compose up -d

# Check health
curl http://localhost:3000/health

# Create an instance
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -d '{"name": "my-instance", "productName": "RTX 4090 24GB", "templateId": "pytorch-jupyter"}'
```

## 🔄 Latest Updates

For the most recent changes and feature additions, see the [Implementation Changelog](./implementation/changelog.md).

## 💡 Need Help?

1. **New to the API?** Start with the [Quick Start Guide](./api/quick-start.md)
2. **Deployment questions?** Check the [Docker Deployment Guide](./deployment/docker.md)
3. **Issues?** Review the [Troubleshooting Guide](./TROUBLESHOOTING.md)
4. **Architecture questions?** See the [Architecture Overview](./implementation/architecture.md)

---

This documentation hub provides comprehensive coverage of all aspects of the Novita GPU Instance API. Use the navigation above to find the information you need for your specific use case.