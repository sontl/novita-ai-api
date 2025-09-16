# Data Models & Type Definitions

<cite>
**Referenced Files in This Document**   
- [api.ts](file://src/types/api.ts)
- [validation.ts](file://src/types/validation.ts)
- [job.ts](file://src/types/job.ts)
- [instanceService.ts](file://src/services/instanceService.ts)
- [jobQueueService.ts](file://src/services/jobQueueService.ts)
- [instances.ts](file://src/routes/instances.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Core Data Models](#core-data-models)
3. [Validation Schema](#validation-schema)
4. [Job Queue System](#job-queue-system)
5. [Health Check Response](#health-check-response)
6. [Validation Implementation](#validation-implementation)
7. [Type Relationships](#type-relationships)
8. [Example Data Instances](#example-data-instances)
9. [Runtime Validation & API Contracts](#runtime-validation--api-contracts)
10. [Versioning Strategy](#versioning-strategy)
11. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive documentation for the core data models in the novitai application. It details the primary TypeScript interfaces used throughout the system, including InstanceDetails, CreateInstanceRequest, Job, and HealthCheckResponse. The documentation covers validation rules implemented using Joi, type relationships, example data instances, and how these models are used for both runtime validation and API contract documentation. The document also addresses the versioning strategy and backward compatibility considerations for evolving these schemas.

## Core Data Models

### InstanceDetails Interface
The InstanceDetails interface represents the complete state and configuration of a GPU instance in the novitai system. It contains comprehensive information about an instance's identity, status, configuration, and connection details.

```mermaid
classDiagram
class InstanceDetails {
+string id
+string name
+string status
+number gpuNum
+string region
+Array<PortMapping> portMappings
+ConnectionDetails? connectionDetails
+string createdAt
+string? readyAt
}
class PortMapping {
+number port
+string endpoint
+string type
}
class ConnectionDetails {
+string? ssh
+string? jupyter
+string? webTerminal
}
InstanceDetails --> PortMapping : "has many"
InstanceDetails --> ConnectionDetails : "has optional"
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L26-L44)

**Section sources**
- [api.ts](file://src/types/api.ts#L26-L44)
- [instanceService.ts](file://src/services/instanceService.ts#L300-L350)

### CreateInstanceRequest Interface
The CreateInstanceRequest interface defines the structure of the request payload for creating a new GPU instance. It includes both required and optional fields that specify the desired configuration for the new instance.

```mermaid
classDiagram
class CreateInstanceRequest {
+string name
+string productName
+string|number templateId
+number? gpuNum
+number? rootfsSize
+string? region
+string? webhookUrl
}
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L9-L17)

**Section sources**
- [api.ts](file://src/types/api.ts#L9-L17)
- [instances.ts](file://src/routes/instances.ts#L15-L35)

## Validation Schema

### CreateInstanceRequest Validation Rules
The validation schema for CreateInstanceRequest enforces strict constraints on each field to ensure data integrity and system stability. The schema is implemented using Joi and includes custom error messages for improved user experience.

```mermaid
flowchart TD
A["CreateInstanceRequest Validation"] --> B["name: string"]
B --> C["Min length: 1"]
B --> D["Max length: 100"]
B --> E["Pattern: /^[a-zA-Z0-9-_]+$/"]
A --> F["productName: string"]
F --> G["Min length: 1"]
F --> H["Max length: 200"]
A --> I["templateId: string|number"]
I --> J["Min length: 1"]
A --> K["gpuNum: number"]
K --> L["Integer only"]
K --> M["Min value: 1"]
K --> N["Max value: 8"]
K --> O["Default: 1"]
A --> P["rootfsSize: number"]
P --> Q["Integer only"]
P --> R["Min value: 20"]
P --> S["Max value: 1000"]
P --> T["Default: 60"]
A --> U["region: string"]
U --> V["Valid values: CN-HK-01, US-WEST-01, EU-WEST-01"]
U --> W["Default: CN-HK-01"]
A --> X["webhookUrl: string"]
X --> Y["Valid HTTP/HTTPS URL"]
```

**Diagram sources**
- [validation.ts](file://src/types/validation.ts#L5-L68)

**Section sources**
- [validation.ts](file://src/types/validation.ts#L5-L68)
- [instances.ts](file://src/routes/instances.ts#L20-L30)

## Job Queue System

### Job Interface
The Job interface represents a unit of work in the asynchronous job queue system. Each job contains metadata about its type, status, execution attempts, and timing information.

```mermaid
classDiagram
class Job {
+string id
+JobType type
+any payload
+JobStatus status
+JobPriority priority
+number attempts
+number maxAttempts
+Date createdAt
+Date? processedAt
+Date? completedAt
+Date? nextRetryAt
+string? error
}
class JobType {
+CREATE_INSTANCE = 'create_instance'
+MONITOR_INSTANCE = 'monitor_instance'
+SEND_WEBHOOK = 'send_webhook'
}
class JobStatus {
+PENDING = 'pending'
+PROCESSING = 'processing'
+COMPLETED = 'completed'
+FAILED = 'failed'
}
class JobPriority {
+LOW = 1
+NORMAL = 2
+HIGH = 3
+CRITICAL = 4
}
Job --> JobType : "has type"
Job --> JobStatus : "has status"
Job --> JobPriority : "has priority"
```

**Diagram sources**
- [job.ts](file://src/types/job.ts#L24-L37)
- [job.ts](file://src/types/job.ts#L2-L22)

**Section sources**
- [job.ts](file://src/types/job.ts#L24-L37)
- [jobQueueService.ts](file://src/services/jobQueueService.ts#L50-L100)

### Job Payload Types
The system defines specific payload interfaces for different job types, ensuring type safety and proper data structure for each job category.

```mermaid
classDiagram
class CreateInstanceJobPayload {
+string instanceId
+string name
+string productName
+string|number templateId
+number gpuNum
+number rootfsSize
+string region
+string? webhookUrl
}
class MonitorInstanceJobPayload {
+string instanceId
+string novitaInstanceId
+string? webhookUrl
+Date startTime
+number maxWaitTime
}
class SendWebhookJobPayload {
+string url
+any payload
+Record<string, string>? headers
}
class Job {
+any payload
}
Job --> CreateInstanceJobPayload : "payload for CREATE_INSTANCE"
Job --> MonitorInstanceJobPayload : "payload for MONITOR_INSTANCE"
Job --> SendWebhookJobPayload : "payload for SEND_WEBHOOK"
```

**Diagram sources**
- [job.ts](file://src/types/job.ts#L40-L70)

**Section sources**
- [job.ts](file://src/types/job.ts#L40-L70)
- [jobQueueService.ts](file://src/services/jobQueueService.ts#L200-L250)

## Health Check Response

### HealthCheckResponse Structure
The HealthCheckResponse interface provides a standardized format for system health status, including service availability, timestamp, and uptime information.

```mermaid
classDiagram
class HealthCheckResponse {
+'healthy'|'unhealthy' status
+string timestamp
+Services services
+number uptime
}
class Services {
+'up'|'down' novitaApi
+'up'|'down' jobQueue
+'up'|'down' cache
}
class EnhancedHealthCheckResponse {
+Performance performance
+SystemMetrics system
+Record<string, any> dependencies
}
HealthCheckResponse <|-- EnhancedHealthCheckResponse : "extends"
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L51-L60)
- [api.ts](file://src/types/api.ts#L63-L80)

**Section sources**
- [api.ts](file://src/types/api.ts#L51-L80)
- [routes/health.ts](file://src/routes/health.ts#L10-L50)

## Validation Implementation

### Validation Functions
The validation system provides utility functions that wrap Joi validation with custom error handling and structured error responses.

```mermaid
sequenceDiagram
participant Client
participant Validation
participant Joi
participant Service
Client->>Validation : validateCreateInstance(data)
Validation->>Joi : createInstanceSchema.validate(data)
Joi-->>Validation : ValidationResult
alt Validation Success
Validation-->>Service : {value : data}
else Validation Failure
Validation->>Validation : Format error details
Validation-->>Service : {value : partialData, error : details}
end
Service->>Service : Handle validation result
alt Has Error
Service->>Client : Throw ValidationError
else No Error
Service->>Service : Process valid data
end
```

**Diagram sources**
- [validation.ts](file://src/types/validation.ts#L159-L224)
- [instances.ts](file://src/routes/instances.ts#L20-L30)

**Section sources**
- [validation.ts](file://src/types/validation.ts#L159-L224)
- [instances.ts](file://src/routes/instances.ts#L20-L30)

### Custom Validators and Error Messages
The system implements custom validators with user-friendly error messages to improve the developer experience and provide clear feedback on validation failures.

```mermaid
flowchart TD
A["Field Validation"] --> B["name field"]
B --> C["Pattern validation: /^[a-zA-Z0-9-_]+$/"]
C --> D["Custom message: 'Name must contain only alphanumeric characters, hyphens, and underscores'"]
A --> E["productName field"]
E --> F["Min length validation: 1"]
F --> G["Custom message: 'Product name is required'"]
A --> H["templateId field"]
H --> I["Min length validation: 1"]
I --> J["Custom message: 'Template ID is required'"]
A --> K["gpuNum field"]
K --> L["Integer validation"]
L --> M["Custom message: 'GPU number must be an integer'"]
A --> N["region field"]
N --> O["Enum validation: CN-HK-01, US-WEST-01, EU-WEST-01"]
O --> P["Custom message: 'Region must be one of: CN-HK-01, US-WEST-01, EU-WEST-01'"]
```

**Diagram sources**
- [validation.ts](file://src/types/validation.ts#L5-L68)

**Section sources**
- [validation.ts](file://src/types/validation.ts#L5-L68)
- [utils/errorHandler.ts](file://src/utils/errorHandler.ts#L48-L103)

## Type Relationships

### Inheritance and Composition
The data model system uses both inheritance and composition to create a flexible and maintainable type structure.

```mermaid
classDiagram
class InstanceDetails
class InstanceState
class InstanceResponse
InstanceDetails <|-- InstanceResponse : "maps from"
InstanceState <|-- InstanceDetails : "contains"
class CreateInstanceRequest
class NovitaCreateInstanceRequest
CreateInstanceRequest <|-- NovitaCreateInstanceRequest : "extends"
class ErrorResponse
class ValidationErrorResponse
ErrorResponse <|-- ValidationErrorResponse : "extends"
InstanceDetails --> PortMapping : "has many"
InstanceDetails --> ConnectionDetails : "has optional"
InstanceState --> Configuration : "has"
InstanceState --> Timestamps : "has"
class Configuration
class Timestamps
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L26-L44)
- [api.ts](file://src/types/api.ts#L200-L220)
- [api.ts](file://src/types/api.ts#L250-L270)

**Section sources**
- [api.ts](file://src/types/api.ts#L26-L270)
- [instanceService.ts](file://src/services/instanceService.ts#L300-L350)

## Example Data Instances

### Valid Instance Creation Request
```json
{
  "name": "my-gpu-instance",
  "productName": "A100-SXM4-40GB",
  "templateId": "tf-training-template-1",
  "gpuNum": 2,
  "rootfsSize": 100,
  "region": "US-WEST-01",
  "webhookUrl": "https://myapp.com/webhook"
}
```

### Invalid Instance Creation Request (Multiple Errors)
```json
{
  "name": "invalid name!",  // Invalid characters
  "productName": "",       // Empty string
  "templateId": "",        // Empty string
  "gpuNum": 10,           // Exceeds maximum
  "rootfsSize": 5,         // Below minimum
  "region": "INVALID-REGION", // Not in enum
  "webhookUrl": "not-a-url" // Invalid URL format
}
```

### Valid Instance Details Response
```json
{
  "id": "inst_12345_abcde",
  "name": "my-gpu-instance",
  "status": "running",
  "gpuNum": 2,
  "region": "US-WEST-01",
  "portMappings": [
    {
      "port": 22,
      "endpoint": "ssh://gpu-instance-123.novitai.com:22",
      "type": "tcp"
    },
    {
      "port": 8888,
      "endpoint": "https://jupyter.gpu-instance-123.novitai.com",
      "type": "https"
    }
  ],
  "connectionDetails": {
    "ssh": "ssh://gpu-instance-123.novitai.com:22",
    "jupyter": "https://jupyter.gpu-instance-123.novitai.com"
  },
  "createdAt": "2023-12-01T10:00:00.000Z",
  "readyAt": "2023-12-01T10:04:30.000Z"
}
```

### Valid Health Check Response
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:30:00.000Z",
  "services": {
    "novitaApi": "up",
    "jobQueue": "up",
    "cache": "up"
  },
  "uptime": 3600
}
```

**Section sources**
- [api.ts](file://src/types/api.ts#L9-L80)
- [validation.ts](file://src/types/validation.ts#L5-L68)

## Runtime Validation & API Contracts

### Validation Flow in Request Processing
The system uses TypeScript interfaces for both compile-time type checking and runtime validation, creating a robust contract between the API and its consumers.

```mermaid
sequenceDiagram
participant Client
participant Express
participant Validation
participant Service
participant Database
Client->>Express : POST /api/instances
Express->>Validation : validateCreateInstance(req.body)
alt Validation Success
Validation-->>Service : Validated data
Service->>Service : Business logic
Service->>Database : Store instance state
Service->>JobQueue : Add create_instance job
Service-->>Express : CreateInstanceResponse
Express-->>Client : 201 Created + response
else Validation Failure
Validation->>Express : ValidationResult with error
Express->>ErrorHandling : Throw ValidationError
ErrorHandling-->>Client : 400 Bad Request + error details
end
```

**Diagram sources**
- [instances.ts](file://src/routes/instances.ts#L15-L35)
- [validation.ts](file://src/types/validation.ts#L159-L224)

**Section sources**
- [instances.ts](file://src/routes/instances.ts#L15-L35)
- [validation.ts](file://src/types/validation.ts#L159-L224)

### Error Response Structure
The system provides a consistent error response format that includes detailed validation error information when appropriate.

```mermaid
classDiagram
class ErrorResponse {
+ErrorDetail error
}
class ErrorDetail {
+string code
+string message
+any details
+string timestamp
+string requestId
}
class ValidationErrorResponse {
+ValidationErrorDetail[] validationErrors
}
class ValidationErrorDetail {
+string field
+string message
+any value
}
ErrorResponse <|-- ValidationErrorResponse : "extends"
ErrorDetail <|-- ValidationErrorDetail : "in validationErrors"
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L250-L270)
- [utils/errorHandler.ts](file://src/utils/errorHandler.ts#L48-L103)

**Section sources**
- [api.ts](file://src/types/api.ts#L250-L270)
- [utils/errorHandler.ts](file://src/utils/errorHandler.ts#L48-L103)

## Versioning Strategy

### Schema Evolution and Backward Compatibility
The data model system is designed with backward compatibility in mind, allowing for graceful evolution of schemas over time.

```mermaid
flowchart TD
A["Schema Versioning Strategy"] --> B["Use optional properties for new fields"]
A --> C["Maintain default values for optional fields"]
A --> D["Support multiple types for fields when necessary"]
A --> E["Deprecate fields rather than remove them"]
A --> F["Use semantic versioning for API"]
A --> G["Provide migration paths for breaking changes"]
A --> H["Maintain backward compatibility for N-2 versions"]
B --> I["Example: webhookUrl is optional"]
C --> J["Example: gpuNum defaults to 1"]
D --> K["Example: templateId supports string|number"]
E --> L["Mark fields with @deprecated in JSDoc"]
F --> M["Follow MAJOR.MINOR.PATCH versioning"]
G --> N["Provide upgrade guides for breaking changes"]
H --> O["Allow gradual migration of clients"]
```

**Diagram sources**
- [api.ts](file://src/types/api.ts#L9-L17)
- [validation.ts](file://src/types/validation.ts#L5-L68)

**Section sources**
- [api.ts](file://src/types/api.ts#L9-L17)
- [validation.ts](file://src/types/validation.ts#L5-L68)
- [config/README.md](file://src/config/README.md#L107-L139)

## Conclusion
The novitai application employs a robust and comprehensive data modeling system that combines TypeScript interfaces with Joi validation to ensure data integrity and provide clear API contracts. The core entities—InstanceDetails, CreateInstanceRequest, Job, and HealthCheckResponse—are carefully designed with appropriate constraints and relationships to support the application's functionality. The validation system provides detailed error messages and handles both required and optional fields with appropriate defaults. The job queue system enables asynchronous processing with retry mechanisms and priority handling. The health check system provides comprehensive monitoring capabilities. The type system uses inheritance and composition to create a maintainable structure, and the versioning strategy ensures backward compatibility during schema evolution. Together, these elements create a solid foundation for a reliable and scalable application.