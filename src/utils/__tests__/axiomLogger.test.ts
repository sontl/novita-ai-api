import { AxiomLogger, axiomLogger, createComponentLogger, createRequestLogger } from '../axiomLogger';

// Mock winston logger
jest.mock('../logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn()
  },
  sanitizeLogData: jest.fn((data) => data)
}));

describe('AxiomLogger', () => {
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = require('../logger').logger;
    jest.clearAllMocks();
  });

  describe('Basic logging methods', () => {
    test('should log info messages with enriched context', () => {
      axiomLogger.info('Test message', {
        component: 'test',
        feature: 'logging'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          component: 'test',
          feature: 'logging',
          level: 'info',
          service: 'novita-gpu-instance-api',
          timestamp: expect.any(String),
          memoryUsage: expect.any(Number),
          tags: []
        })
      );
    });

    test('should log error messages with error context', () => {
      const error = new Error('Test error');
      
      axiomLogger.error('Test error message', {
        component: 'test',
        errorCode: 'TEST_001'
      }, error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test error message',
        expect.objectContaining({
          component: 'test',
          errorCode: 'TEST_001',
          level: 'error',
          errorType: 'Error',
          errorMessage: 'Test error',
          stackTrace: expect.any(String)
        })
      );
    });

    test('should log warnings with context', () => {
      axiomLogger.warn('Test warning', {
        component: 'test',
        tags: ['warning', 'test']
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Test warning',
        expect.objectContaining({
          component: 'test',
          level: 'warn',
          tags: ['warning', 'test']
        })
      );
    });

    test('should log debug messages', () => {
      axiomLogger.debug('Debug message', {
        component: 'test'
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Debug message',
        expect.objectContaining({
          component: 'test',
          level: 'debug'
        })
      );
    });
  });

  describe('HTTP request logging', () => {
    test('should log successful HTTP requests as info', () => {
      axiomLogger.httpRequest('GET', '/api/test', 200, 150, {
        customerId: 'cust-123'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'HTTP GET /api/test - 200',
        expect.objectContaining({
          level: 'info',
          component: 'http',
          action: 'request',
          httpMethod: 'GET',
          httpUrl: '/api/test',
          httpStatusCode: 200,
          responseTime: 150,
          customerId: 'cust-123',
          tags: ['http', 'request']
        })
      );
    });

    test('should log client errors as warnings', () => {
      axiomLogger.httpRequest('POST', '/api/test', 400, 100);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HTTP POST /api/test - 400',
        expect.objectContaining({
          level: 'warn',
          httpStatusCode: 400
        })
      );
    });

    test('should log server errors as errors', () => {
      axiomLogger.httpRequest('POST', '/api/test', 500, 200);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'HTTP POST /api/test - 500',
        expect.objectContaining({
          level: 'error',
          httpStatusCode: 500
        })
      );
    });
  });

  describe('Business event logging', () => {
    test('should log business events with proper structure', () => {
      axiomLogger.businessEvent('user_registered', {
        customerId: 'cust-456',
        metadata: {
          plan: 'premium',
          source: 'web'
        }
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Business Event: user_registered',
        expect.objectContaining({
          level: 'info',
          component: 'business',
          action: 'event',
          eventName: 'user_registered',
          customerId: 'cust-456',
          metadata: {
            plan: 'premium',
            source: 'web'
          },
          tags: ['business', 'event']
        })
      );
    });
  });

  describe('Performance logging', () => {
    test('should log fast operations as info', () => {
      axiomLogger.performance('database_query', 100, {
        operation: 'select'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performance: database_query',
        expect.objectContaining({
          level: 'info',
          component: 'performance',
          action: 'measurement',
          operation: 'database_query',
          duration: 100,
          tags: ['performance']
        })
      );
    });

    test('should log slow operations as warnings', () => {
      axiomLogger.performance('database_query', 6000, {
        operation: 'select'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Performance: database_query',
        expect.objectContaining({
          level: 'warn',
          duration: 6000
        })
      );
    });
  });

  describe('Security event logging', () => {
    test('should log low/medium security events as warnings', () => {
      axiomLogger.security('login_attempt', 'medium', {
        clientIp: '192.168.1.1'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Security Event: login_attempt',
        expect.objectContaining({
          level: 'warn',
          component: 'security',
          action: 'event',
          securityEvent: 'login_attempt',
          securitySeverity: 'medium',
          clientIp: '192.168.1.1',
          tags: ['security', 'medium']
        })
      );
    });

    test('should log high/critical security events as errors', () => {
      axiomLogger.security('brute_force_attack', 'critical', {
        clientIp: '10.0.0.1'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Security Event: brute_force_attack',
        expect.objectContaining({
          level: 'error',
          securitySeverity: 'critical'
        })
      );
    });
  });

  describe('Component logger', () => {
    test('should create logger with component context', () => {
      const componentLogger = createComponentLogger('test_service', 'test_feature');
      
      componentLogger.info('Test message');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          component: 'test_service',
          feature: 'test_feature'
        })
      );
    });
  });

  describe('Request logger', () => {
    test('should create logger with request context', () => {
      const requestLogger = createRequestLogger('req-123', 'corr-456');
      
      requestLogger.info('Request processed');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Request processed',
        expect.objectContaining({
          requestId: 'req-123',
          correlationId: 'corr-456',
          component: 'request'
        })
      );
    });
  });

  describe('Child logger', () => {
    test('should inherit parent context', () => {
      const parentLogger = new AxiomLogger({
        component: 'parent',
        customerId: 'cust-123'
      });

      const childLogger = parentLogger.child({
        feature: 'child_feature',
        sessionId: 'sess-456'
      });

      childLogger.info('Child message');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Child message',
        expect.objectContaining({
          component: 'parent',
          customerId: 'cust-123',
          feature: 'child_feature',
          sessionId: 'sess-456'
        })
      );
    });
  });

  describe('Context enrichment', () => {
    test('should add timestamp and memory usage', () => {
      axiomLogger.info('Test message');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          timestamp: expect.any(String),
          memoryUsage: expect.any(Number),
          service: 'novita-gpu-instance-api',
          environment: expect.any(String)
        })
      );
    });

    test('should ensure tags is always an array', () => {
      axiomLogger.info('Test message', {
        tags: 'not-an-array' as any
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          tags: []
        })
      );
    });
  });
});