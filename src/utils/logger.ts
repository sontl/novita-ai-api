import winston from 'winston';
import { config } from '../config/config';

// Custom format for structured logging with correlation IDs
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, requestId, correlationId, ...meta }) => {
    const logEntry: any = {
      timestamp,
      level: level.toUpperCase(),
      service,
      message,
      ...meta
    };

    if (requestId) {
      logEntry.requestId = requestId;
    }
    
    if (correlationId) {
      logEntry.correlationId = correlationId;
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, correlationId, ...meta }) => {
    const prefix = requestId ? `[${requestId}]` : '';
    const correlation = correlationId ? `{${correlationId}}` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${prefix}${correlation} ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format: structuredFormat,
  defaultMeta: { 
    service: 'novita-gpu-instance-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.nodeEnv
  },
  transports: [
    // Always use structured format for file/production logging
    new winston.transports.Console({
      format: config.nodeEnv === 'production' ? structuredFormat : consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  ],
  exitOnError: false
});

// Enhanced logger interface with correlation ID support
export interface LogContext {
  requestId?: string | undefined;
  correlationId?: string | undefined;
  userId?: string | undefined;
  instanceId?: string | undefined;
  operation?: string | undefined;
  duration?: number | undefined;
  statusCode?: number | undefined;
  [key: string]: any;
}

// Enhanced logging methods with context support
export const createContextLogger = (context: LogContext = {}) => {
  return {
    error: (message: string, meta: any = {}) => {
      logger.error(message, { ...context, ...meta });
    },
    warn: (message: string, meta: any = {}) => {
      logger.warn(message, { ...context, ...meta });
    },
    info: (message: string, meta: any = {}) => {
      logger.info(message, { ...context, ...meta });
    },
    debug: (message: string, meta: any = {}) => {
      logger.debug(message, { ...context, ...meta });
    },
    http: (message: string, meta: any = {}) => {
      logger.http(message, { ...context, ...meta });
    }
  };
};

// Utility function to sanitize sensitive data from logs
export const sanitizeLogData = (data: any, visited = new WeakSet()): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle circular references
  if (visited.has(data)) {
    return '[Circular Reference]';
  }
  visited.add(data);

  const sensitiveFields = [
    'password', 'token', 'apiKey', 'secret', 'authorization', 'cookie',
    'x-api-key', 'x-auth-token', 'webhookUrl', 'novitaApiKey'
  ];

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  const sanitizeValue = (obj: any, key: string): any => {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      return '[REDACTED]';
    }
    
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      return sanitizeLogData(obj[key], visited);
    }
    
    return obj[key];
  };

  if (Array.isArray(sanitized)) {
    return sanitized.map(item => sanitizeLogData(item, visited));
  }

  Object.keys(sanitized).forEach(key => {
    sanitized[key] = sanitizeValue(sanitized, key);
  });

  return sanitized;
};

// Performance logging utility
export const logPerformance = (
  operation: string,
  startTime: number,
  context: LogContext = {}
): void => {
  const duration = Date.now() - startTime;
  const contextLogger = createContextLogger(context);
  
  if (duration > 5000) {
    contextLogger.warn('Slow operation detected', {
      operation,
      duration,
      threshold: 5000
    });
  } else {
    contextLogger.debug('Operation completed', {
      operation,
      duration
    });
  }
};

// Request/Response logging utility
export const logHttpRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  context: LogContext = {}
): void => {
  const contextLogger = createContextLogger(context);
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  contextLogger[level]('HTTP Request', {
    method,
    url,
    statusCode,
    duration,
    category: 'http_request'
  });
};