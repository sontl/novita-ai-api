import { Request, Response, NextFunction } from 'express';
import { 
  ErrorResponse, 
  ValidationErrorResponse, 
  ValidationErrorDetail,
  NovitaApiClientError,
  RateLimitError,
  CircuitBreakerError,
  TimeoutError 
} from '../types/api';
import { ValidationResult } from '../types/validation';
// Simple UUID generator
function generateRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Error codes for different error types
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_NOT_STARTABLE = 'INSTANCE_NOT_STARTABLE',
  NOVITA_API_ERROR = 'NOVITA_API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  // Startup operation specific error codes
  STARTUP_TIMEOUT = 'STARTUP_TIMEOUT',
  STARTUP_FAILED = 'STARTUP_FAILED',
  HEALTH_CHECK_TIMEOUT = 'HEALTH_CHECK_TIMEOUT',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  STARTUP_OPERATION_IN_PROGRESS = 'STARTUP_OPERATION_IN_PROGRESS',
  STARTUP_OPERATION_NOT_FOUND = 'STARTUP_OPERATION_NOT_FOUND',
  RESOURCE_CONSTRAINTS = 'RESOURCE_CONSTRAINTS',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

// Custom error classes
export class ValidationError extends Error {
  constructor(
    message: string,
    public details: ValidationErrorDetail[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class InstanceNotFoundError extends Error {
  constructor(public identifier: string, public searchType: 'id' | 'name' = 'id') {
    super(`Instance not found: ${identifier} (searched by ${searchType})`);
    this.name = 'InstanceNotFoundError';
  }
}

export class InstanceNotStartableError extends Error {
  constructor(
    public instanceId: string,
    public currentStatus: string,
    public reason: string
  ) {
    super(`Instance ${instanceId} cannot be started: ${reason} (current status: ${currentStatus})`);
    this.name = 'InstanceNotStartableError';
  }
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = ErrorCode.INTERNAL_SERVER_ERROR,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Startup operation specific error classes
export class StartupTimeoutError extends Error {
  constructor(
    public instanceId: string,
    public timeoutMs: number,
    public phase: 'startup' | 'health_check' = 'startup'
  ) {
    super(`Instance ${instanceId} startup timeout after ${timeoutMs}ms during ${phase} phase`);
    this.name = 'StartupTimeoutError';
  }
}

export class StartupFailedError extends Error {
  constructor(
    public instanceId: string,
    public reason: string,
    public phase: 'startup' | 'health_check' | 'api_call' = 'startup',
    public retryable: boolean = true
  ) {
    super(`Instance ${instanceId} startup failed during ${phase}: ${reason}`);
    this.name = 'StartupFailedError';
  }
}

export class HealthCheckTimeoutError extends Error {
  constructor(
    public instanceId: string,
    public timeoutMs: number,
    public endpointCount: number
  ) {
    super(`Health check timeout for instance ${instanceId} after ${timeoutMs}ms (${endpointCount} endpoints)`);
    this.name = 'HealthCheckTimeoutError';
  }
}

export class HealthCheckFailedError extends Error {
  constructor(
    public instanceId: string,
    public failedEndpoints: number,
    public totalEndpoints: number,
    public lastError?: string
  ) {
    super(`Health check failed for instance ${instanceId}: ${failedEndpoints}/${totalEndpoints} endpoints failed${lastError ? ` (${lastError})` : ''}`);
    this.name = 'HealthCheckFailedError';
  }
}

export class StartupOperationInProgressError extends Error {
  constructor(
    public instanceId: string,
    public operationId: string,
    public currentPhase: string
  ) {
    super(`Startup operation already in progress for instance ${instanceId} (operation: ${operationId}, phase: ${currentPhase})`);
    this.name = 'StartupOperationInProgressError';
  }
}

export class ResourceConstraintsError extends Error {
  constructor(
    public instanceId: string,
    public resourceType: string,
    public suggestion?: string
  ) {
    super(`Resource constraints prevented startup of instance ${instanceId}: ${resourceType}${suggestion ? ` - ${suggestion}` : ''}`);
    this.name = 'ResourceConstraintsError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Error response builders
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  requestId?: string
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: requestId || generateRequestId()
    }
  };
}

export function createValidationErrorResponse(
  validationErrors: ValidationErrorDetail[],
  requestId?: string
): ValidationErrorResponse {
  return {
    error: {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: undefined,
      timestamp: new Date().toISOString(),
      requestId: requestId || generateRequestId(),
      validationErrors
    }
  };
}

// Validation result handler
export function handleValidationResult<T>(
  result: ValidationResult<T>,
  requestId?: string
): T {
  if (result.error) {
    throw new ValidationError(result.error.message, result.error.details);
  }
  return result.value;
}

// HTTP status code mapping
export function getHttpStatusCode(error: Error): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof InstanceNotFoundError) return 404;
  if (error instanceof InstanceNotStartableError) return 400;
  if (error instanceof StartupOperationInProgressError) return 409;
  if (error instanceof StartupTimeoutError) return 408;
  if (error instanceof StartupFailedError) return 500;
  if (error instanceof HealthCheckTimeoutError) return 408;
  if (error instanceof HealthCheckFailedError) return 503;
  if (error instanceof ResourceConstraintsError) return 503;
  if (error instanceof NetworkError) return error.retryable ? 503 : 500;
  if (error instanceof RateLimitError) return 429;
  if (error instanceof CircuitBreakerError) return 503;
  if (error instanceof TimeoutError) return 408;
  if (error instanceof NovitaApiClientError) {
    return error.statusCode || 500;
  }
  if (error instanceof ServiceError) return error.statusCode;
  return 500;
}

// Error code mapping
export function getErrorCode(error: Error): string {
  if (error instanceof ValidationError) return ErrorCode.VALIDATION_ERROR;
  if (error instanceof InstanceNotFoundError) return ErrorCode.INSTANCE_NOT_FOUND;
  if (error instanceof InstanceNotStartableError) return ErrorCode.INSTANCE_NOT_STARTABLE;
  if (error instanceof StartupOperationInProgressError) return ErrorCode.STARTUP_OPERATION_IN_PROGRESS;
  if (error instanceof StartupTimeoutError) return ErrorCode.STARTUP_TIMEOUT;
  if (error instanceof StartupFailedError) return ErrorCode.STARTUP_FAILED;
  if (error instanceof HealthCheckTimeoutError) return ErrorCode.HEALTH_CHECK_TIMEOUT;
  if (error instanceof HealthCheckFailedError) return ErrorCode.HEALTH_CHECK_FAILED;
  if (error instanceof ResourceConstraintsError) return ErrorCode.RESOURCE_CONSTRAINTS;
  if (error instanceof NetworkError) return ErrorCode.NETWORK_ERROR;
  if (error instanceof RateLimitError) return ErrorCode.RATE_LIMIT_EXCEEDED;
  if (error instanceof CircuitBreakerError) return ErrorCode.CIRCUIT_BREAKER_OPEN;
  if (error instanceof TimeoutError) return ErrorCode.REQUEST_TIMEOUT;
  if (error instanceof NovitaApiClientError) {
    return error.code || ErrorCode.NOVITA_API_ERROR;
  }
  if (error instanceof ServiceError) return error.code;
  return ErrorCode.INTERNAL_SERVER_ERROR;
}

// Express error handler middleware
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  const statusCode = getHttpStatusCode(error);
  const errorCode = getErrorCode(error);

