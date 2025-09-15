import { Request, Response, NextFunction } from 'express';
import {
  ValidationError,
  InstanceNotFoundError,
  ServiceError,
  ErrorCode,
  createErrorResponse,
  createValidationErrorResponse,
  handleValidationResult,
  getHttpStatusCode,
  getErrorCode,
  errorHandler,
  asyncHandler,
  requestIdMiddleware,
  getSafeErrorMessage
} from '../errorHandler';
import {
  NovitaApiClientError,
  RateLimitError,
  CircuitBreakerError,
  TimeoutError
} from '../../types/api';

describe('Error Handler Utilities', () => {
  describe('Custom Error Classes', () => {
    it('should create ValidationError with details', () => {
      const details = [
        { field: 'name', message: 'Name is required' }
      ];
      const error = new ValidationError('Validation failed', details);
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
    });

    it('should create InstanceNotFoundError with instance ID', () => {
      const error = new InstanceNotFoundError('test-123');
      
      expect(error.name).toBe('InstanceNotFoundError');
      expect(error.message).toContain('test-123');
    });

    it('should create ServiceError with custom properties', () => {
      const error = new ServiceError('Service error', 503, 'CUSTOM_ERROR', { extra: 'data' });
      
      expect(error.name).toBe('ServiceError');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.details).toEqual({ extra: 'data' });
    });
  });

  describe('Error Response Builders', () => {
    it('should create standard error response', () => {
      const response = createErrorResponse('TEST_ERROR', 'Test message', { extra: 'data' }, 'req-123');
      
      expect(response.error.code).toBe('TEST_ERROR');
      expect(response.error.message).toBe('Test message');
      expect(response.error.details).toEqual({ extra: 'data' });
      expect(response.error.requestId).toBe('req-123');
      expect(response.error.timestamp).toBeDefined();
    });

    it('should create validation error response', () => {
      const validationErrors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format' }
      ];
      const response = createValidationErrorResponse(validationErrors, 'req-123');
      
      expect(response.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.error.validationErrors).toEqual(validationErrors);
      expect(response.error.requestId).toBe('req-123');
    });

    it('should generate request ID if not provided', () => {
      const response = createErrorResponse('TEST_ERROR', 'Test message');
      
      expect(response.error.requestId).toBeDefined();
      expect(response.error.requestId.length).toBeGreaterThan(0);
    });
  });

  describe('Validation Result Handler', () => {
    it('should return value for successful validation', () => {
      const result = { value: { name: 'test' } };
      const value = handleValidationResult(result);
      
      expect(value).toEqual({ name: 'test' });
    });

    it('should throw ValidationError for failed validation', () => {
      const result = {
        value: {},
        error: {
          message: 'Validation failed',
          details: [{ field: 'name', message: 'Name is required' }]
        }
      };
      
      expect(() => handleValidationResult(result)).toThrow(ValidationError);
    });
  });

  describe('HTTP Status Code Mapping', () => {
    it('should return 400 for ValidationError', () => {
      const error = new ValidationError('Validation failed', []);
      expect(getHttpStatusCode(error)).toBe(400);
    });

    it('should return 404 for InstanceNotFoundError', () => {
      const error = new InstanceNotFoundError('test-123');
      expect(getHttpStatusCode(error)).toBe(404);
    });

    it('should return 429 for RateLimitError', () => {
      const error = new RateLimitError();
      expect(getHttpStatusCode(error)).toBe(429);
    });

    it('should return 503 for CircuitBreakerError', () => {
      const error = new CircuitBreakerError();
      expect(getHttpStatusCode(error)).toBe(503);
    });

    it('should return 408 for TimeoutError', () => {
      const error = new TimeoutError();
      expect(getHttpStatusCode(error)).toBe(408);
    });

    it('should return custom status code for NovitaApiClientError', () => {
      const error = new NovitaApiClientError('API error', 422);
      expect(getHttpStatusCode(error)).toBe(422);
    });

    it('should return custom status code for ServiceError', () => {
      const error = new ServiceError('Service error', 503);
      expect(getHttpStatusCode(error)).toBe(503);
    });

    it('should return 500 for unknown errors', () => {
      const error = new Error('Unknown error');
      expect(getHttpStatusCode(error)).toBe(500);
    });
  });

  describe('Error Code Mapping', () => {
    it('should return correct error codes for different error types', () => {
      expect(getErrorCode(new ValidationError('', []))).toBe(ErrorCode.VALIDATION_ERROR);
      expect(getErrorCode(new InstanceNotFoundError('test'))).toBe(ErrorCode.INSTANCE_NOT_FOUND);
      expect(getErrorCode(new RateLimitError())).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(getErrorCode(new CircuitBreakerError())).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN);
      expect(getErrorCode(new TimeoutError())).toBe(ErrorCode.REQUEST_TIMEOUT);
    });

    it('should return custom error code for NovitaApiClientError', () => {
      const error = new NovitaApiClientError('API error', 400, 'CUSTOM_CODE');
      expect(getErrorCode(error)).toBe('CUSTOM_CODE');
    });

    it('should return INTERNAL_SERVER_ERROR for unknown errors', () => {
      const error = new Error('Unknown error');
      expect(getErrorCode(error)).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    });
  });

  describe('Express Error Handler Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonSpy: jest.Mock;
    let statusSpy: jest.Mock;
    let setSpy: jest.Mock;

    beforeEach(() => {
      jsonSpy = jest.fn();
      statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
      setSpy = jest.fn();
      
      mockReq = {
        headers: {},
        url: '/test',
        method: 'GET'
      };
      
      mockRes = {
        status: statusSpy,
        set: setSpy
      };
      
      mockNext = jest.fn();
      
      // Mock console.error to avoid noise in tests
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle ValidationError correctly', () => {
      const validationErrors = [{ field: 'name', message: 'Name is required' }];
      const error = new ValidationError('Validation failed', validationErrors);
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.VALIDATION_ERROR,
            validationErrors
          })
        })
      );
    });

    it('should handle RateLimitError with retry-after header', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(setSpy).toHaveBeenCalledWith('Retry-After', '60');
      expect(statusSpy).toHaveBeenCalledWith(429);
    });

    it('should use existing request ID from headers', () => {
      mockReq.headers!['x-request-id'] = 'existing-req-id';
      const error = new Error('Test error');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: 'existing-req-id'
          })
        })
      );
    });
  });

  describe('Async Handler Wrapper', () => {
    it('should call next with error when async function throws', async () => {
      const mockNext = jest.fn();
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      
      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn({} as Request, {} as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should not call next when async function succeeds', async () => {
      const mockNext = jest.fn();
      const asyncFn = jest.fn().mockResolvedValue('success');
      
      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn({} as Request, {} as Response, mockNext);
      
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Request ID Middleware', () => {
    it('should add request ID to headers and response', () => {
      const mockReq = { headers: {} } as Request;
      const mockRes = { set: jest.fn() } as unknown as Response;
      const mockNext = jest.fn();
      
      requestIdMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.headers['x-request-id']).toBeDefined();
      expect(mockRes.set).toHaveBeenCalledWith('X-Request-ID', mockReq.headers['x-request-id']);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing request ID if present', () => {
      const existingId = 'existing-id';
      const mockReq = { headers: { 'x-request-id': existingId } } as unknown as Request;
      const mockRes = { set: jest.fn() } as unknown as Response;
      const mockNext = jest.fn();
      
      requestIdMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.headers['x-request-id']).toBe(existingId);
      expect(mockRes.set).toHaveBeenCalledWith('X-Request-ID', existingId);
    });
  });

  describe('Safe Error Message', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return original message in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Detailed error message');
      
      expect(getSafeErrorMessage(error)).toBe('Detailed error message');
    });

    it('should return safe message for internal errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Internal database connection failed');
      
      expect(getSafeErrorMessage(error)).toBe('An internal server error occurred');
    });

    it('should return original message for user-facing errors in production', () => {
      process.env.NODE_ENV = 'production';
      const validationError = new ValidationError('Name is required', []);
      const notFoundError = new InstanceNotFoundError('test-123');
      const rateLimitError = new RateLimitError();
      
      expect(getSafeErrorMessage(validationError)).toBe('Name is required');
      expect(getSafeErrorMessage(notFoundError)).toContain('test-123');
      expect(getSafeErrorMessage(rateLimitError)).toBe('Rate limit exceeded');
    });
  });
});