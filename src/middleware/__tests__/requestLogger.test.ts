import { Request, Response, NextFunction } from 'express';
import { 
  requestLoggerMiddleware, 
  correlationIdMiddleware, 
  performanceMiddleware 
} from '../requestLogger';
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
  sanitizeLogData: jest.fn((data) => data),
  logHttpRequest: jest.fn()
}));

describe('Request Logger Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;
  let mockContextLogger: any;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET',
      url: '/test',
      path: '/test',
      body: { name: 'test' },
      query: { filter: 'active' },
      params: { id: '123' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      get: jest.fn((header: string) => {
        const headers: any = {
          'User-Agent': 'test-user-agent',
          'Content-Type': 'application/json',
          'Content-Length': '100'
        };
        return headers[header];
      })
    };

    mockRes = {
      set: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      get: jest.fn((header: string) => {
        const headers: any = {
          'Content-Type': 'application/json',
          'Content-Length': '200'
        };
        return headers[header];
      }),
      getHeaders: jest.fn().mockReturnValue({}),
      statusCode: 200,
      headersSent: false
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

  describe('Request Logger Middleware', () => {
    it('should generate request ID when not present', () => {
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBeDefined();
      expect(mockRes.set).toHaveBeenCalledWith('X-Request-ID', mockReq.requestId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing request ID when present', () => {
      const existingRequestId = 'existing-req-id';
      mockReq.headers['x-request-id'] = existingRequestId;

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(existingRequestId);
      expect(mockRes.set).toHaveBeenCalledWith('X-Request-ID', existingRequestId);
    });

    it('should set correlation ID header when present', () => {
      const correlationId = 'test-correlation-id';
      mockReq.headers['x-correlation-id'] = correlationId;

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.set).toHaveBeenCalledWith('X-Correlation-ID', correlationId);
    });

    it('should log incoming request with sanitized data', () => {
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          path: '/test',
          userAgent: 'test-user-agent',
          contentType: 'application/json',
          ip: '127.0.0.1',
          query: { filter: 'active' },
          params: { id: '123' },
          body: { name: 'test' }
        })
      );

      expect(loggerModule.sanitizeLogData).toHaveBeenCalledWith(mockReq.body);
      expect(loggerModule.sanitizeLogData).toHaveBeenCalledWith(mockReq.query);
      expect(loggerModule.sanitizeLogData).toHaveBeenCalledWith(mockReq.params);
    });

    it('should override res.json to log response', () => {
      const originalJson = mockRes.json;
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = { success: true };
      mockRes.json(responseBody);

      expect(originalJson).toHaveBeenCalledWith(responseBody);
      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 200,
          responseBody: { success: true }
        })
      );
    });

    it('should override res.send to log response', () => {
      const originalSend = mockRes.send;
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = 'Success';
      mockRes.send(responseBody);

      expect(originalSend).toHaveBeenCalledWith(responseBody);
      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 200,
          responseBody: 'Success'
        })
      );
    });

    it('should handle response finish event', () => {
      let finishCallback: Function;
      mockRes.on = jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      // Simulate response finish
      finishCallback!();

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 200
        })
      );
    });

    it('should not log body for large payloads', () => {
      mockReq.get = jest.fn().mockReturnValue('20000'); // Large content length

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          body: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should not log body for binary content types', () => {
      mockReq.get = jest.fn((header: string) => {
        if (header === 'Content-Type') return 'image/jpeg';
        return undefined;
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          body: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should not log body for health check endpoints', () => {
      mockReq.path = '/health';

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          body: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should log error responses with warn level', () => {
      mockRes.statusCode = 400;
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = { error: 'Bad request' };
      mockRes.json(responseBody);

      expect(mockContextLogger.warn).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 400,
          responseBody: { error: 'Bad request' }
        })
      );
    });

    it('should log server errors with error level', () => {
      mockRes.statusCode = 500;
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = { error: 'Internal server error' };
      mockRes.json(responseBody);

      expect(mockContextLogger.error).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 500,
          responseBody: { error: 'Internal server error' }
        })
      );
    });

    it('should call logHttpRequest with correct parameters', () => {
      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = { success: true };
      mockRes.json(responseBody);

      expect(loggerModule.logHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/test',
        200,
        expect.any(Number),
        expect.objectContaining({
          requestId: mockReq.requestId
        })
      );
    });
  });

  describe('Correlation ID Middleware', () => {
    it('should generate correlation ID when not present', () => {
      correlationIdMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.headers['x-correlation-id']).toBeDefined();
      expect(mockReq.headers['x-correlation-id']).toMatch(/^corr_\d+_[a-z0-9]+$/);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should preserve existing correlation ID', () => {
      const existingCorrelationId = 'existing-correlation-id';
      mockReq.headers['x-correlation-id'] = existingCorrelationId;

      correlationIdMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.headers['x-correlation-id']).toBe(existingCorrelationId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Performance Middleware', () => {
    it('should log performance metrics on response finish', () => {
      let finishCallback: Function;
      mockRes.on = jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      mockReq.requestId = 'test-req-id';
      performanceMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // Simulate response finish
      finishCallback!();

      expect(mockContextLogger.debug).toHaveBeenCalledWith(
        'Request performance',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          duration: expect.any(Number),
          statusCode: 200,
          category: 'performance'
        })
      );
    });

    it('should log slow request warning', (done) => {
      let finishCallback: Function;
      mockRes.on = jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      mockReq.requestId = 'test-req-id';
      
      // Mock Date.now to simulate slow request
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return 1000; // Start time
        }
        return 7000; // End time (6 seconds later - slow)
      });

      performanceMiddleware(mockReq, mockRes, mockNext);

      // Simulate response finish
      finishCallback!();

      expect(mockContextLogger.warn).toHaveBeenCalledWith(
        'Slow request detected',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          duration: 6000,
          threshold: 5000
        })
      );

      // Restore Date.now
      Date.now = originalDateNow;
      done();
    });

    it('should create context logger with correct parameters', () => {
      mockReq.requestId = 'test-req-id';
      mockReq.correlationId = 'test-correlation-id';

      let finishCallback: Function;
      mockRes.on = jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      performanceMiddleware(mockReq, mockRes, mockNext);
      finishCallback!();

      expect(loggerModule.createContextLogger).toHaveBeenCalledWith({
        requestId: 'test-req-id',
        correlationId: 'test-correlation-id',
        operation: 'GET /test'
      });
    });
  });

  describe('Body Logging Logic', () => {
    it('should not log multipart form data', () => {
      mockReq.get = jest.fn((header: string) => {
        if (header === 'Content-Type') return 'multipart/form-data';
        return undefined;
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          body: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should not log binary streams', () => {
      mockReq.get = jest.fn((header: string) => {
        if (header === 'Content-Type') return 'application/octet-stream';
        return undefined;
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          body: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should not log response body for large responses', () => {
      mockRes.get = jest.fn((header: string) => {
        if (header === 'Content-Length') return '20000';
        return undefined;
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const responseBody = { data: 'large response' };
      mockRes.json(responseBody);

      expect(mockContextLogger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          responseBody: '[BODY_NOT_LOGGED]'
        })
      );
    });

    it('should always log error response bodies', () => {
      mockRes.statusCode = 400;
      mockRes.get = jest.fn((header: string) => {
        if (header === 'Content-Length') return '20000'; // Large response
        return undefined;
      });

      requestLoggerMiddleware(mockReq, mockRes, mockNext);

      const errorBody = { error: 'Validation failed' };
      mockRes.json(errorBody);

      expect(mockContextLogger.warn).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          responseBody: { error: 'Validation failed' }
        })
      );
    });
  });
});