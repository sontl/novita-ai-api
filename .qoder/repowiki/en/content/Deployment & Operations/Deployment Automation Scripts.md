# Deployment Automation Scripts

<cite>
**Referenced Files in This Document**   
- [deploy-dev.sh](file://scripts/deploy-dev.sh)
- [deploy-prod.sh](file://scripts/deploy-prod.sh)
- [health-check.sh](file://scripts/health-check.sh)
- [backup.sh](file://scripts/backup.sh)
- [Makefile](file://Makefile)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Development Deployment Script](#development-deployment-script)
3. [Production Deployment Script](#production-deployment-script)
4. [Health Check Script](#health-check-script)
5. [Backup Script](#backup-script)
6. [Integration with Makefile](#integration-with-makefile)
7. [Usage Examples](#usage-examples)
8. [Error Handling Mechanisms](#error-handling-mechanisms)
9. [Extensibility and Customization](#extensibility-and-customization)
10. [Security Considerations](#security-considerations)
11. [Conclusion](#conclusion)

## Introduction
This document provides a comprehensive overview of the deployment automation scripts located in the `scripts` directory of the Novita GPU Instance API project. These scripts streamline the setup, deployment, monitoring, and backup processes across development and production environments. Each script is designed to encapsulate complex operations into simple, repeatable commands, ensuring consistency and reducing human error during deployments. The integration with the Makefile further enhances usability by providing intuitive, high-level commands for common operations.

## Development Deployment Script

The `deploy-dev.sh` script automates the local development environment setup using Docker Compose. It ensures that all prerequisites are met before starting services, including the presence of a valid `.env` configuration file. If no `.env` file exists, it creates one from `.env.example` and prompts the user to configure it before proceeding. The script then starts the development stack in detached mode and performs a readiness check by polling the `/health` endpoint every 2 seconds for up to 30 seconds. Upon successful startup verification, it displays service status and access information. In case of failure, it outputs logs for troubleshooting.

The script also creates a `logs` directory with appropriate permissions and concludes with usage instructions for managing the running containers.

**Section sources**
- [deploy-dev.sh](file://scripts/deploy-dev.sh#L1-L58)

## Production Deployment Script

The `deploy-prod.sh` script orchestrates the production deployment workflow, which includes image building, configuration validation, service startup with production-specific overrides, and health verification. Unlike the development script, it enforces strict validation of the `.env` file, specifically checking that the `NOVITA_API_KEY` is properly set and not left at its default placeholder value.

It uses multiple Docker Compose files (`docker-compose.yml` and `docker-compose.prod.yml`) to apply production configurations such as resource limits, logging settings, and network policies. After building the production image, it starts the services and performs a health check by executing a `curl` command inside the running container to verify endpoint availability. The timeout is extended to 60 seconds to accommodate potentially slower production initialization. On failure, it retrieves logs from the main API service for diagnostics.

**Section sources**
- [deploy-prod.sh](file://scripts/deploy-prod.sh#L1-L63)

## Health Check Script

The `health-check.sh` script serves as a standalone utility for verifying the readiness and health of the Novita GPU Instance API. It supports environment variables `SERVICE_URL` (default: `http://localhost:3000`) and `TIMEOUT` (default: 10 seconds) for flexible integration into CI/CD pipelines and orchestration platforms like Kubernetes.

The script performs multiple checks:
- Validates HTTP response from the `/health` endpoint
- Confirms the `/metrics` endpoint returns valid JSON
- Measures response time and warns if above 5 seconds
- Checks Docker container status when Docker is available

Each check contributes to a final pass/fail result, making this script suitable for use in liveness and readiness probes. It leverages `jq` for JSON validation and includes robust error handling through the `set -e` directive.

**Section sources**
- [health-check.sh](file://scripts/health-check.sh#L1-L96)

## Backup Script

The `backup.sh` script enables comprehensive system backups, capturing configuration files, source code, logs, Docker images, and data directories (if present). It generates timestamped archives and a detailed manifest file containing system metadata, Docker image details, and backup contents.

Key features include:
- Exclusion of transient directories (`node_modules`, `dist`, etc.)
- Compression of archives using `tar.gz`
- Optional Docker image backup via `docker save`
- Manifest generation with system and environment context
- Automatic cleanup of older backups (retains last 5)

The script is idempotent and handles missing components gracefully (e.g., skips image backup if Docker is not available or image doesn't exist). It also provides clear restoration instructions in the output, enhancing usability during disaster recovery scenarios.

**Section sources**
- [backup.sh](file://scripts/backup.sh#L1-L101)

## Integration with Makefile

All deployment scripts are integrated into the project's `Makefile`, providing user-friendly, consistent commands across environments. This abstraction layer simplifies execution and reduces the need to remember complex script paths or arguments.

Key Make targets include:
- `make dev` → runs `deploy-dev.sh`
- `make prod` → runs `deploy-prod.sh`
- `make health` → runs `health-check.sh`
- `make backup` → runs `backup.sh`

The Makefile also includes related operations such as logging (`make logs`), stopping environments (`make down`), and setup (`make setup`). This standardization ensures that both novice and experienced users can interact with the system using a uniform interface, while still allowing direct script execution for advanced use cases.

**Section sources**
- [Makefile](file://Makefile#L1-L141)

## Usage Examples

Common workflows using the deployment scripts:

**Start development environment:**
```bash
make dev
# or directly
./scripts/deploy-dev.sh
```

**Deploy to production:**
```bash
make prod
# or directly
./scripts/deploy-prod.sh
```

**Run health check:**
```bash
make health
# or with custom URL
SERVICE_URL=http://api.example.com make health
```

**Create backup:**
```bash
make backup
# or with custom backup directory
BACKUP_DIR=/mnt/backups make backup
```

**Check status and logs:**
```bash
make status
make logs
```

These commands can be incorporated into CI/CD pipelines, scheduled tasks, or manual operations with consistent behavior.

## Error Handling Mechanisms

All scripts implement robust error handling using `set -e` to exit immediately on any command failure. They include:
- Pre-flight checks for required files and configurations
- Timeout mechanisms for service startup and health checks
- Fallback behaviors (e.g., skipping optional components)
- Descriptive error messages with diagnostic actions
- Log output on failure for troubleshooting

For example, `deploy-prod.sh` validates the API key configuration, while `backup.sh` continues archiving even if individual components fail (using `|| true`). The health check script aggregates multiple test results and reports a comprehensive summary, enabling precise failure identification.

## Extensibility and Customization

The scripts are designed for extensibility:
- Environment variables allow runtime configuration (`SERVICE_URL`, `BACKUP_DIR`, etc.)
- Modular functions (in `health-check.sh`) enable easy addition of new checks
- Clear separation of concerns between scripts facilitates reuse
- Standardized output format supports parsing in automation tools

To extend functionality:
- Add new endpoints to `health-check.sh` using `check_endpoint` or `check_json_endpoint`
- Include additional directories in `backup.sh`'s `tar` command
- Modify Docker Compose override files for environment-specific settings
- Create new Make targets for custom workflows

This design supports adaptation to different deployment topologies, cloud providers, or monitoring systems without modifying core logic.

## Security Considerations

The deployment scripts incorporate several security best practices:
- Script files have appropriate execute permissions (set via `chmod`)
- Sensitive configuration is externalized in `.env` files excluded from version control
- The `NOVITA_API_KEY` is validated to prevent accidental deployment with default values
- Backup archives include access controls and are stored locally by default
- Minimal permissions are used for log directories (`755`)

However, users should ensure:
- `.env` files are protected from unauthorized access
- Backup storage locations are secure and encrypted if needed
- Scripts are executed only by authorized personnel
- Production secrets are managed using secure vaults in enterprise environments

The use of Docker isolation further enhances security by containing the application and its dependencies.

## Conclusion

The deployment automation scripts in the `scripts` directory provide a robust, standardized approach to managing the Novita GPU Instance API lifecycle. From local development setup to production deployment, health monitoring, and system backups, these tools reduce operational complexity and improve reliability. Their integration with the Makefile offers a consistent user experience, while their modular design allows for future extensibility. By following security best practices and providing comprehensive error handling, these scripts form a critical component of the project's DevOps infrastructure.