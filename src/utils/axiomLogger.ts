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
  metadata?: Record<string, any>;
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
    // Start with minimal base context
    const enriched: AxiomLogContext = {
      service: this.baseContext.service,
      version: this.baseContext.version,
      environment: this.baseContext.environment,
      timestamp: new Date().toISOString()
    };

    // Add only essential fields from base context
    if (this.baseContext.component) enriched.component = this.baseContext.component;
    if (this.baseContext.requestId) enriched.requestId = this.baseContext.requestId;
    if (this.baseContext.correlationId) enriched.correlationId = this.baseContext.correlationId;

    // Add only essential fields from context
    const essentialFields = [
      'component', 'action', 'operation', 'requestId', 'correlationId',
      'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
      'instanceId', 'errorType', 'tags'
    ];

    essentialFields.forEach(field => {
      if (context[field] !== undefined) {
        enriched[field] = context[field];
      }
    });

    // Add memory usage only if not already provided and not in context
    if (!enriched.memoryUsage && !context.memoryUsage) {
      enriched.memoryUsage = this.getMemoryUsage();
    }

    // Ensure tags is always an array
    if (context.tags && Array.isArray(context.tags)) {
      enriched.tags = context.tags;
    } else if (!enriched.tags) {
      enriched.tags = [];
    }

    // DO NOT add metadata to prevent Axiom column limit errors
    // All additional context is available in console logs

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