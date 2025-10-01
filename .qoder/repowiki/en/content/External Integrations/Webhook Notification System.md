# Webhook Notification System

<cite>
**Referenced Files in This Document**   
- [webhookClient.ts](file://src/clients/webhookClient.ts) - *Updated with enhanced startup notifications and retry logic*
- [config.ts](file://src/config/config.ts) - *Configuration for webhook settings*
- [instanceService.ts](file://src/services/instanceService.ts) - *Integration with instance lifecycle management*
- [api.ts](file://src/types/api.ts) - *Type definitions for webhook payloads and health checks*
</cite>

## Update Summary
**Changes Made**   
- Updated **WebhookClient Class Overview** to include new startup lifecycle methods and enhanced retry mechanism
- Expanded **Payload Structure** to include `healthCheck` and `startupOperation` fields with detailed schema
- Added new section **Startup Lifecycle Notifications** to document specialized notification methods for startup operations
- Enhanced **Retry Mechanism** section to describe the new `sendWebhookWithRetry` method with exponential backoff and jitter
- Updated **Integration with InstanceService** to reflect new startup monitoring workflow
- Added **Health Check Integration** section to document comprehensive health check data in notifications
- Revised **Best Practices** to include guidance on handling startup progress notifications

## Table of Contents
1. [Introduction](#introduction)
2. [WebhookClient Class Overview](#webhookclient-class-overview)
3. [Payload Structure](#payload-structure)
4. [Security Features](#security-features)
5. [Retry Mechanism](#retry-mechanism)
6. [Notification Methods](#notification-methods)
7. [Startup Lifecycle Notifications](#startup-lifecycle-notifications)
8. [Health Check Integration](#health-check-integration)
9. [Error Handling Strategy](#error-handling-strategy)
10. [Integration with InstanceService](#integration-with-instanceservice)
11. [Configuration Options](#configuration-options)
12. [Common Issues and Solutions](#common-issues-and-solutions)
13. [Best Practices](#best-practices)

## Introduction
The webhook notification system provides reliable, secure communication between the GPU instance management platform and external services when instances reach terminal states. This system ensures that users are promptly informed about instance status changes through configurable webhook endpoints. The implementation focuses on delivery reliability, security, and ease of integration, making it suitable for both beginners and experienced developers who need to build robust notification workflows.

## WebhookClient Class Overview

The WebhookClient class serves as the central component for sending notifications to user-provided endpoints. It encapsulates all logic related to payload creation, security signing, retry mechanisms, and error handling.

```mermaid
classDiagram
class WebhookClient {
+sendSuccessNotification(url : string, instanceId : string, options : object) Promise~void~
+sendFailureNotification(url : string, instanceId : string, error : string, options : object) Promise~void~
+sendTimeoutNotification(url : string, instanceId : string, options : object) Promise~void~
+sendHealthCheckNotification(url : string, instanceId : string, status : 'health_checking' | 'ready' | 'failed', options : object) Promise~void~
+sendStartupInitiatedNotification(url : string, instanceId : string, options : object) Promise~void~
+sendStartupProgressNotification(url : string, instanceId : string, currentPhase : 'monitoring' | 'health_checking', options : object) Promise~void~
+sendStartupCompletedNotification(url : string, instanceId : string, options : object) Promise~void~
+sendStartupFailedNotification(url : string, instanceId : string, error : string, options : object) Promise~void~
+createNotificationPayload(instanceId : string, status : string, options : object) WebhookNotificationPayload
-generateSignature(payload : string, secret : string) string
-sendWebhook(request : WebhookRequest, maxRetries : number) Promise~void~
-sendWebhookWithRetry(request : WebhookRequest, maxRetries : number) Promise~void~
}
class WebhookRequest {
+url : string
+payload : any
+headers? : Record~string, string~
+secret? : string
}
class WebhookNotificationPayload {
+instanceId : string
+novitaInstanceId? : string
+status : 'running' | 'failed' | 'timeout' | 'ready' | 'health_checking' | 'startup_initiated' | 'startup_completed' | 'startup_failed'
+timestamp : string
+elapsedTime? : number
+error? : string
+data? : any
+healthCheck? : HealthCheckData
+startupOperation? : StartupOperationData
+reason? : string
}
class HealthCheckData {
+status : 'pending' | 'in_progress' | 'completed' | 'failed'
+overallStatus? : 'healthy' | 'unhealthy' | 'partial'
+endpoints? : EndpointHealthCheck[]
+startedAt? : string
+completedAt? : string
+totalResponseTime? : number
}
class StartupOperationData {
+operationId : string
+status : 'initiated' | 'monitoring' | 'health_checking' | 'completed' | 'failed'
+startedAt : string
+phases : StartupPhases
+totalElapsedTime? : number
+error? : string
}
class StartupPhases {
+startRequested : string
+instanceStarting? : string
+instanceRunning? : string
+healthCheckStarted? : string
+healthCheckCompleted? : string
+ready? : string
}
WebhookClient --> WebhookRequest : "uses"
WebhookClient --> WebhookNotificationPayload : "creates"
WebhookNotificationPayload --> HealthCheckData : "optional"
WebhookNotificationPayload --> StartupOperationData : "optional"
```

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L47-L881)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L47-L881)

## Payload Structure

The webhook notification system uses a standardized payload structure to ensure consistency across different event types. The WebhookNotificationPayload interface defines the schema for all notifications.

```mermaid
erDiagram
WEBHOOK_NOTIFICATION_PAYLOAD {
string instanceId PK
string novitaInstanceId
string status
string timestamp
number elapsedTime
string error
any data
string reason
}
WEBHOOK_NOTIFICATION_PAYLOAD ||--o{ HEALTH_CHECK_DATA : "contains"
HEALTH_CHECK_DATA {
string status
string overallStatus
array endpoints
string startedAt
string completedAt
number totalResponseTime
}
HEALTH_CHECK_DATA ||--o{ ENDPOINT_HEALTH_CHECK : "has"
ENDPOINT_HEALTH_CHECK {
number port
string endpoint
string type
string status
string lastChecked
string error
number responseTime
}
WEBHOOK_NOTIFICATION_PAYLOAD ||--o{ STARTUP_OPERATION_DATA : "contains"
STARTUP_OPERATION_DATA {
string operationId
string status
string startedAt
object phases
number totalElapsedTime
string error
}
STARTUP_OPERATION_DATA ||--o{ STARTUP_PHASES : "has"
STARTUP_PHASES {
string startRequested
string instanceStarting
string instanceRunning
string healthCheckStarted
string healthCheckCompleted
string ready
}
```

The payload includes essential information about the instance state change:
- **instanceId**: Unique identifier for the instance within the system
- **status**: Terminal state reached ('running', 'failed', 'timeout', 'ready', 'health_checking', 'startup_initiated', 'startup_completed', 'startup_failed')
- **timestamp**: ISO 8601 formatted timestamp of the event
- **elapsedTime**: Optional duration in milliseconds for operation completion
- **error**: Error message for failed or timeout states
- **data**: Optional additional data specific to the event
- **reason**: Human-readable explanation of the status change
- **healthCheck**: Comprehensive health check results including endpoint status and response times
- **startupOperation**: Detailed startup operation timeline with phase timestamps

**Diagram sources**
- [api.ts](file://src/types/api.ts#L26-L137)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L17-L57)
- [api.ts](file://src/types/api.ts#L26-L137)

## Security Features

The webhook system implements robust security measures to ensure message integrity and authenticity. HMAC-SHA256 signatures are generated using a shared secret to prevent unauthorized access and tampering.

```mermaid
sequenceDiagram
participant Client as "WebhookClient"
participant Server as "External Service"
Client->>Client : Generate payload JSON
Client->>Client : Calculate HMAC-SHA256 signature
Client->>Client : Add X-Webhook-Signature and X-Webhook-Timestamp headers
Client->>Server : POST notification with headers
Server->>Server : Verify signature using shared secret
Server->>Server : Check timestamp freshness
Server-->>Client : Return response
```

The signature generation process uses the `generateSignature` method, which creates an HMAC-SHA256 hash of the JSON stringified payload using the WEBHOOK_SECRET. This signature is included in the `X-Webhook-Signature` header with the prefix "sha256=". The `X-Webhook-Timestamp` header contains the Unix timestamp in seconds, allowing receivers to validate the freshness of the request.

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L64-L72)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L109-L115)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L64-L72)

## Retry Mechanism

The system implements an exponential backoff retry strategy with jitter to handle transient failures while avoiding thundering herd problems on external services.

```mermaid
flowchart TD
Start([Send Webhook]) --> Prepare["Prepare payload and headers"]
Prepare --> Attempt["Attempt = 1"]
Attempt --> Send["Send HTTP POST"]
Send --> Success{"Success?"}
Success --> |Yes| End([Success])
Success --> |No| ClientError{"Client Error (4xx)?"}
ClientError --> |Yes| Fail([Don't Retry - Throw Error])
ClientError --> |No| MaxAttempts{"Max Attempts Reached?"}
MaxAttempts --> |No| CalculateDelay["Delay = min(2^(attempt-1) * 1000ms + jitter, 30s)"]
CalculateDelay --> Wait["Wait delay period"]
Wait --> Increment["attempt++"]
Increment --> Attempt
MaxAttempts --> |Yes| FinalFail([All retries failed])
```

The retry mechanism follows these rules:
- Maximum of 5 attempts for startup-related notifications, 3 attempts for standard notifications
- Exponential backoff delays: 1s, 2s, 4s, 8s, 16s (capped at 30s) with 10% random jitter
- Only retries on 5xx server errors and network issues
- Does not retry on 4xx client errors, which indicate permanent problems
- Configurable retry count through the `maxRetries` parameter
- Enhanced `sendWebhookWithRetry` method specifically for startup operations with additional logging

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L117-L188)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L586-L684)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L117-L188)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L586-L684)

## Notification Methods

The WebhookClient provides specialized methods for sending notifications based on the terminal state of GPU instances.

```mermaid
classDiagram
class WebhookClient {
+sendSuccessNotification(url : string, instanceId : string, options : object) Promise~void~
+sendFailureNotification(url : string, instanceId : string, error : string, options : object) Promise~void~
+sendTimeoutNotification(url : string, instanceId : string, options : object) Promise~void~
}
WebhookClient --> "1" WebhookNotificationPayload : creates
WebhookNotificationPayload : +instanceId : string
WebhookNotificationPayload : +status : 'running' | 'failed' | 'timeout'
WebhookNotificationPayload : +timestamp : string
WebhookNotificationPayload : +elapsedTime? : number
WebhookNotificationPayload : +error? : string
```

**sendSuccessNotification** creates a payload with status 'running' when an instance becomes ready. **sendFailureNotification** generates a payload with status 'failed' and includes the error message. **sendTimeoutNotification** creates a payload with status 'timeout' and automatically formats the error message to include the elapsed time.

Each method internally calls `createNotificationPayload` with the appropriate status and options, then invokes `sendWebhook` to handle delivery with retry logic.

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L191-L239)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L191-L239)

## Startup Lifecycle Notifications

The WebhookClient now includes specialized methods for tracking the complete startup lifecycle of GPU instances, providing detailed progress updates.

```mermaid
sequenceDiagram
participant InstanceService as "InstanceService"
participant WebhookClient as "WebhookClient"
participant ExternalService as "External Service"
InstanceService->>WebhookClient : sendStartupInitiatedNotification()
WebhookClient->>ExternalService : POST startup_initiated
ExternalService-->>WebhookClient : 2xx
WebhookClient-->>InstanceService : Success
InstanceService->>WebhookClient : sendStartupProgressNotification()
WebhookClient->>ExternalService : POST monitoring/health_checking
ExternalService-->>WebhookClient : 2xx
WebhookClient-->>InstanceService : Success
alt Startup Success
InstanceService->>WebhookClient : sendStartupCompletedNotification()
WebhookClient->>ExternalService : POST startup_completed
else Startup Failure
InstanceService->>WebhookClient : sendStartupFailedNotification()
WebhookClient->>ExternalService : POST startup_failed
end
```

The startup lifecycle notification methods include:
- **sendStartupInitiatedNotification**: Called when startup operation begins, includes operation ID and estimated ready time
- **sendStartupProgressNotification**: Provides periodic updates during startup, indicating current phase (monitoring or health_checking)
- **sendStartupCompletedNotification**: Sent when instance is fully ready, includes complete timeline and health check results
- **sendStartupFailedNotification**: Notifies of startup failure with specific failure phase and error details

These methods use the enhanced `sendWebhookWithRetry` method with 5 maximum attempts and jittered exponential backoff for improved reliability during critical startup operations.

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L550-L684)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L550-L684)

## Health Check Integration

The webhook system now includes comprehensive health check data in notifications, providing detailed insights into application readiness.

```mermaid
erDiagram
HEALTH_CHECK_RESULT {
string status
string overallStatus
array endpoints
string startedAt
string completedAt
number totalResponseTime
}
HEALTH_CHECK_RESULT ||--o{ ENDPOINT_HEALTH_CHECK : "has"
ENDPOINT_HEALTH_CHECK {
number port
string endpoint
string type
string status
string lastChecked
string error
number responseTime
}
```

When health checks are performed, the notification payload includes a `healthCheck` object with:
- **status**: Current health check status ('pending', 'in_progress', 'completed', 'failed')
- **overallStatus**: Final assessment ('healthy', 'unhealthy', 'partial')
- **endpoints**: Array of individual endpoint check results with response times and errors
- **startedAt/completedAt**: Timestamps for health check duration calculation
- **totalResponseTime**: Aggregate response time across all endpoints

The `sendHealthCheckNotification` method can send updates at various stages of the health check process, allowing external systems to monitor application readiness in real-time.

**Diagram sources**
- [api.ts](file://src/types/api.ts#L100-L137)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L484-L545)
- [api.ts](file://src/types/api.ts#L100-L137)

## Error Handling Strategy

The webhook system implements comprehensive error handling to ensure reliable delivery attempts and proper error reporting.

```mermaid
flowchart TD
Start([Webhook Delivery]) --> Try["Try: Send POST request"]
Try --> Success{"Success?"}
Success --> |Yes| LogSuccess["Log success at info level"]
Success --> |No| CaptureError["Capture error object"]
CaptureError --> LogWarning["Log attempt failure at warn level"]
LogWarning --> ClientError{"Response status < 500?"}
ClientError --> |Yes| LogError["Log client error at error level"]
ClientError --> |Yes| ThrowImmediate["Throw error immediately"]
ClientError --> |No| NotMaxAttempt{"Attempt < maxRetries?"}
NotMaxAttempt --> |Yes| ApplyBackoff["Apply exponential backoff"]
NotMaxAttempt --> |No| FinalFailure["All retries exhausted"]
FinalFailure --> ThrowFinal["Throw delivery failure error"]
```

The error handling strategy includes:
- Logging delivery attempts at debug level
- Recording successful deliveries at info level
- Warning about failed attempts with error details
- Immediate termination on client errors (4xx status codes)
- Exhaustive retry attempts on server errors (5xx status codes)
- Final error throw after all retries are exhausted
- Enhanced error logging for startup operations with permanent failure logging

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L137-L188)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L620-L684)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L137-L188)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L620-L684)

## Integration with InstanceService

The webhook client is integrated into the instance lifecycle management through the InstanceService class, which triggers notifications when instances reach terminal states.

```mermaid
sequenceDiagram
participant JobWorker as "Job Worker"
participant InstanceService as "InstanceService"
participant WebhookClient as "WebhookClient"
participant ExternalService as "External Service"
JobWorker->>InstanceService : Instance ready
InstanceService->>InstanceService : Update instance state
InstanceService->>WebhookClient : sendStartupInitiatedNotification()
WebhookClient->>ExternalService : POST startup_initiated
ExternalService-->>WebhookClient : 2xx
WebhookClient-->>InstanceService : Success
InstanceService->>WebhookClient : sendStartupProgressNotification()
WebhookClient->>ExternalService : POST monitoring
InstanceService->>WebhookClient : sendHealthCheckNotification()
WebhookClient->>ExternalService : POST health_checking
InstanceService->>WebhookClient : sendReadyNotification()
WebhookClient->>ExternalService : POST ready
```

When a GPU instance startup is initiated, InstanceService calls the appropriate notification methods on WebhookClient at key milestones. The webhook URL is stored in the instance state when the instance is created, allowing the system to notify the correct endpoint throughout the startup lifecycle.

**Diagram sources**
- [instanceService.ts](file://src/services/instanceService.ts#L110-L125)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L550-L684)

**Section sources**
- [instanceService.ts](file://src/services/instanceService.ts#L110-L125)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L550-L684)

## Configuration Options

The webhook system supports various configuration options through environment variables, allowing customization of behavior without code changes.

```mermaid
erDiagram
CONFIGURATION {
string WEBHOOK_URL
string WEBHOOK_SECRET
number WEBHOOK_TIMEOUT
number MAX_RETRY_ATTEMPTS
}
```

Key configuration options include:
- **WEBHOOK_URL**: Default webhook endpoint for notifications
- **WEBHOOK_SECRET**: Secret key for HMAC-SHA256 signature generation
- **WEBHOOK_TIMEOUT**: Timeout in milliseconds for webhook requests (default: 10000)
- **MAX_RETRY_ATTEMPTS**: Maximum number of retry attempts (default: 3)

These values can be set in the .env file or through environment variables, with the system providing sensible defaults when values are not specified.

**Diagram sources**
- [config.ts](file://src/config/config.ts#L23-L38)
- [config.ts](file://src/config/config.ts#L200-L220)

**Section sources**
- [config.ts](file://src/config/config.ts#L23-L38)
- [config.ts](file://src/config/config.ts#L200-L220)

## Common Issues and Solutions

Several common issues may arise when implementing webhook notifications, along with their solutions.

**Signature Verification on Receiver Side**
Issue: Receiver cannot validate the HMAC signature
Solution: Ensure the receiver uses the same secret and hashing algorithm (HMAC-SHA256). The payload must be the raw JSON string without modifications.

**Webhook Delivery Failures**
Issue: Notifications fail to reach the endpoint
Solution: Verify the endpoint URL is accessible and handles POST requests. Check firewall rules and SSL certificates. Implement proper error logging on the receiver.

**Endpoint Availability**
Issue: Transient network issues cause delivery failures
Solution: The built-in retry mechanism with exponential backoff handles temporary outages. Monitor delivery logs to identify persistent issues.

**Timestamp Validation**
Issue: Receiver rejects notifications as stale
Solution: Ensure system clocks are synchronized. The receiver should accept timestamps within a reasonable window (e.g., ±5 minutes).

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L64-L72)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L117-L188)

## Best Practices

To ensure reliable and secure webhook notifications, follow these best practices:

**Delivery Guarantees**
- Implement idempotency in the receiver to handle duplicate notifications
- Use the instanceId as a unique identifier for deduplication
- Monitor delivery logs for patterns of failure
- Consider using the operationId for tracking specific startup operations

**Security Best Practices**
- Use strong, randomly generated webhook secrets
- Rotate secrets periodically
- Validate the X-Webhook-Timestamp to prevent replay attacks
- Store secrets securely using environment variables or secret management systems

**Performance Considerations**
- Keep webhook endpoints responsive to avoid timeout issues
- Implement proper error handling on the receiver side
- Use the elapsedTime field to monitor instance startup performance
- Consider asynchronous processing on the receiver side for long-running operations

**Debugging Guidance**
- Enable debug logging to trace webhook delivery attempts
- Monitor the X-Webhook-Signature header format
- Verify payload structure matches expected schema
- Test with sample payloads during development
- Use the reason field to understand the context of status changes

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L64-L72)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L117-L188)
- [config.ts](file://src/config/config.ts#L200-L220)