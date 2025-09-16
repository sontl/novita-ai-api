# Getting Started

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [package.json](file://package.json)
- [docker-compose.yml](file://docker-compose.yml)
- [docker-compose.example.yml](file://docker-compose.example.yml)
- [docker-compose.prod.yml](file://docker-compose.prod.yml)
- [Dockerfile](file://Dockerfile)
- [DEPLOYMENT.md](file://DEPLOYMENT.md)
- [DOCKER_DEPLOYMENT_SUMMARY.md](file://DOCKER_DEPLOYMENT_SUMMARY.md)
- [.env.example](file://.env.example)
- [src/index.ts](file://src/index.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Installation Methods](#installation-methods)
5. [Node.js Direct Execution](#nodejs-direct-execution)
6. [Docker-Based Deployment](#docker-based-deployment)
7. [Configuration with .env File](#configuration-with-env-file)
8. [Production Deployment](#production-deployment)
9. [Quick-Start API Example](#quick-start-api-example)
10. [Common Setup Pitfalls and Solutions](#common-setup-pitfalls-and-solutions)

## Introduction
This guide provides a comprehensive onboarding process for developers and operators to quickly set up and run the Novita GPU Instance API service. The instructions are designed to enable a new user to go from cloning the repository to running a functional service in under 10 minutes, using either direct Node.js execution or Docker-based deployment.

## Prerequisites
Before beginning the setup, ensure your system meets the following requirements:

- **Node.js 18+** (for local development)
- **Docker Engine 20.10+**
- **Docker Compose 2.0+**
- **Novita.ai API key** (required for service operation)

These prerequisites support both development and production deployment workflows.

**Section sources**
- [README.md](file://README.md#L15-L20)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L5-L10)

## Environment Setup
Begin by cloning the repository and navigating into the project directory:

```bash
git clone https://github.com/novitai/novita-gpu-instance-api.git
cd novita-gpu-instance-api
```

Next, copy the example environment file to create your local `.env` configuration:

```bash
cp .env.example .env
```

Edit the `.env` file to include your Novita.ai API key and optional webhook configuration:

```bash
NOVITA_API_KEY=your_actual_api_key_here
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook
```

This environment file will be used by both Node.js and Docker deployment methods.

**Section sources**
- [README.md](file://README.md#L23-L30)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L15-L20)

## Installation Methods
The Novita GPU Instance API supports two primary installation methods:

1. **Direct Node.js Execution**: Best for development and debugging
2. **Docker-Based Deployment**: Ideal for consistent environments and production use

Both methods are fully supported and will result in a running API service accessible on port 3000 by default.

## Node.js Direct Execution
For developers who prefer to run the application directly using Node.js, follow these steps:

1. Install all dependencies using npm:
```bash
npm install
```

2. Build the TypeScript application:
```bash
npm run build
```

3. Start the application in development mode with hot reloading:
```bash
npm run dev
```

The development server will be available at `http://localhost:3000`. The `dev` script uses `ts-node-dev` for automatic restarts when code changes are detected.

Alternative npm scripts include:
- `npm start`: Run the compiled production build
- `npm run test`: Execute unit and integration tests
- `npm run lint`: Check code quality with ESLint

**Section sources**
- [README.md](file://README.md#L33-L45)
- [package.json](file://package.json#L7-L12)

## Docker-Based Deployment
For containerized deployment, Docker Compose provides a complete environment with proper networking, logging, and health checks.

To start the service using Docker Compose:
```bash
docker-compose up -d
```

This command:
- Builds the container image (if not already built)
- Creates and starts the container
- Sets up the dedicated `novita-network`
- Mounts the logs volume to `./logs`
- Applies resource limits and security settings

Verify the service is running:
```bash
docker-compose ps
```

View logs:
```bash
docker-compose logs -f novita-gpu-api
```

Stop the service:
```bash
docker-compose down
```

**Section sources**
- [README.md](file://README.md#L48-L55)
- [docker-compose.yml](file://docker-compose.yml#L1-L103)

## Configuration with .env File
The `.env` file controls all runtime configuration. After copying `.env.example` to `.env`, configure the following key variables:

```bash
# Required - Your Novita.ai API key
NOVITA_API_KEY=your_api_key_here

# Optional - Webhook for instance ready notifications
WEBHOOK_URL=https://your-webhook-endpoint.com/webhook
WEBHOOK_SECRET=your_signing_secret

# Logging level (error, warn, info, debug)
LOG_LEVEL=info

# Default region for GPU instances
DEFAULT_REGION=CN-HK-01
```

The `docker-compose.yml` file references these environment variables, with defaults provided where appropriate. The `NOVITA_API_KEY` is required and will cause startup failure if not set.

For custom deployment scenarios, refer to `docker-compose.example.yml` which demonstrates:
- Custom port mapping
- Additional volume mounts
- Resource limit adjustments
- Reverse proxy (nginx) integration
- Monitoring (Prometheus) setup

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L15-L45)
- [docker-compose.example.yml](file://docker-compose.example.yml#L1-L70)

## Production Deployment
For production environments, use the production-specific configuration:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The `docker-compose.prod.yml` file provides production-optimized settings:
- Uses pre-built images with version tags
- Stricter resource limits (512MB memory, 0.5 CPU)
- More frequent health checks
- Enhanced logging with structured labels
- Rolling update and rollback policies

The production configuration also sets `NODE_ENV=production` and uses a dedicated log volume mounted at `/var/log/novita-gpu-api`.

Alternatively, use the provided deployment script:
```bash
./scripts/deploy-prod.sh
```

**Section sources**
- [docker-compose.prod.yml](file://docker-compose.prod.yml#L1-L66)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L25-L30)

## Quick-Start API Example
Once the service is running, test the API by creating a GPU instance:

```bash
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stable-diffusion-xl",
    "region": "CN-HK-01",
    "webhookUrl": "https://your-webhook.com/notify"
  }'
```

A successful response will return:
```json
{
  "instanceId": "inst_12345",
  "status": "pending",
  "createdAt": "2023-12-01T10:00:00Z"
}
```

Check instance status:
```bash
curl http://localhost:3000/api/instances/inst_12345
```

The service will automatically poll Novita.ai for instance readiness and send a webhook notification when the GPU instance is available.

**Section sources**
- [README.md](file://README.md#L60-L70)
- [src/routes/instances.ts](file://src/routes/instances.ts#L15-L132)

## Common Setup Pitfalls and Solutions
This section addresses frequent issues encountered during setup and their resolutions.

### Port Conflicts
**Issue**: "Port 3000 is already in use" error.
**Solution**: Change the host port in `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"
```
Or set the PORT environment variable in `.env`:
```bash
PORT=8080
```

### Missing Environment Variables
**Issue**: Container fails to start with "NOVITA_API_KEY is required".
**Solution**: Ensure `.env` file exists and contains:
```bash
NOVITA_API_KEY=your_actual_key_here
```
Verify the file is in the correct directory and has proper permissions.

### Docker Permission Issues
**Issue**: "Permission denied" when accessing logs or volumes.
**Solution**: Fix directory ownership:
```bash
sudo chown -R 1001:1001 ./logs
sudo chmod 755 ./logs
```
The container runs as user 1001 (nodejs), so mounted directories must be accessible.

### Health Check Failures
**Issue**: Container restarts due to failed health checks.
**Solution**: Verify API key connectivity:
```bash
docker-compose exec novita-gpu-api curl -H "Authorization: Bearer $NOVITA_API_KEY" https://api.novita.ai/v1/products
```
Ensure network connectivity and correct API key permissions.

### Development Mode Not Restarting
**Issue**: Changes to source code don't trigger server restart.
**Solution**: Ensure you're using `npm run dev` and that file watching is supported in your environment. On some systems, you may need to increase inotify limits.

**Section sources**
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L150-L200)
- [docker-compose.yml](file://docker-compose.yml#L50-L55)
- [Dockerfile](file://Dockerfile#L1-L112)