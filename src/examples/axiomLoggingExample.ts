/**
 * Example demonstrating Axiom logging integration
 * This file shows how to use the enhanced logging features for better observability
 */

import { axiomLogger, createComponentLogger, createRequestLogger } from '../utils/axiomLogger';

/**
 * Example: Basic logging with Axiom
 */
export function basicLoggingExample(): void {
  // Simple info log
  axiomLogger.info('Application started', {
    component: 'startup',
    feature: 'initialization',
    tags: ['startup', 'application']
  });

  // Error logging with context
  const error = new Error('Database connection failed');
  axiomLogger.error('Failed to connect to database', {
    component: 'database',
    feature: 'connection',
    errorCode: 'DB_CONN_001',
    tags: ['database', 'connection', 'error']
  }, error);

  // Performance logging
  axiomLogger.performance('database_query', 1250, {
    component: 'database',
    feature: 'query',
    operation: 'select_instances',
    tags: ['database', 'query', 'slow']
  });

  // Business event logging
  axiomLogger.businessEvent('instance_created', {
    instanceId: 'inst-123',
    customerId: 'cust-456',
    feature: 'instance_management',
    metadata: {
      instanceType: 'gpu-large',
      region: 'OC-AU-01'
    },
    tags: ['instance', 'creation', 'business']
  });
}

/**
 * Example: Component-specific logging
 */
export function componentLoggingExample(): void {
  // Create a logger for a specific component
  const instanceLogger = createComponentLogger('instance_service', 'lifecycle');

  instanceLogger.info('Starting instance lifecycle check', {
    action: 'lifecycle_check',
    tags: ['instance', 'lifecycle']
  });

  instanceLogger.warn('Instance approaching timeout', {
    instanceId: 'inst-789',
    action: 'timeout_warning',
    metadata: {
      timeoutMinutes: 5,
      currentUptime: 115
    },
    tags: ['instance', 'timeout', 'warning']
  });
}

/**
 * Example: Request-specific logging
 */
export function requestLoggingExample(): void {
  const requestId = 'req-abc123';
  const correlationId = 'corr-xyz789';
  
  // Create a request-specific logger
  const requestLogger = createRequestLogger(requestId, correlationId);

  requestLogger.info('Processing API request', {
    action: 'request_processing',
    httpMethod: 'POST',
    httpUrl: '/api/instances',
    tags: ['api', 'request']
  });

  // Log HTTP request with standardized format
  requestLogger.httpRequest('POST', '/api/instances', 201, 850, {
    customerId: 'cust-456',
    tags: ['api', 'success']
  });
}

/**
 * Example: Security event logging
 */
export function securityLoggingExample(): void {
  const securityLogger = createComponentLogger('security', 'authentication');

  // Log authentication failure
  securityLogger.security('authentication_failed', 'medium', {
    action: 'auth_failure',
    clientIp: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    metadata: {
      attemptCount: 3,
      reason: 'invalid_credentials'
    },
    tags: ['security', 'auth', 'failure']
  });

  // Log suspicious activity
  securityLogger.security('rate_limit_exceeded', 'high', {
    action: 'rate_limit',
    clientIp: '10.0.0.50',
    metadata: {
      requestCount: 1000,
      timeWindow: '1 minute'
    },
    tags: ['security', 'rate_limit', 'suspicious']
  });
}

/**
 * Example: Error handling with rich context
 */
export async function errorHandlingExample(): Promise<void> {
  const operationLogger = createComponentLogger('novita_api', 'instance_creation');

  try {
    // Simulate an operation that might fail
    await simulateApiCall();
    
    operationLogger.info('Instance creation successful', {
      action: 'create_instance',
      instanceId: 'inst-new-123',
      tags: ['instance', 'creation', 'success']
    });
  } catch (error) {
    operationLogger.error('Instance creation failed', {
      action: 'create_instance',
      errorCode: 'INST_CREATE_001',
      errorType: 'ApiError',
      metadata: {
        retryAttempt: 1,
        maxRetries: 3
      },
      tags: ['instance', 'creation', 'error']
    }, error as Error);
  }
}

/**
 * Example: Performance monitoring
 */
export async function performanceMonitoringExample(): Promise<void> {
  const performanceLogger = createComponentLogger('cache', 'redis_operations');
  
  const startTime = Date.now();
  
  try {
    // Simulate cache operation
    await simulateCacheOperation();
    
    const duration = Date.now() - startTime;
    
    performanceLogger.performance('cache_operation', duration, {
      operation: 'bulk_get',
      cacheHit: true,
      itemCount: 50,
      tags: ['cache', 'redis', 'bulk_operation']
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    performanceLogger.error('Cache operation failed', {
      operation: 'bulk_get',
      duration,
      tags: ['cache', 'redis', 'error']
    }, error as Error);
  }
}

/**
 * Example: Child logger with inherited context
 */
export function childLoggerExample(): void {
  // Create a base logger with common context
  const baseLogger = createComponentLogger('migration_service', 'instance_sync');
  
  // Create child loggers that inherit the base context
  const migrationLogger = baseLogger.child({
    migrationId: 'mig-456',
    batchSize: 100,
    tags: ['migration', 'batch']
  });

  migrationLogger.info('Starting migration batch', {
    action: 'batch_start',
    tags: ['migration', 'start']
  });

  migrationLogger.info('Migration batch completed', {
    action: 'batch_complete',
    processedCount: 95,
    failedCount: 5,
    tags: ['migration', 'complete']
  });
}

// Helper functions for examples
async function simulateApiCall(): Promise<void> {
  // Simulate random failure
  if (Math.random() < 0.3) {
    throw new Error('API call failed: Network timeout');
  }
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function simulateCacheOperation(): Promise<void> {
  // Simulate cache operation delay
  await new Promise(resolve => setTimeout(resolve, 50));
}