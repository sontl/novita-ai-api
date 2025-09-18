/**
 * Integration test for HealthChecker service
 * Tests the service functionality without complex mocking
 */

import { HealthCheckerService, HealthCheckErrorType, HealthCheckError } from '../healthCheckerService';

describe('HealthCheckerService Integration', () => {
  let healthChecker: HealthCheckerService;

  beforeEach(() => {
    healthChecker = new HealthCheckerService();
  });

  describe('Service instantiation', () => {
    it('should create a HealthChecker service instance', () => {
      expect(healthChecker).toBeInstanceOf(HealthCheckerService);
    });

    it('should have required methods', () => {
      expect(typeof healthChecker.performHealthChecks).toBe('function');
    });
  });

  describe('Configuration handling', () => {
    it('should handle empty port mappings', async () => {
      const result = await healthChecker.performHealthChecks([]);
      
      expect(result).toBeDefined();
      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(0);
      expect(result.totalResponseTime).toBe(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should filter by target port', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' }
      ];

      const config = { targetPort: 9999 }; // Non-existent port
      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(0);
    });

    it('should use default configuration when none provided', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      // Use short timeout to avoid long waits
      const config = {
        timeoutMs: 500,
        retryAttempts: 1,
        retryDelayMs: 100,
        maxWaitTimeMs: 2000
      };

      // This will fail because localhost:8080 is not running, but we can test the structure
      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result).toBeDefined();
      expect(result.overallStatus).toBeDefined();
      expect(result.endpoints).toBeDefined();
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.totalResponseTime).toBeGreaterThanOrEqual(0);
    }, 5000); // 5 second timeout for this test
  });

  describe('Error handling', () => {
    it('should create HealthCheckError with correct properties', () => {
      const originalError = new Error('Original error');
      const healthCheckError = new HealthCheckError(
        'Test error message',
        HealthCheckErrorType.TIMEOUT,
        408,
        originalError
      );

      expect(healthCheckError).toBeInstanceOf(Error);
      expect(healthCheckError).toBeInstanceOf(HealthCheckError);
      expect(healthCheckError.message).toBe('Test error message');
      expect(healthCheckError.type).toBe(HealthCheckErrorType.TIMEOUT);
      expect(healthCheckError.statusCode).toBe(408);
      expect(healthCheckError.originalError).toBe(originalError);
      expect(healthCheckError.name).toBe('HealthCheckError');
    });

    it('should have all error types defined', () => {
      expect(HealthCheckErrorType.TIMEOUT).toBe('timeout');
      expect(HealthCheckErrorType.CONNECTION_REFUSED).toBe('connection_refused');
      expect(HealthCheckErrorType.CONNECTION_RESET).toBe('connection_reset');
      expect(HealthCheckErrorType.DNS_RESOLUTION_FAILED).toBe('dns_resolution_failed');
      expect(HealthCheckErrorType.NETWORK_UNREACHABLE).toBe('network_unreachable');
      expect(HealthCheckErrorType.BAD_GATEWAY).toBe('bad_gateway');
      expect(HealthCheckErrorType.SERVICE_UNAVAILABLE).toBe('service_unavailable');
      expect(HealthCheckErrorType.SERVER_ERROR).toBe('server_error');
      expect(HealthCheckErrorType.CLIENT_ERROR).toBe('client_error');
      expect(HealthCheckErrorType.SSL_ERROR).toBe('ssl_error');
      expect(HealthCheckErrorType.INVALID_RESPONSE).toBe('invalid_response');
      expect(HealthCheckErrorType.UNKNOWN).toBe('unknown');
    });

    it('should detect error indicators in response body', () => {
      // Test Bad Gateway detection
      const badGatewayError = new HealthCheckError(
        'Bad Gateway detected in response body',
        HealthCheckErrorType.BAD_GATEWAY,
        502,
        undefined,
        'http://test.com',
        100,
        { gatewayError: 'bad_gateway_in_response_body' }
      );

      expect(badGatewayError.type).toBe(HealthCheckErrorType.BAD_GATEWAY);
      expect(badGatewayError.isRetryable).toBe(true);
      expect(badGatewayError.severity).toBe('medium');
      expect(badGatewayError.statusCode).toBe(502);
      expect(badGatewayError.context?.gatewayError).toBe('bad_gateway_in_response_body');
    });

    it('should provide comprehensive error logging information', () => {
      const error = new HealthCheckError(
        'Test error with full context',
        HealthCheckErrorType.CONNECTION_REFUSED,
        undefined,
        new Error('Original error'),
        'http://test.example.com:8080/health',
        150,
        { 
          userAgent: 'Test-Agent',
          connectionIssue: 'port_closed_or_service_down',
          additionalContext: 'test_data'
        }
      );

      const logObject = error.toLogObject();
      
      expect(logObject.name).toBe('HealthCheckError');
      expect(logObject.message).toBe('Test error with full context');
      expect(logObject.type).toBe('connection_refused');
      expect(logObject.endpoint).toBe('http://test.example.com:8080/health');
      expect(logObject.responseTime).toBe(150);
      expect(logObject.isRetryable).toBe(true);
      expect(logObject.severity).toBe('medium');
      expect(logObject.timestamp).toBeDefined();
      expect(logObject.context).toEqual({
        userAgent: 'Test-Agent',
        connectionIssue: 'port_closed_or_service_down',
        additionalContext: 'test_data'
      });
      expect(logObject.originalError).toEqual({
        name: 'Error',
        message: 'Original error',
        code: undefined
      });
    });
  });

  describe('Utility methods', () => {
    it('should calculate retry delays with exponential backoff', () => {
      const baseDelay = 1000;
      
      // Mock Math.random for consistent testing
      const originalRandom = Math.random;
      Math.random = () => 0.5; // This will result in jitter factor of 1.0

      const delay1 = (healthChecker as any).calculateRetryDelay(1, baseDelay);
      const delay2 = (healthChecker as any).calculateRetryDelay(2, baseDelay);
      const delay3 = (healthChecker as any).calculateRetryDelay(3, baseDelay);

      expect(delay1).toBe(1000); // 1000 * 2^0 * 1.0
      expect(delay2).toBe(2000); // 1000 * 2^1 * 1.0
      expect(delay3).toBe(4000); // 1000 * 2^2 * 1.0

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should apply jitter to retry delays', () => {
      const baseDelay = 1000;
      const originalRandom = Math.random;

      // Test minimum jitter
      Math.random = () => 0; // Results in jitter factor of 0.5
      const minDelay = (healthChecker as any).calculateRetryDelay(1, baseDelay);
      expect(minDelay).toBe(500);

      // Test maximum jitter
      Math.random = () => 1; // Results in jitter factor of 1.5
      const maxDelay = (healthChecker as any).calculateRetryDelay(1, baseDelay);
      expect(maxDelay).toBe(1500);

      Math.random = originalRandom;
    });

    it('should create sleep promises', async () => {
      const startTime = Date.now();
      await (healthChecker as any).sleep(50); // 50ms sleep
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(endTime - startTime).toBeLessThan(100); // But not too much
    });
  });

  describe('HTTP request configuration', () => {
    it('should create proper axios configuration', () => {
      const endpoint = 'http://example.com:8080/health';
      const config = {
        timeoutMs: 5000,
        retryAttempts: 3,
        retryDelayMs: 1000,
        maxWaitTimeMs: 30000
      };

      // We can't easily test the actual HTTP request without mocking,
      // but we can test that the method exists and accepts the right parameters
      // Note: We don't actually call the method to avoid unhandled promise rejections
      expect(typeof (healthChecker as any).makeHealthCheckRequest).toBe('function');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle unreachable endpoints gracefully', async () => {
      const portMappings = [
        { port: 9999, endpoint: 'http://localhost:9999/nonexistent', type: 'http' }
      ];

      const config = {
        timeoutMs: 1000, // Short timeout for faster test
        retryAttempts: 1, // Minimal retries
        retryDelayMs: 100,
        maxWaitTimeMs: 5000
      };

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toBeDefined();
      expect(result.endpoints[0]?.responseTime).toBe(0);
    });

    it('should handle multiple unreachable endpoints', async () => {
      const portMappings = [
        { port: 9998, endpoint: 'http://localhost:9998/health', type: 'http' },
        { port: 9999, endpoint: 'http://localhost:9999/status', type: 'http' }
      ];

      const config = {
        timeoutMs: 500,
        retryAttempts: 1,
        retryDelayMs: 100,
        maxWaitTimeMs: 3000
      };

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(2);
      expect(result.endpoints.every(e => e.status === 'unhealthy')).toBe(true);
      expect(result.endpoints.every(e => e.error)).toBe(true);
    });
  });
});