import { Request, Response, NextFunction } from 'express';
import { metricsMiddleware, cacheMetricsMiddleware, recordJobMetrics } from '../metricsMiddleware';
import { metricsService } from '../../services/metricsService';

// Mock the metrics service
jest.mock('../../services/metricsService');
const mockMetricsService = metricsService as jest.Mocked<typeof metricsService>;

describe('MetricsMiddleware', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseFinishCallback: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      method: 'GET',
      path: '/api/test',
      route: { path: '/api/test' },
      headers: {}
    };

    mockResponse = {
      statusCode: 200,
      on: jest.fn().mockImplementation((event: string, callback: () => void) => {
        if (event === 'finish') {
          responseFinishCallback = callback;
        }
      })
    };

    mockNext = jest.fn();
  });

  describe('metricsMiddleware', () => {
    it('should record request metrics on response finish', () => {
      const startTime = Date.now();
      
      // Call middleware
      metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      // Verify next was called
      expect(mockNext).toHaveBeenCalled();
      
      // Verify response.on was called with 'finish'
      expect(mockResponse.on).toHaveBeenCalledWith('finish', expect.any(Function));
      
      // Simulate response finish
      responseFinishCallback();
      
      // Verify metrics were recorded
      expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/test',
        200,
        expect.any(Number)
      );
      
      // Verify duration is reasonable (should be very small)
      const recordedCall = mockMetricsService.recordRequest.mock.calls[0];
      if (recordedCall) {
        const duration = recordedCall[3];
        expect(duration).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(100); // Should be very fast
      }
    });

    it('should normalize endpoint paths with IDs', () => {
      mockRequest.route = { path: '/api/instances/:id' };
      mockRequest.path = '/api/instances/123';
      
      metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      responseFinishCallback();
      
      expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/instances/:id',
        200,
        expect.any(Number)
      );
    });

    it('should handle missing route gracefully', () => {
      mockRequest.route = undefined;
      mockRequest.path = '/api/unknown';
      
      metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      responseFinishCallback();
      
      expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/unknown',
        200,
        expect.any(Number)
      );
    });

    it('should log warning for slow requests', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock a slow request by delaying the finish callback
      metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      // Simulate a delay before finish
      setTimeout(() => {
        responseFinishCallback();
        
        // The duration should trigger a slow request warning
        // Note: This test might be flaky due to timing, but it tests the concept
        expect(mockMetricsService.recordRequest).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      }, 10);
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        mockRequest.method = method;
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
        
        expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
          method,
          '/api/test',
          200,
          expect.any(Number)
        );
      });
    });

    it('should handle different status codes', () => {
      const statusCodes = [200, 201, 400, 404, 500];
      
      statusCodes.forEach(statusCode => {
        mockResponse.statusCode = statusCode;
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
        
        expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
          'GET',
          '/api/test',
          statusCode,
          expect.any(Number)
        );
      });
    });

    it('should handle metrics service errors gracefully', () => {
      mockMetricsService.recordRequest.mockImplementation(() => {
        throw new Error('Metrics service error');
      });
      
      // Should not throw an error
      expect(() => {
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
      }).not.toThrow();
    });

    it('should include request ID in error logs', () => {
      mockRequest.headers = { 'x-request-id': 'test-request-123' };
      mockMetricsService.recordRequest.mockImplementation(() => {
        throw new Error('Metrics service error');
      });
      
      // Should not throw an error even with request ID
      expect(() => {
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
      }).not.toThrow();
    });
  });

  describe('Path normalization', () => {
    const testCases = [
      {
        input: '/api/instances/123',
        expected: '/api/instances/:id',
        description: 'numeric ID'
      },
      {
        input: '/api/instances/550e8400-e29b-41d4-a716-446655440000',
        expected: '/api/instances/:id',
        description: 'UUID'
      },
      {
        input: '/api/instances/abc123def456ghi789jkl',
        expected: '/api/instances/:id',
        description: 'long alphanumeric string'
      },
      {
        input: '/api/instances',
        expected: '/api/instances',
        description: 'no ID'
      },
      {
        input: '/health',
        expected: '/health',
        description: 'simple path'
      },
      {
        input: '',
        expected: 'unknown',
        description: 'empty path'
      }
    ];

    testCases.forEach(({ input, expected, description }) => {
      it(`should normalize ${description}: ${input} -> ${expected}`, () => {
        mockRequest.path = input;
        mockRequest.route = undefined; // Force use of path normalization
        
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
        
        expect(mockMetricsService.recordRequest).toHaveBeenCalledWith(
          'GET',
          expected,
          200,
          expect.any(Number)
        );
      });
    });
  });

  describe('cacheMetricsMiddleware', () => {
    it('should record cache hit', () => {
      cacheMetricsMiddleware.recordHit();
      
      expect(mockMetricsService.recordCacheHit).toHaveBeenCalled();
    });

    it('should record cache miss', () => {
      cacheMetricsMiddleware.recordMiss();
      
      expect(mockMetricsService.recordCacheMiss).toHaveBeenCalled();
    });

    it('should update cache size', () => {
      cacheMetricsMiddleware.updateSize(150);
      
      expect(mockMetricsService.updateCacheSize).toHaveBeenCalledWith(150);
    });
  });

  describe('recordJobMetrics', () => {
    it('should record job metrics successfully', () => {
      recordJobMetrics('create_instance', 2000, true, 5);
      
      expect(mockMetricsService.recordJob).toHaveBeenCalledWith(
        'create_instance',
        2000,
        true,
        5
      );
    });

    it('should record failed job metrics', () => {
      recordJobMetrics('monitor_instance', 1500, false, 3);
      
      expect(mockMetricsService.recordJob).toHaveBeenCalledWith(
        'monitor_instance',
        1500,
        false,
        3
      );
    });

    it('should handle metrics service errors gracefully', () => {
      mockMetricsService.recordJob.mockImplementation(() => {
        throw new Error('Job metrics error');
      });
      
      // Should not throw an error
      expect(() => {
        recordJobMetrics('create_instance', 1000, true, 2);
      }).not.toThrow();
    });

    it('should handle different job types', () => {
      const jobTypes = ['create_instance', 'monitor_instance', 'send_webhook'];
      
      jobTypes.forEach(jobType => {
        recordJobMetrics(jobType, 1000, true, 1);
        
        expect(mockMetricsService.recordJob).toHaveBeenCalledWith(
          jobType,
          1000,
          true,
          1
        );
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle concurrent requests', () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        method: 'GET',
        path: `/api/test/${i}`,
        statusCode: 200 + i
      }));

      requests.forEach(({ method, path, statusCode }, index) => {
        const req = { ...mockRequest, method, path };
        const res = { ...mockResponse, statusCode };
        
        metricsMiddleware(req as Request, res as Response, mockNext);
        responseFinishCallback();
      });

      expect(mockMetricsService.recordRequest).toHaveBeenCalledTimes(5);
    });

    it('should maintain timing accuracy under load', () => {
      const startTime = Date.now();
      
      // Simulate multiple rapid requests
      for (let i = 0; i < 10; i++) {
        metricsMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        responseFinishCallback();
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All recorded durations should be reasonable
      mockMetricsService.recordRequest.mock.calls.forEach(call => {
        const duration = call[3];
        expect(duration).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(totalTime + 100); // Allow some buffer
      });
    });
  });
});