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
    // Define the EXACT set of allowed fields to prevent column limit errors
    const allowedFields = new Set([
      'timestamp', 'level', 'message', 'service', 'environment', 'version',
      'requestId', 'correlationId', 'component', 'action', 'operation',
      'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
      'instanceId', 'errorType', 'memoryUsage', 'tags', 'metadata'
    ]);

    // Ultra-minimal set of fields to prevent column limit errors
    const axiomEntry: any = {
      timestamp: info.timestamp,
      level: info.level.toUpperCase(),
      message: info.message,
      service: info.service || 'novita-gpu-instance-api',
      environment: info.environment || 'development',
      version: info.version || '1.0.0'
    };

    // Collect all additional data into metadata
    const metadata: any = {};

    // Process all fields from the log entry
    Object.keys(info).forEach(key => {
      if (key === 'timestamp' || key === 'level' || key === 'message' ||
        key === 'service' || key === 'environment' || key === 'version') {
        return; // Already handled above
      }

      if (allowedFields.has(key) && info[key] !== undefined) {
        // Add essential fields directly
        if (key === 'tags' && Array.isArray(info[key])) {
          axiomEntry.tags = info[key].join(',');
        } else {
          axiomEntry[key] = info[key];
        }
      } else {
        // Everything else goes into metadata
        metadata[key] = info[key];
      }
    });

    // Add metadata as a single JSON string if there's any additional data
    if (Object.keys(metadata).length > 0) {
      axiomEntry.metadata = JSON.stringify(metadata);
    }

    return JSON.stringify(axiomEntry);
  })
);

// Global handler for Axiom SDK errors (which may escape the transport error handler)
// This prevents "ingest limit exceeded" errors from crashing the app
const handleAxiomError = (error: Error) => {
  if (error.message?.includes('ingest limit exceeded') ||
    error.stack?.includes('@axiomhq')) {
    const now = Date.now();
    const lastAxiomErrorTime = (global as any).__lastAxiomErrorTime || 0;
    if (now - lastAxiomErrorTime > 60000) { // Log at most once per minute
      (global as any).__lastAxiomErrorTime = now;
      console.warn(`⚠️  Axiom error (suppressed): ${error.message}`);
      console.warn('   You have exceeded your Axiom data ingestion quota.');
      console.warn('   To disable Axiom: remove AXIOM_DATASET and AXIOM_TOKEN environment variables.');
    }
    return true; // Indicate this error was handled
  }
  return false;
};

// Install global handlers for Axiom errors that escape the transport
process.on('unhandledRejection', (reason: any) => {
  if (reason instanceof Error && handleAxiomError(reason)) {
    return; // Error was handled, don't rethrow
  }
  // Let other unhandled rejections propagate normally
  console.error('Unhandled Rejection:', reason);
});

// Add Axiom transport if configured
// Note: Axiom transport includes error handling for "ingest limit exceeded" errors
if (process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
  try {
    const axiomTransport = new WinstonTransport({
      dataset: process.env.AXIOM_DATASET,
      token: process.env.AXIOM_TOKEN,
      orgId: process.env.AXIOM_ORG_ID, // Optional: only needed for personal tokens
      format: axiomFormat,
      handleExceptions: false, // Don't let Axiom errors crash the app
      handleRejections: false
    });

    // Add error handler to prevent "ingest limit exceeded" errors from crashing the app
    axiomTransport.on('error', (error: Error) => {
      handleAxiomError(error);
    });

    transports.push(axiomTransport);
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

  // Define the EXACT set of allowed fields to prevent Axiom column limit errors
  const allowedFields = new Set([
    'requestId', 'correlationId', 'component', 'action', 'operation',
    'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
    'instanceId', 'errorType', 'memoryUsage', 'tags', 'metadata'
  ]);

  const limited: any = {};
  const metadata: any = {};

  Object.keys(data).forEach(key => {
    if (allowedFields.has(key)) {
      limited[key] = data[key];
    } else {
      // Put non-essential fields in metadata
      metadata[key] = data[key];
    }
  });

  // Add metadata as a JSON string if there's any
  if (Object.keys(metadata).length > 0) {
    limited.metadata = JSON.stringify(metadata);
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