  // Log error details
  console.error(`[${requestId}] Error:`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    statusCode,
    errorCode,
    url: req.url,
    method: req.method
  });

  // Handle validation errors specially
  if (error instanceof ValidationError) {
    const response = createValidationErrorResponse(error.details, requestId);
    res.status(statusCode).json(response);
    return;
  }

  // Handle rate limit errors with retry-after header
  if (error instanceof RateLimitError && error.retryAfter) {
    res.set('Retry-After', error.retryAfter.toString());
  }

  // Handle startup operation errors with additional context
  if (error instanceof StartupOperationInProgressError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        instanceId: error.instanceId,
        operationId: error.operationId,
        currentPhase: error.currentPhase,
        retryable: false
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Handle startup timeout errors with retry information
  if (error instanceof StartupTimeoutError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        instanceId: error.instanceId,
        timeoutMs: error.timeoutMs,
        phase: error.phase,
        retryable: true,
        suggestion: 'Consider increasing timeout values or checking instance configuration'
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Handle startup failed errors with retry information
  if (error instanceof StartupFailedError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        instanceId: error.instanceId,
        reason: error.reason,
        phase: error.phase,
        retryable: error.retryable
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Handle health check errors with endpoint details
  if (error instanceof HealthCheckFailedError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        instanceId: error.instanceId,
        failedEndpoints: error.failedEndpoints,
        totalEndpoints: error.totalEndpoints,
        lastError: error.lastError,
        retryable: true,
        suggestion: 'Check application startup logs and endpoint configuration'
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Handle resource constraint errors with suggestions
  if (error instanceof ResourceConstraintsError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        instanceId: error.instanceId,
        resourceType: error.resourceType,
        suggestion: error.suggestion || 'Try again later or use a different instance configuration',
        retryable: true
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Handle network errors with retry information
  if (error instanceof NetworkError) {
    const response = createErrorResponse(
      errorCode,
      error.message,
      {
        code: error.code,
        retryable: error.retryable,
        suggestion: error.retryable ? 'Network issue detected, please retry the operation' : 'Network configuration issue, please check connectivity'
      },
      requestId
    );
    res.status(statusCode).json(response);
    return;
  }

  // Create standard error response
  const response = createErrorResponse(
    errorCode,
    error.message,
    error instanceof ServiceError ? error.details : undefined,
    requestId
  );

  res.status(statusCode).json(response);
}

// Async error wrapper for route handlers
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Request ID middleware
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.set('X-Request-ID', requestId);
  next();
}

// Error logging utility
export function logError(error: Error, context?: any): void {
  console.error('Error occurred:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context
  });
}

// Safe error message extraction (avoid exposing sensitive info)
export function getSafeErrorMessage(error: Error): string {
  // In production, don't expose internal error details
  if (process.env.NODE_ENV === 'production') {
    if (error instanceof ValidationError || 
        error instanceof InstanceNotFoundError ||
        error instanceof InstanceNotStartableError ||
        error instanceof StartupOperationInProgressError ||
        error instanceof StartupTimeoutError ||
        error instanceof StartupFailedError ||
        error instanceof HealthCheckTimeoutError ||
        error instanceof HealthCheckFailedError ||
        error instanceof ResourceConstraintsError ||
        error instanceof NetworkError ||
        error instanceof RateLimitError) {
      return error.message;
    }
    return 'An internal server error occurred';
  }
  
  return error.message;
}

// Startup operation error utilities
export function createStartupErrorContext(
  instanceId: string,
  operationId?: string,
  phase?: string,
  elapsedTime?: number
): Record<string, any> {
  return {
    instanceId,
    ...(operationId && { operationId }),
    ...(phase && { phase }),
    ...(elapsedTime && { elapsedTimeMs: elapsedTime }),
    timestamp: new Date().toISOString()
  };
}

export function isRetryableStartupError(error: Error): boolean {
  if (error instanceof StartupFailedError) return error.retryable;
  if (error instanceof NetworkError) return error.retryable;
  if (error instanceof StartupTimeoutError) return true;
  if (error instanceof HealthCheckTimeoutError) return true;
  if (error instanceof HealthCheckFailedError) return true;
  if (error instanceof ResourceConstraintsError) return true;
  if (error instanceof RateLimitError) return true;
  if (error instanceof CircuitBreakerError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof NovitaApiClientError) {
    // Retry on server errors but not client errors
    return error.statusCode ? error.statusCode >= 500 : false;
  }
  return false;
}

export function getStartupErrorSuggestion(error: Error): string | undefined {
  if (error instanceof StartupTimeoutError) {
    return 'Consider increasing timeout values or checking instance configuration';
  }
  if (error instanceof HealthCheckFailedError) {
    return 'Check application startup logs and endpoint configuration';
  }
  if (error instanceof ResourceConstraintsError) {
    return error.suggestion || 'Try again later or use a different instance configuration';
  }
  if (error instanceof NetworkError && error.retryable) {
    return 'Network issue detected, please retry the operation';
  }
  if (error instanceof RateLimitError) {
    return 'Rate limit exceeded, please wait before retrying';
  }
  return undefined;
}