# Requirements Document

## Introduction

This feature implements an automated spot instance migration system that runs as a scheduled job every 15 minutes. The system monitors all Novita GPU instances for spot instances that have been reclaimed (status "exited") and automatically migrates them when appropriate conditions are met. This ensures minimal downtime for spot instances that have been terminated due to capacity constraints or pricing changes.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the system to automatically detect when spot instances have been reclaimed, so that I can minimize service disruption without manual intervention.

#### Acceptance Criteria

1. WHEN the scheduled job runs THEN the system SHALL fetch all current instances directly from Novita API (bypassing cache)
2. WHEN fetching instances from Novita API THEN the system SHALL use the existing NovitaApiService methods
3. WHEN the API call fails THEN the system SHALL log the error and continue with the next scheduled execution
4. WHEN instances are retrieved THEN the system SHALL filter for instances with status "exited"

### Requirement 2

**User Story:** As a system administrator, I want the system to identify which exited instances are eligible for migration, so that only appropriate instances are automatically migrated.

#### Acceptance Criteria

1. WHEN an instance has status "exited" THEN the system SHALL check the spotStatus field
2. WHEN an instance has status "exited" THEN the system SHALL check the spotReclaimTime field
3. IF spotStatus is empty AND spotReclaimTime is "0" THEN the system SHALL skip the instance (no action needed)
4. IF spotReclaimTime is not "0" THEN the system SHALL mark the instance as eligible for migration
5. WHEN determining eligibility THEN the system SHALL log the decision rationale for each exited instance

### Requirement 3

**User Story:** As a system administrator, I want eligible spot instances to be automatically migrated, so that services can be restored without manual intervention.

#### Acceptance Criteria

1. WHEN an instance is eligible for migration THEN the system SHALL call the Novita migrate instance API
2. WHEN calling the migrate API THEN the system SHALL use POST request to `/gpu-instance/openapi/v1/gpu/instance/migrate`
3. WHEN calling the migrate API THEN the system SHALL include the instanceId in the request body
4. WHEN calling the migrate API THEN the system SHALL include proper Authorization header with Bearer token
5. WHEN migration succeeds THEN the system SHALL log the successful migration with instance details
6. WHEN migration fails THEN the system SHALL log the error but continue processing other instances

### Requirement 4

**User Story:** As a system administrator, I want the migration job to run on a reliable schedule, so that spot instance reclaims are detected and handled promptly.

#### Acceptance Criteria

1. WHEN the system starts THEN the migration job SHALL be scheduled to run every 15 minutes
2. WHEN a job execution is in progress THEN subsequent scheduled executions SHALL wait for completion
3. WHEN the system shuts down THEN the scheduled job SHALL be properly cancelled
4. WHEN job execution fails THEN the system SHALL log the error and continue with the next scheduled execution
5. WHEN the job runs THEN the system SHALL log the start and completion of each execution

### Requirement 5

**User Story:** As a system administrator, I want comprehensive logging and error handling for the migration process, so that I can monitor and troubleshoot the automated migration system.

#### Acceptance Criteria

1. WHEN the migration job starts THEN the system SHALL log the execution start time and job details
2. WHEN processing each instance THEN the system SHALL log the instance ID, status, spotStatus, and spotReclaimTime
3. WHEN migration is attempted THEN the system SHALL log the migration request details
4. WHEN migration completes THEN the system SHALL log the result (success/failure) with response details
5. WHEN errors occur THEN the system SHALL log detailed error information without stopping the job
6. WHEN the job completes THEN the system SHALL log summary statistics (total processed, migrated, skipped, errors)

### Requirement 6

**User Story:** As a system administrator, I want the migration system to be configurable, so that I can adjust the behavior based on operational needs.

#### Acceptance Criteria

1. WHEN configuring the system THEN the migration job schedule SHALL be configurable via environment variables
2. WHEN configuring the system THEN the migration timeout SHALL be configurable
3. WHEN configuring the system THEN the system SHALL support enabling/disabling the migration job
4. WHEN invalid configuration is provided THEN the system SHALL log warnings and use default values
5. WHEN the system starts THEN the system SHALL log the active migration job configuration