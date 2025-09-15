import { Router, Request, Response, NextFunction } from 'express';
import { instanceService } from '../services/instanceService';
import { validateCreateInstance, validateInstanceId } from '../types/validation';
import { createContextLogger, LogContext } from '../utils/logger';
import { asyncHandler } from '../utils/errorHandler';
import { NovitaApiClientError } from '../types/api';

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

  contextLogger.debug('List instances request received', {
    query: req.query
  });

  // Get all instances
  const startTime = Date.now();
  const result = await instanceService.listInstances();
  const duration = Date.now() - startTime;

  contextLogger.info('Instances listed successfully', {
    count: result.total,
    duration
  });

  res.json(result);
}));

export { router as instancesRouter };