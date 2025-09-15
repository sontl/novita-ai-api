import { Request, Response, NextFunction } from 'express';
import { createContextLogger, sanitizeLogData, logHttpRequest, LogContext } from '../utils/logger';

// Extended Request interface to store timing information
interface TimedRequest extends Request {
  startTime?: number;
  requestId?: string;
  correlationId?: string;
}

// Request/Response logging middleware
export const requestLoggerMiddleware = (
  req: TimedRequest,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  req.startTime = startTime;

  // Extract or generate request identifiers
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  const correlationId = req.headers['x-correlation-id'] as string;
  
  req.requestId = requestId;
  req.correlationId = correlationId;

  // Set response headers
  res.set('X-Request-ID', requestId);
  if (correlationId) {
    res.set('X-Correlation-ID', correlationId);
  }

  const context: LogContext = {
    requestId,
    correlationId,
    operation: `${req.method} ${req.path}`
  };

  const contextLogger = createContextLogger(context);

  // Log incoming request
  contextLogger.info('Incoming request', {
    method: req.method,
    url: req.url,
    path: req.path,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    ip: req.ip || req.connection.remoteAddress,
    query: sanitizeLogData(req.query),
    params: sanitizeLogData(req.params),
    headers: sanitizeLogData(req.headers),
    body: shouldLogBody(req) ? sanitizeLogData(req.body) : '[BODY_NOT_LOGGED]'
  });

  // Capture original res.json and res.send methods
  const originalJson = res.json;
  const originalSend = res.send;

  // Override res.json to log response
  res.json = function(body: any) {
    logResponse(req, res, body, contextLogger);
    return originalJson.call(this, body);
  };

  // Override res.send to log response
  res.send = function(body: any) {
    logResponse(req, res, body, contextLogger);
    return originalSend.call(this, body);
  };

  // Handle response finish event for cases where json/send aren't called
  res.on('finish', () => {
    if (!res.headersSent) {
      logResponse(req, res, null, contextLogger);
    }
  });

  next();
};

// Log response details
const logResponse = (
  req: TimedRequest,
  res: Response,
  body: any,
  contextLogger: ReturnType<typeof createContextLogger>
): void => {
  const duration = req.startTime ? Date.now() - req.startTime : 0;
  const statusCode = res.statusCode;

  // Determine log level based on status code
  const logLevel = statusCode >= 500 ? 'error' : 
                   statusCode >= 400 ? 'warn' : 
                   statusCode >= 300 ? 'info' : 'info';

  contextLogger[logLevel]('Outgoing response', {
    statusCode,
    duration,
    contentType: res.get('Content-Type'),
    contentLength: res.get('Content-Length'),
    responseBody: shouldLogResponseBody(req, res, statusCode) ? sanitizeLogData(body) : '[BODY_NOT_LOGGED]',
    headers: sanitizeLogData(res.getHeaders())
  });

  // Log HTTP request summary
  logHttpRequest(
    req.method,
    req.url,
    statusCode,
    duration,
    {
      requestId: req.requestId || undefined,
      correlationId: req.correlationId || undefined
    }
  );
};

// Determine if request body should be logged
const shouldLogBody = (req: Request): boolean => {
  // Don't log body for certain content types or large payloads
  const contentType = req.get('Content-Type') || '';
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);

  // Skip binary content types
  if (contentType.includes('multipart/form-data') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/')) {
    return false;
  }

  // Skip large payloads (> 10KB)
  if (contentLength > 10240) {
    return false;
  }

  // Skip health check endpoints
  if (req.path === '/health' || req.path.includes('/health')) {
    return false;
  }

  return true;
};

// Determine if response body should be logged
const shouldLogResponseBody = (req: Request, res: Response, statusCode: number): boolean => {
  // Always log error responses for debugging
  if (statusCode >= 400) {
    return true;
  }

  // Don't log large responses
  const contentLength = parseInt(res.get('Content-Length') || '0', 10);
  if (contentLength > 10240) {
    return false;
  }

  // Don't log binary responses
  const contentType = res.get('Content-Type') || '';
  if (contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/') ||
      contentType.includes('application/octet-stream')) {
    return false;
  }

  // Skip health check responses
  if (req.path === '/health' || req.path.includes('/health')) {
    return false;
  }

  return true;
};

// Generate unique request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

// Correlation ID middleware - generates correlation ID if not present
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.headers['x-correlation-id']) {
    req.headers['x-correlation-id'] = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  next();
};

// Performance monitoring middleware
export const performanceMiddleware = (
  req: TimedRequest,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const context: LogContext = {
      requestId: req.requestId || undefined,
      correlationId: req.correlationId || undefined,
      operation: `${req.method} ${req.path}`
    };

    const contextLogger = createContextLogger(context);

    // Log slow requests
    if (duration > 5000) {
      contextLogger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode,
        threshold: 5000
      });
    }

    // Log performance metrics
    contextLogger.debug('Request performance', {
      method: req.method,
      url: req.url,
      duration,
      statusCode: res.statusCode,
      category: 'performance'
    });
  });

  next();
};