# Novita.ai HTTP Client

This module provides a robust HTTP client for interacting with the Novita.ai API, featuring advanced error handling, retry logic, rate limiting, and circuit breaker patterns.

## Features

### 🔄 Retry Logic with Exponential Backoff
- Automatic retry for network errors, timeouts, and 5xx server errors
- Exponential backoff strategy (1s, 2s, 4s, max 30s)
- Configurable maximum retry attempts (default: 3)
- Respects `Retry-After` headers for 429 responses

### ⚡ Circuit Breaker Pattern
- Prevents cascading failures when API is down
- Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
- Configurable failure threshold and recovery timeout
- Automatic state transitions based on success/failure rates

### 🚦 Rate Limiting
- Built-in request queuing to respect API rate limits
- Configurable requests per time window
- Automatic request spacing to prevent 429 errors
- Queue status monitoring for observability

### 📝 Comprehensive Logging
- Structured logging with correlation IDs
- Request/response logging with sanitized data
- Error categorization and detailed error context
- Performance metrics and timing information

### 🛡️ Error Handling
- Typed error classes for different error scenarios
- Automatic error categorization (network, auth, rate limit, etc.)
- Graceful degradation and fallback strategies
- Detailed error context for debugging

## Usage

### Basic Usage

```typescript
import { novitaClient } from './clients/novitaClient';

// Make HTTP requests
const response = await novitaClient.get('/v1/products');
const createResponse = await novitaClient.post('/v1/instances', instanceData);
```

### Using the API Service (Recommended)

```typescript
import { novitaApiService } from './services/novitaApiService';

// High-level API methods with built-in error handling
const products = await novitaApiService.getProducts({ region: 'CN-HK-01' });
const optimalProduct = await novitaApiService.getOptimalProduct('RTX 4090', 'CN-HK-01');
const instance = await novitaApiService.createInstance(instanceRequest);
```

### Monitoring and Observability

```typescript
// Check circuit breaker state
const circuitState = novitaClient.getCircuitBreakerState();
console.log('Circuit breaker:', circuitState); // 'closed', 'open', or 'half_open'

// Monitor request queue
const queueStatus = novitaClient.getQueueStatus();
console.log('Queue length:', queueStatus.queueLength);
console.log('Processing:', queueStatus.isProcessing);

// Health check
const isHealthy = await novitaClient.healthCheck();
```

## Configuration

The client is configured through environment variables:

```bash
# Required
NOVITA_API_KEY=your_api_key_here

# Optional (with defaults)
NOVITA_API_BASE_URL=https://api.novita.ai
REQUEST_TIMEOUT=30000
MAX_RETRY_ATTEMPTS=3
```

## Error Types

### NovitaApiClientError
Base error class for all API-related errors.

```typescript
try {
  await novitaApiService.getInstance('invalid-id');
} catch (error) {
  if (error instanceof NovitaApiClientError) {
    console.log('Status:', error.statusCode);
    console.log('Code:', error.code);
    console.log('Message:', error.message);
  }
}
```

### RateLimitError
Thrown when API rate limits are exceeded.

```typescript
try {
  await novitaApiService.getProducts();
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log('Retry after:', error.retryAfter, 'ms');
  }
}
```

### CircuitBreakerError
Thrown when circuit breaker is open (API is failing).

```typescript
try {
  await novitaApiService.getProducts();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('API is currently unavailable');
  }
}
```

### TimeoutError
Thrown when requests timeout.

```typescript
try {
  await novitaApiService.getProducts();
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out');
  }
}
```

## Architecture

### Request Flow

1. **Request Queuing**: All requests go through a queue for rate limiting
2. **Rate Limiting**: Requests are spaced according to configured limits
3. **Circuit Breaker**: Requests are blocked if circuit is open
4. **HTTP Request**: Actual HTTP request with timeout and auth headers
5. **Response Processing**: Success/failure affects circuit breaker state
6. **Retry Logic**: Failed requests are retried with exponential backoff
7. **Error Handling**: Errors are categorized and wrapped in typed exceptions

### Components

- **NovitaClient**: Low-level HTTP client with all reliability features
- **NovitaApiService**: High-level service with business logic methods
- **CircuitBreaker**: Implements circuit breaker pattern
- **RateLimiter**: Manages request rate limiting
- **Error Classes**: Typed error hierarchy for different failure modes

## Testing

The client includes comprehensive unit tests covering:

- Request/response handling
- Error scenarios and retry logic
- Rate limiting behavior
- Circuit breaker state transitions
- Mock API responses

Run tests:
```bash
npm test -- --testPathPattern="novitaClient|novitaApiService"
```

## Best Practices

1. **Use the API Service**: Prefer `novitaApiService` over direct client usage
2. **Handle Errors Gracefully**: Always catch and handle specific error types
3. **Monitor Circuit Breaker**: Check circuit breaker state in health checks
4. **Respect Rate Limits**: The client handles this automatically, but be aware
5. **Use Correlation IDs**: All requests include correlation IDs for tracing
6. **Configure Timeouts**: Adjust timeouts based on your use case

## Examples

See `src/examples/httpClientExample.ts` for complete usage examples including:
- Basic API operations
- Error handling patterns
- Monitoring and observability
- Rate limiting demonstration
- Circuit breaker behavior