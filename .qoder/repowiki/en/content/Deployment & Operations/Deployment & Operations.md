# Deployment & Operations

<cite>
**Referenced Files in This Document**   
- [Dockerfile](file://Dockerfile)
- [docker-compose.yml](file://docker-compose.yml)
- [docker-compose.prod.yml](file://docker-compose.prod.yml)
- [docker-compose.override.yml](file://docker-compose.override.yml)
- [scripts/deploy-dev.sh](file://scripts/deploy-dev.sh)
- [scripts/deploy-prod.sh](file://scripts/deploy-prod.sh)
- [scripts/health-check.sh](file://scripts/health-check.sh)
- [scripts/backup.sh](file://scripts/backup.sh)
- [DEPLOYMENT.md](file://DEPLOYMENT.md)
- [DOCKER_DEPLOYMENT_SUMMARY.md](file://DOCKER_DEPLOYMENT_SUMMARY.md)
</cite>

## Table of Contents
1. [Docker-Based Deployment Strategy](#docker-based-deployment-strategy)
2. [Docker Compose Configuration](#docker-compose-configuration)
3. [Deployment Procedures](#deployment-procedures)
4. [Health Check Mechanism](#health-check-mechanism)
5. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
6. [Production Best Practices](#production-best-practices)
7. [CI/CD Integration](#cicd-integration)
8. [Scaling and Performance Tuning](#scaling-and-performance-tuning)
9. [Operational Runbooks](#operational-runbooks)

## Docker-Based Deployment Strategy

The Novitai application utilizes a multi-stage Docker build process optimized for both development and production environments. The Dockerfile implements a security-hardened, production-ready image with minimal attack surface. The build process consists of multiple stages: base, dependencies, build, production dependencies, development, and production. This approach ensures that only necessary files and dependencies are included in the final production image, significantly reducing image size and potential vulnerabilities.

The production stage uses Alpine Linux as the base image for its small footprint and security advantages. The container runs as a non-root user (UID 1001) to minimize privilege escalation risks. The root filesystem is mounted as read-only, with only specific volumes (logs) having write permissions. Temporary filesystems are configured for `/tmp` and `/var/tmp` with `noexec` and `nosuid` flags to prevent execution of malicious code in temporary directories.

**Section sources**
- [Dockerfile](file://Dockerfile#L1-L112)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)
- [DOCKER_DEPLOYMENT_SUMMARY.md](file://DOCKER_DEPLOYMENT_SUMMARY.md#L1-L185)

## Docker Compose Configuration

The deployment infrastructure leverages Docker Compose with environment-specific configuration files to manage service orchestration. The core configuration is defined in `docker-compose.yml`, which establishes the base service definition, network configuration, volume mounts, and default resource limits. Environment-specific behaviors are implemented through override files: `docker-compose.override.yml` for development and `docker-compose.prod.yml` for production.

The development configuration enables hot reloading by mounting the source code directory, relaxes security restrictions for easier debugging, increases resource limits to accommodate development tools, and sets the log level to debug. In contrast, the production configuration enforces stricter security policies, uses more conservative resource limits, configures aggressive health checks, and implements structured logging with service and environment labels for monitoring integration.

The configuration supports environment variable interpolation and validation, ensuring critical settings like `NOVITA_API_KEY` are present before deployment. Volume management differs between environments, with development using local directory mounts for logs and production utilizing named volumes with bind mounts to system log directories for better log management and persistence.

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L1-L103)
- [docker-compose.prod.yml](file://docker-compose.prod.yml#L1-L66)
- [docker-compose.override.yml](file://docker-compose.override.yml#L1-L30)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Deployment Procedures

### Development Deployment

The development deployment process is automated through the `deploy-dev.sh` script, which provides a streamlined setup experience. The script first checks for the existence of the `.env` configuration file, creating it from the example template if missing. It then creates the necessary logs directory with appropriate permissions and initiates the Docker Compose stack using the development configuration.

The deployment includes a health verification phase that polls the `/health` endpoint every 2 seconds for up to 30 seconds. If the service fails to become responsive within this timeframe, the script outputs the last 20 log lines for troubleshooting and exits with an error. Upon successful deployment, the script displays the service status and provides quick reference information for accessing the API, health endpoint, and metrics.

### Production Deployment

The production deployment process is automated through the `deploy-prod.sh` script, which implements additional validation steps to prevent misconfigured deployments. The script verifies both the existence of the `.env` file and the presence of a valid `NOVITA_API_KEY` before proceeding. It then builds the production Docker image using the multi-stage build process and deploys the stack with both the base and production override configurations.

The production deployment includes an extended health verification phase with a 60-second timeout, reflecting the more stringent requirements of production environments. The script uses the full Docker Compose command path to ensure the correct configuration files are used. If the health check fails, the script outputs the relevant logs and exits with an error, preventing the use of a non-functional deployment.

**Section sources**
- [scripts/deploy-dev.sh](file://scripts/deploy-dev.sh#L1-L58)
- [scripts/deploy-prod.sh](file://scripts/deploy-prod.sh#L1-L63)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Health Check Mechanism

The health check mechanism is implemented at multiple levels to ensure service reliability and facilitate container orchestration. At the Docker level, a HEALTHCHECK instruction is defined in the Dockerfile with configurable parameters for interval, timeout, retries, and start period. This native Docker health check integrates with the container runtime to provide automatic status monitoring and restart capabilities.

The application exposes a dedicated `/health` endpoint that performs comprehensive health verification, checking service responsiveness, Novita.ai API connectivity, and internal service health. This endpoint is consumed by both the Docker health check and the external `health-check.sh` script. The external script provides enhanced diagnostic capabilities, including response time measurement, metrics endpoint validation, JSON response verification, and Docker container status inspection.

The health check configuration differs between environments, with production using more frequent checks (15s interval vs 30s), shorter timeouts (5s vs 10s), and more retry attempts (5 vs 3) to ensure rapid detection of issues. The start period is also extended in production (60s vs 40s) to accommodate potentially slower initialization in resource-constrained environments.

**Section sources**
- [scripts/health-check.sh](file://scripts/health-check.sh#L1-L96)
- [Dockerfile](file://Dockerfile#L1-L112)
- [docker-compose.yml](file://docker-compose.yml#L1-L103)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Backup and Disaster Recovery

The backup strategy is automated through the `backup.sh` script, which creates comprehensive backups of the application state, configuration, and data. The script generates timestamped archives containing configuration files, source code, scripts, logs, and package definitions while excluding transient directories like `node_modules` and `dist`. It also optionally backs up the Docker image and any local data directories.

The backup process includes several safety features: automatic cleanup of old backups (retaining only the most recent 5), manifest generation with system information and backup contents, and error tolerance for missing components. The manifest file provides detailed information about the backup contents, system environment, and restoration instructions, facilitating disaster recovery procedures.

For disaster recovery, the backup strategy enables complete restoration of the application state. The restoration process involves extracting the backup archive, loading the Docker image (if backed up), and redeploying the service with the restored configuration. The script-generated manifest provides step-by-step restoration instructions, reducing recovery time during critical incidents.

**Section sources**
- [scripts/backup.sh](file://scripts/backup.sh#L1-L101)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Production Best Practices

### Environment Variable Management

Environment variables are managed through the `.env` file, which should be populated from the provided `.env.example` template. Critical secrets like `NOVITA_API_KEY` must be configured before deployment. The configuration supports default values for optional variables while enforcing the presence of required ones through Docker Compose's environment validation syntax.

### Log Rotation

Log rotation is configured through Docker's json-file logging driver with size-based rotation. In production, logs are limited to 50MB per file with 5 rotation files, providing approximately 250MB of log history. The logs are stored in a dedicated volume mounted to `/var/log/novita-gpu-api` on the host system for centralized log management and monitoring integration.

### Monitoring Setup

The application provides multiple monitoring endpoints: the `/health` endpoint for liveness and readiness checks, and the `/metrics` endpoint for performance and operational metrics. These endpoints are designed to integrate with standard monitoring tools like Prometheus and Grafana. The production configuration includes service and environment labels in the log output to facilitate log aggregation and analysis.

### Security Hardening

Multiple security hardening measures are implemented: non-root user execution, read-only root filesystem, no-new-privileges security option, temporary filesystems with noexec/nosuid flags, and resource limits to prevent denial-of-service attacks. The application also includes security middleware (Helmet) and rate limiting to protect against common web vulnerabilities.

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L1-L103)
- [docker-compose.prod.yml](file://docker-compose.prod.yml#L1-L66)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## CI/CD Integration

The deployment architecture is designed for seamless integration with common CI/CD platforms. The multi-stage Docker build process ensures consistent image creation across environments. The environment-specific Docker Compose files enable easy configuration of different deployment stages (development, staging, production) within CI/CD pipelines.

The deployment scripts can be incorporated into CI/CD workflows to automate testing, validation, and deployment processes. The health check script provides a reliable way to verify deployment success before promoting to the next stage. The backup script can be scheduled as part of regular maintenance operations within the CI/CD system.

For integration with platforms like GitHub Actions, GitLab CI, or Jenkins, the deployment process can be triggered by code pushes or manual approvals. The scripts provide clear success/failure indications through exit codes, enabling proper pipeline control. Environment variables can be securely managed through the CI/CD platform's secret management features, eliminating the need to store sensitive information in version control.

**Section sources**
- [scripts/deploy-dev.sh](file://scripts/deploy-dev.sh#L1-L58)
- [scripts/deploy-prod.sh](file://scripts/deploy-prod.sh#L1-L63)
- [scripts/health-check.sh](file://scripts/health-check.sh#L1-L96)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Scaling and Performance Tuning

### Scaling Strategies

The application supports both vertical and horizontal scaling. Vertical scaling is achieved by adjusting the resource limits in the Docker Compose configuration, with recommended starting points of 512MB memory and 0.5 CPU cores for production. Horizontal scaling can be implemented by increasing the number of service replicas, though this requires external load balancing and shared state management.

### Resource Requirements

The minimum recommended resource allocation for production is 256MB reserved memory and 0.25 reserved CPU cores, with limits set at 512MB and 0.5 cores respectively. These values can be adjusted based on observed usage patterns and performance requirements. The development environment requires more generous resources (2GB memory limit) to accommodate development tools and debugging overhead.

### Performance Tuning Parameters

Several configuration parameters can be tuned for performance optimization:
- `INSTANCE_POLL_INTERVAL`: Controls the frequency of instance status checks (default: 30 seconds)
- `MAX_CONCURRENT_JOBS`: Limits the number of concurrent processing jobs (default: 10)
- `CACHE_TIMEOUT`: Sets the duration for caching API responses (default: 300 seconds)
- `REQUEST_TIMEOUT`: Configures the timeout for external API requests (default: 30,000 milliseconds)

These parameters should be adjusted based on the specific workload characteristics and performance requirements of the deployment environment.

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L1-L103)
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)

## Operational Runbooks

### Service Restarts

For routine restarts, use the standard Docker Compose command: `docker-compose restart novita-gpu-api`. The service is configured with a 30-second stop grace period to allow for graceful shutdown and cleanup operations. In production, restarts should be performed during maintenance windows to minimize impact on users.

### Upgrades

The upgrade process involves three steps: backup, image update, and deployment. First, create a backup using the `backup.sh` script. Then, pull the latest image or rebuild the Docker image. Finally, deploy the updated service with zero-downtime rolling updates using `docker-compose up -d --no-deps --build novita-gpu-api`. Verify the deployment using the health check script before considering the upgrade complete.

### Incident Response

In case of service failure, follow these steps:
1. Check container status and logs using `docker-compose ps` and `docker-compose logs`
2. Verify configuration with `docker-compose config`
3. Test connectivity to the health endpoint
4. If necessary, roll back to a previous backup
5. Consult the DEPLOYMENT.md documentation for troubleshooting guidance

Critical incidents should be documented, including the incident timeline, root cause analysis, and corrective actions taken to prevent recurrence.

**Section sources**
- [DEPLOYMENT.md](file://DEPLOYMENT.md#L1-L336)
- [scripts/health-check.sh](file://scripts/health-check.sh#L1-L96)
- [scripts/backup.sh](file://scripts/backup.sh#L1-L101)