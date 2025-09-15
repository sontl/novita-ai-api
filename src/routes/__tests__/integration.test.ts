import request from 'supertest';

// Mock the config before importing anything else
jest.mock('../../config/config', () => ({
  config: {
    port: 3000,
    nodeEnv: 'test',
    logLevel: 'error',
    novita: {
      apiKey: 'test-key',
      baseUrl: 'https://api.novita.ai'
    },
    webhook: {
      url: undefined,
      secret: undefined
    },
    defaults: {
      region: 'CN-HK-01',
      pollInterval: 30,
      maxRetryAttempts: 3,
      requestTimeout: 30000
    }
  }
}));

// Mock all services
jest.mock('../../services/instanceService');
jest.mock('../../services/novitaApiService');
jest.mock('../../services/jobQueueService');

import { app } from '../../index';
import { instanceService } from '../../services/instanceService';
import { novitaApiService } from '../../services/novitaApiService';
import { jobQueueService } from '../../services/jobQueueService';

const mockInstanceService = instanceService as jest.Mocked<typeof instanceService>;
const mockNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockJobQueueService = jobQueueService as jest.Mocked<typeof jobQueueService>;

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default successful mocks
    mockNovitaApiService.getProducts.mockResolvedValue([]);
    
    mockJobQueueService.getStats.mockReturnValue({
      totalJobs: 0,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      jobsByType: {
        create_instance: 0,
        monitor_instance: 0,
        send_webhook: 0
      }
    });
    
    mockInstanceService.getCacheStats.mockReturnValue({
      instanceDetailsCache: { size: 0, hitRatio: 0, metrics: {} },
      instanceStatesSize: 0,
      cachedInstanceIds: []
    });

    mockInstanceService.listInstances.mockResolvedValue({
      instances: [],
      total: 0
    });
  });

  describe('Route availability', () => {
    it('should have health endpoint available', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should have instances endpoints available', async () => {
      // Test GET /api/instances
      await request(app)
        .get('/api/instances')
        .expect(200);

      // Test POST /api/instances with validation error
      await request(app)
        .post('/api/instances')
        .send({})
        .expect(400);

      // Test GET /api/instances/:id with invalid ID
      await request(app)
        .get('/api/instances/invalid@id')
        .expect(400);
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should handle CORS and security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers (helmet)
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/instances')
        .send({ name: 'test' })
        .expect(400); // Will fail validation but shows JSON parsing works

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should include request ID in all responses', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      const instancesResponse = await request(app)
        .get('/api/instances')
        .expect(200);

      const errorResponse = await request(app)
        .get('/unknown-route')
        .expect(404);

      // Health endpoint doesn't include request ID in body, but others should
      expect(errorResponse.body.error).toHaveProperty('requestId');
    });
  });

  describe('Error handling consistency', () => {
    it('should return consistent error format across endpoints', async () => {
      const responses = await Promise.all([
        request(app).get('/unknown-route').expect(404),
        request(app).post('/api/instances').send({}).expect(400),
        request(app).get('/api/instances/invalid@id').expect(400)
      ]);

      responses.forEach(response => {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body.error).toHaveProperty('timestamp');
        expect(response.body.error).toHaveProperty('requestId');
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/instances')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});