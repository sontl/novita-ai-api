# Requirements Document

## Introduction

This feature provides an API service that automates the creation, management, and monitoring of Novita.ai GPU instances. The service will handle the complete lifecycle from instance creation with optimal pricing selection, automatic startup, status monitoring, and webhook notifications when instances are ready. The system will be deployable as a Docker Compose application for easy deployment and scaling.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to create a GPU instance by providing minimal configuration parameters, so that I can quickly provision compute resources without manual API orchestration.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/instances` with name, productName, templateId, and optional parameters THEN the system SHALL create a new Novita.ai GPU instance
2. WHEN productName is provided THEN the system SHALL query available products and select the lowest spot price option in the default region (CN-HK-01)
3. WHEN templateId is provided THEN the system SHALL fetch template configuration including imageUrl, imageAuth, envs, and ports
4. WHEN gpuNum is not specified THEN the system SHALL default to 1 GPU
5. WHEN rootfsSize is not specified THEN the system SHALL default to 60GB
6. WHEN billingMode is not specified THEN the system SHALL default to "spot" pricing

### Requirement 2

**User Story:** As a developer, I want the system to automatically start created instances and monitor their status, so that I don't need to manually manage the instance lifecycle.

#### Acceptance Criteria

1. WHEN an instance is successfully created THEN the system SHALL automatically start the instance
2. WHEN an instance is started THEN the system SHALL continuously poll the instance status every 30 seconds
3. WHEN the instance status becomes "running" THEN the system SHALL stop polling and trigger the configured webhook
4. IF the instance fails to start within 10 minutes THEN the system SHALL log an error and notify via webhook with failure status
5. WHEN polling for status THEN the system SHALL handle API rate limits and network errors gracefully

### Requirement 3

**User Story:** As a system administrator, I want to receive webhook notifications when instances are ready or fail, so that I can integrate with downstream systems and workflows.

#### Acceptance Criteria

1. WHEN an instance reaches "running" status THEN the system SHALL send a POST request to the configured webhook URL with instance details
2. WHEN an instance fails to start THEN the system SHALL send a POST request to the configured webhook URL with error details
3. WHEN webhook delivery fails THEN the system SHALL retry up to 3 times with exponential backoff
4. WHEN webhook configuration is missing THEN the system SHALL log the status change but continue operation

### Requirement 4

**User Story:** As a developer, I want to query the status of my GPU instances, so that I can monitor their current state and connection details.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/instances/{instanceId}` THEN the system SHALL return the current instance status and details
2. WHEN a GET request is made to `/api/instances` THEN the system SHALL return a list of all managed instances
3. WHEN an instance is not found THEN the system SHALL return a 404 error with appropriate message
4. WHEN the Novita.ai API is unavailable THEN the system SHALL return cached status if available or appropriate error message

### Requirement 5

**User Story:** As a DevOps engineer, I want to deploy the service using Docker Compose, so that I can easily manage the application in containerized environments.

#### Acceptance Criteria

1. WHEN docker-compose up is executed THEN the system SHALL start all required services including the API server and any dependencies
2. WHEN environment variables are provided THEN the system SHALL configure Novita.ai API credentials and webhook URLs
3. WHEN the container starts THEN the system SHALL validate required configuration and fail fast if invalid
4. WHEN the service is running THEN it SHALL expose health check endpoints for monitoring
5. WHEN data persistence is needed THEN the system SHALL use volumes for storing instance state and logs

### Requirement 6

**User Story:** As a developer, I want the system to handle errors gracefully and provide meaningful feedback, so that I can troubleshoot issues effectively.

#### Acceptance Criteria

1. WHEN Novita.ai API returns an error THEN the system SHALL return appropriate HTTP status codes and error messages
2. WHEN invalid parameters are provided THEN the system SHALL return 400 Bad Request with validation details
3. WHEN API rate limits are exceeded THEN the system SHALL implement exponential backoff and retry logic
4. WHEN network timeouts occur THEN the system SHALL retry requests up to 3 times before failing
5. WHEN system errors occur THEN the system SHALL log detailed error information for debugging