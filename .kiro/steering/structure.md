# Project Structure

## Directory Organization

```
src/
├── clients/           # External API clients (Novita.ai)
├── config/           # Configuration management and validation
├── examples/         # Usage examples and demonstrations
├── middleware/       # Express middleware (error handling)
├── routes/          # Express route handlers
├── services/        # Business logic and API orchestration
├── types/           # TypeScript type definitions and validation
└── utils/           # Shared utilities (logging, error handling)
```

## Architecture Patterns

### Layered Architecture
- **Routes**: HTTP request/response handling
- **Services**: Business logic and external API coordination
- **Clients**: External API communication with retry/circuit breaker
- **Types**: Centralized type definitions and validation schemas

### Error Handling Strategy
- Custom error classes for different failure scenarios
- Circuit breaker pattern for external API resilience
- Centralized error middleware for consistent responses
- Structured logging with context information

## File Naming Conventions

- **Services**: `{domain}Service.ts` (e.g., `novitaApiService.ts`)
- **Clients**: `{provider}Client.ts` (e.g., `novitaClient.ts`)
- **Types**: Descriptive names (`api.ts`, `validation.ts`)
- **Tests**: Co-located in `__tests__/` folders with `.test.ts` suffix
- **Examples**: `{feature}Example.ts` for demonstration code

## Code Organization Principles

- **Single Responsibility**: Each service handles one domain
- **Dependency Injection**: Services use injected clients
- **Type Safety**: Comprehensive TypeScript coverage
- **Testability**: All business logic is unit tested
- **Configuration**: Environment-based with validation
- **Logging**: Structured logging throughout the application

## Testing Structure

- Unit tests co-located with source code in `__tests__/` folders
- Mocked external dependencies for isolated testing
- Coverage reporting enabled for quality metrics
- Test files mirror source structure for easy navigation