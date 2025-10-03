import { logger } from './logger';

/**
 * Axiom-safe logging utility that prevents column limit errors
 * by consolidating all dynamic fields into a metadata object
 */

export interface SafeLogContext {
  // Core fields that are allowed as separate columns
  requestId?: string | string[] | undefined;
  correlationId?: string | undefined;
  component?: string | undefined;
  action?: string | undefined;
  operation?: string | undefined;
  httpMethod?: string | undefined;
  httpUrl?: string | undefined;
  httpStatusCode?: number | undefined;
  responseTime?: number | undefined;
  duration?: number | string | undefined;
  instanceId?: string | undefined;
  errorType?: string | undefined;
  memoryUsage?: number | undefined;
  tags?: string[] | undefined;
  
  // All other fields go into metadata
  [key: string]: any;
}

/**
 * Process log context to ensure Axiom compatibility
 */
function processLogContext(context: SafeLogContext): any {
  const allowedFields = new Set([
    'requestId', 'correlationId', 'component', 'action', 'operation',
    'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
    'instanceId', 'errorType', 'memoryUsage', 'tags'
  ]);

  const processed: any = {};
  const metadata: any = {};

  Object.keys(context).forEach(key => {
    if (allowedFields.has(key)) {
      let value = context[key];
      // Handle special cases
      if (key === 'requestId' && Array.isArray(value)) {
        value = value[0]; // Take first value if array
      }
      processed[key] = value;
    } else {
      metadata[key] = context[key];
    }
  });

  // Add metadata as JSON string if there's any additional data
  if (Object.keys(metadata).length > 0) {
    processed.metadata = JSON.stringify(metadata);
  }

  return processed;
}

/**
 * Axiom-safe logger that prevents column limit errors
 */
export const axiomSafeLogger = {
  info: (message: string, context: SafeLogContext = {}) => {
    logger.info(message, processLogContext(context));
  },

  warn: (message: string, context: SafeLogContext = {}) => {
    logger.warn(message, processLogContext(context));
  },

  error: (message: string, context: SafeLogContext = {}, error?: Error) => {
    const processedContext = processLogContext({
      ...context,
      ...(error && {
        errorType: error.constructor.name,
        errorMessage: error.message,
        stackTrace: error.stack
      })
    });
    logger.error(message, processedContext);
  },

  debug: (message: string, context: SafeLogContext = {}) => {
    logger.debug(message, processLogContext(context));
  },

  /**
   * Log HTTP requests with standardized fields
   */
  httpRequest: (
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    context: SafeLogContext = {}
  ) => {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const processedContext = processLogContext({
      ...context,
      component: 'http',
      action: 'request',
      httpMethod: method,
      httpUrl: url,
      httpStatusCode: statusCode,
      responseTime,
      tags: ['http', 'request', ...(context.tags || [])]
    });

    logger[level](`HTTP ${method} ${url} - ${statusCode}`, processedContext);
  },

  /**
   * Log business events
   */
  businessEvent: (event: string, context: SafeLogContext = {}) => {
    const processedContext = processLogContext({
      ...context,
      component: 'business',
      action: 'event',
      eventName: event,
      tags: ['business', 'event', ...(context.tags || [])]
    });

    logger.info(`Business Event: ${event}`, processedContext);
  },

  /**
   * Log performance metrics
   */
  performance: (operation: string, duration: number, context: SafeLogContext = {}) => {
    const level = duration > 5000 ? 'warn' : 'info';
    const processedContext = processLogContext({
      ...context,
      component: 'performance',
      action: 'measurement',
      operation,
      duration,
      tags: ['performance', ...(context.tags || [])]
    });

    logger[level](`Performance: ${operation}`, processedContext);
  }
};

/**
 * Create a component-specific logger
 */
export const createAxiomSafeLogger = (component: string, baseContext: SafeLogContext = {}) => {
  const contextWithComponent = { ...baseContext, component };
  
  return {
    info: (message: string, context: SafeLogContext = {}) => {
      axiomSafeLogger.info(message, { ...contextWithComponent, ...context });
    },

    warn: (message: string, context: SafeLogContext = {}) => {
      axiomSafeLogger.warn(message, { ...contextWithComponent, ...context });
    },

    error: (message: string, context: SafeLogContext = {}, error?: Error) => {
      axiomSafeLogger.error(message, { ...contextWithComponent, ...context }, error);
    },

    debug: (message: string, context: SafeLogContext = {}) => {
      axiomSafeLogger.debug(message, { ...contextWithComponent, ...context });
    },

    httpRequest: (
      method: string,
      url: string,
      statusCode: number,
      responseTime: number,
      context: SafeLogContext = {}
    ) => {
      axiomSafeLogger.httpRequest(method, url, statusCode, responseTime, {
        ...contextWithComponent,
        ...context
      });
    },

    businessEvent: (event: string, context: SafeLogContext = {}) => {
      axiomSafeLogger.businessEvent(event, { ...contextWithComponent, ...context });
    },

    performance: (operation: string, duration: number, context: SafeLogContext = {}) => {
      axiomSafeLogger.performance(operation, duration, { ...contextWithComponent, ...context });
    }
  };
};