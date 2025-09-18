# Requirements Document

## Introduction

This feature adds an API endpoint to start GPU instances that are currently in "exited" status. The system will validate the instance status, start the instance through the Novita.ai API, monitor the startup process, perform health checks on application endpoints, and send webhook notifications when the instance is ready to serve requests. The endpoint will accept either instance ID or instance name as input for flexible integration.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to start a stopped GPU instance using either its ID or name, so that I can resume work on previously created instances without recreating them.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/instances/{instanceId}/start` THEN the system SHALL start the specified instance if it exists and is in "exited" status
2. WHEN a POST request is made to `/api/instances/start` with instanceName in the request body THEN the system SHALL find the instance by name and start it if it's in "exited" status
3. WHEN an instance is not found THEN the system SHALL return a 404 error with appropriate message
4. WHEN an instance is not in "exited" status THEN the system SHALL return a 400 error indicating the current status and that it cannot be started
5. WHEN the start operation is initiated successfully THEN the system SHALL return a 202 Accepted response with operation details

### Requirement 2

**User Story:** As a developer, I want the system to validate instance status before attempting to start it, so that I receive clear feedback about why a start operation might fail.

#### Acceptance Criteria

1. WHEN checking instance status THEN the system SHALL first retrieve current instance details from the Novita.ai API
2. WHEN an instance is in "creating", "starting", "running", or "ready" status THEN the system SHALL return an error indicating the instance is already active
3. WHEN an instance is in "stopping" or "failed" status THEN the system SHALL return an error indicating the instance cannot be started in its current state
4. WHEN an instance is in "terminated" status THEN the system SHALL return an error indicating the instance has been permanently terminated
5. WHEN the Novita.ai API is unavailable THEN the system SHALL return a 503 error with retry information

### Requirement 3

**User Story:** As a developer, I want the system to monitor the instance startup process and perform health checks, so that I know when the instance is truly ready to serve requests.

#### Acceptance Criteria

1. WHEN an instance start is initiated THEN the system SHALL create a monitoring job to track the startup progress
2. WHEN the instance status becomes "running" THEN the system SHALL begin health checks on the configured application endpoints
3. WHEN health checks pass for all required endpoints THEN the system SHALL update the instance status to "ready" and send webhook notifications
4. WHEN health checks fail or timeout THEN the system SHALL mark the instance as "failed" and send failure webhook notifications
5. WHEN monitoring exceeds the maximum wait time THEN the system SHALL timeout the operation and send appropriate notifications

### Requirement 4

**User Story:** As a system administrator, I want configurable startup monitoring and health check parameters, so that I can adjust timeouts and behavior based on different application requirements.

#### Acceptance Criteria

1. WHEN starting an instance THEN the system SHALL use configurable timeout values for the startup monitoring process
2. WHEN performing health checks THEN the system SHALL use configurable parameters for endpoint checks, retries, and timeouts
3. WHEN health check configuration is provided in the start request THEN the system SHALL use those parameters instead of defaults
4. WHEN no health check configuration is provided THEN the system SHALL use the default health check settings from the system configuration
5. WHEN a specific target port is provided THEN the system SHALL only perform health checks on that port instead of all configured ports

### Requirement 5

**User Story:** As a developer integrating with the API, I want detailed status information and webhook notifications during the start process, so that I can track progress and handle completion or failures appropriately.

#### Acceptance Criteria

1. WHEN an instance start is in progress THEN the system SHALL log detailed information about each phase of the startup process
2. WHEN querying instance status during startup THEN the system SHALL return current progress information including startup phase and health check status
3. WHEN the instance becomes ready THEN the system SHALL send a webhook notification with instance details and endpoint information
4. WHEN the startup process fails THEN the system SHALL send a webhook notification with error details and failure reason
5. WHEN webhook delivery fails THEN the system SHALL retry webhook notifications according to the configured retry policy

### Requirement 6

**User Story:** As a developer, I want the start instance API to handle edge cases and errors gracefully, so that I can build reliable automation around instance management.

#### Acceptance Criteria

1. WHEN multiple start requests are made for the same instance THEN the system SHALL return the status of the existing start operation rather than creating duplicate operations
2. WHEN the Novita.ai API returns rate limiting errors THEN the system SHALL implement exponential backoff and retry logic
3. WHEN network timeouts occur during the start operation THEN the system SHALL retry the operation according to configured retry policies
4. WHEN the instance fails to start due to resource constraints THEN the system SHALL return appropriate error messages with suggested alternatives
5. WHEN system errors occur during the start process THEN the system SHALL log detailed error information and return meaningful error responses to the client