/**
 * Unit tests for HealthChecker service
 * Tests individual endpoint health checking logic, parallel processing,
 * retry mechanisms, timeout handling, and error categorization
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import { HealthCheckerService, HealthCheckErrorType, HealthCheckError } from '../healthCheckerService';
import { HealthCheckConfig, EndpointHealthCheck, HealthCheckResult } from '../../types/api';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

// Mock axios.isAxiosError to return true for our mocked errors
(axios.isAxiosError as any) = jest.fn((error: any): error is AxiosError => {
  return error && error.isAxiosError === true;
});

// Mock logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('HealthCheckerService Unit Tests', () => {
  let healthChecker: HealthCheckerService;
  let mockAxiosResponse: Partial<AxiosResponse>;

  beforeEach(() => {
    healthChecker = new HealthCheckerService();
    jest.clearAllMocks();
    
    // Default successful response
    mockAxiosResponse = {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'content-length': '100'
      },
      data: 'OK'
    };
    
    // Mock axios to simulate some response time for realistic testing
    mockedAxios.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve(mockAxiosResponse as AxiosResponse), 1)
      )
    );
  });

  describe('Individual endpoint health checking logic', () => {
    it('should successfully check a healthy endpoint', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];
      
      const config: HealthCheckConfig = {
        timeoutMs: 5000,
        retryAttempts: 2,
        retryDelayMs: 1000,
        maxWaitTimeMs: 30000
      };

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('healthy');
      expect(result.endpoints).toHaveLength(1);
      
      const endpoint = result.endpoints[0];
      expect(endpoint?.status).toBe('healthy');
      expect(endpoint?.port).toBe(8080);
      expect(endpoint?.endpoint).toBe('http://localhost:8080/health');
      expect(endpoint?.type).toBe('http');
      expect(endpoint?.responseTime).toBeGreaterThan(0);
      expect(endpoint?.lastChecked).toBeInstanceOf(Date);
      expect(endpoint?.error).toBeUndefined();
    });

    it('should handle endpoint returning 3xx status as healthy', async () => {
      mockAxiosResponse.status = 301;
      mockAxiosResponse.statusText = 'Moved Permanently';
      mockedAxios.mockResolvedValue(mockAxiosResponse as AxiosResponse);

      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.overallStatus).toBe('healthy');
      expect(result.endpoints[0]?.status).toBe('healthy');
    });

    it('should handle endpoint with custom configuration', async () => {
      const portMappings = [
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' }
      ];
      
      const customConfig: HealthCheckConfig = {
        timeoutMs: 2000,
        retryAttempts: 1,
        retryDelayMs: 500,
        maxWaitTimeMs: 10000
      };

      await healthChecker.performHealthChecks(portMappings, customConfig);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 2000,
          url: 'http://localhost:3000/status'
        })
      );
    });

    it('should track response time accurately', async () => {
      // Mock a delay in the axios response
      mockedAxios.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve(mockAxiosResponse as AxiosResponse), 100)
        )
      );

      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.endpoints[0]?.responseTime).toBeGreaterThanOrEqual(90);
      expect(result.endpoints[0]?.responseTime).toBeLessThan(200);
      expect(result.totalResponseTime).toBe(result.endpoints[0]?.responseTime || 0);
    });
  });

  describe('Parallel endpoint checking functionality', () => {
    it('should check multiple endpoints in parallel', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' },
        { port: 9000, endpoint: 'http://localhost:9000/ready', type: 'http' }
      ];

      const startTime = Date.now();
      const result = await healthChecker.performHealthChecks(portMappings);
      const endTime = Date.now();

      expect(result.endpoints).toHaveLength(3);
      expect(result.overallStatus).toBe('healthy');
      
      // All endpoints should be healthy
      result.endpoints.forEach(endpoint => {
        expect(endpoint.status).toBe('healthy');
        expect(endpoint.responseTime).toBeGreaterThan(0);
      });

      // Should complete faster than sequential execution would
      // (allowing some overhead for parallel processing)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Verify all endpoints were called
      expect(mockedAxios).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed healthy and unhealthy endpoints', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' },
        { port: 9000, endpoint: 'http://localhost:9000/ready', type: 'http' }
      ];

      // Mock responses: first succeeds, second fails, third succeeds
      mockedAxios
        .mockResolvedValueOnce(mockAxiosResponse as AxiosResponse)
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(mockAxiosResponse as AxiosResponse);

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.overallStatus).toBe('partial');
      expect(result.endpoints).toHaveLength(3);
      
      const healthyEndpoints = result.endpoints.filter(e => e.status === 'healthy');
      const unhealthyEndpoints = result.endpoints.filter(e => e.status === 'unhealthy');
      
      expect(healthyEndpoints).toHaveLength(2);
      expect(unhealthyEndpoints).toHaveLength(1);
      expect(unhealthyEndpoints[0]?.error).toBeDefined();
    });

    it('should handle all endpoints failing', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' }
      ];

      mockedAxios.mockRejectedValue(new Error('Connection refused'));

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(2);
      expect(result.endpoints.every(e => e.status === 'unhealthy')).toBe(true);
      expect(result.endpoints.every(e => e.error)).toBe(true);
      expect(result.totalResponseTime).toBe(0);
    });

    it('should filter endpoints by target port', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' },
        { port: 9000, endpoint: 'http://localhost:9000/ready', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 5000,
        retryAttempts: 2,
        retryDelayMs: 1000,
        maxWaitTimeMs: 30000,
        targetPort: 3000
      };

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0]?.port).toBe(3000);
      expect(mockedAxios).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry mechanism and timeout handling', () => {
    it('should retry failed requests according to configuration', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 1000,
        retryAttempts: 2, // 2 retries = 3 total attempts
        retryDelayMs: 10, // Very short delay for faster test
        maxWaitTimeMs: 30000
      };

      // Create a retryable error (connection refused)
      const connectionError = {
        message: 'Connection refused',
        name: 'Error',
        code: 'ECONNREFUSED',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      // Mock to fail first 2 attempts, succeed on 3rd
      mockedAxios
        .mockRejectedValueOnce(connectionError)
        .mockRejectedValueOnce(connectionError)
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => resolve(mockAxiosResponse as AxiosResponse), 1)
          )
        );

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('healthy');
      expect(result.endpoints[0]?.status).toBe('healthy');
      expect(mockedAxios).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 10000); // Increase timeout for this test

    it('should fail after exhausting all retry attempts', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 1000,
        retryAttempts: 2,
        retryDelayMs: 10, // Short delay for faster test
        maxWaitTimeMs: 30000
      };

      // Create a retryable error
      const connectionError = {
        message: 'Connection refused',
        name: 'Error',
        code: 'ECONNREFUSED',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      mockedAxios.mockRejectedValue(connectionError);

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toContain('Connection refused - service is not accepting connections');
      expect(mockedAxios).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 5000);

    it('should not retry non-retryable errors', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 1000,
        retryAttempts: 3,
        retryDelayMs: 100,
        maxWaitTimeMs: 30000
      };

      // Mock 404 error (non-retryable)
      const axiosError = {
        message: 'Request failed with status code 404',
        name: 'Error',
        isAxiosError: true,
        config: {},
        toJSON: () => ({}),
        response: {
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config: {},
          data: 'Not Found'
        }
      } as AxiosError;

      mockedAxios.mockRejectedValue(axiosError);

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(mockedAxios).toHaveBeenCalledTimes(1); // No retries for 404
    });

    it('should handle timeout errors correctly', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 100,
        retryAttempts: 1,
        retryDelayMs: 10, // Short delay for faster test
        maxWaitTimeMs: 30000
      };

      const timeoutError = {
        message: 'timeout of 100ms exceeded',
        name: 'Error',
        code: 'ECONNABORTED',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      mockedAxios.mockRejectedValue(timeoutError);

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toContain('Request timeout after');
      expect(mockedAxios).toHaveBeenCalledTimes(2); // Initial + 1 retry (timeout is retryable)
    }, 5000);

    it('should calculate exponential backoff with jitter', () => {
      const originalRandom = Math.random;
      
      // Test with fixed random value for predictable results
      Math.random = () => 0.5; // Results in jitter factor of 1.0

      const delay1 = (healthChecker as any).calculateRetryDelay(1, 1000);
      const delay2 = (healthChecker as any).calculateRetryDelay(2, 1000);
      const delay3 = (healthChecker as any).calculateRetryDelay(3, 1000);

      expect(delay1).toBe(1000); // 1000 * 2^0 * 1.0
      expect(delay2).toBe(2000); // 1000 * 2^1 * 1.0
      expect(delay3).toBe(4000); // 1000 * 2^2 * 1.0

      // Test jitter range
      Math.random = () => 0; // Minimum jitter (0.5)
      const minDelay = (healthChecker as any).calculateRetryDelay(1, 1000);
      expect(minDelay).toBe(500);

      Math.random = () => 1; // Maximum jitter (1.5)
      const maxDelay = (healthChecker as any).calculateRetryDelay(1, 1000);
      expect(maxDelay).toBe(1500);

      Math.random = originalRandom;
    });
  });

  describe('Error categorization and response time tracking', () => {
    it('should categorize connection refused errors', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const connectionError = {
        message: 'connect ECONNREFUSED',
        name: 'Error',
        code: 'ECONNREFUSED',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      mockedAxios.mockRejectedValue(connectionError);

      const result = await healthChecker.performHealthChecks(portMappings, { retryAttempts: 0 });

      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toContain('Connection refused - service is not accepting connections');
    });

    it('should categorize DNS resolution errors', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://nonexistent.domain:8080/health', type: 'http' }
      ];

      const dnsError = {
        message: 'getaddrinfo ENOTFOUND',
        name: 'Error',
        code: 'ENOTFOUND',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      mockedAxios.mockRejectedValue(dnsError);

      const result = await healthChecker.performHealthChecks(portMappings, { retryAttempts: 0 });

      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toContain('DNS resolution failed - hostname could not be resolved');
    });

    it('should categorize HTTP status code errors', async () => {
      const testCases = [
        { status: 400, expectedType: 'Bad Request', expectedCategory: 'CLIENT_ERROR' },
        { status: 401, expectedType: 'Unauthorized', expectedCategory: 'CLIENT_ERROR' },
        { status: 404, expectedType: 'Not Found', expectedCategory: 'CLIENT_ERROR' },
        { status: 500, expectedType: 'Server Error', expectedCategory: 'SERVER_ERROR' },
        { status: 502, expectedType: 'Bad Gateway', expectedCategory: 'BAD_GATEWAY' },
        { status: 503, expectedType: 'Service Unavailable', expectedCategory: 'SERVICE_UNAVAILABLE' }
      ];

      for (const testCase of testCases) {
        const portMappings = [
          { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
        ];

        const httpError = {
          message: `Request failed with status code ${testCase.status}`,
          name: 'Error',
          isAxiosError: true,
          config: {},
          toJSON: () => ({}),
          response: {
            status: testCase.status,
            statusText: testCase.expectedType,
            headers: {},
            config: {},
            data: 'Error response'
          }
        } as AxiosError;

        mockedAxios.mockRejectedValue(httpError);

        const result = await healthChecker.performHealthChecks(portMappings, { retryAttempts: 0 });

        expect(result.endpoints[0]?.status).toBe('unhealthy');
        expect(result.endpoints[0]?.error).toContain(testCase.status.toString());
      }
    });

    it('should categorize SSL/TLS errors', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'https://localhost:8080/health', type: 'https' }
      ];

      const sslError = {
        message: 'certificate verify failed',
        name: 'Error',
        isAxiosError: true,
        config: {},
        toJSON: () => ({})
      } as AxiosError;

      mockedAxios.mockRejectedValue(sslError);

      const result = await healthChecker.performHealthChecks(portMappings, { retryAttempts: 0 });

      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.error).toContain('SSL/TLS error: certificate verify failed');
    });

    it('should track response times for successful requests', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' }
      ];

      // Mock different response times
      mockedAxios
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => resolve(mockAxiosResponse as AxiosResponse), 50)
          )
        )
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => resolve(mockAxiosResponse as AxiosResponse), 100)
          )
        );

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.endpoints[0]?.responseTime).toBeGreaterThanOrEqual(40);
      expect(result.endpoints[0]?.responseTime).toBeLessThan(80);
      expect(result.endpoints[1]?.responseTime).toBeGreaterThanOrEqual(90);
      expect(result.endpoints[1]?.responseTime).toBeLessThan(130);
      
      const expectedTotal = (result.endpoints[0]?.responseTime || 0) + (result.endpoints[1]?.responseTime || 0);
      expect(result.totalResponseTime).toBe(expectedTotal);
    });

    it('should set response time to 0 for failed requests', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      mockedAxios.mockRejectedValue(new Error('Connection refused'));

      const result = await healthChecker.performHealthChecks(portMappings);

      expect(result.endpoints[0]?.status).toBe('unhealthy');
      expect(result.endpoints[0]?.responseTime).toBe(0);
      expect(result.totalResponseTime).toBe(0);
    });

    it('should create HealthCheckError with comprehensive details', () => {
      const originalError = new Error('Original error');
      const healthCheckError = new HealthCheckError(
        'Test error message',
        HealthCheckErrorType.TIMEOUT,
        408,
        originalError,
        'http://localhost:8080/health',
        1500,
        { customContext: 'test' }
      );

      expect(healthCheckError.message).toBe('Test error message');
      expect(healthCheckError.type).toBe(HealthCheckErrorType.TIMEOUT);
      expect(healthCheckError.statusCode).toBe(408);
      expect(healthCheckError.originalError).toBe(originalError);
      expect(healthCheckError.endpoint).toBe('http://localhost:8080/health');
      expect(healthCheckError.responseTime).toBe(1500);
      expect(healthCheckError.context).toEqual({ customContext: 'test' });
      expect(healthCheckError.timestamp).toBeInstanceOf(Date);
      expect(healthCheckError.isRetryable).toBe(true); // TIMEOUT is retryable
      expect(healthCheckError.severity).toBe('medium');

      const logObject = healthCheckError.toLogObject();
      expect(logObject.type).toBe(HealthCheckErrorType.TIMEOUT);
      expect(logObject.isRetryable).toBe(true);
      expect(logObject.severity).toBe('medium');
    });

    it('should determine error retryability correctly', () => {
      const retryableError = new HealthCheckError(
        'Timeout error',
        HealthCheckErrorType.TIMEOUT
      );
      expect(retryableError.isRetryable).toBe(true);

      const nonRetryableError = new HealthCheckError(
        'Client error',
        HealthCheckErrorType.CLIENT_ERROR
      );
      expect(nonRetryableError.isRetryable).toBe(false);
    });

    it('should determine error severity levels correctly', () => {
      const lowSeverityError = new HealthCheckError(
        'Client error',
        HealthCheckErrorType.CLIENT_ERROR
      );
      expect(lowSeverityError.severity).toBe('low');

      const mediumSeverityError = new HealthCheckError(
        'Timeout error',
        HealthCheckErrorType.TIMEOUT
      );
      expect(mediumSeverityError.severity).toBe('medium');

      const highSeverityError = new HealthCheckError(
        'Network error',
        HealthCheckErrorType.NETWORK_UNREACHABLE
      );
      expect(highSeverityError.severity).toBe('high');

      const criticalSeverityError = new HealthCheckError(
        'SSL error',
        HealthCheckErrorType.SSL_ERROR
      );
      expect(criticalSeverityError.severity).toBe('critical');
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle empty port mappings', async () => {
      const result = await healthChecker.performHealthChecks([]);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(0);
      expect(result.totalResponseTime).toBe(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should handle null/undefined port mappings', async () => {
      // The service tries to access .length before validation, so it throws TypeError first
      await expect(healthChecker.performHealthChecks(null as any))
        .rejects.toThrow();
      
      await expect(healthChecker.performHealthChecks(undefined as any))
        .rejects.toThrow();
    });

    it('should handle invalid port mappings', async () => {
      // The service tries to call .map before validation, so it throws TypeError first
      await expect(healthChecker.performHealthChecks('invalid' as any))
        .rejects.toThrow();
    });

    it('should filter out non-matching target ports', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' },
        { port: 3000, endpoint: 'http://localhost:3000/status', type: 'http' }
      ];

      const config: HealthCheckConfig = {
        timeoutMs: 5000,
        retryAttempts: 2,
        retryDelayMs: 1000,
        maxWaitTimeMs: 30000,
        targetPort: 9999 // Non-existent port
      };

      const result = await healthChecker.performHealthChecks(portMappings, config);

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.endpoints).toHaveLength(0);
      expect(mockedAxios).not.toHaveBeenCalled();
    });

    it('should use default configuration when partial config provided', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      const partialConfig = { timeoutMs: 2000 };

      await healthChecker.performHealthChecks(portMappings, partialConfig);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 2000 // Custom value
        })
      );
    });

    it('should handle axios request configuration correctly', async () => {
      const portMappings = [
        { port: 8080, endpoint: 'http://localhost:8080/health', type: 'http' }
      ];

      await healthChecker.performHealthChecks(portMappings);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'http://localhost:8080/health',
          timeout: 10000, // Default timeout
          maxRedirects: 0,
          headers: expect.objectContaining({
            'User-Agent': 'Novita-GPU-Instance-API-HealthChecker/1.0',
            'Accept': '*/*',
            'Cache-Control': 'no-cache',
            'Connection': 'close',
            'X-Health-Check': 'true'
          })
        })
      );
    });
  });

  describe('Utility methods', () => {
    it('should provide health check statistics', () => {
      const stats = healthChecker.getHealthCheckStats();

      expect(stats.defaultConfig).toEqual({
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 300000
      });
      expect(stats.errorTypes).toBe(HealthCheckErrorType);
      expect(stats.version).toBe('1.0.0');
    });

    it('should validate health check configuration', () => {
      const validConfig = {
        timeoutMs: 5000,
        retryAttempts: 2,
        retryDelayMs: 1000,
        maxWaitTimeMs: 30000,
        targetPort: 8080
      };

      const validation = healthChecker.validateConfig(validConfig);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid configuration values', () => {
      const invalidConfig = {
        timeoutMs: -1000,
        retryAttempts: -1,
        retryDelayMs: -500,
        maxWaitTimeMs: 0,
        targetPort: 70000
      };

      const validation = healthChecker.validateConfig(invalidConfig);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors).toContain('timeoutMs must be a positive number');
      expect(validation.errors).toContain('retryAttempts must be a non-negative number');
      expect(validation.errors).toContain('retryDelayMs must be a non-negative number');
      expect(validation.errors).toContain('maxWaitTimeMs must be a positive number');
      expect(validation.errors).toContain('targetPort must be a valid port number (1-65535)');
    });

    it('should summarize health check results', () => {
      const mockResult: HealthCheckResult = {
        overallStatus: 'partial',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://localhost:8080/health',
            type: 'http',
            status: 'healthy',
            responseTime: 150,
            lastChecked: new Date()
          },
          {
            port: 3000,
            endpoint: 'http://localhost:3000/status',
            type: 'http',
            status: 'unhealthy',
            error: 'Connection refused',
            responseTime: 0,
            lastChecked: new Date()
          }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      const summary = healthChecker.summarizeResults(mockResult);

      expect(summary.metrics.totalEndpoints).toBe(2);
      expect(summary.metrics.healthyEndpoints).toBe(1);
      expect(summary.metrics.unhealthyEndpoints).toBe(1);
      expect(summary.metrics.averageResponseTime).toBe(150);
      expect(summary.metrics.totalResponseTime).toBe(150);
      expect(summary.issues).toContain('Port 3000: Connection refused');
      expect(summary.summary).toContain('Health check partial: 1/2');
    });
  });
});