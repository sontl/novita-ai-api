import winston from 'winston';
const { WinstonTransport } = require('@axiomhq/winston');
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

// Create transports array
const transports: winston.transport[] = [
  // Console transport - always present
  new winston.transports.Console({
    format: config.nodeEnv === 'production' ? structuredFormat : consoleFormat,
    handleExceptions: true,
    handleRejections: true
  })
];

// Axiom-optimized format with ultra-strict field limiting to prevent column limit errors
const axiomFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    // Ultra-minimal set of fields to prevent column limit errors
    const axiomEntry: any = {
      timestamp: info.timestamp,
      level: info.level.toUpperCase(),
      message: info.message,
      service: info.service || 'novita-gpu-instance-api',
      environment: info.environment || 'development'
    };

    // Add only the most essential fields
    if (info.requestId) axiomEntry.requestId = info.requestId;
    if (info.correlationId) axiomEntry.correlationId = info.correlationId;
    if (info.component) axiomEntry.component = info.component;
    if (info.httpMethod) axiomEntry.httpMethod = info.httpMethod;
    if (info.httpUrl) axiomEntry.httpUrl = info.httpUrl;
    if (info.httpStatusCode) axiomEntry.httpStatusCode = info.httpStatusCode;
    if (typeof info.responseTime === 'number') axiomEntry.responseTime = info.responseTime;
    if (info.instanceId) axiomEntry.instanceId = info.instanceId;
    if (info.errorType) axiomEntry.errorType = info.errorType;

    // Convert tags to a single string
    if (info.tags && Array.isArray(info.tags)) {
      axiomEntry.tags = info.tags.join(',');
    }

    // DO NOT add metadata field to prevent column limit errors
    // All other information is available in console logs

    return JSON.stringify(axiomEntry);
  })
);

// Add Axiom transport if configured
if (process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
  try {
    transports.push(
      new WinstonTransport({
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
        orgId: process.env.AXIOM_ORG_ID, // Optional: only needed for personal tokens
        format: axiomFormat
      })
    );
    console.log('✅ Axiom transport initialized successfully');
  } catch (error) {
    console.warn('⚠️  Failed to initialize Axiom transport:', (error as Error).message);
    console.warn('   Continuing with console logging only');
  }
}

export const logger = winston.createLogger({
  level: config.logLevel,
  format: structuredFormat,
  defaultMeta: { 
    service: 'novita-gpu-instance-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.nodeEnv,
    hostname: process.env.HOSTNAME || require('os').hostname(),
    pid: process.pid
  },
  transports,
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

// Utility function to limit log fields for Axiom compatibility
export const limitLogFields = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Define allowed fields to prevent Axiom column limit errors
  const allowedFields = [
    'requestId', 'correlationId', 'component', 'action', 'operation',
    'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
    'instanceId', 'errorType', 'memoryUsage', 'tags', 'count', 'status'
  ];

  const limited: any = {};
  const metadata: any = {};

  Object.keys(data).forEach(key => {
    if (allowedFields.includes(key)) {
      limited[key] = data[key];
    } else {
      // Put non-essential fields in metadata
      metadata[key] = data[key];
    }
  });

  // Add metadata as a single field if there's any
  if (Object.keys(metadata).length > 0) {
    limited.metadata = metadata;
  }

  return limited;
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