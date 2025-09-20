# Documentation Index

Complete documentation for the Novita GPU Instance API service.

## 🚀 Getting Started

- **[README.md](./README.md)** - Project overview and quick setup
- **[API Quick Start](./API_QUICK_START.md)** - Get started with the API in minutes
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Docker deployment guide

## 📖 API Documentation

- **[API Client Reference](./API_CLIENT_REFERENCE.md)** - Complete API documentation for client integration
  - All endpoints with request/response examples
  - Error codes and handling
  - Best practices and client libraries
  - Webhook documentation

## 🔧 Technical Documentation

- **[API Endpoints Summary](./API_ENDPOINTS_SUMMARY.md)** - Technical implementation summary
- **[STOP API Implementation](./STOP_API_IMPLEMENTATION.md)** - Stop API feature documentation
- **[Region Fallback Implementation](./REGION_FALLBACK_IMPLEMENTATION.md)** - Region fallback logic
- **[Startup Error Handling Summary](./STARTUP_ERROR_HANDLING_SUMMARY.md)** - Error handling details

## 🐳 Deployment & Operations

- **[Docker Deployment Summary](./DOCKER_DEPLOYMENT_SUMMARY.md)** - Docker deployment overview
- **[Makefile](./Makefile)** - Build and deployment commands

## 💻 Client Examples

- **[client-examples/README.md](./client-examples/README.md)** - Client integration examples
  - Node.js examples
  - Python examples  
  - Shell script examples
  - Integration patterns

## 📊 Configuration & Monitoring

- **[.env.example](./.env.example)** - Environment configuration template
- Health checks: `GET /health`
- Metrics: `GET /api/metrics`
- Cache management: `GET /api/cache/stats`

## 🏗️ Development

- **[package.json](./package.json)** - Dependencies and scripts
- **[tsconfig.json](./tsconfig.json)** - TypeScript configuration
- **[jest.config.js](./jest.config.js)** - Test configuration
- **[.eslintrc.js](./.eslintrc.js)** - Linting configuration

## 📁 Project Structure

```
├── src/
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── clients/         # External API clients
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Shared utilities
│   └── config/          # Configuration management
├── client-examples/     # Client integration examples
├── docs/               # Additional documentation
├── logs/               # Application logs
└── coverage/           # Test coverage reports
```

## 🔍 Quick Navigation

### For Developers Integrating the API
1. [API Quick Start](./API_QUICK_START.md) - Start here
2. [API Client Reference](./API_CLIENT_REFERENCE.md) - Complete reference
3. [client-examples/](./client-examples/) - Code examples

### For DevOps/Deployment
1. [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
2. [Docker Deployment Summary](./DOCKER_DEPLOYMENT_SUMMARY.md) - Docker overview
3. [.env.example](./.env.example) - Configuration template

### For Troubleshooting
1. Health check: `curl http://localhost:3000/health`
2. [STARTUP_ERROR_HANDLING_SUMMARY.md](./STARTUP_ERROR_HANDLING_SUMMARY.md)
3. Application logs in `./logs/`

### For Understanding Implementation
1. [API Endpoints Summary](./API_ENDPOINTS_SUMMARY.md) - Technical details
2. [src/routes/](./src/routes/) - Route implementations
3. [src/services/](./src/services/) - Business logic

## 📝 Document Status

| Document | Status | Last Updated | Purpose |
|----------|--------|--------------|---------|
| README.md | ✅ Current | 2024-01-15 | Project overview |
| API_CLIENT_REFERENCE.md | ✅ Current | 2024-01-15 | Complete API docs |
| API_QUICK_START.md | ✅ Current | 2024-01-15 | Quick start guide |
| DEPLOYMENT.md | ✅ Current | 2024-01-15 | Deployment guide |
| API_ENDPOINTS_SUMMARY.md | ✅ Current | 2024-01-15 | Technical summary |

## 🤝 Contributing

When updating documentation:

1. Keep the [API Client Reference](./API_CLIENT_REFERENCE.md) as the primary API documentation
2. Update this index when adding new documents
3. Ensure examples are tested and working
4. Follow the existing documentation style
5. Update the document status table above

## 📞 Support

For documentation issues:

1. Check the relevant document from the list above
2. Review the [API Client Reference](./API_CLIENT_REFERENCE.md) for API questions
3. Check [client-examples/](./client-examples/) for integration help
4. Test with the health endpoint: `GET /health`
5. Contact the development team