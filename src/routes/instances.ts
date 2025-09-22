import { Router, Request, Response } from 'express';
import { instanceService } from '../services/instanceService';
import { autoStopService } from '../services/autoStopService';
import { validateCreateInstance, validateInstanceId, validateStartInstance, validateStopInstance, validateUpdateLastUsedTime, validateDeleteInstance } from '../types/validation';
import { createContextLogger, LogContext } from '../utils/logger';
import { asyncHandler } from '../utils/errorHandler';
import { config } from '../config/config';

const router = Router();

/**
 * POST /api/instances
 * Create a new GPU instance
 */
router.post('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'create_instance'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance creation request received', {
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate request body
  const validation = validateCreateInstance(req.body);
  if (validation.error) {
    contextLogger.warn('Instance creation validation failed', {
      validationErrors: validation.error.details
    });

    // Validation errors are handled by the global error handler
    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(validation.error.message, validation.error.details);
  }

  // Create instance
  const startTime = Date.now();
  const result = await instanceService.createInstance(validation.value);
  const duration = Date.now() - startTime;

  contextLogger.info('Instance creation initiated successfully', {
    instanceId: result.instanceId,
    status: result.status,
    duration
  });

  res.status(201).json(result);
}));

/**
 * GET /api/instances/:instanceId
 * Get instance status and details
 */
router.get('/:instanceId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;
  const { instanceId } = req.params;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'get_instance_status',
    instanceId
  };

  const contextLogger = createContextLogger(context);

  contextLogger.debug('Instance status request received');

  // Validate instance ID
  const validation = validateInstanceId(instanceId);
  if (validation.error) {
    contextLogger.warn('Invalid instance ID provided', {
      validationError: validation.error.message
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(validation.error.message, validation.error.details);
  }

  // Get instance status
  const startTime = Date.now();
  const instanceDetails = await instanceService.getInstanceStatus(validation.value);
  const duration = Date.now() - startTime;

  contextLogger.debug('Instance status retrieved successfully', {
    status: instanceDetails.status,
    duration
  });

  res.json(instanceDetails);
}));

/**
 * GET /api/instances
 * List all managed instances
 * 
 * Query parameters:
 * - source: 'all' | 'local' | 'novita' (default: 'local')
 * - includeNovitaOnly: boolean (default: false)
 * - syncLocalState: boolean (default: false)
 */
router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'list_instances'
  };

  const contextLogger = createContextLogger(context);

  // Parse query parameters with configuration defaults
  const source = (req.query.source as string) || 'all';
  const includeNovitaOnly = req.query.includeNovitaOnly !== undefined
    ? req.query.includeNovitaOnly === 'true'
    : config.instanceListing.defaultIncludeNovitaOnly;
  const syncLocalState = req.query.syncLocalState !== undefined
    ? req.query.syncLocalState === 'true'
    : config.instanceListing.defaultSyncLocalState;

  contextLogger.debug('List instances request received', {
    source,
    includeNovitaOnly,
    syncLocalState,
    query: req.query
  });

  const startTime = Date.now();
  let result;

  if (source === 'all' || source === 'comprehensive') {
    // Check if comprehensive listing is enabled
    if (!config.instanceListing.enableComprehensiveListing) {
      contextLogger.warn('Comprehensive listing requested but disabled in configuration');
      // Fallback to local listing
      result = await instanceService.listInstances();
    } else {
      // Use comprehensive listing with Novita.ai integration
      result = await instanceService.listInstancesComprehensive({
        includeNovitaOnly,
        syncLocalState
      });
    }
  } else {
    // Use traditional local-only listing
    result = await instanceService.listInstances();
  }

  const duration = Date.now() - startTime;

  contextLogger.info('Instances listed successfully', {
    source,
    count: result.total,
    duration
  });

  res.json(result);
}));

/**
 * GET /api/instances/comprehensive
 * List instances with comprehensive data from both local state and Novita.ai API
 * 
 * Query parameters:
 * - includeNovitaOnly: boolean (default: true)
 * - syncLocalState: boolean (default: false)
 */
router.get('/comprehensive', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'list_instances_comprehensive'
  };

  const contextLogger = createContextLogger(context);

  // Parse query parameters with configuration defaults
  const includeNovitaOnly = req.query.includeNovitaOnly !== undefined
    ? req.query.includeNovitaOnly !== 'false' // Default to true unless explicitly false
    : config.instanceListing.defaultIncludeNovitaOnly;
  const syncLocalState = req.query.syncLocalState !== undefined
    ? req.query.syncLocalState === 'true'
    : config.instanceListing.defaultSyncLocalState;

  // Check if comprehensive listing is enabled
  if (!config.instanceListing.enableComprehensiveListing) {
    contextLogger.warn('Comprehensive listing endpoint called but disabled in configuration');
    res.status(404).json({
      error: {
        code: 'FEATURE_DISABLED',
        message: 'Comprehensive instance listing is disabled',
        timestamp: new Date().toISOString(),
        requestId
      }
    });
    return;
  }

  contextLogger.debug('Comprehensive instances request received', {
    includeNovitaOnly,
    syncLocalState,
    query: req.query
  });

  // Get comprehensive instance list
  const startTime = Date.now();
  const result = await instanceService.listInstancesComprehensive({
    includeNovitaOnly,
    syncLocalState
  });
  const duration = Date.now() - startTime;

  contextLogger.info('Comprehensive instances listed successfully', {
    totalCount: result.total,
    sources: result.sources,
    performance: result.performance,
    duration
  });

  res.json(result);
}));

