// Mock winston first
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  http: jest.fn()
};

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockLogger),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn()
  },
  transports: {
    Console: jest.fn()
  }
}));

// Mock config
jest.mock('../../config/config', () => ({
  config: {
    logLevel: 'info',
    nodeEnv: 'test'
  }
}));

import winston from 'winston';
import { 
  createContextLogger, 
  sanitizeLogData, 
  logPerformance, 
  logHttpRequest,
  LogContext 
} from '../logger';

describe('Logger Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Context Logger', () => {
    it('should create context logger with provided context', () => {
      const context: LogContext = {
        requestId: 'test-req-id',
        correlationId: 'test-corr-id',
        operation: 'test-operation'
      };

      const contextLogger = createContextLogger(context);

      contextLogger.info('Test message', { extra: 'data' });

      expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
        requestId: 'test-req-id',
        correlationId: 'test-corr-id',
        operation: 'test-operation',
        extra: 'data'
      });
    });

    it('should create context logger with empty context', () => {
      const contextLogger = createContextLogger();

      contextLogger.error('Error message');

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', {});
    });

    it('should support all log levels', () => {
      const contextLogger = createContextLogger({ requestId: 'test' });

      contextLogger.error('Error message');
      contextLogger.warn('Warning message');
      contextLogger.info('Info message');
      contextLogger.debug('Debug message');
      contextLogger.http('HTTP message');

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', { requestId: 'test' });
      expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', { requestId: 'test' });
      expect(mockLogger.info).toHaveBeenCalledWith('Info message', { requestId: 'test' });
      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', { requestId: 'test' });
      expect(mockLogger.http).toHaveBeenCalledWith('HTTP message', { requestId: 'test' });
    });

    it('should merge context with additional metadata', () => {
      const context: LogContext = {
        requestId: 'test-req-id',
        userId: 'user-123'
      };

      const contextLogger = createContextLogger(context);

      contextLogger.info('Test message', { 
        operation: 'create_instance',
        duration: 1500 
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
        requestId: 'test-req-id',
        userId: 'user-123',
        operation: 'create_instance',
        duration: 1500
      });
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize sensitive fields', () => {
      const data = {
        name: 'John Doe',
        password: 'secret123',
        apiKey: 'api-key-123',
        token: 'bearer-token',
        authorization: 'Bearer xyz',
        webhookUrl: 'https://example.com/webhook',
        publicData: 'safe-data'
      };

      const sanitized = sanitizeLogData(data);

      expect(sanitized).toEqual({
        name: 'John Doe',
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        token: '[REDACTED]',
        authorization: '[REDACTED]',
        webhookUrl: '[REDACTED]',
        publicData: 'safe-data'
      });
    });

    it('should sanitize nested objects', () => {
      const data = {
        user: {
          name: 'John Doe',
          password: 'secret123'
        },
        config: {
          apiKey: 'api-key-123',
          timeout: 5000
        }
      };

      const sanitized = sanitizeLogData(data);

      expect(sanitized).toEqual({
        user: {
          name: 'John Doe',
          password: '[REDACTED]'
        },
        config: {
          apiKey: '[REDACTED]',
          timeout: 5000
        }
      });
    });

    it('should sanitize arrays', () => {
      const data = [
        { name: 'Item 1', secret: 'secret1' },
        { name: 'Item 2', secret: 'secret2' }
      ];

      const sanitized = sanitizeLogData(data);

      expect(sanitized).toEqual([
        { name: 'Item 1', secret: '[REDACTED]' },
        { name: 'Item 2', secret: '[REDACTED]' }
      ]);
    });

    it('should handle case-insensitive field matching', () => {
      const data = {
        PASSWORD: 'secret',
        ApiKey: 'key123',
        X_AUTH_TOKEN: 'token123'
      };

      const sanitized = sanitizeLogData(data);

      expect(sanitized).toEqual({
        PASSWORD: '[REDACTED]',
        ApiKey: '[REDACTED]',
        X_AUTH_TOKEN: '[REDACTED]'
      });
    });

    it('should handle non-object data', () => {
      expect(sanitizeLogData('string')).toBe('string');
      expect(sanitizeLogData(123)).toBe(123);
      expect(sanitizeLogData(null)).toBe(null);
      expect(sanitizeLogData(undefined)).toBe(undefined);
    });

    it('should handle circular references gracefully', () => {
      const data: any = { name: 'test' };
      data.self = data;

      // Should not throw an error
      expect(() => sanitizeLogData(data)).not.toThrow();
    });
  });

  describe('Performance Logging', () => {
    it('should log normal operation performance', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      const context: LogContext = { requestId: 'test-req-id' };

      logPerformance('test_operation', startTime, context);

      expect(mockLogger.debug).toHaveBeenCalledWith('Operation completed', {
        requestId: 'test-req-id',
        operation: 'test_operation',
        duration: expect.any(Number)
      });
    });

    it('should log slow operation warning', () => {
      const startTime = Date.now() - 6000; // 6 seconds ago (slow)
      const context: LogContext = { requestId: 'test-req-id' };

      logPerformance('slow_operation', startTime, context);

      expect(mockLogger.warn).toHaveBeenCalledWith('Slow operation detected', {
        requestId: 'test-req-id',
        operation: 'slow_operation',
        duration: expect.any(Number),
        threshold: 5000
      });
    });

    it('should work without context', () => {
      const startTime = Date.now() - 1000;

      logPerformance('test_operation', startTime);

      expect(mockLogger.debug).toHaveBeenCalledWith('Operation completed', {
        operation: 'test_operation',
        duration: expect.any(Number)
      });
    });
  });

  describe('HTTP Request Logging', () => {
    it('should log successful HTTP requests', () => {
      const context: LogContext = { 
        requestId: 'test-req-id',
        correlationId: 'test-corr-id'
      };

      logHttpRequest('GET', '/api/instances', 200, 150, context);

      expect(mockLogger.info).toHaveBeenCalledWith('HTTP Request', {
        requestId: 'test-req-id',
        correlationId: 'test-corr-id',
        method: 'GET',
        url: '/api/instances',
        statusCode: 200,
        duration: 150,
        category: 'http_request'
      });
    });

    it('should log client errors with warn level', () => {
      const context: LogContext = { requestId: 'test-req-id' };

      logHttpRequest('POST', '/api/instances', 400, 50, context);

      expect(mockLogger.warn).toHaveBeenCalledWith('HTTP Request', {
        requestId: 'test-req-id',
        method: 'POST',
        url: '/api/instances',
        statusCode: 400,
        duration: 50,
        category: 'http_request'
      });
    });

    it('should log server errors with error level', () => {
      const context: LogContext = { requestId: 'test-req-id' };

      logHttpRequest('GET', '/api/instances/123', 500, 2000, context);

      expect(mockLogger.error).toHaveBeenCalledWith('HTTP Request', {
        requestId: 'test-req-id',
        method: 'GET',
        url: '/api/instances/123',
        statusCode: 500,
        duration: 2000,
        category: 'http_request'
      });
    });

    it('should work without context', () => {
      logHttpRequest('GET', '/health', 200, 10);

      expect(mockLogger.info).toHaveBeenCalledWith('HTTP Request', {
        method: 'GET',
        url: '/health',
        statusCode: 200,
        duration: 10,
        category: 'http_request'
      });
    });
  });

  describe('Logger Configuration', () => {
    it('should create logger with correct configuration', () => {
      // Re-import to trigger logger creation
      jest.resetModules();
      require('../logger');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          defaultMeta: expect.objectContaining({
            service: 'novita-gpu-instance-api',
            environment: 'test'
          }),
          exitOnError: false
        })
      );
    });

    it('should configure console transport with structured format', () => {
      jest.resetModules();
      require('../logger');

      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          handleExceptions: true,
          handleRejections: true
        })
      );
    });
  });

  describe('Structured Logging Format', () => {
    it('should include all required fields in log entry', () => {
      const context: LogContext = {
        requestId: 'test-req-id',
        correlationId: 'test-corr-id',
        operation: 'test-operation',
        userId: 'user-123'
      };

      const contextLogger = createContextLogger(context);
      contextLogger.info('Test message', { 
        statusCode: 200,
        duration: 150 
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
        requestId: 'test-req-id',
        correlationId: 'test-corr-id',
        operation: 'test-operation',
        userId: 'user-123',
        statusCode: 200,
        duration: 150
      });
    });

    it('should handle missing optional fields gracefully', () => {
      const context: LogContext = {
        requestId: 'test-req-id'
        // Missing correlationId, operation, etc.
      };

      const contextLogger = createContextLogger(context);
      contextLogger.info('Test message');

      expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
        requestId: 'test-req-id'
      });
    });
  });
});