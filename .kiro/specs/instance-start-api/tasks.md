# Implementation Plan

- [x] 1. Extend type definitions for instance start functionality
  - Add StartInstanceRequest, StartInstanceResponse, and StartInstanceJobPayload interfaces
  - Add MONITOR_STARTUP to JobType enum
  - Create InstanceNotStartableError and InstanceNotFoundError classes
  - Add StartupOperation interface for tracking startup operations
  - _Requirements: 1.1, 1.5, 2.1, 6.1_

- [x] 2. Add instance startup configuration to config system
  - Extend Config interface with instanceStartup section
  - Define default values for startup timeouts and health check settings
  - Add validation for startup configuration parameters
  - _Requirements: 4.1, 4.4_

- [x] 3. Implement instance lookup and validation methods in InstanceService
  - Create findInstanceByName method to search instances by name
  - Implement validateInstanceStartable method to check if instance can be started
  - Add isStartupInProgress method to prevent duplicate operations
  - Create helper methods for instance status validation
  - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 6.1_

- [x] 4. Implement startInstance method in InstanceService
  - Create main startInstance method that handles both ID and name-based starting
  - Implement startup operation tracking with createStartupOperation method
  - Add logic to call Novita.ai API to start the instance
  - Create monitoring job for startup process
  - _Requirements: 1.1, 1.5, 3.1, 5.1_

- [x] 5. Add startup monitoring job handler to JobWorkerService
  - Implement handleMonitorStartup method for MONITOR_STARTUP job type
  - Add logic to monitor instance status until it reaches "running"
  - Integrate with existing health check system when instance is running
  - Handle startup timeouts and failure scenarios
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Create API route handlers for instance start endpoints
  - Add POST /api/instances/:instanceId/start route handler
  - Add POST /api/instances/start route handler for name-based starting
  - Implement request validation and error handling
  - Add proper logging and context tracking
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 7. Enhance webhook notifications for startup operations
  - Modify webhook payload to include startup operation details
  - Add specific webhook events for startup completion and failure
  - Implement retry logic for webhook delivery failures
  - _Requirements: 5.3, 5.4, 5.5_

- [x] 8. Add comprehensive error handling for startup operations
  - Implement proper error responses for various failure scenarios
  - Add detailed logging for startup operation phases
  - Handle Novita.ai API errors with appropriate retry logic
  - Create meaningful error messages for client responses
  - _Requirements: 2.5, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Create unit tests for instance start functionality
  - Test startInstance method with various scenarios (valid/invalid instances)
  - Test instance lookup by name and ID
  - Test status validation logic
  - Test startup operation tracking and deduplication
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 6.1_

- [ ] 10. Create unit tests for startup monitoring job handler
  - Test handleMonitorStartup method with different instance states
  - Test health check integration during startup
  - Test timeout and failure handling
  - Test webhook notification sending
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 11. Create unit tests for API route handlers
  - Test both start endpoint variants (by ID and by name)
  - Test request validation and error responses
  - Test successful startup initiation responses
  - Test edge cases and error scenarios
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 12. Add integration tests for complete startup workflow
  - Test end-to-end startup flow from API call to ready state
  - Test startup with health check integration
  - Test webhook notifications during startup process
  - Test error scenarios and recovery
  - _Requirements: 3.1, 3.2, 3.3, 5.3, 5.4_

- [ ] 13. Add validation tests for startup edge cases
  - Test starting instances in various non-startable states
  - Test duplicate startup operation handling
  - Test API failures and retry logic
  - Test timeout scenarios and cleanup
  - _Requirements: 2.2, 2.3, 2.4, 6.1, 6.2, 6.3_

- [ ] 14. Update API documentation and examples
  - Add documentation for new start instance endpoints
  - Create example requests and responses
  - Document error codes and troubleshooting
  - Add integration examples for common use cases
  - _Requirements: 5.1, 5.2_