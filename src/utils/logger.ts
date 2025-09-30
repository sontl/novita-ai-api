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

// Axiom-optimized format that limits fields and flattens objects
const axiomFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    // Extract core fields for Axiom
    const axiomEntry: any = {
      timestamp: info.timestamp,
      level: info.level.toUpperCase(),
      message: info.message,
      service: info.service || 'novita-gpu-instance-api',
      environment: info.environment || 'development',
      version: info.version || '1.0.0'
    };

    // Add essential tracking fields
    if (info.requestId) axiomEntry.requestId = info.requestId;
    if (info.correlationId) axiomEntry.correlationId = info.correlationId;
    if (info.component) axiomEntry.component = info.component;
    if (info.feature) axiomEntry.feature = info.feature;
    if (info.action) axiomEntry.action = info.action;

    // Add performance metrics
    if (typeof info.responseTime === 'number') axiomEntry.responseTime = info.responseTime;
    if (typeof info.duration === 'number') axiomEntry.duration = info.duration;
    if (typeof info.memoryUsage === 'number') axiomEntry.memoryUsage = info.memoryUsage;

    // Add HTTP context (flattened)
    if (info.httpMethod) axiomEntry.httpMethod = info.httpMethod;
    if (info.httpUrl) axiomEntry.httpUrl = info.httpUrl;
    if (info.httpStatusCode) axiomEntry.httpStatusCode = info.httpStatusCode;
    if (info.httpUserAgent) axiomEntry.httpUserAgent = info.httpUserAgent;
    if (info.clientIp) axiomEntry.clientIp = info.clientIp;

    // Add business context
    if (info.instanceId) axiomEntry.instanceId = info.instanceId;
    if (info.customerId) axiomEntry.customerId = info.customerId;
    if (info.sessionId) axiomEntry.sessionId = info.sessionId;
    if (info.operation) axiomEntry.operation = info.operation;

    // Add error context
    if (info.errorType) axiomEntry.errorType = info.errorType;
    if (info.errorCode) axiomEntry.errorCode = info.errorCode;
    if (info.stack) axiomEntry.errorStack = info.stack;

    // Add tags as a single field (array or string)
    if (info.tags) {
      axiomEntry.tags = Array.isArray(info.tags) ? info.tags.join(',') : info.tags;
    }

    // Add metadata as a JSON string to avoid field explosion
    const metadata: any = {};
    Object.keys(info).forEach(key => {
      if (!axiomEntry.hasOwnProperty(key) && 
          !['timestamp', 'level', 'message', 'service', 'environment', 'version', 'hostname', 'pid'].includes(key)) {
        // Only include simple values in metadata to avoid field explosion
        if (typeof info[key] === 'string' || typeof info[key] === 'number' || typeof info[key] === 'boolean') {
          metadata[key] = info[key];
        } else if (info[key] && typeof info[key] === 'object') {
          // Convert complex objects to strings
          metadata[key] = JSON.stringify(info[key]).substring(0, 500); // Limit size
        }
      }
    });

    if (Object.keys(metadata).length > 0) {
      axiomEntry.metadata = JSON.stringify(metadata);
    }

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