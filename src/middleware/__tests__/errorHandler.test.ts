import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler, ErrorCategory } from '../errorHandler';
import { 
  ValidationError, 
  InstanceNotFoundError, 
  InstanceNotStartableError,
  ServiceError,
  ErrorCode 
} from '../../utils/errorHandler';
import { 
  NovitaApiClientError, 
  RateLimitError, 
  CircuitBreakerError, 
  TimeoutError 
} from '../../types/api';
import * as loggerModule from '../../utils/logger';

// Mock the logger module
jest.mock('../../utils/logger', () => ({
  createContextLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn()
  })),
  sanitizeLogData: jest.fn((data) => data)
}));

describe('Error Handler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;
  let setSpy: jest.Mock;
  let getHeadersSpy: jest.Mock;
  let mockContextLogger: any;

  beforeEach(() => {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    setSpy = jest.fn();
    getHeadersSpy = jest.fn().mockReturnValue({});
    
    mockReq = {
      headers: { 'x-request-id': 'test-req-id' },
      url: '/test',
      method: 'GET',
      path: '/test',
      body: {},
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      connection: { remoteAddress: '127.0.0.1' } as any
    };
    
    mockRes = {
      status: statusSpy,
      set: setSpy,
      json: jsonSpy,
      getHeaders: getHeadersSpy
    };
    
    mockNext = jest.fn();

    mockContextLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      http: jest.fn()
    };

    (loggerModule.createContextLogger as jest.Mock).mockReturnValue(mockContextLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Classification and Handling', () => {
    it('should handle ValidationError correctly', () => {
      const validationDetails = [{ field: 'name', message: 'Name is required' }];
      const error = new ValidationError('Validation failed', validationDetails);
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            requestId: 'test-req-id'
          })
        })
      );
      expect(mockContextLogger.warn).toHaveBeenCalled();
    });

    it('should handle InstanceNotFoundError correctly', () => {
      const error = new InstanceNotFoundError('test-instance-123', 'id');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.INSTANCE_NOT_FOUND,
            requestId: 'test-req-id'
          })
        })
      );
      expect(mockContextLogger.warn).toHaveBeenCalled();
    });

    it('should handle InstanceNotStartableError correctly', () => {
      const error = new InstanceNotStartableError('test-instance-123', 'running', 'Instance is already running');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.INSTANCE_NOT_STARTABLE,
            requestId: 'test-req-id'
          })
        })
      );
      expect(mockContextLogger.warn).toHaveBeenCalled();
    });

    it('should handle RateLimitError with retry-after header', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      
      errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
      
      expect(setSpy).toHaveBeenCalledWith('Retry-After', '60');
      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.RATE_LIMIT_EXCEEDED,
            retryable: true,
            retryAfter: 60
          })
        })
      );
    });

    it('should handle CircuitBreakerError correctly', () => {
      const error = new CircuitBreakerError('Circuit breaker is open');
      
      errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(503);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.CIRCUIT_BREAKER_OPEN,
            retryable: true
          })
        })
      );
    });

    it('should handle TimeoutError correctly', () => {
      const error = new TimeoutError('Request timeout');
      
      errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(408);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.REQUEST_TIMEOUT,
            retryable: true
          })
        })
      );
    });

    it('should handle NovitaApiClientError correctly', () => {
      const error = new NovitaApiClientError('API error', 422, 'INVALID_PARAMS', { field: 'value' });
      
      errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(422);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_PARAMS',
            message: 'API error'
          })
        })
      );
    });

    it('should handle ServiceError correctly', () => {
      const error = new ServiceError('Service unavailable', 503, 'SERVICE_DOWN', { reason: 'maintenance' });
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(503);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'SERVICE_DOWN',
            retryable: true
          })
        })
      );
    });

    it('should handle authentication errors', () => {
      const error = new Error('Unauthorized access');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.UNAUTHORIZED
          })
        })
      );
    });

    it('should handle authorization errors', () => {
      const error = new Error('Forbidden operation');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.FORBIDDEN
          })
        })
      );
    });

    it('should handle unknown errors as internal server errors', () => {
      const error = new Error('Unknown error');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.INTERNAL_SERVER_ERROR
          })
        })
      );
      expect(mockContextLogger.error).toHaveBeenCalled();
    });
  });

  describe('Security and Data Sanitization', () => {
    it('should set security headers', () => {
      const error = new Error('Test error');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(setSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(setSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should sanitize request data in logs', () => {
      const error = new Error('Test error');
      mockReq.body = { password: 'secret', name: 'test' };
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(loggerModule.sanitizeLogData).toHaveBeenCalledWith(mockReq.body);
    });

    it('should include correlation ID when present', () => {
      const error = new Error('Test error');
      mockReq.headers!['x-correlation-id'] = 'test-correlation-id';
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            correlationId: 'test-correlation-id'
          })
        })
      );
    });
  });

  describe('Environment-specific Behavior', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should include validation errors in non-production', () => {
      process.env.NODE_ENV = 'development';
      const validationDetails = [{ field: 'name', message: 'Name is required' }];
      const error = new ValidationError('Validation failed', validationDetails);
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            validationErrors: validationDetails
          })
        })
      );
    });

    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            stack: 'Error stack trace'
          })
        })
      );
    });

    it('should sanitize error messages in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Internal database connection failed');
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'An internal server error occurred'
          })
        })
      );
    });

    it('should preserve user-facing error messages in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new ValidationError('Name is required', []);
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Name is required'
          })
        })
      );
    });
  });

  describe('Not Found Handler', () => {
    it('should handle 404 errors correctly', () => {
      notFoundHandler(mockReq as Request, mockRes as Response);
      
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Route GET /test not found',
            requestId: 'test-req-id'
          })
        })
      );
      expect(mockContextLogger.warn).toHaveBeenCalled();
    });

    it('should include correlation ID in 404 response', () => {
      mockReq.headers!['x-correlation-id'] = 'test-correlation-id';
      
      notFoundHandler(mockReq as Request, mockRes as Response);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            correlationId: 'test-correlation-id'
          })
        })
      );
    });
  });

  describe('Logging Context', () => {
    it('should create context logger with correct parameters', () => {
      const error = new Error('Test error');
      mockReq.headers!['x-correlation-id'] = 'test-correlation-id';
      
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
      
      expect(loggerModule.createContextLogger).toHaveBeenCalledWith({
        requestId: 'test-req-id',
        correlationId: 'test-correlation-id',
        operation: 'GET /test',
        userAgent: 'test-user-agent',
        ip: '127.0.0.1'
      });
    });

    it('should log appropriate level based on status code', () => {
      // Test 4xx error (warn level)
      const clientError = new ValidationError('Validation failed', []);
      errorHandler(clientError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockContextLogger.warn).toHaveBeenCalled();

      // Reset mocks
      jest.clearAllMocks();
      (loggerModule.createContextLogger as jest.Mock).mockReturnValue(mockContextLogger);

      // Test 5xx error (error level)
      const serverError = new Error('Internal error');
      errorHandler(serverError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockContextLogger.error).toHaveBeenCalled();
    });
  });
});