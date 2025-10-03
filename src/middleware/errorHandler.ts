import { Request, Response, NextFunction } from 'express';
import { createContextLogger, sanitizeLogData, LogContext } from '../utils/logger';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('error-handler');
import { 
  NovitaApiClientError, 
  RateLimitError, 
  CircuitBreakerError, 
  TimeoutError,
  ErrorResponse 
} from '../types/api';
import { 
  ValidationError, 
  InstanceNotFoundError, 
  InstanceNotStartableError,
  ServiceError,
  ErrorCode 
} from '../utils/errorHandler';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

// Error categorization for better handling
export enum ErrorCategory {
  CLIENT_ERROR = 'CLIENT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CIRCUIT_BREAKER_ERROR = 'CIRCUIT_BREAKER_ERROR'
}

// Enhanced error classification
const classifyError = (error: Error): { 
  statusCode: number; 
  errorCode: string; 
  category: ErrorCategory;
  isRetryable: boolean;
} => {
  // Validation errors
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
      category: ErrorCategory.VALIDATION_ERROR,
      isRetryable: false
    };
  }

  // Not found errors
  if (error instanceof InstanceNotFoundError) {
    return {
      statusCode: 404,
      errorCode: ErrorCode.INSTANCE_NOT_FOUND,
      category: ErrorCategory.CLIENT_ERROR,
      isRetryable: false
    };
  }

  // Instance not startable errors
  if (error instanceof InstanceNotStartableError) {
    return {
      statusCode: 400,
      errorCode: ErrorCode.INSTANCE_NOT_STARTABLE,
      category: ErrorCategory.CLIENT_ERROR,
      isRetryable: false
    };
  }

  // Rate limit errors
  if (error instanceof RateLimitError) {
    return {
      statusCode: 429,
      errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
      category: ErrorCategory.RATE_LIMIT_ERROR,
      isRetryable: true
    };
  }

  // Circuit breaker errors
  if (error instanceof CircuitBreakerError) {
    return {
      statusCode: 503,
      errorCode: ErrorCode.CIRCUIT_BREAKER_OPEN,
      category: ErrorCategory.CIRCUIT_BREAKER_ERROR,
      isRetryable: true
    };
  }

  // Timeout errors
  if (error instanceof TimeoutError) {
    return {
      statusCode: 408,
      errorCode: ErrorCode.REQUEST_TIMEOUT,
      category: ErrorCategory.TIMEOUT_ERROR,
      isRetryable: true
    };
  }

  // Novita API errors
  if (error instanceof NovitaApiClientError) {
    const statusCode = error.statusCode || 500;
    return {
      statusCode,
      errorCode: error.code || ErrorCode.NOVITA_API_ERROR,
      category: statusCode >= 500 ? ErrorCategory.EXTERNAL_API_ERROR : ErrorCategory.CLIENT_ERROR,
      isRetryable: statusCode >= 500 || statusCode === 429
    };
  }

  // Service errors
  if (error instanceof ServiceError) {
    return {
      statusCode: error.statusCode,
      errorCode: error.code,
      category: error.statusCode >= 500 ? ErrorCategory.SERVER_ERROR : ErrorCategory.CLIENT_ERROR,
      isRetryable: error.statusCode >= 500
    };
  }

  // Authentication/Authorization errors
  if (error.message.toLowerCase().includes('unauthorized') || error.message.toLowerCase().includes('authentication')) {
    return {
      statusCode: 401,
      errorCode: ErrorCode.UNAUTHORIZED,
      category: ErrorCategory.AUTHENTICATION_ERROR,
      isRetryable: false
    };
  }

  if (error.message.toLowerCase().includes('forbidden') || error.message.toLowerCase().includes('permission')) {
    return {
      statusCode: 403,
      errorCode: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION_ERROR,
      isRetryable: false
    };
  }

  // Default to internal server error
  return {
    statusCode: 500,
    errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
    category: ErrorCategory.SERVER_ERROR,
    isRetryable: false
  };
};

// Enhanced error handler middleware
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  const correlationId = req.headers['x-correlation-id'] as string;
  
  const context: LogContext = {
    requestId,
    correlationId,
    operation: `${req.method} ${req.path}`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  };

  const contextLogger = createContextLogger(context);
  const { statusCode, errorCode, category, isRetryable } = classifyError(error);

  // Sanitize request data for logging
  const sanitizedBody = sanitizeLogData(req.body);
  const sanitizedQuery = sanitizeLogData(req.query);
  const sanitizedParams = sanitizeLogData(req.params);

  // Log error with appropriate level and context
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  contextLogger[logLevel]('Request error occurred', {
    errorType: error.name,
    httpMethod: req.method,
    httpUrl: req.url,
    httpStatusCode: statusCode
  });

  // Handle special error types
  if (error instanceof RateLimitError && (error as RateLimitError).retryAfter) {
    res.set('Retry-After', (error as RateLimitError).retryAfter!.toString());
  }

  // Add security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');

  // Build error response
  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message: getSafeErrorMessage(error, statusCode),
      timestamp: new Date().toISOString(),
      requestId,
      ...(correlationId && { correlationId })
    }
  };

  // Include additional details in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    if (error instanceof ValidationError && error.details) {
      (errorResponse.error as any).validationErrors = error.details;
    }
    
    if (error instanceof ServiceError && error.details) {
      errorResponse.error.details = error.details;
    }

    if (process.env.NODE_ENV === 'development' && error.stack) {
      (errorResponse.error as any).stack = error.stack;
    }
  }

  // Add retry information for retryable errors
  if (isRetryable) {
    (errorResponse.error as any).retryable = true;
    if (error instanceof RateLimitError && (error as RateLimitError).retryAfter) {
      (errorResponse.error as any).retryAfter = (error as RateLimitError).retryAfter;
    }
  }

  res.status(statusCode).json(errorResponse);
};

// Enhanced 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  const correlationId = req.headers['x-correlation-id'] as string;
  
  const context: LogContext = {
    requestId,
    correlationId,
    operation: `${req.method} ${req.path}`
  };

  const contextLogger = createContextLogger(context);
  
  contextLogger.warn('Route not found', {
    method: req.method,
    url: req.url,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  const errorResponse: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      requestId,
      ...(correlationId && { correlationId })
    }
  };

  res.status(404).json(errorResponse);
};

// Utility function to get safe error messages
const getSafeErrorMessage = (error: Error, statusCode: number): string => {
  // In production, sanitize error messages for security
  if (process.env.NODE_ENV === 'production') {
    // Allow user-facing error messages
    if (error instanceof ValidationError || 
        error instanceof InstanceNotFoundError ||
        error instanceof InstanceNotStartableError ||
        error instanceof RateLimitError ||
        statusCode < 500) {
      return error.message;
    }
    
    // Generic message for server errors
    return 'An internal server error occurred';
  }
  
  return error.message;
};