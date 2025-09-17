# Using Client Examples

<cite>
**Referenced Files in This Document**   
- [httpClientExample.ts](file://src/examples/httpClientExample.ts)
- [jobQueueExample.ts](file://src/examples/jobQueueExample.ts)
- [productServiceExample.ts](file://src/examples/productServiceExample.ts)
- [templateServiceExample.ts](file://src/examples/templateServiceExample.ts)
- [registryAuthExample.ts](file://src/examples/registryAuthExample.ts) - *Added in recent commit*
- [regionFallbackExample.ts](file://src/examples/regionFallbackExample.ts) - *Added in recent commit*
- [novitaClient.ts](file://src/clients/novitaClient.ts)
- [productService.ts](file://src/services/productService.ts)
- [templateService.ts](file://src/services/templateService.ts)
- [jobQueueService.ts](file://src/services/jobQueueService.ts)
- [README.md](file://client-examples/README.md)
</cite>

## Update Summary
**Changes Made**   
- Added new section for Region Fallback Example to document the multi-region fallback feature
- Added new section for Registry Authentication Example to document private image registry support
- Updated Template Service Example section to reflect the environment variable field name change from 'name' to 'key'
- Updated document sources to include the new regionFallbackExample.ts and registryAuthExample.ts files
- Verified all existing examples remain accurate with current codebase

## Table of Contents
1. [Introduction](#introduction)
2. [Core Example Analysis](#core-example-analysis)
3. [Extending Examples with Advanced Features](#extending-examples-with-advanced-features)
4. [Cross-Language Integration Patterns](#cross-language-integration-patterns)
5. [Troubleshooting Common Issues](#troubleshooting-common-issues)
6. [Testing Client Integrations](#testing-client-integrations)
7. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive guidance on leveraging client and service examples for real-world integrations with the Novita GPU Instance API. The examples in the `src/examples/` directory demonstrate key aspects of the API, including basic request patterns, asynchronous workflow handling, product catalog interactions, and configuration templating. Developers can use these examples as templates to build custom integrations while following best practices for code reusability and separation of concerns.

The examples are designed to showcase both high-level service usage and lower-level client interactions, providing a complete picture of how to interact with the API effectively. By understanding these patterns, developers can create robust, maintainable integrations that handle real-world scenarios such as rate limiting, error recovery, and performance optimization.

## Core Example Analysis

### HTTP Client Example Analysis
The `httpClientExample.ts` demonstrates fundamental API interaction patterns using both high-level services and direct client access. It showcases health checking, client status monitoring, product filtering, optimal product selection, template configuration retrieval, instance listing, and comprehensive error handling. The example also demonstrates rate limiting and circuit breaker functionality through concurrent request testing.

```mermaid
sequenceDiagram
participant Demo as "httpClientExample"
participant Service as "novitaApiService"
participant Client as "novitaClient"
participant API as "Novita API"
Demo->>Service : healthCheck()
Service->>Client : get('/health')
Client->>API : GET /health
API-->>Client : 200 OK
Client-->>Service : Response
Service-->>Demo : true
Demo->>Service : getProducts({productName, region})
Service->>Client : get('/v1/products', params)
Client->>API : GET /v1/products?productName=...&region=...
API-->>Client : Product List
Client-->>Service : Response
Service-->>Demo : Products
Demo->>Service : getOptimalProduct(name, region)
Service->>Service : getProducts() with filters
Service->>Service : sort by spot price
Service-->>Demo : Optimal Product
```

**Section sources**
- [httpClientExample.ts](file://src/examples/httpClientExample.ts#L1-L130)

### Job Queue Example Analysis
The `jobQueueExample.ts` demonstrates asynchronous workflow handling using the JobQueueService and JobWorkerService. It shows how to create different types of jobs (instance creation, webhook sending), manage job priorities, monitor job progress, and handle graceful shutdown. The example illustrates proper error handling and cleanup procedures for long-running processes.

```mermaid
classDiagram
class JobQueueService {
+addJob(type, payload, priority)
+getJob(id)
+getJobs(filter)
+getStats()
+startProcessing()
+stopProcessing()
+shutdown(timeout)
-processNextJob()
-getNextJob()
-processJob(job)
-executeJob(job)
}
class JobWorkerService {
+start()
+shutdown(timeout)
+registerHandlers()
}
class Job {
+id : string
+type : JobType
+payload : any
+status : JobStatus
+priority : JobPriority
+attempts : number
+maxAttempts : number
+createdAt : Date
+processedAt : Date
+completedAt : Date
+error : string
+nextRetryAt : Date
}
JobQueueService --> Job : "contains"
JobWorkerService --> JobQueueService : "uses"
JobWorkerService --> Job : "processes"
class JobType {
<<enumeration>>
CREATE_INSTANCE
MONITOR_INSTANCE
SEND_WEBHOOK
}
class JobStatus {
<<enumeration>>
PENDING
PROCESSING
COMPLETED
FAILED
}
class JobPriority {
<<enumeration>>
LOW
NORMAL
HIGH
}
```

**Section sources**
- [jobQueueExample.ts](file://src/examples/jobQueueExample.ts#L1-L102)

### Product Service Example Analysis
The `productServiceExample.ts` demonstrates product catalog interactions with a focus on optimal pricing selection and caching strategies. It shows how to retrieve products with filters, find the optimal product based on spot price, demonstrate caching behavior, and manage cache statistics. The example emphasizes performance optimization through intelligent caching.

```mermaid
flowchart TD
Start([Start]) --> GetOptimal["getOptimalProduct(name, region)"]
GetOptimal --> CheckCache["Check optimalProductCache"]
CheckCache --> CacheHit{"Cache Hit?"}
CacheHit --> |Yes| ReturnCached["Return cached product"]
CacheHit --> |No| FetchProducts["getProducts() with filters"]
FetchProducts --> FilterAvailable["Filter available products"]
FilterAvailable --> SortByPrice["Sort by spot price ascending"]
SortByPrice --> SelectCheapest["Select first product"]
SelectCheapest --> CacheResult["Cache optimal product"]
CacheResult --> ReturnResult["Return optimal product"]
ReturnCached --> End([End])
ReturnResult --> End
```

**Section sources**
- [productServiceExample.ts](file://src/examples/productServiceExample.ts#L1-L75)

### Template Service Example Analysis
The `templateServiceExample.ts` demonstrates configuration templating capabilities, showing how to fetch templates, extract configuration, demonstrate caching behavior, preload templates, and handle various error conditions. The example includes comprehensive error handling for invalid template IDs and non-existent templates.

```mermaid
sequenceDiagram
participant Demo as "templateServiceExample"
participant Service as "templateService"
participant Cache as "templateCache"
participant API as "Novita API"
Demo->>Service : getTemplate(templateId)
Service->>Cache : has(templateId)
Cache-->>Service : false
Service->>API : GET /v1/templates/{templateId}
API-->>Service : Template Data
Service->>Service : validateTemplate()
Service->>Cache : set(templateId, template)
Service-->>Demo : Template
Demo->>Service : getTemplate(templateId)
Service->>Cache : has(templateId)
Cache-->>Service : true
Service->>Cache : get(templateId)
Cache-->>Service : Template
Service-->>Demo : Template (cached)
Demo->>Service : preloadTemplate(templateId)
Service->>Service : getTemplate(templateId)
Service-->>Demo : Preload Complete
```

**Updated** The template service now uses 'key' instead of 'name' for environment variable field names in the template configuration.

**Section sources**
- [templateServiceExample.ts](file://src/examples/templateServiceExample.ts#L1-L148)
- [templateService.ts](file://src/services/templateService.ts#L172-L219) - *Updated in recent commit*

### Region Fallback Example Analysis
The `regionFallbackExample.ts` demonstrates the new multi-region fallback functionality for GPU product selection. This example shows how the system can automatically try different regions in priority order when searching for optimal products, with support for default configurations, preferred regions, and custom region priority lists.

```mermaid
flowchart TD
Start([Start]) --> Default["Default Region Config"]
Default --> TryRegions["Try regions in priority order"]
subgraph Region Priority
TryRegions --> SGP["AS-SGP-02 (Priority 1)"]
TryRegions --> HK["CN-HK-01 (Priority 2)"]
TryRegions --> IN["AS-IN-01 (Priority 3)"]
end
TryRegions --> Found{"Product Found?"}
Found --> |Yes| Return["Return product and region used"]
Found --> |No| Fail["All regions failed"]
Preferred[Preferred Region] --> MoveToFront["Move preferred region to front"]
MoveToFront --> TryRegions
Custom[Custom Regions] --> DefineOrder["Define custom priority order"]
DefineOrder --> TryRegions
Return --> End([End])
Fail --> End
```

**Section sources**
- [regionFallbackExample.ts](file://src/examples/regionFallbackExample.ts#L1-L91)
- [productService.ts](file://src/services/productService.ts#L150-L250)

### Registry Authentication Example Analysis
The `registryAuthExample.ts` demonstrates the new registry authentication functionality that supports private Docker images. This example shows how the system handles Docker registry authentication when creating instances with private images, including credential management and secure handling.

```mermaid
flowchart TD
Start([Start]) --> Template["Template with imageAuth ID"]
Template --> Fetch["Fetch registry credentials"]
Fetch --> System["System calls /v1/repository/auths"]
System --> Match["Find credentials by auth ID"]
Match --> Extract["Extract username/password"]
Extract --> Format["Format as username:password"]
Format --> Request["Include in instance creation"]
Request --> Instance["Private image instance created"]
```

**Section sources**
- [registryAuthExample.ts](file://src/examples/registryAuthExample.ts#L1-L97)
- [novitaApiService.ts](file://src/services/novitaApiService.ts#L150-L200)

## Extending Examples with Advanced Features

### Adding Logging Capabilities
All examples can be enhanced with comprehensive logging by leveraging the existing logger utility. The `novitaClient` already includes request and response interceptors that log correlation IDs, method types, URLs, and parameters. Developers can extend this by adding custom log levels and structured logging for business logic.

```mermaid
sequenceDiagram
participant App as "Application"
participant Logger as "logger"
participant File as "Log File"
participant Monitor as "Monitoring System"
App->>Logger : info("Message", {context})
Logger->>File : Write to file
Logger->>Monitor : Send to monitoring
App->>Logger : error("Error", {error})
Logger->>File : Write error with stack
Logger->>Monitor : Alert on critical error
App->>Logger : debug("Debug", {data})
Logger->>File : Write debug info
```

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L116-L180)
- [logger.ts](file://src/utils/logger.ts#L1-L50)

### Implementing Monitoring and Metrics
The examples can be extended with monitoring capabilities using the metrics middleware and job metrics recording. The `recordJobMetrics` function captures job processing time, success/failure status, and queue size, enabling performance analysis and alerting.

```mermaid
flowchart LR
Job[Job Processing] --> Metrics["recordJobMetrics()"]
Metrics --> Prometheus[(Prometheus)]
Metrics --> Grafana[(Grafana)]
Metrics --> AlertManager[(AlertManager)]
subgraph Monitoring
Prometheus --> |Scrapes| Grafana
Prometheus --> |Triggers| AlertManager
Grafana --> |Displays| Dashboard[Dashboard]
AlertManager --> |Sends| Email[Email]
AlertManager --> |Sends| Slack[Slack]
end
```

**Section sources**
- [metricsMiddleware.ts](file://src/middleware/metricsMiddleware.ts#L1-L30)
- [jobQueueService.ts](file://src/services/jobQueueService.ts#L250-L270)

### Enhancing Error Reporting
Error handling can be improved by implementing comprehensive error reporting that includes context information, correlation IDs, and structured error formats. The examples already demonstrate basic error handling, but can be extended with centralized error reporting services.

```mermaid
flowchart TD
Error[Error Occurs] --> Catch["try/catch block"]
Catch --> Classify["Classify error type"]
Classify --> Network{"Network Error?"}
Classify --> Server{"5xx Error?"}
Classify --> RateLimit{"429 Error?"}
Classify --> Auth{"401 Error?"}
Network --> |Yes| Retry["Schedule retry"]
Server --> |Yes| Retry
RateLimit --> |Yes| Backoff["Exponential backoff"]
Auth --> |Yes| Alert["Alert admin"]
Retry --> Report["Send to error reporting"]
Backoff --> Report
Alert --> Report
Report --> Sentry[(Sentry)]
Report --> Log[(Log Aggregator)]
```

**Section sources**
- [novitaClient.ts](file://src/clients/novitaClient.ts#L200-L250)
- [errorHandler.ts](file://src/utils/errorHandler.ts#L1-L100)

## Cross-Language Integration Patterns

### Node.js Client Enhancement
The Node.js examples in `client-examples/nodejs` can be enhanced by incorporating patterns from the TypeScript examples, such as circuit breaker implementation, rate limiting, and structured logging. The core functionality from `novitaClient.ts` can be adapted to pure JavaScript clients.

```mermaid
classDiagram
class NovitaNodeClient {
+request(config)
+get(url, config)
+post(url, data, config)
+put(url, data, config)
+delete(url, config)
+healthCheck()
+getCircuitBreakerState()
+getQueueStatus()
}
class CircuitBreaker {
+execute(operation)
+getState()
-onSuccess()
-onFailure()
}
class RateLimiter {
+waitForSlot()
}
class Logger {
+info(message, context)
+error(message, context)
+debug(message, context)
}
NovitaNodeClient --> CircuitBreaker : "uses"
NovitaNodeClient --> RateLimiter : "uses"
NovitaNodeClient --> Logger : "uses"
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L1-L253)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L1-L384)

### Python Client Enhancement
The Python examples can be enhanced with similar patterns, implementing circuit breakers, rate limiters, and structured logging. The Python client can leverage libraries like `tenacity` for retry logic and `logging` for structured output.

```mermaid
sequenceDiagram
participant Python as "Python Client"
participant Circuit as "CircuitBreaker"
participant RateLimit as "RateLimiter"
participant Logger as "Logger"
participant API as "Novita API"
Python->>Circuit : execute(request)
Circuit->>RateLimit : waitForSlot()
RateLimit-->>Circuit : OK
Circuit->>Python : makeRequest()
Python->>API : HTTP Request
API-->>Python : Response
Python-->>Circuit : Success
Circuit-->>Circuit : onSuccess()
Circuit-->>Logger : Log success
Python-->>Caller : Result
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L1-L253)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L1-L384)

## Troubleshooting Common Issues

### Incorrect Payload Formats
When dealing with incorrect payload formats, ensure that all required fields are present and properly formatted. The API expects specific data types and structures for different endpoints.

```mermaid
flowchart TD
Request[API Request] --> Validate["Validate payload format"]
Validate --> Correct{"Format Correct?"}
Correct --> |No| Identify["Identify missing/invalid fields"]
Identify --> Fix["Fix payload structure"]
Fix --> Retry["Retry request"]
Correct --> |Yes| Process["Process request"]
Process --> Success["Return success"]
Identify --> Log["Log error with context"]
Log --> Guide["Provide guidance to user"]
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L152-L170)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L200-L250)

### Authentication Failures
Authentication failures typically occur due to incorrect API keys or missing authorization headers. Ensure the API key is correctly configured in environment variables without quotes or extra spaces.

```mermaid
flowchart TD
Request[API Request] --> Auth["Check Authorization"]
Auth --> HasKey{"API Key Provided?"}
HasKey --> |No| Fail1["Return 401"]
HasKey --> |Yes| ValidFormat{"Valid Format?"}
ValidFormat --> |No| Fail2["Return 401"]
ValidFormat --> |Yes| Active{"Key Active?"}
Active --> |No| Fail3["Return 401"]
Active --> |Yes| Success["Process request"]
Fail1 --> Guide1["Check NOVITA_API_KEY env var"]
Fail2 --> Guide2["Verify key format: nv_..."]
Fail3 --> Guide3["Regenerate API key"]
```

**Section sources**
- [docs/TROUBLESHOOTING.md](file://docs/TROUBLESHOOTING.md#L161-L194)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L116-L130)

### Unexpected Response Handling
When receiving unexpected responses, implement proper error handling with retry logic for transient failures and appropriate fallbacks for permanent errors.

```mermaid
flowchart TD
Response[API Response] --> Status{"Status Code"}
Status --> Success{"2xx?"}
Success --> |Yes| HandleSuccess["Process data"]
Success --> |No| ClientError{"4xx?"}
ClientError --> |Yes| HandleClient["Fix request and retry"]
ClientError --> |No| ServerError{"5xx?"}
ServerError --> |Yes| Retry["Retry with backoff"]
ServerError --> |No| Network{"Network Error?"}
Network --> |Yes| Retry
Network --> |No| Unknown["Log unknown error"]
Retry --> Count{"Max retries reached?"}
Count --> |No| Wait["Wait with backoff"]
Wait --> RetryRequest["Retry request"]
Count --> |Yes| Fail["Fail permanently"]
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L152-L170)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L200-L250)

## Testing Client Integrations

### Mock Server Testing
Testing client integrations with mock servers allows for reliable testing without depending on external services. The examples can be tested using mock implementations of the API services.

```mermaid
flowchart LR
Test[Integration Test] --> Mock["Mock API Server"]
Mock --> Response["Simulated Responses"]
Test --> Client["Client Implementation"]
Client --> Mock
Client --> Assert["Assertions"]
Assert --> Result["Test Result"]
subgraph "Mock Scenarios"
Mock --> Success["200 OK responses"]
Mock --> Error401["401 Unauthorized"]
Mock --> Error429["429 Rate Limited"]
Mock --> Error500["500 Server Error"]
Mock --> Timeout["Network Timeout"]
end
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L232-L250)
- [novitaClient.ts](file://src/clients/novitaClient.ts#L1-L384)

### Snapshot Testing
Snapshot testing ensures that API responses and client behavior remain consistent over time. This approach captures the output of API calls and compares it against known good snapshots.

```mermaid
flowchart TD
Test[Snapshot Test] --> Execute["Execute API call"]
Execute --> Capture["Capture response"]
Capture --> Load["Load saved snapshot"]
Load --> Compare{"Response matches snapshot?"}
Compare --> |Yes| Pass["Test passes"]
Compare --> |No| Review["Review changes"]
Review --> Update{"Update snapshot?"}
Update --> |Yes| Save["Save new snapshot"]
Update --> |No| Fail["Test fails"]
Save --> Pass
```

**Section sources**
- [client-examples/README.md](file://client-examples/README.md#L232-L250)
- [__tests__](file://src/__tests__#L1-L50)

## Conclusion
The client examples provided in the repository serve as comprehensive templates for building real-world integrations with the Novita GPU Instance API. By understanding and leveraging these examples, developers can create robust, maintainable integrations that follow best practices for error handling, performance optimization, and code organization.

The examples demonstrate key patterns including basic request handling, asynchronous workflow management, product catalog interactions, and configuration templating. These patterns can be extended with advanced features like comprehensive logging, monitoring, and error reporting to create production-ready integrations.

When adapting these examples, focus on code reusability and separation of concerns by encapsulating common functionality in services and utilities. Follow the documented best practices for configuration management, error handling, resource management, security, and performance to ensure reliable and secure integrations.

For troubleshooting, refer to the specific guidance provided for common issues such as payload format errors, authentication failures, and unexpected responses. Utilize the testing strategies outlined, including mock server testing and snapshot testing, to ensure the reliability and stability of your client integrations.