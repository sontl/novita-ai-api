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
  NOVITA_API_ERROR = 'NOVITA_API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
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
  constructor(instanceId: string) {
    super(`Instance with ID '${instanceId}' not found`);
    this.name = 'InstanceNotFoundError';
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
        error instanceof RateLimitError) {
      return error.message;
    }
    return 'An internal server error occurred';
  }
  
  return error.message;
}