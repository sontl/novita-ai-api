import { Router, Request, Response } from 'express';
import { instanceService } from '../services/instanceService';
import { validateCreateInstance, validateInstanceId, validateStartInstance } from '../types/validation';
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

export { router as instancesRouter };