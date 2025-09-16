# Testing Strategy

<cite>
**Referenced Files in This Document**   
- [jest.config.js](file://jest.config.js)
- [Makefile](file://Makefile)
- [setup.ts](file://src/__tests__/setup.ts)
- [fixtures/index.ts](file://src/__tests__/fixtures/index.ts)
- [app.test.ts](file://src/__tests__/app.test.ts)
- [e2e.test.ts](file://src/__tests__/e2e.test.ts)
- [performance.test.ts](file://src/__tests__/performance.test.ts)
- [config.test.ts](file://src/config/__tests__/config.test.ts)
- [errorHandler.test.ts](file://src/middleware/__tests__/errorHandler.test.ts)
- [requestLogger.test.ts](file://src/middleware/__tests__/requestLogger.test.ts)
- [health.test.ts](file://src/routes/__tests__/health.test.ts)
- [instances.test.ts](file://src/routes/__tests__/instances.test.ts)
- [integration.test.ts](file://src/routes/__tests__/integration.test.ts)
- [cache.test.ts](file://src/routes/__tests__/cache.test.ts)
- [metrics.test.ts](file://src/routes/__tests__/metrics.test.ts)
- [cacheService.test.ts](file://src/services/__tests__/cacheService.test.ts)
- [instanceCreationWorkflow.test.ts](file://src/services/__tests__/instanceCreationWorkflow.test.ts)
- [instanceService.test.ts](file://src/services/__tests__/instanceService.test.ts)
- [jobIntegration.test.ts](file://src/services/__tests__/jobIntegration.test.ts)
- [jobQueueService.test.ts](file://src/services/__tests__/jobQueueService.test.ts)
- [jobWorkerService.test.ts](file://src/services/__tests__/jobWorkerService.test.ts)
- [metricsService.test.ts](file://src/services/__tests__/metricsService.test.ts)
- [novitaApiService.test.ts](file://src/services/__tests__/novitaApiService.test.ts)
- [productService.test.ts](file://src/services/__tests__/productService.test.ts)
- [templateService.test.ts](file://src/services/__tests__/templateService.test.ts)
- [workflowIntegration.test.ts](file://src/services/__tests__/workflowIntegration.test.ts)
- [validation.test.ts](file://src/types/__tests__/validation.test.ts)
- [logger.test.ts](file://src/utils/__tests__/logger.test.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Testing Framework and Configuration](#testing-framework-and-configuration)
3. [Test Structure and Organization](#test-structure-and-organization)
4. [Unit Testing Strategy](#unit-testing-strategy)
5. [Integration Testing Approach](#integration-testing-approach)
6. [End-to-End Testing](#end-to-end-testing)
7. [Performance Testing](#performance-testing)
8. [Test Setup and Teardown](#test-setup-and-teardown)
9. [Test Fixtures and Mock Data](#test-fixtures-and-mock-data)
10. [Writing New Tests](#writing-new-tests)
11. [Code Coverage and CI Integration](#code-coverage-and-ci-integration)
12. [Troubleshooting and Debugging](#troubleshooting-and-debugging)

## Introduction
The novitai application employs a comprehensive, multi-layered testing strategy to ensure reliability, performance, and correctness across all components. This documentation details the testing approach, covering unit, integration, end-to-end, and performance tests. The strategy leverages Jest as the primary testing framework with TypeScript support through ts-jest, ensuring type safety and robust test execution. Tests are organized in a structured directory hierarchy with dedicated folders for different test types, enabling clear separation of concerns and maintainability. The testing ecosystem includes extensive mocking of external dependencies, reusable test fixtures, and comprehensive coverage requirements enforced through CI/CD pipelines.

## Testing Framework and Configuration

The novitai application uses Jest as its primary testing framework, configured specifically for TypeScript through ts-jest. The testing environment is configured in jest.config.js with settings optimized for the application's architecture and requirements.

```mermaid
graph TD
A[Jest Testing Framework] --> B[ts-jest]
A --> C[Test Environment: node]
A --> D[Roots: <rootDir>/src]
A --> E[Test Match Patterns]
A --> F[Setup Files After Env]
A --> G[Transform Rules]
A --> H[Coverage Configuration]
A --> I[Test Timeout: 10000ms]
A --> J[Max Workers: 4]
E --> E1[**/__tests__/**/*.ts]
E --> E2[**/*.test.ts]
E --> E3[**/*.spec.ts]
F --> F1[setup.ts]
H --> H1[Coverage Directory: coverage]
H --> H2[Coverage Reporters: text, lcov, html]
H --> H3[Coverage Threshold: 80%]
```

**Diagram sources**
- [jest.config.js](file://jest.config.js#L0-L30)

**Section sources**
- [jest.config.js](file://jest.config.js#L0-L30)

## Test Structure and Organization

Tests are organized in a hierarchical structure within the src/__tests__ directory and component-specific __tests__ subdirectories. This organization follows a clear pattern that separates different test types and maintains proximity to the code they test.

```mermaid
graph TD
A[src] --> B[__tests__]
A --> C[clients]
A --> D[config]
A --> E[middleware]
A --> F[routes]
A --> G[services]
A --> H[types]
A --> I[utils]
B --> B1[fixtures]
B --> B2[app.test.ts]
B --> B3[e2e.test.ts]
B --> B4[performance.test.ts]
B --> B5[setup.ts]
C --> C1[__tests__]
C1 --> C1a[novitaClient.test.ts]
C1 --> C1b[webhookClient.test.ts]
D --> D1[__tests__]
D1 --> D1a[config.test.ts]
E --> E1[__tests__]
E1 --> E1a[errorHandler.test.ts]
E1 --> E1b[metricsMiddleware.test.ts]
E1 --> E1c[requestLogger.test.ts]
F --> F1[__tests__]
F1 --> F1a[cache.test.ts]
F1 --> F1b[health.test.ts]
F1 --> F1c[instances.test.ts]
F1 --> F1d[integration.test.ts]
F1 --> F1e[metrics.test.ts]
G --> G1[__tests__]
G1 --> G1a[cacheService.test.ts]
G1 --> G1b[instanceCreationWorkflow.test.ts]
G1 --> G1c[instanceService.test.ts]
G1 --> G1d[jobIntegration.test.ts]
G1 --> G1e[jobQueueService.test.ts]
G1 --> G1f[jobWorkerService.test.ts]
G1 --> G1g[metricsService.test.ts]
G1 --> G1h[novitaApiService.test.ts]
G1 --> G1i[productService.test.ts]
G1 --> G1j[templateService.test.ts]
G1 --> G1k[workflowIntegration.test.ts]
H --> H1[__tests__]
H1 --> H1a[validation.test.ts]
I --> I1[__tests__]
I1 --> I1a[logger.test.ts]
```

**Diagram sources**
- [project structure](file://#L1-L100)

**Section sources**
- [project structure](file://#L1-L100)

## Unit Testing Strategy

Unit tests in the novitai application focus on testing individual functions, classes, and modules in isolation. Each service, utility, and middleware component has dedicated unit tests that verify functionality with mocked dependencies.

```mermaid
classDiagram
class UnitTest {
+test individual functions
+test class methods
+test module exports
+use mocks for dependencies
+fast execution
+high code coverage
}
class Mock {
+simulate external services
+control test scenarios
+verify interactions
+prevent side effects
}
class Assertion {
+validate outputs
+check error conditions
+verify state changes
+use custom matchers
}
UnitTest --> Mock : "uses"
UnitTest --> Assertion : "performs"
Mock --> ProductService : "mocks"
Mock --> TemplateService : "mocks"
Mock --> NovitaApiService : "mocks"
Mock --> WebhookClient : "mocks"
Mock --> InstanceService : "mocks"
```

**Diagram sources**
- [src/services/__tests__/productService.test.ts](file://src/services/__tests__/productService.test.ts)
- [src/services/__tests__/templateService.test.ts](file://src/services/__tests__/templateService.test.ts)
- [src/services/__tests__/novitaApiService.test.ts](file://src/services/__tests__/novitaApiService.test.ts)
- [src/services/__tests__/webhookClient.test.ts](file://src/clients/__tests__/webhookClient.test.ts)
- [src/services/__tests__/instanceService.test.ts](file://src/services/__tests__/instanceService.test.ts)

**Section sources**
- [src/services/__tests__/productService.test.ts](file://src/services/__tests__/productService.test.ts)
- [src/services/__tests__/templateService.test.ts](file://src/services/__tests__/templateService.test.ts)
- [src/services/__tests__/novitaApiService.test.ts](file://src/services/__tests__/novitaApiService.test.ts)
- [src/clients/__tests__/webhookClient.test.ts](file://src/clients/__tests__/webhookClient.test.ts)
- [src/services/__tests__/instanceService.test.ts](file://src/services/__tests__/instanceService.test.ts)

## Integration Testing Approach

Integration tests verify the interaction between multiple components, particularly focusing on route handlers, middleware, and service integrations. These tests use Supertest to simulate HTTP requests and validate API behavior.

```mermaid
sequenceDiagram
participant Client as "Test Client"
participant Router as "Express Router"
participant Middleware as "Middleware Stack"
participant Service as "Business Logic"
participant MockDB as "Mock External Services"
Client->>Router : HTTP Request
Router->>Middleware : Process Request
Middleware->>Middleware : CORS, Logging, Error Handling
Middleware->>Service : Call Service Method
Service->>MockDB : External API Call
MockDB-->>Service : Mocked Response
Service-->>Middleware : Return Result
Middleware-->>Router : Format Response
Router-->>Client : HTTP Response
Note over Client,MockDB : Verify route handlers, middleware integration, and service coordination
```

**Diagram sources**
- [src/routes/__tests__/instances.test.ts](file://src/routes/__tests__/instances.test.ts)
- [src/routes/__tests__/integration.test.ts](file://src/routes/__tests__/integration.test.ts)
- [src/routes/__tests__/health.test.ts](file://src/routes/__tests__/health.test.ts)
- [src/middleware/__tests__/errorHandler.test.ts](file://src/middleware/__tests__/errorHandler.test.ts)
- [src/middleware/__tests__/requestLogger.test.ts](file://src/middleware/__tests__/requestLogger.test.ts)

**Section sources**
- [src/routes/__tests__/instances.test.ts](file://src/routes/__tests__/instances.test.ts)
- [src/routes/__tests__/integration.test.ts](file://src/routes/__tests__/integration.test.ts)
- [src/routes/__tests__/health.test.ts](file://src/routes/__tests__/health.test.ts)
- [src/middleware/__tests__/errorHandler.test.ts](file://src/middleware/__tests__/errorHandler.test.ts)
- [src/middleware/__tests__/requestLogger.test.ts](file://src/middleware/__tests__/requestLogger.test.ts)

## End-to-End Testing

End-to-end tests validate the complete instance creation workflow, simulating real user interactions and verifying system behavior from request initiation to completion.

```mermaid
flowchart TD
Start([API Request]) --> ValidateInput["Validate Request Body"]
ValidateInput --> InputValid{"Input Valid?"}
InputValid --> |No| ReturnError["Return 400: Validation Error"]
InputValid --> |Yes| CreateJob["Queue Create Instance Job"]
CreateJob --> StartProcessing["Start Job Worker"]
StartProcessing --> MonitorInstance["Monitor Instance Status"]
MonitorInstance --> InstanceReady{"Instance Ready?"}
InstanceReady --> |No| CheckTimeout["Check Timeout"]
CheckTimeout --> |Within Limit| Wait["Wait & Retry"]
Wait --> MonitorInstance
CheckTimeout --> |Exceeded| MarkFailed["Mark Instance as Failed"]
MarkFailed --> NotifyWebhook["Send Failure Webhook"]
InstanceReady --> |Yes| StartMonitoring["Start Instance Monitoring"]
StartMonitoring --> SendWebhook["Send Ready Webhook"]
SendWebhook --> ReturnSuccess["Return 201: Instance Created"]
ReturnError --> End([Response])
ReturnSuccess --> End
NotifyWebhook --> End
```

**Diagram sources**
- [src/__tests__/e2e.test.ts](file://src/__tests__/e2e.test.ts)
- [src/services/__tests__/workflowIntegration.test.ts](file://src/services/__tests__/workflowIntegration.test.ts)
- [src/services/__tests__/jobIntegration.test.ts](file://src/services/__tests__/jobIntegration.test.ts)

**Section sources**
- [src/__tests__/e2e.test.ts](file://src/__tests__/e2e.test.ts)
- [src/services/__tests__/workflowIntegration.test.ts](file://src/services/__tests__/workflowIntegration.test.ts)
- [src/services/__tests__/jobIntegration.test.ts](file://src/services/__tests__/jobIntegration.test.ts)

## Performance Testing

Performance tests measure API response times under various load conditions and ensure the system meets performance requirements.

```mermaid
graph TD
A[Performance Tests] --> B[API Response Times]
A --> C[Load Testing]
A --> D[Memory Usage]
A --> E[Metrics Overhead]
B --> B1[Health Check < 100ms]
B --> B2[Instance Creation < 500ms]
B --> B3[Status Check < 200ms]
C --> C1[Single Request Performance]
C --> C2[Concurrent Requests]
C --> C3[Multiple Instance Creations]
D --> D1[Cache Memory Limits]
D --> D2[Memory Leak Detection]
E --> E1[Metrics Collection Overhead]
E --> E2[Performance Impact < 20%]
F[Test Execution] --> G[Measure Response Time]
G --> H[Assert Performance Thresholds]
H --> I[Report Results]
```

**Diagram sources**
- [src/__tests__/performance.test.ts](file://src/__tests__/performance.test.ts)
- [src/services/__tests__/metricsService.test.ts](file://src/services/__tests__/metricsService.test.ts)
- [src/middleware/__tests__/metricsMiddleware.test.ts](file://src/middleware/__tests__/metricsMiddleware.test.ts)

**Section sources**
- [src/__tests__/performance.test.ts](file://src/__tests__/performance.test.ts)
- [src/services/__tests__/metricsService.test.ts](file://src/services/__tests__/metricsService.test.ts)
- [src/middleware/__tests__/metricsMiddleware.test.ts](file://src/middleware/__tests__/metricsMiddleware.test.ts)

## Test Setup and Teardown

The test environment is configured through setup.ts, which establishes global test configurations, mocks, and utilities used across all test files.

```mermaid
flowchart TD
A[Global Setup] --> B[Set Environment Variables]
B --> B1[NODE_ENV=test]
B --> B2[LOG_LEVEL=error]
B --> B3[NOVITA_API_KEY=test-api-key]
A --> C[Configure Jest Timeout]
C --> C1[10000ms]
A --> D[Mock Console Methods]
D --> D1[console.log]
D --> D2[console.info]
D --> D3[console.warn]
D --> D4[console.error]
A --> E[Define Custom Matchers]
E --> E1[toBeWithinRange]
E --> E2[toBeValidInstanceId]
E --> E3[toBeValidJobId]
E --> E4[toHaveValidTimestamp]
A --> F[Create Mock Services]
F --> F1[mockNovitaApiService]
F --> F2[mockWebhookClient]
F --> F3[mockProductService]
F --> F4[mockTemplateService]
F --> F5[mockInstanceService]
G[Before All] --> H[Suppress Console Output]
I[After All] --> J[Restore Console Methods]
```

**Diagram sources**
- [src/__tests__/setup.ts](file://src/__tests__/setup.ts#L0-L316)

**Section sources**
- [src/__tests__/setup.ts](file://src/__tests__/setup.ts#L0-L316)

## Test Fixtures and Mock Data

The application uses a centralized fixtures system to provide consistent test data across all test files, ensuring reliability and maintainability.

```mermaid
classDiagram
class Fixtures {
+mockProducts : Product[]
+mockTemplates : Template[]
+mockInstanceResponses : InstanceResponse[]
+mockCreateRequests : CreateInstanceRequest[]
+mockJobs : Job[]
+mockErrors : Object
+mockWebhookPayloads : Object
+mockConfig : Object
}
class TestDataGenerator {
+generateInstanceId()
+generateJobId()
+generateCreateRequest()
+generateInstanceResponse()
+generateJob()
+generateMultipleInstances()
}
class TestUtils {
+wait()
+waitFor()
+createDelayedMock()
+createDelayedErrorMock()
}
Fixtures --> TestDataGenerator : "uses"
Fixtures --> TestUtils : "uses"
TestDataGenerator --> Product : "creates"
TestDataGenerator --> Template : "creates"
TestDataGenerator --> InstanceResponse : "creates"
TestDataGenerator --> CreateInstanceRequest : "creates"
TestDataGenerator --> Job : "creates"
```

**Diagram sources**
- [src/__tests__/fixtures/index.ts](file://src/__tests__/fixtures/index.ts#L0-L468)

**Section sources**
- [src/__tests__/fixtures/index.ts](file://src/__tests__/fixtures/index.ts#L0-L468)

## Writing New Tests

When writing new tests for the novitai application, follow these conventions to ensure consistency with the existing test suite.

```mermaid
flowchart TD
A[Create Test File] --> B[Use .test.ts Extension]
B --> C[Place in __tests__ Directory]
C --> D[Import Required Modules]
D --> E[Mock External Dependencies]
E --> F[Write Test Suite with describe]
F --> G[Use beforeEach/afterEach for Setup]
G --> H[Write Individual Tests with it]
H --> I[Use Supertest for API Tests]
I --> J[Use Custom Matchers]
J --> K[Verify Mock Interactions]
K --> L[Clean Up in afterEach]
L --> M[Follow Naming Conventions]
N[Naming Conventions] --> N1[describe: Component/Feature]
N --> N2[it: Should behavior when condition]
N --> N3[Variables: camelCase]
N --> N4[Constants: UPPER_CASE]
O[Best Practices] --> O1[Test One Thing]
O --> O2[Use Descriptive Names]
O --> O3[Mock External Services]
O --> O4[Clean Up After Tests]
O --> O5[Use Test Utilities]
```

**Section sources**
- [src/__tests__/app.test.ts](file://src/__tests__/app.test.ts)
- [src/routes/__tests__/instances.test.ts](file://src/routes/__tests__/instances.test.ts)
- [src/services/__tests__/instanceService.test.ts](file://src/services/__tests__/instanceService.test.ts)

## Code Coverage and CI Integration

Code coverage is enforced through Jest configuration with specific thresholds, and test execution is integrated into the CI/CD pipeline via the Makefile.

```mermaid
graph TD
A[Code Coverage] --> B[Jest Configuration]
B --> B1[collectCoverageFrom]
B --> B2[coverageDirectory: coverage]
B --> B3[coverageReporters: text, lcov, html]
B --> B4[coverageThreshold: 80%]
C[Coverage Targets] --> C1[branches: 80%]
C --> C2[functions: 80%]
C --> C3[lines: 80%]
C --> C4[statements: 80%]
D[CI Integration] --> E[Makefile Commands]
E --> E1[make test]
E --> E2[make test-coverage]
E --> E3[make test-watch]
F[Test Execution] --> G[Run All Tests]
G --> H[Generate Coverage Report]
H --> I[Fail if Below Threshold]
I --> J[Upload to CI System]
K[Makefile] --> L[test: Run npm test]
K --> M[test-coverage: Run with --coverage]
K --> N[test-watch: Run in watch mode]
```

**Diagram sources**
- [jest.config.js](file://jest.config.js#L0-L30)
- [Makefile](file://Makefile#L0-L141)

**Section sources**
- [jest.config.js](file://jest.config.js#L0-L30)
- [Makefile](file://Makefile#L0-L141)

## Troubleshooting and Debugging

This section provides guidance for troubleshooting common test issues and debugging strategies for the novitai application.

```mermaid
flowchart TD
A[Troubleshooting] --> B[Flaky Tests]
A --> C[Timeout Errors]
A --> D[Mock Issues]
A --> E[Coverage Gaps]
B --> B1[Increase testTimeout]
B --> B2[Check async operations]
B --> B3[Verify mock reset]
B --> B4[Use done callback]
C --> C1[Check Jest timeout setting]
C --> C2[Review async/await usage]
C --> C3[Inspect Promise chains]
C --> C4[Add console logs]
D --> D1[Verify mock implementation]
D --> D2[Check mock call order]
D --> D3[Ensure proper mocking]
D --> D4[Use mockReset/mockClear]
E --> E1[Identify uncovered lines]
E --> E2[Add targeted tests]
E --> E3[Review coverage report]
E --> E4[Check ignore patterns]
F[Debugging Strategies] --> G[Enable verbose logging]
F --> H[Use console.log in tests]
F --> I[Run single test with only]
F --> J[Use debugger statement]
F --> K[Check coverage reports]
F --> L[Review error stack traces]
```

**Section sources**
- [src/__tests__/setup.ts](file://src/__tests__/setup.ts)
- [jest.config.js](file://jest.config.js)
- [src/__tests__/app.test.ts](file://src/__tests__/app.test.ts)
- [src/routes/__tests__/instances.test.ts](file://src/routes/__tests__/instances.test.ts)