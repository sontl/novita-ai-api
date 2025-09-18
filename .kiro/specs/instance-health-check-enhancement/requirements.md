# Requirements Document

## Introduction

This feature enhances the instance monitoring system to include application-level health checks after GPU instances reach the "Running" state. Currently, the system only monitors until the instance status becomes "Running", but applications inside the instance may still need additional time to start and become ready to serve requests. This enhancement adds health checks for the application endpoints exposed through port mappings to ensure the instance is truly ready for use.

## Requirements

### Requirement 1

**User Story:** As a developer using the GPU instance API, I want the system to verify that applications inside the instance are ready to serve requests, so that I receive accurate notifications about instance readiness.

#### Acceptance Criteria

1. WHEN an instance reaches "Running" status THEN the system SHALL perform health checks on the application endpoints
2. WHEN health checks are performed THEN the system SHALL check all endpoints in the portMappings array by default
3. WHEN a specific port is provided in the monitoring request THEN the system SHALL only check the endpoint for that specific port
4. WHEN an endpoint returns a successful response (not "Bad Gateway") THEN the system SHALL consider that endpoint healthy
5. WHEN all required endpoints are healthy THEN the system SHALL update the instance status to "Ready" and send webhook notifications

### Requirement 2

**User Story:** As a system administrator, I want configurable health check parameters, so that I can adjust timeouts and retry behavior based on different application startup requirements.

#### Acceptance Criteria

1. WHEN performing health checks THEN the system SHALL use configurable timeout values for HTTP requests
2. WHEN an endpoint health check fails THEN the system SHALL retry according to configurable retry parameters
3. WHEN health checks exceed the maximum wait time THEN the system SHALL mark the instance as failed with appropriate error messaging
4. WHEN health check configuration is not provided THEN the system SHALL use sensible default values

### Requirement 3

**User Story:** As a developer integrating with the API, I want detailed health check status information, so that I can understand why an instance might not be ready.

#### Acceptance Criteria

1. WHEN health checks are in progress THEN the system SHALL log detailed information about each endpoint check
2. WHEN health checks fail THEN the system SHALL include specific error details in the instance state
3. WHEN webhook notifications are sent THEN the system SHALL include health check results and endpoint status information
4. WHEN querying instance status THEN the system SHALL return current health check progress and results

### Requirement 4

**User Story:** As a developer, I want the health check system to handle different types of application endpoints gracefully, so that various application architectures are supported.

#### Acceptance Criteria

1. WHEN checking HTTP endpoints THEN the system SHALL accept any 2xx or 3xx status code as healthy
2. WHEN an endpoint returns "Bad Gateway" or 5xx errors THEN the system SHALL consider it unhealthy and continue monitoring
3. WHEN an endpoint is unreachable or times out THEN the system SHALL consider it unhealthy and retry according to configuration
4. WHEN checking multiple endpoints THEN the system SHALL perform checks in parallel for efficiency
5. WHEN partial endpoints are healthy THEN the system SHALL continue monitoring until all required endpoints are ready or timeout occurs