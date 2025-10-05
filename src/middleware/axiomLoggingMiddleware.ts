import { Request, Response, NextFunction } from 'express';
import { createRequestLogger, AxiomLogContext } from '../utils/axiomLogger';

/**
 * Enhanced request interface with logging context
 */
export interface RequestWithLogging extends Request {
  logger: ReturnType<typeof createRequestLogger>;
  requestId: string;
  correlationId: string;
  startTime: number;
}

/**
 * Middleware to add Axiom-optimized logging to all requests
 */
// Simple UUID generator to avoid ES module issues
function generateRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const axiomLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestWithLogging = req as RequestWithLogging;

  // Generate unique identifiers
  requestWithLogging.requestId = generateRequestId();
  requestWithLogging.correlationId = requestWithLogging.headers['x-correlation-id'] as string || generateRequestId();
  requestWithLogging.startTime = Date.now();

  // Create request-specific logger
  requestWithLogging.logger = createRequestLogger(requestWithLogging.requestId, requestWithLogging.correlationId);

  // Extract minimal request context to avoid field explosion
  const requestContext: AxiomLogContext = {
    httpMethod: requestWithLogging.method,
    httpUrl: requestWithLogging.originalUrl || requestWithLogging.url,
    tags: ['http', 'incoming']
  };

  // Additional context is available in console logs only

  // Log incoming request with minimal context
  requestWithLogging.logger.info('Incoming HTTP request', requestContext);

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any, cb?: any): any {
    const responseTime = Date.now() - requestWithLogging.startTime;

    // Log outgoing response with minimal context
    const responseContext: AxiomLogContext = {
      tags: ['http', 'outgoing']
    };

    // Additional response context is available in console logs only

    requestWithLogging.logger.httpRequest(
      requestWithLogging.method,
      requestWithLogging.originalUrl || requestWithLogging.url,
      res.statusCode,
      responseTime,
      responseContext
    );

    // Log slow requests as performance events
    if (responseTime > 1000) {
      requestWithLogging.logger.performance('http_request', responseTime, {
        httpMethod: requestWithLogging.method,
        httpUrl: requestWithLogging.originalUrl || requestWithLogging.url,
        httpStatusCode: res.statusCode,
        tags: ['slow_request']
      });
    }

    // Call original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  // Continue to next middleware
  next();
};

/**
 * Error handling middleware with Axiom logging
 */
export const axiomErrorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestWithLogging = req as RequestWithLogging;
  const responseTime = Date.now() - (requestWithLogging.startTime || Date.now());

  // Log error with full context
  if (requestWithLogging.logger) {
    requestWithLogging.logger.error('Unhandled request error', {
      httpMethod: requestWithLogging.method,
      httpUrl: requestWithLogging.originalUrl || requestWithLogging.url,
      httpStatusCode: res.statusCode || 500,
      responseTime,
      errorType: error.constructor.name,
      tags: ['http', 'error', 'unhandled']
    }, error);
  }

  // Send error response
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      requestId: requestWithLogging.requestId,
      timestamp: new Date().toISOString()
    });
  }

  // Only call next if headers haven't been sent
  if (!res.headersSent) {
    next(error);
  }
};