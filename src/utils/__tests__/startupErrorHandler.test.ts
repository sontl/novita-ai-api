import {
  ErrorCode,
  StartupTimeoutError,
  StartupFailedError,
  HealthCheckTimeoutError,
  HealthCheckFailedError,
  StartupOperationInProgressError,
  ResourceConstraintsError,
  NetworkError,
  getHttpStatusCode,
  getErrorCode,
  isRetryableStartupError,
  getStartupErrorSuggestion,
  createStartupErrorContext
} from '../errorHandler';

describe('Startup Error Handler', () => {
  describe('StartupTimeoutError', () => {
    it('should create startup timeout error with correct properties', () => {
      const error = new StartupTimeoutError('inst_123', 300000, 'health_check');
      
      expect(error.name).toBe('StartupTimeoutError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.timeoutMs).toBe(300000);
      expect(error.phase).toBe('health_check');
      expect(error.message).toBe('Instance inst_123 startup timeout after 300000ms during health_check phase');
    });

    it('should default to startup phase', () => {
      const error = new StartupTimeoutError('inst_123', 300000);
      expect(error.phase).toBe('startup');
    });
  });

  describe('StartupFailedError', () => {
    it('should create startup failed error with correct properties', () => {
      const error = new StartupFailedError('inst_123', 'API error', 'api_call', false);
      
      expect(error.name).toBe('StartupFailedError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.reason).toBe('API error');
      expect(error.phase).toBe('api_call');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Instance inst_123 startup failed during api_call: API error');
    });

    it('should default to retryable and startup phase', () => {
      const error = new StartupFailedError('inst_123', 'Generic error');
      expect(error.phase).toBe('startup');
      expect(error.retryable).toBe(true);
    });
  });

  describe('HealthCheckTimeoutError', () => {
    it('should create health check timeout error with correct properties', () => {
      const error = new HealthCheckTimeoutError('inst_123', 60000, 3);
      
      expect(error.name).toBe('HealthCheckTimeoutError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.timeoutMs).toBe(60000);
      expect(error.endpointCount).toBe(3);
      expect(error.message).toBe('Health check timeout for instance inst_123 after 60000ms (3 endpoints)');
    });
  });

  describe('HealthCheckFailedError', () => {
    it('should create health check failed error with correct properties', () => {
      const error = new HealthCheckFailedError('inst_123', 2, 3, 'Connection refused');
      
      expect(error.name).toBe('HealthCheckFailedError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.failedEndpoints).toBe(2);
      expect(error.totalEndpoints).toBe(3);
      expect(error.lastError).toBe('Connection refused');
      expect(error.message).toBe('Health check failed for instance inst_123: 2/3 endpoints failed (Connection refused)');
    });

    it('should work without lastError', () => {
      const error = new HealthCheckFailedError('inst_123', 1, 2);
      expect(error.message).toBe('Health check failed for instance inst_123: 1/2 endpoints failed');
    });
  });

  describe('StartupOperationInProgressError', () => {
    it('should create startup operation in progress error with correct properties', () => {
      const error = new StartupOperationInProgressError('inst_123', 'op_456', 'monitoring');
      
      expect(error.name).toBe('StartupOperationInProgressError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.operationId).toBe('op_456');
      expect(error.currentPhase).toBe('monitoring');
      expect(error.message).toBe('Startup operation already in progress for instance inst_123 (operation: op_456, phase: monitoring)');
    });
  });

  describe('ResourceConstraintsError', () => {
    it('should create resource constraints error with correct properties', () => {
      const error = new ResourceConstraintsError('inst_123', 'GPU resources', 'Try different region');
      
      expect(error.name).toBe('ResourceConstraintsError');
      expect(error.instanceId).toBe('inst_123');
      expect(error.resourceType).toBe('GPU resources');
      expect(error.suggestion).toBe('Try different region');
      expect(error.message).toBe('Resource constraints prevented startup of instance inst_123: GPU resources - Try different region');
    });

    it('should work without suggestion', () => {
      const error = new ResourceConstraintsError('inst_123', 'Memory');
      expect(error.message).toBe('Resource constraints prevented startup of instance inst_123: Memory');
    });
  });

  describe('NetworkError', () => {
    it('should create network error with correct properties', () => {
      const error = new NetworkError('Connection failed', 'ECONNRESET', false);
      
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('ECONNRESET');
      expect(error.retryable).toBe(false);
    });

    it('should default to retryable', () => {
      const error = new NetworkError('Network issue');
      expect(error.retryable).toBe(true);
    });
  });

  describe('getHttpStatusCode', () => {
    it('should return correct status codes for startup errors', () => {
      expect(getHttpStatusCode(new StartupTimeoutError('inst_123', 300000))).toBe(408);
      expect(getHttpStatusCode(new StartupFailedError('inst_123', 'error'))).toBe(500);
      expect(getHttpStatusCode(new HealthCheckTimeoutError('inst_123', 60000, 3))).toBe(408);
      expect(getHttpStatusCode(new HealthCheckFailedError('inst_123', 1, 2))).toBe(503);
      expect(getHttpStatusCode(new StartupOperationInProgressError('inst_123', 'op_456', 'monitoring'))).toBe(409);
      expect(getHttpStatusCode(new ResourceConstraintsError('inst_123', 'GPU'))).toBe(503);
      expect(getHttpStatusCode(new NetworkError('Network error', 'ECONNRESET', true))).toBe(503);
      expect(getHttpStatusCode(new NetworkError('Network error', 'ECONNRESET', false))).toBe(500);
    });
  });

  describe('getErrorCode', () => {
    it('should return correct error codes for startup errors', () => {
      expect(getErrorCode(new StartupTimeoutError('inst_123', 300000))).toBe(ErrorCode.STARTUP_TIMEOUT);
      expect(getErrorCode(new StartupFailedError('inst_123', 'error'))).toBe(ErrorCode.STARTUP_FAILED);
      expect(getErrorCode(new HealthCheckTimeoutError('inst_123', 60000, 3))).toBe(ErrorCode.HEALTH_CHECK_TIMEOUT);
      expect(getErrorCode(new HealthCheckFailedError('inst_123', 1, 2))).toBe(ErrorCode.HEALTH_CHECK_FAILED);
      expect(getErrorCode(new StartupOperationInProgressError('inst_123', 'op_456', 'monitoring'))).toBe(ErrorCode.STARTUP_OPERATION_IN_PROGRESS);
      expect(getErrorCode(new ResourceConstraintsError('inst_123', 'GPU'))).toBe(ErrorCode.RESOURCE_CONSTRAINTS);
      expect(getErrorCode(new NetworkError('Network error'))).toBe(ErrorCode.NETWORK_ERROR);
    });
  });

  describe('isRetryableStartupError', () => {
    it('should correctly identify retryable startup errors', () => {
      expect(isRetryableStartupError(new StartupTimeoutError('inst_123', 300000))).toBe(true);
      expect(isRetryableStartupError(new StartupFailedError('inst_123', 'error', 'startup', true))).toBe(true);
      expect(isRetryableStartupError(new StartupFailedError('inst_123', 'error', 'startup', false))).toBe(false);
      expect(isRetryableStartupError(new HealthCheckTimeoutError('inst_123', 60000, 3))).toBe(true);
      expect(isRetryableStartupError(new HealthCheckFailedError('inst_123', 1, 2))).toBe(true);
      expect(isRetryableStartupError(new ResourceConstraintsError('inst_123', 'GPU'))).toBe(true);
      expect(isRetryableStartupError(new NetworkError('Network error', 'ECONNRESET', true))).toBe(true);
      expect(isRetryableStartupError(new NetworkError('Network error', 'ECONNRESET', false))).toBe(false);
    });
  });

  describe('getStartupErrorSuggestion', () => {
    it('should return appropriate suggestions for startup errors', () => {
      expect(getStartupErrorSuggestion(new StartupTimeoutError('inst_123', 300000)))
        .toBe('Consider increasing timeout values or checking instance configuration');
      
      expect(getStartupErrorSuggestion(new HealthCheckFailedError('inst_123', 1, 2)))
        .toBe('Check application startup logs and endpoint configuration');
      
      expect(getStartupErrorSuggestion(new ResourceConstraintsError('inst_123', 'GPU', 'Try different region')))
        .toBe('Try different region');
      
      expect(getStartupErrorSuggestion(new ResourceConstraintsError('inst_123', 'GPU')))
        .toBe('Try again later or use a different instance configuration');
      
      expect(getStartupErrorSuggestion(new NetworkError('Network error', 'ECONNRESET', true)))
        .toBe('Network issue detected, please retry the operation');
      
      expect(getStartupErrorSuggestion(new StartupFailedError('inst_123', 'error')))
        .toBeUndefined();
    });
  });

  describe('createStartupErrorContext', () => {
    it('should create error context with all provided fields', () => {
      const context = createStartupErrorContext('inst_123', 'op_456', 'monitoring', 30000);
      
      expect(context.instanceId).toBe('inst_123');
      expect(context.operationId).toBe('op_456');
      expect(context.phase).toBe('monitoring');
      expect(context.elapsedTimeMs).toBe(30000);
      expect(context.timestamp).toBeDefined();
      expect(new Date(context.timestamp)).toBeInstanceOf(Date);
    });

    it('should create error context with minimal fields', () => {
      const context = createStartupErrorContext('inst_123');
      
      expect(context.instanceId).toBe('inst_123');
      expect(context.operationId).toBeUndefined();
      expect(context.phase).toBeUndefined();
      expect(context.elapsedTimeMs).toBeUndefined();
      expect(context.timestamp).toBeDefined();
    });
  });
});