/**
 * POST /api/instances/:instanceId/start
 * Start instance by ID
 */
router.post('/:instanceId/start', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;
  const { instanceId } = req.params;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'start_instance_by_id',
    instanceId
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance start request received (by ID)', {
    instanceId,
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate instance ID
  const instanceIdValidation = validateInstanceId(instanceId);
  if (instanceIdValidation.error) {
    contextLogger.warn('Invalid instance ID provided', {
      validationError: instanceIdValidation.error.message
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(instanceIdValidation.error.message, instanceIdValidation.error.details);
  }

  // Validate request body
  const bodyValidation = validateStartInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance start validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Start instance by ID
  const startTime = Date.now();
  try {
    const result = await instanceService.startInstance(
      instanceIdValidation.value,
      bodyValidation.value,
      'id'
    );
    const duration = Date.now() - startTime;

    contextLogger.info('Instance start initiated successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(202).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for startup operations
    contextLogger.error('Instance start failed', {
      instanceId: instanceIdValidation.value,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * POST /api/instances/start
 * Start instance by name (provided in request body)
 */
router.post('/start', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'start_instance_by_name'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance start request received (by name)', {
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate request body
  const bodyValidation = validateStartInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance start validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Ensure instanceName is provided for name-based starting
  if (!bodyValidation.value.instanceName) {
    contextLogger.warn('Instance name not provided for name-based start');

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError('Instance name is required for name-based starting', [{
      field: 'instanceName',
      message: 'Instance name is required for name-based starting',
      value: undefined
    }]);
  }

  // Add instanceName to context for logging
  const contextWithName: LogContext = {
    ...context,
    instanceName: bodyValidation.value.instanceName
  };
  const contextLoggerWithName = createContextLogger(contextWithName);

  // Start instance by name
  const startTime = Date.now();
  try {
    const result = await instanceService.startInstance(
      bodyValidation.value.instanceName,
      bodyValidation.value,
      'name'
    );
    const duration = Date.now() - startTime;

    contextLoggerWithName.info('Instance start initiated successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(202).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for startup operations
    contextLoggerWithName.error('Instance start by name failed', {
      instanceName: bodyValidation.value.instanceName,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * POST /api/instances/:instanceId/stop
 * Stop instance by ID
 */
router.post('/:instanceId/stop', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;
  const { instanceId } = req.params;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'stop_instance_by_id',
    instanceId
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance stop request received (by ID)', {
    instanceId,
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate instance ID
  const instanceIdValidation = validateInstanceId(instanceId);
  if (instanceIdValidation.error) {
    contextLogger.warn('Invalid instance ID provided', {
      validationError: instanceIdValidation.error.message
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(instanceIdValidation.error.message, instanceIdValidation.error.details);
  }

  // Validate request body
  const bodyValidation = validateStopInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance stop validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Stop instance by ID
  const startTime = Date.now();
  try {
    const result = await instanceService.stopInstance(
      instanceIdValidation.value,
      bodyValidation.value,
      'id'
    );
    const duration = Date.now() - startTime;

    contextLogger.info('Instance stop completed successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(200).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for stop operations
    contextLogger.error('Instance stop failed', {
      instanceId: instanceIdValidation.value,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * POST /api/instances/stop
 * Stop instance by name (provided in request body)
 */
router.post('/stop', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'stop_instance_by_name'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance stop request received (by name)', {
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate request body
  const bodyValidation = validateStopInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance stop validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Ensure instanceName is provided for name-based stopping
  if (!bodyValidation.value.instanceName) {
    contextLogger.warn('Instance name not provided for name-based stop');

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError('Instance name is required for name-based stopping', [{
      field: 'instanceName',
      message: 'Instance name is required for name-based stopping',
      value: undefined
    }]);
  }

  // Add instanceName to context for logging
  const contextWithName: LogContext = {
    ...context,
    instanceName: bodyValidation.value.instanceName
  };
  const contextLoggerWithName = createContextLogger(contextWithName);

  // Stop instance by name
  const startTime = Date.now();
  try {
    const result = await instanceService.stopInstance(
      bodyValidation.value.instanceName,
      bodyValidation.value,
      'name'
    );
    const duration = Date.now() - startTime;

    contextLoggerWithName.info('Instance stop completed successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(200).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for stop operations
    contextLoggerWithName.error('Instance stop by name failed', {
      instanceName: bodyValidation.value.instanceName,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * PUT /api/instances/:instanceId/last-used
 * Update the last used time for an instance
 */
router.put('/:instanceId/last-used', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;
  const { instanceId } = req.params;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'update_last_used_time',
    instanceId
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Update last used time request received', {
    instanceId,
    requestBody: req.body
  });

  // Validate instance ID
  const instanceIdValidation = validateInstanceId(instanceId);
  if (instanceIdValidation.error) {
    contextLogger.warn('Invalid instance ID provided', {
      validationError: instanceIdValidation.error.message
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(instanceIdValidation.error.message, instanceIdValidation.error.details);
  }

  // Validate request body
  const bodyValidation = validateUpdateLastUsedTime(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Update last used time validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Update last used time
  const startTime = Date.now();
  try {
    const lastUsedAt = bodyValidation.value.lastUsedAt ? new Date(bodyValidation.value.lastUsedAt) : undefined;
    const result = await instanceService.updateLastUsedTime(instanceIdValidation.value, lastUsedAt);
    const duration = Date.now() - startTime;

    contextLogger.info('Last used time updated successfully', {
      instanceId: result.instanceId,
      lastUsedAt: result.lastUsedAt,
      duration
    });

    res.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    contextLogger.error('Update last used time failed', {
      instanceId: instanceIdValidation.value,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration
    });

    throw error;
  }
}));

/**
 * GET /api/instances/auto-stop/stats
 * Get auto-stop service statistics
 */
router.get('/auto-stop/stats', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'get_auto_stop_stats'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.debug('Auto-stop stats request received');

  const stats = autoStopService.getAutoStopStats();

  contextLogger.debug('Auto-stop stats retrieved successfully');

  res.json(stats);
}));

/**
 * POST /api/instances/auto-stop/trigger
 * Manually trigger an auto-stop check
 */
router.post('/auto-stop/trigger', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'trigger_auto_stop_check'
  };

  const contextLogger = createContextLogger(context);

  const dryRun = req.body.dryRun !== false; // Default to true for safety

  contextLogger.info('Manual auto-stop check triggered', { dryRun });

  const startTime = Date.now();
  await autoStopService.triggerManualCheck(dryRun);
  const duration = Date.now() - startTime;

  contextLogger.info('Manual auto-stop check queued successfully', {
    dryRun,
    duration
  });

  res.json({
    message: 'Auto-stop check queued successfully',
    dryRun,
    timestamp: new Date().toISOString()
  });
}));

/**
 * DELETE /api/instances/:instanceId
 * Delete instance by ID
 */
router.delete('/:instanceId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;
  const { instanceId } = req.params;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'delete_instance_by_id',
    instanceId
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance delete request received (by ID)', {
    instanceId,
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate instance ID
  const instanceIdValidation = validateInstanceId(instanceId);
  if (instanceIdValidation.error) {
    contextLogger.warn('Invalid instance ID provided', {
      validationError: instanceIdValidation.error.message
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(instanceIdValidation.error.message, instanceIdValidation.error.details);
  }

  // Validate request body
  const bodyValidation = validateDeleteInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance delete validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Delete instance by ID
  const startTime = Date.now();
  try {
    const result = await instanceService.deleteInstance(
      instanceIdValidation.value,
      bodyValidation.value,
      'id'
    );
    const duration = Date.now() - startTime;

    contextLogger.info('Instance deleted successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(200).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for delete operations
    contextLogger.error('Instance delete failed', {
      instanceId: instanceIdValidation.value,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * POST /api/instances/delete
 * Delete instance by name (provided in request body)
 */
router.post('/delete', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'delete_instance_by_name'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Instance delete request received (by name)', {
    requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
  });

  // Validate request body
  const bodyValidation = validateDeleteInstance(req.body);
  if (bodyValidation.error) {
    contextLogger.warn('Instance delete validation failed', {
      validationErrors: bodyValidation.error.details
    });

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError(bodyValidation.error.message, bodyValidation.error.details);
  }

  // Ensure instanceName is provided for name-based deletion
  if (!bodyValidation.value.instanceName) {
    contextLogger.warn('Instance name not provided for name-based delete');

    const { ValidationError } = await import('../utils/errorHandler');
    throw new ValidationError('Instance name is required for name-based deletion', [{
      field: 'instanceName',
      message: 'Instance name is required for name-based deletion',
      value: undefined
    }]);
  }

  // Add instanceName to context for logging
  const contextWithName: LogContext = {
    ...context,
    instanceName: bodyValidation.value.instanceName
  };
  const contextLoggerWithName = createContextLogger(contextWithName);

  // Delete instance by name
  const startTime = Date.now();
  try {
    const result = await instanceService.deleteInstance(
      bodyValidation.value.instanceName,
      bodyValidation.value,
      'name'
    );
    const duration = Date.now() - startTime;

    contextLoggerWithName.info('Instance deleted successfully', {
      instanceId: result.instanceId,
      novitaInstanceId: result.novitaInstanceId,
      operationId: result.operationId,
      status: result.status,
      duration
    });

    res.status(200).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging for delete operations
    contextLoggerWithName.error('Instance delete by name failed', {
      instanceName: bodyValidation.value.instanceName,
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration,
      requestBody: { ...req.body, webhookUrl: req.body.webhookUrl ? '[REDACTED]' : undefined }
    });

    throw error;
  }
}));

/**
 * POST /api/instances/migration/check-failed
 * Trigger a check for failed migration jobs and handle them
 */
router.post('/migration/check-failed', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'check_failed_migrations'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Failed migration check request received');

  const startTime = Date.now();

  try {
    // Import the migration service
    const { instanceMigrationService } = await import('../services/instanceMigrationService');

    // Check if we should run immediately or schedule
    const runImmediately = req.body?.immediate === true;

    if (runImmediately) {
      // Run the check immediately
      const result = await instanceMigrationService.handleFailedMigrationJobs();
      const duration = Date.now() - startTime;

      contextLogger.info('Failed migration check completed immediately', {
        ...result,
        duration
      });

      res.status(200).json({
        success: true,
        message: 'Failed migration check completed',
        result,
        executedAt: new Date().toISOString(),
        duration
      });
    } else {
      // Schedule the failed migration check job
      const jobId = await instanceMigrationService.scheduleFailedMigrationCheck();
      const duration = Date.now() - startTime;

      contextLogger.info('Failed migration check job scheduled successfully', {
        jobId,
        duration
      });

      res.status(202).json({
        success: true,
        message: 'Failed migration check job scheduled successfully',
        jobId,
        scheduledAt: new Date().toISOString(),
        duration
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;

    contextLogger.error('Failed migration check failed', {
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration
    });

    throw error;
  }
}));

/**
 * GET /api/instances/migration/scheduler/status
 * Get the status of the failed migration scheduler
 */
router.get('/migration/scheduler/status', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'get_failed_migration_scheduler_status'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Failed migration scheduler status request received');

  try {
    // Import the service registry to get the scheduler
    const { serviceRegistry } = await import('../services/serviceRegistry');
    
    const failedMigrationScheduler = serviceRegistry.getFailedMigrationScheduler();
    
    if (!failedMigrationScheduler) {
      res.status(404).json({
        success: false,
        message: 'Failed migration scheduler not initialized',
        status: null
      });
      return;
    }

    const status = failedMigrationScheduler.getStatus();
    const healthDetails = failedMigrationScheduler.getHealthDetails();

    contextLogger.info('Failed migration scheduler status retrieved', {
      isRunning: status.isRunning,
      isEnabled: status.isEnabled
    });

    res.status(200).json({
      success: true,
      message: 'Failed migration scheduler status retrieved',
      status,
      healthDetails,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    contextLogger.error('Failed migration scheduler status retrieval failed', {
      error: (error as Error).message,
      errorType: (error as Error).name
    });

    throw error;
  }
}));

/**
 * POST /api/instances/migration/scheduler/trigger
 * Manually trigger the failed migration scheduler
 */
router.post('/migration/scheduler/trigger', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const correlationId = req.headers['x-correlation-id'] as string;

  const context: LogContext = {
    requestId,
    correlationId,
    operation: 'trigger_failed_migration_scheduler'
  };

  const contextLogger = createContextLogger(context);

  contextLogger.info('Failed migration scheduler trigger request received');

  const startTime = Date.now();
  
  try {
    // Import the service registry to get the scheduler
    const { serviceRegistry } = await import('../services/serviceRegistry');
    
    const failedMigrationScheduler = serviceRegistry.getFailedMigrationScheduler();
    
    if (!failedMigrationScheduler) {
      throw new Error('Failed migration scheduler not initialized');
    }

    // Execute the scheduler immediately
    const jobId = await failedMigrationScheduler.executeNow();
    const duration = Date.now() - startTime;

    contextLogger.info('Failed migration scheduler triggered successfully', {
      jobId,
      duration
    });

    res.status(202).json({
      success: true,
      message: 'Failed migration scheduler triggered successfully',
      jobId,
      triggeredAt: new Date().toISOString(),
      duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    contextLogger.error('Failed migration scheduler trigger failed', {
      error: (error as Error).message,
      errorType: (error as Error).name,
      duration
    });

    throw error;
  }
}));

export { router as instancesRouter };