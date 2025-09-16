# External Integrations

<cite>
**Referenced Files in This Document**   
- [novitaClient.ts](file://src/clients/novitaClient.ts)
- [webhookClient.ts](file://src/clients/webhookClient.ts)
- [novitaApiService.ts](file://src/services/novitaApiService.ts)
- [instanceService.ts](file://src/services/instanceService.ts)
- [config.ts](file://src/config/config.ts)
</cite>

## Table of Contents
1. [Novita.ai API Integration](#novitai-api-integration)
2. [Webhook Notification System](#webhook-notification-system)
3. [Fault Tolerance and Resilience](#fault-tolerance-and-resilience)
4. [Security Considerations](#security-considerations)
5. [Observability and Monitoring](#observability-and-monitoring)
6. [Rate Limiting and Throttling](#rate-limiting-and-throttling)
7. [Testing Integration Scenarios](#testing-integration-scenarios)

## Novita.ai API Integration

The novitai application integrates with the Novita.ai API through the `NovitaClient` HTTP client wrapper, which provides a robust interface for all external API interactions. This integration handles authentication, request management, and response processing with enterprise-grade reliability.

Authentication with the Novita.ai API is implemented using API key-based authorization. The client automatically includes the API key in the Authorization header of every request using the Bearer token scheme. The API key is securely stored in the application configuration and never exposed in client-side code or logs.

```mermaid
sequenceDiagram
participant Application
participant NovitaClient
participant NovitaAPI
Application->>NovitaClient : API Request (e.g., createInstance)
NovitaClient->>NovitaClient : Add Authorization Header
NovitaClient->>NovitaClient : Add Correlation ID
NovitaClient->>NovitaAPI : Forward Request
NovitaAPI-->>NovitaClient : API Response
NovitaClient-->>Application : Return Result
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L100-L150)
- [novitaApiService.ts](file://src/services/novitaApiService.ts#L100-L200)

The `NovitaClient` class wraps Axios to provide enhanced functionality including automatic request signing, correlation ID injection, and comprehensive logging. Each request is tagged with a unique correlation ID that persists through the entire request lifecycle, enabling end-to-end tracing of API interactions.

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L100-L150)
- [config.ts](file://src/config/config.ts#L10-L50)

## Webhook Notification System

The application implements a webhook notification system that asynchronously informs external systems about instance lifecycle events. When instances transition to ready state or encounter errors, the system sends POST requests to user-provided webhook endpoints with detailed payload information.

The webhook payload structure includes essential information about the instance state:

```json
{
  "instanceId": "inst_12345",
  "status": "running",
  "timestamp": "2023-12-01T10:30:00Z",
  "elapsedTime": 245000,
  "data": {
    "connectionDetails": {
      "host": "192.168.1.100",
      "port": 22,
      "username": "gpuuser"
    }
  }
}
```

To ensure message integrity and authenticity, the application implements signature verification using the WEBHOOK_SECRET. Each webhook request includes a signature in the `X-Webhook-Signature` header, generated using HMAC-SHA256 algorithm with the payload and secret key. The timestamp is also included in the `X-Webhook-Timestamp` header to prevent replay attacks.

```mermaid
sequenceDiagram
participant InstanceService
participant WebhookClient
participant UserEndpoint
InstanceService->>WebhookClient : sendSuccessNotification()
WebhookClient->>WebhookClient : Create payload
WebhookClient->>WebhookClient : Generate signature
WebhookClient->>UserEndpoint : POST with signature
alt Success
UserEndpoint-->>WebhookClient : 200 OK
WebhookClient-->>InstanceService : Delivery confirmed
else Failure
WebhookClient->>WebhookClient : Schedule retry
WebhookClient->>UserEndpoint : Retry with exponential backoff
end
```

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L50-L100)
- [instanceService.ts](file://src/services/instanceService.ts#L300-L400)

The system provides delivery guarantees through a robust retry mechanism. Failed webhook deliveries are automatically retried up to three times with exponential backoff (1s, 2s, 4s). The system distinguishes between client errors (4xx) and server errors (5xx), only retrying on the latter to avoid overwhelming endpoints with invalid requests.

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L90-L150)
- [instanceService.ts](file://src/services/instanceService.ts#L200-L300)

## Fault Tolerance and Resilience

The application implements comprehensive fault tolerance measures to maintain reliability during external service failures. These mechanisms ensure graceful degradation and prevent cascading failures throughout the system.

The circuit breaker pattern is implemented in the `NovitaClient` to prevent overwhelming the Novita.ai API during outages. The circuit breaker has three states: CLOSED (normal operation), OPEN (requests immediately fail), and HALF_OPEN (testing recovery). When consecutive failures exceed the threshold of 5, the circuit opens for 60 seconds before transitioning to HALF_OPEN state. Three consecutive successful requests are required to close the circuit completely.

```mermaid
stateDiagram-v2
[*] --> CLOSED
CLOSED --> OPEN : 5+ consecutive failures
OPEN --> HALF_OPEN : 60s timeout
HALF_OPEN --> CLOSED : 3+ successes
HALF_OPEN --> OPEN : failure
OPEN --> HALF_OPEN : timeout
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L50-L100)

For webhook deliveries, the application implements fallback behaviors when external endpoints are unreachable. While there is no persistent fallback storage, the retry mechanism with exponential backoff provides temporary resilience against transient failures. The system also provides clear error feedback to clients about webhook delivery status.

The integration includes sophisticated retry mechanisms for both API calls and webhook notifications. API requests are retried on network errors (ECONNABORTED, ENOTFOUND), 5xx server errors, and 429 rate limit responses. Retries use exponential backoff with a maximum delay of 30 seconds to avoid overwhelming external services.

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L250-L300)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L90-L150)

## Security Considerations

The application implements robust security measures for handling third-party API credentials and validating incoming communications. API keys for the Novita.ai integration are securely managed through configuration files and environment variables, never hardcoded in source code.

All webhook signatures are validated using HMAC-SHA256 with a secret key configured in the application settings. The signature verification process ensures that incoming webhook requests originate from trusted sources and have not been tampered with during transmission.

The system follows security best practices by redacting sensitive information from logs. The request and response logging middleware automatically sanitizes sensitive fields such as authentication tokens, API keys, and other credentials, replacing them with "[REDACTED]" in log output.

```mermaid
flowchart TD
A[Incoming Webhook] --> B{Has Signature?}
B --> |No| C[Reject Request]
B --> |Yes| D[Extract Signature]
D --> E[Recompute Signature]
E --> F{Signatures Match?}
F --> |No| G[Reject Request]
F --> |Yes| H[Process Payload]
H --> I[Verify Timestamp]
I --> J{Within Tolerance?}
J --> |No| K[Reject Request]
J --> |Yes| L[Process Event]
```

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L50-L90)
- [logger.ts](file://src/utils/logger.ts#L100-L150)

The application also implements proper error handling that avoids leaking sensitive system information to clients. Error responses are standardized and do not expose internal implementation details, stack traces, or configuration information.

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L50-L90)
- [logger.ts](file://src/utils/logger.ts#L100-L150)

## Observability and Monitoring

The application provides comprehensive observability features to monitor integration health and troubleshoot issues. All external request/response cycles are logged with detailed information while respecting privacy and security constraints.

The request logging middleware captures essential information about each external interaction, including method, URL, status code, duration, and size. Request and response bodies are logged selectively based on size and content type, with large payloads (>10KB) and binary content omitted to prevent log bloat.

```mermaid
flowchart LR
A[External Request] --> B[Add Correlation ID]
B --> C[Log Request Details]
C --> D[Execute Request]
D --> E[Log Response Details]
E --> F[Update Metrics]
F --> G[Check Performance]
G --> H{Slow Operation?}
H --> |Yes| I[Log Warning]
H --> |No| J[Log Debug]
```

**Diagram sources**
- [requestLogger.ts](file://src/middleware/requestLogger.ts#L30-L80)
- [logger.ts](file://src/utils/logger.ts#L150-L180)

The system tracks delivery success rates for webhook notifications, logging successful deliveries at INFO level and failed attempts at WARN level. This enables monitoring of integration reliability and identification of problematic endpoints.

The `NovitaClient` exposes monitoring endpoints to check integration health, including circuit breaker state and request queue status. These metrics can be integrated with external monitoring systems to provide real-time visibility into integration performance.

**Section sources**
- [requestLogger.ts](file://src/middleware/requestLogger.ts#L30-L80)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L350-L400)

## Rate Limiting and Throttling

The application implements sophisticated rate limiting to comply with external service constraints and prevent service disruption. The `NovitaClient` includes a token bucket rate limiter that enforces a maximum of 100 requests per minute to the Novita.ai API.

When the rate limit is approached, requests are queued and processed at a compliant rate. The rate limiter uses a sliding window algorithm to accurately track request frequency and prevent bursts that could trigger API rate limiting.

```mermaid
flowchart TD
A[New Request] --> B{Rate Limit Exceeded?}
B --> |No| C[Process Immediately]
B --> |Yes| D[Calculate Wait Time]
D --> E[Delay Request]
E --> F[Process Request]
C --> G[Update Request Counter]
F --> G
G --> H[Remove Expired Requests]
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L150-L200)

For webhook deliveries, the application implements exponential backoff during retry attempts to avoid overwhelming recipient endpoints. The backoff sequence (1s, 2s, 4s) ensures that temporary outages do not result in request storms when services recover.

The system also handles rate limiting responses from external APIs gracefully. When a 429 (Too Many Requests) response is received, the client respects the Retry-After header if provided, or applies exponential backoff based on the number of retry attempts.

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L150-L200)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L90-L150)

## Testing Integration Scenarios

The application provides comprehensive testing capabilities for integration scenarios, including mock servers and example implementations. The test suite includes dedicated test files for both the Novita client and webhook client, ensuring reliable behavior under various conditions.

The testing framework validates critical integration scenarios such as:
- Successful API calls with proper authentication
- Error handling for network failures and API errors
- Webhook signature generation and verification
- Retry logic for failed deliveries
- Circuit breaker state transitions
- Rate limiting enforcement

Example implementations in the `examples` directory demonstrate proper usage patterns for external integrations, serving as reference implementations for developers extending the system.

**Section sources**
- [novitaClient.test.ts](file://src/clients/__tests__/novitaClient.test.ts)
- [webhookClient.test.ts](file://src/clients/__tests__/webhookClient.test.ts)
- [examples](file://src/examples)