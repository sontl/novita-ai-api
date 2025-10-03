import { logger, LogContext, sanitizeLogData } from './logger';

/**
 * Enhanced logging interface specifically designed for Axiom integration
 * Provides structured logging with consistent field naming and data enrichment
 */

export interface AxiomLogContext extends LogContext {
  // Application context
  component?: string;
  feature?: string;
  action?: string;

  // Business context
  customerId?: string;
  sessionId?: string;
  traceId?: string;

  // Performance metrics
  responseTime?: number;
  memoryUsage?: number;
  cpuUsage?: number;

  // Error context
  errorCode?: string;
  errorType?: string;
  stackTrace?: string;

  // API context
  apiVersion?: string;
  userAgent?: string;
  clientIp?: string;

  // Custom tags for filtering in Axiom
  tags?: string[];

  // Additional metadata
  metadata?: Record<string, any> | string;
}

/**
 * Axiom-optimized logger with enhanced structured logging
 */
export class AxiomLogger {
  private baseContext: AxiomLogContext;

  constructor(baseContext: AxiomLogContext = {}) {
    this.baseContext = {
      ...baseContext,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      service: 'novita-gpu-instance-api',
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(context: AxiomLogContext): AxiomLogger {
    return new AxiomLogger({
      ...this.baseContext,
      ...context
    });
  }

  /**
   * Log an error with enhanced context
   */
  error(message: string, context: AxiomLogContext = {}, error?: Error): void {
    const enrichedContext = this.enrichContext({
      ...context,
      level: 'error',
      ...(error && {
        errorType: error.constructor.name,
        stackTrace: error.stack,
        errorMessage: error.message
      })
    });

    logger.error(message, sanitizeLogData(enrichedContext));
  }

  /**
   * Log a warning with context
   */
  warn(message: string, context: AxiomLogContext = {}): void {
    const enrichedContext = this.enrichContext({
      ...context,
      level: 'warn'
    });

    logger.warn(message, sanitizeLogData(enrichedContext));
  }

  /**
   * Log info with context
   */
  info(message: string, context: AxiomLogContext = {}): void {
    const enrichedContext = this.enrichContext({
      ...context,
      level: 'info'
    });

    logger.info(message, sanitizeLogData(enrichedContext));
  }

  /**
   * Log debug information
   */
  debug(message: string, context: AxiomLogContext = {}): void {
    const enrichedContext = this.enrichContext({
      ...context,
      level: 'debug'
    });

    logger.debug(message, sanitizeLogData(enrichedContext));
  }

  /**
   * Log HTTP requests with standardized fields for Axiom dashboards
   */
  httpRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    context: AxiomLogContext = {}
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const enrichedContext = this.enrichContext({
      ...context,
      level,
      component: 'http',
      action: 'request',
      httpMethod: method,
      httpUrl: url,
      httpStatusCode: statusCode,
      responseTime,
      tags: ['http', 'request', ...(context.tags || [])]
    });

    logger[level](`HTTP ${method} ${url} - ${statusCode}`, sanitizeLogData(enrichedContext));
  }

  /**
   * Log business events for analytics
   */
  businessEvent(
    event: string,
    context: AxiomLogContext = {}
  ): void {
    const enrichedContext = this.enrichContext({
      ...context,
      level: 'info',
      component: 'business',
      action: 'event',
      eventName: event,
      tags: ['business', 'event', ...(context.tags || [])]
    });

    logger.info(`Business Event: ${event}`, sanitizeLogData(enrichedContext));
  }

  /**
   * Log performance metrics
   */
  performance(
    operation: string,
    duration: number,
    context: AxiomLogContext = {}
  ): void {
    const level = duration > 5000 ? 'warn' : 'info';
    const enrichedContext = this.enrichContext({
      ...context,
      level,
      component: 'performance',
      action: 'measurement',
      operation,
      duration,
      tags: ['performance', ...(context.tags || [])]
    });

    logger[level](`Performance: ${operation}`, sanitizeLogData(enrichedContext));
  }

  /**
   * Log security events
   */
  security(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: AxiomLogContext = {}
  ): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    const enrichedContext = this.enrichContext({
      ...context,
      level,
      component: 'security',
      action: 'event',
      securityEvent: event,
      securitySeverity: severity,
      tags: ['security', severity, ...(context.tags || [])]
    });

    logger[level](`Security Event: ${event}`, sanitizeLogData(enrichedContext));
  }

  /**
   * Enrich context with base context and additional metadata
   * Heavily optimized to prevent Axiom column limit errors
   */
  private enrichContext(context: AxiomLogContext): AxiomLogContext {
    // Define the EXACT set of allowed fields to prevent column limit errors
    const allowedFields = new Set([
      'service', 'version', 'environment', 'timestamp', 'level',
      'component', 'action', 'operation', 'requestId', 'correlationId',
      'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
      'instanceId', 'errorType', 'memoryUsage', 'tags', 'metadata'
    ]);

    // Start with minimal base context
    const enriched: AxiomLogContext = {
      service: this.baseContext.service,
      version: this.baseContext.version,
      environment: this.baseContext.environment,
      timestamp: new Date().toISOString()
    };

    // Collect all additional data into metadata
    const metadata: any = {};

    // Process base context
    Object.keys(this.baseContext).forEach(key => {
      if (allowedFields.has(key) && this.baseContext[key] !== undefined) {
        enriched[key] = this.baseContext[key];
      } else if (key !== 'service' && key !== 'version' && key !== 'environment' && key !== 'timestamp') {
        metadata[key] = this.baseContext[key];
      }
    });

    // Process current context
    Object.keys(context).forEach(key => {
      if (allowedFields.has(key) && context[key] !== undefined) {
        if (key === 'tags' && Array.isArray(context[key])) {
          enriched.tags = context[key];
        } else {
          enriched[key] = context[key];
        }
      } else {
        metadata[key] = context[key];
      }
    });

    // Add memory usage only if not already provided
    if (!enriched.memoryUsage && !context.memoryUsage) {
      enriched.memoryUsage = this.getMemoryUsage();
    }

    // Ensure tags is always an array
    if (!enriched.tags) {
      enriched.tags = [];
    }

    // Add metadata as JSON string if there's any additional data
    if (Object.keys(metadata).length > 0) {
      enriched.metadata = JSON.stringify(metadata);
    }

    return enriched;
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    try {
      return Math.round(process.memoryUsage().heapUsed / 1024 / 1024); // MB
    } catch {
      return 0;
    }
  }
}

/**
 * Default Axiom logger instance
 */
export const axiomLogger = new AxiomLogger();

/**
 * Create a logger for a specific component
 */
export const createComponentLogger = (component: string, feature?: string): AxiomLogger => {
  const context: AxiomLogContext = { component };
  if (feature) {
    context.feature = feature;
  }
  return new AxiomLogger(context);
};

/**
 * Create a logger for a specific request
 */
export const createRequestLogger = (requestId: string, correlationId?: string): AxiomLogger => {
  return new AxiomLogger({
    requestId,
    correlationId,
    component: 'request'
  });
};