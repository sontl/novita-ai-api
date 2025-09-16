# Python Client Integration

<cite>
**Referenced Files in This Document**   
- [requirements.txt](file://client-examples/python/requirements.txt)
- [setup.py](file://client-examples/python/setup.py)
- [httpClientExample.ts](file://src/examples/httpClientExample.ts)
- [novitaClient.ts](file://src/clients/novitaClient.ts)
- [webhookClient.ts](file://src/clients/webhookClient.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Environment Setup](#environment-setup)
3. [Core HTTP Client Features](#core-http-client-features)
4. [Creating GPU Instances](#creating-gpu-instances)
5. [Monitoring Instance Status](#monitoring-instance-status)
6. [Webhook Callback Handling](#webhook-callback-handling)
7. [Error Handling and Retry Logic](#error-handling-and-retry-logic)
8. [Security Best Practices](#security-best-practices)
9. [Performance Optimization](#performance-optimization)
10. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)

## Introduction
This guide provides comprehensive instructions for integrating Python applications with the Novita API to manage GPU instances. It covers environment setup, instance lifecycle management, webhook integration, error handling, and performance optimization. The documentation draws from the official TypeScript implementation patterns and adapts them for Python using the requests library and best practices in asynchronous programming.

## Environment Setup

To begin integrating with the Novita API, set up your Python environment using the provided configuration files. The project includes both `requirements.txt` and `setup.py` to support different deployment scenarios.

```mermaid
flowchart TD
Start["Create Python Environment"] --> InstallDeps["Install Dependencies"]
InstallDeps --> ChooseMethod["Choose Installation Method"]
ChooseMethod --> MethodPip["pip install -r requirements.txt"]
ChooseMethod --> MethodSetup["python setup.py install"]
MethodPip --> Verify["Verify Installation"]
MethodSetup --> Verify
Verify --> Complete["Environment Ready"]
```

**Diagram sources**
- [requirements.txt](file://client-examples/python/requirements.txt#L1-L2)
- [setup.py](file://client-examples/python/setup.py#L1-L25)

**Section sources**
- [requirements.txt](file://client-examples/python/requirements.txt#L1-L2)
- [setup.py](file://client-examples/python/setup.py#L1-L25)

## Core HTTP Client Features

The Novita API client implements several reliability patterns that should be replicated in Python integrations. These include circuit breaker, rate limiting, retry logic, and structured logging. The TypeScript implementation demonstrates these patterns using axios with interceptors and custom classes.

```mermaid
classDiagram
class NovitaClient {
+client : AxiosInstance
+circuitBreaker : CircuitBreaker
+rateLimiter : RateLimiter
+requestQueue : QueuedRequest[]
+isProcessingQueue : boolean
+request(config) : Promise~AxiosResponse~
+get(url, config) : Promise~AxiosResponse~
+post(url, data, config) : Promise~AxiosResponse~
+put(url, data, config) : Promise~AxiosResponse~
+delete(url, config) : Promise~AxiosResponse~
+healthCheck() : Promise~boolean~
+getCircuitBreakerState() : CircuitState
+getQueueStatus() : QueueStatus
}
class CircuitBreaker {
-state : CircuitState
-failureCount : number
-lastFailureTime : number
-successCount : number
+execute(operation) : Promise~T~
+getState() : CircuitState
+onSuccess() : void
+onFailure() : void
}
class RateLimiter {
-requests : number[]
+waitForSlot() : Promise~void~
}
class WebhookClient {
-client : AxiosInstance
+sendWebhook(request, maxRetries) : Promise~void~
+createNotificationPayload(instanceId, status, options) : WebhookNotificationPayload
+generateSignature(payload, secret) : string
+sendSuccessNotification(url, instanceId, options) : Promise~void~
+sendFailureNotification(url, instanceId, error, options) : Promise~void~
+sendTimeoutNotification(url, instanceId, options) : Promise~void~
}
NovitaClient --> CircuitBreaker : "uses"
NovitaClient --> RateLimiter : "uses"
NovitaClient --> WebhookClient : "coordinates with"
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

## Creating GPU Instances

Creating GPU instances through the Novita API requires proper authentication and payload formatting. The process involves making a POST request to the instances endpoint with the required configuration parameters. The TypeScript example demonstrates the use of service methods that abstract the underlying HTTP operations.

```mermaid
sequenceDiagram
participant Client as "Python Client"
participant Service as "NovitaApiService"
participant ClientHTTP as "NovitaClient"
participant API as "Novita API"
Client->>Service : createInstance(config)
Service->>ClientHTTP : post('/v1/instances', config)
ClientHTTP->>ClientHTTP : Apply rate limiting
ClientHTTP->>ClientHTTP : Check circuit breaker
ClientHTTP->>API : HTTP POST Request
API-->>ClientHTTP : 201 Created
ClientHTTP-->>Service : Response
Service-->>Client : Instance object
```

**Diagram sources**
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)

**Section sources**
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)

## Monitoring Instance Status

Monitoring GPU instance status can be achieved through polling or webhook notifications. The recommended approach combines initial polling with webhook callbacks for event-driven updates. The polling interval should be optimized to balance responsiveness with API rate limits.

```mermaid
flowchart TD
Start["Start Monitoring"] --> Poll["Poll Instance Status"]
Poll --> CheckStatus["Check Response Status"]
CheckStatus --> |Pending| Wait["Wait 30s"]
Wait --> Poll
CheckStatus --> |Running| Notify["Send Success Notification"]
CheckStatus --> |Failed| Error["Handle Failure"]
CheckStatus --> |Timeout| Timeout["Handle Timeout"]
Notify --> Complete["Monitoring Complete"]
Error --> Complete
Timeout --> Complete
```

**Diagram sources**
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)

**Section sources**
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)

## Webhook Callback Handling

Webhook callbacks provide real-time notifications about instance state changes. The Novita API supports signed webhooks to ensure authenticity. When implementing webhook receivers in Python, it's essential to verify signatures and handle retries properly.

```mermaid
sequenceDiagram
participant API as "Novita API"
participant WebhookClient as "WebhookClient"
participant Receiver as "Your Server"
API->>WebhookClient : Instance Event
WebhookClient->>WebhookClient : Create payload
WebhookClient->>WebhookClient : Generate signature
WebhookClient->>Receiver : POST with X-Webhook-Signature
alt Valid Signature
Receiver->>Receiver : Process notification
Receiver-->>WebhookClient : 200 OK
else Invalid Signature
Receiver->>Receiver : Reject request
Receiver-->>WebhookClient : 401 Unauthorized
end
```

**Diagram sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

**Section sources**
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

## Error Handling and Retry Logic

Robust error handling is critical for reliable API integration. The Novita client implements a comprehensive error hierarchy and retry strategy. Python implementations should replicate this behavior using libraries like `tenacity` or `backoff` to handle transient failures.

```mermaid
flowchart TD
Request["Make API Request"] --> Success{"Success?"}
Success --> |Yes| Complete["Operation Complete"]
Success --> |No| CheckError["Check Error Type"]
CheckError --> |Network Error| Retry["Retry with Exponential Backoff"]
CheckError --> |5xx Error| Retry
CheckError --> |429 Rate Limit| Wait["Wait for Retry-After"]
Wait --> Retry
CheckError --> |4xx Client Error| Fail["Do Not Retry"]
Retry --> Attempt{"Max Attempts?"}
Attempt --> |No| Delay["Wait (2^n * 1s)"]
Delay --> Request
Attempt --> |Yes| FinalFail["Operation Failed"]
Complete --> End
Fail --> End
FinalFail --> End
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

## Security Best Practices

Secure handling of credentials and webhook notifications is essential. The Novita API requires API keys for authentication and supports webhook signatures for message integrity. Python applications should use environment variables or secret management tools to store sensitive information.

```mermaid
flowchart TD
subgraph "Secure Credential Management"
A["Store API Key in Environment Variable"]
B["Use python-dotenv for Local Development"]
C["Use Secret Manager in Production"]
D["Never Commit Secrets to Version Control"]
end
subgraph "Webhook Security"
E["Verify X-Webhook-Signature Header"]
F["Use Constant-Time String Comparison"]
G["Validate Payload Structure"]
H["Implement Replay Attack Protection"]
end
I["Follow Principle of Least Privilege"]
J["Rotate Credentials Regularly"]
A --> I
B --> I
C --> I
D --> I
E --> J
F --> J
G --> J
H --> J
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [webhookClient.ts](file://src/clients/webhookClient.ts#L0-L242)

## Performance Optimization

Optimizing API client performance involves several strategies including connection pooling, session reuse, and efficient polling intervals. The requests library in Python supports these optimizations through the Session object and proper configuration.

```mermaid
flowchart LR
subgraph "Connection Management"
A["Use requests.Session()"]
B["Enable Connection Pooling"]
C["Reuse TCP Connections"]
D["Set Appropriate Timeouts"]
end
subgraph "Request Optimization"
E["Batch Requests When Possible"]
F["Use Efficient Polling Intervals"]
G["Implement Caching for Read Operations"]
H["Compress Request/Response Bodies"]
end
subgraph "Resource Management"
I["Close Sessions Explicitly"]
J["Monitor Memory Usage"]
K["Handle Large Responses in Chunks"]
L["Use Streaming for Large Files"]
end
A --> E
B --> F
C --> G
D --> H
I --> J
K --> L
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)

## Common Pitfalls and Solutions

Integrating with the Novita API may present several challenges. Understanding these common issues and their solutions can help ensure a smooth implementation process.

```mermaid
flowchart TD
subgraph "SSL Verification Issues"
A["Disable SSL Verification Only in Development"]
B["Update CA Certificates Regularly"]
C["Handle Self-Signed Certificates Properly"]
end
subgraph "JSON Parsing Errors"
D["Validate JSON Structure Before Parsing"]
E["Handle Missing Fields Gracefully"]
F["Use Type Hints and Validation"]
end
subgraph "Network Failures"
G["Implement Retry Logic with Backoff"]
H["Use Circuit Breaker Pattern"]
I["Set Reasonable Timeouts"]
end
subgraph "Rate Limiting"
J["Respect Retry-After Headers"]
K["Implement Client-Side Rate Limiting"]
L["Monitor API Usage Patterns"]
end
M["Log Errors with Sufficient Context"]
N["Monitor API Health Regularly"]
O["Test Error Scenarios"]
A --> M
B --> M
C --> M
D --> N
E --> N
F --> N
G --> O
H --> O
I --> O
J --> O
K --> O
L --> O
```

**Diagram sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L0-L384)
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L0-L130)