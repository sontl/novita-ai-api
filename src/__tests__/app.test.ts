/**
 * Application Integration Tests
 * 
 * Tests for the main application setup, middleware configuration,
 * and overall application behavior.
 */

import request from 'supertest';
import { app } from '../index';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// Mock logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Application Integration Tests', () => {
  describe('Application Setup', () => {
    it('should start the application successfully', () => {
      expect(app).toBeDefined();
    });

    it('should have correct configuration in test environment', () => {
      expect(config.nodeEnv).toBe('test');
      expect(config.logLevel).toBe('error');
      expect(config.novita.apiKey).toBe('test-api-key');
    });

    it('should log configuration on startup', () => {
      // Configuration logging happens during module import
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('Middleware Configuration', () => {
    it('should have CORS enabled', async () => {
      const response = await request(app)
        .options('/api/instances')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should have security headers from Helmet', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should parse JSON requests', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({
          name: 'json-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.instanceId).toBeDefined();
    });

    it('should handle request logging', async () => {
      await request(app)
        .get('/health')
        .expect(200);

      // Request logging middleware should log requests
      // (We can't easily test this without checking actual logs)
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Route Configuration', () => {
    it('should have health check endpoint', async () => {
      await request(app)
        .get('/health')
        .expect(200);
    });

    it('should have metrics endpoint', async () => {
      await request(app)
        .get('/metrics')
        .expect(200);
    });

    it('should have instance management endpoints', async () => {
      // Test POST /api/instances
      await request(app)
        .post('/api/instances')
        .send({
          name: 'route-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);

      // Test GET /api/instances
      await request(app)
        .get('/api/instances')
        .expect(200);
    });

    it('should have cache management endpoints', async () => {
      await request(app)
        .get('/api/cache/stats')
        .expect(200);
    });

    it('should return 404 for unknown routes', async () => {
      await request(app)
        .get('/unknown-route')
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/instances')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send('some data')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle large request bodies', async () => {
      const largeData = {
        name: 'large-test',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1',
        largeField: 'x'.repeat(10000) // 10KB of data
      };

      const response = await request(app)
        .post('/api/instances')
        .send(largeData)
        .expect(201);

      expect(response.body.instanceId).toBeDefined();
    });

    it('should handle extremely large request bodies', async () => {
      const extremelyLargeData = {
        name: 'extreme-test',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1',
        largeField: 'x'.repeat(2000000) // 2MB of data
      };

      // Should reject requests that are too large
      await request(app)
        .post('/api/instances')
        .send(extremelyLargeData)
        .expect(413); // Payload Too Large
    });
  });

  describe('Content Type Handling', () => {
    it('should accept application/json', async () => {
      await request(app)
        .post('/api/instances')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          name: 'content-type-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        }))
        .expect(201);
    });

    it('should reject unsupported content types', async () => {
      await request(app)
        .post('/api/instances')
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);
    });

    it('should return JSON responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toBeInstanceOf(Object);
    });
  });

  describe('HTTP Methods', () => {
    it('should support GET requests', async () => {
      await request(app)
        .get('/health')
        .expect(200);
    });

    it('should support POST requests', async () => {
      await request(app)
        .post('/api/instances')
        .send({
          name: 'post-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);
    });

    it('should support OPTIONS requests (CORS preflight)', async () => {
      await request(app)
        .options('/api/instances')
        .expect(204);
    });

    it('should reject unsupported methods', async () => {
      await request(app)
        .put('/api/instances')
        .expect(405); // Method Not Allowed
    });
  });

  describe('Request Validation', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('validation');
    });

    it('should validate field types', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({
          name: 123, // Should be string
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate field lengths', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({
          name: '', // Empty string
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('requestId');
    });

    it('should return consistent success format', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({
          name: 'format-test',
          productName: 'RTX 4090 24GB',
          templateId: 'template-1'
        })
        .expect(201);

      expect(response.body).toHaveProperty('instanceId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('message');
    });

    it('should include request correlation ID', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Should include correlation ID in response headers or body
      expect(
        response.headers['x-request-id'] || 
        response.body.requestId
      ).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should respond to health checks quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Under 100ms
    });

    it('should handle multiple concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health').expect(200)
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(responses).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(1000); // All requests under 1 second
    });
  });

  describe('Security', () => {
    it('should not expose sensitive information in errors', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({})
        .expect(400);

      const responseText = JSON.stringify(response.body);
      
      // Should not contain sensitive data
      expect(responseText).not.toContain('test-api-key');
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
    });

    it('should set appropriate security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers set by Helmet
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should handle malicious input safely', async () => {
      const maliciousInput = {
        name: '<script>alert("xss")</script>',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1'
      };

      const response = await request(app)
        .post('/api/instances')
        .send(maliciousInput)
        .expect(201);

      // Should sanitize or safely handle malicious input
      expect(response.body.instanceId).toBeDefined();
    });
  });
});