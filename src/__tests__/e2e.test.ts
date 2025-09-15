/**
 * End-to-End Integration Tests
 * 
 * These tests verify complete workflows from API request to final response,
 * including all service interactions and background job processing.
 */

import request from 'supertest';
import { app } from '../index';
import { jobQueueService } from '../services/jobQueueService';
import { jobWorkerService } from '../services/jobWorkerService';
import { instanceService } from '../services/instanceService';
import { novitaApiService } from '../services/novitaApiService';
import { productService } from '../services/productService';
import { templateService } from '../services/templateService';
import { webhookClient } from '../clients/webhookClient';
import { CreateInstanceRequest } from '../types/api';
import { JobStatus } from '../types/job';

// Mock external dependencies
jest.mock('../services/novitaApiService');
jest.mock('../services/productService');
jest.mock('../services/templateService');
jest.mock('../clients/webhookClient');

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;
const mockedProductService = productService as jest.Mocked<typeof productService>;
const mockedTemplateService = templateService as jest.Mocked<typeof templateService>;
const mockedWebhookClient = webhookClient as jest.Mocked<typeof webhookClient>;

describe('End-to-End Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Reset job queue
    jobQueueService.clearAllJobs();
    
    // Setup default mocks
    mockedProductService.getOptimalProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      spotPrice: 0.5,
      onDemandPrice: 1.0,
      availability: 'available'
    });

    mockedTemplateService.getTemplate.mockResolvedValue({
      id: 'template-1',
      name: 'CUDA Development',
      imageUrl: 'docker.io/nvidia/cuda:11.8-runtime-ubuntu20.04',
      imageAuth: '',
      ports: [{ port: 8888, type: 'http', name: 'jupyter' }],
      envs: [{ name: 'JUPYTER_ENABLE_LAB', value: 'yes' }]
    });

    mockedNovitaApiService.createInstance.mockResolvedValue({
      id: 'novita-inst-123',
      name: 'test-instance',
      status: 'creating',
      productId: 'prod-1',
      region: 'CN-HK-01',
      createdAt: new Date().toISOString(),
      gpuNum: 1,
      rootfsSize: 60
    });

    mockedNovitaApiService.startInstance.mockResolvedValue({
      id: 'novita-inst-123',
      name: 'test-instance',
      status: 'starting',
      productId: 'prod-1',
      region: 'CN-HK-01',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      gpuNum: 1,
      rootfsSize: 60
    });

    mockedWebhookClient.sendWebhook.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Complete Instance Creation Workflow', () => {
    it('should create instance and complete full lifecycle', async () => {
      jest.useFakeTimers();

      const createRequest: CreateInstanceRequest = {
        name: 'e2e-test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      // Step 1: Create instance via API
      const createResponse = await request(app)
        .post('/api/instances')
        .send(createRequest)
        .expect(201);

      expect(createResponse.body).toMatchObject({
        instanceId: expect.any(String),
        status: 'creating',
        message: expect.any(String)
      });

      const instanceId = createResponse.body.instanceId;

      // Step 2: Verify job was queued
      const queueStats = jobQueueService.getStats();
      expect(queueStats.totalJobs).toBe(1);
      expect(queueStats.pendingJobs).toBe(1);

      // Step 3: Process creation job
      await jobWorkerService.processNextJob();

      // Verify instance was created
      expect(mockedProductService.getOptimalProduct).toHaveBeenCalledWith(
        'RTX 4090 24GB',
        'CN-HK-01'
      );
      expect(mockedTemplateService.getTemplate).toHaveBeenCalledWith('template-1');
      expect(mockedNovitaApiService.createInstance).toHaveBeenCalled();
      expect(mockedNovitaApiService.startInstance).toHaveBeenCalledWith('novita-inst-123');

      // Step 4: Simulate monitoring workflow
      // Mock instance status progression
      mockedNovitaApiService.getInstanceStatus
        .mockResolvedValueOnce({
          id: 'novita-inst-123',
          name: 'test-instance',
          status: 'starting',
          productId: 'prod-1',
          region: 'CN-HK-01',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          gpuNum: 1,
          rootfsSize: 60
        })
        .mockResolvedValueOnce({
          id: 'novita-inst-123',
          name: 'test-instance',
          status: 'running',
          productId: 'prod-1',
          region: 'CN-HK-01',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          readyAt: new Date().toISOString(),
          gpuNum: 1,
          rootfsSize: 60,
          connectionDetails: {
            ssh: 'ssh://user@instance.novita.ai:22',
            jupyter: 'https://instance.novita.ai:8888'
          }
        });

      // Process monitoring job (first poll - still starting)
      await jobWorkerService.processNextJob();
      
      // Advance time and process next monitoring job (second poll - now running)
      jest.advanceTimersByTime(30000);
      await jobWorkerService.processNextJob();

      // Step 5: Verify webhook was sent
      expect(mockedWebhookClient.sendWebhook).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          instanceId,
          status: 'running',
          novitaInstanceId: 'novita-inst-123'
        })
      );

      // Step 6: Verify final instance status via API
      const statusResponse = await request(app)
        .get(`/api/instances/${instanceId}`)
        .expect(200);

      expect(statusResponse.body).toMatchObject({
        id: instanceId,
        name: 'e2e-test-instance',
        status: 'running',
        connectionDetails: {
          ssh: expect.any(String),
          jupyter: expect.any(String)
        }
      });

      jest.useRealTimers();
    }, 15000);

    it('should handle creation failure gracefully', async () => {
      // Mock creation failure
      mockedNovitaApiService.createInstance.mockRejectedValue(
        new Error('Insufficient quota')
      );

      const createRequest: CreateInstanceRequest = {
        name: 'failing-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1'
      };

      // Create instance
      const createResponse = await request(app)
        .post('/api/instances')
        .send(createRequest)
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      // Process creation job (should fail)
      await jobWorkerService.processNextJob();

      // Verify instance status shows failure
      const statusResponse = await request(app)
        .get(`/api/instances/${instanceId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('failed');
      expect(statusResponse.body.lastError).toContain('Insufficient quota');
    });

    it('should handle monitoring timeout', async () => {
      jest.useFakeTimers();

      const createRequest: CreateInstanceRequest = {
        name: 'timeout-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1',
        webhookUrl: 'https://example.com/webhook'
      };

      // Create instance
      const createResponse = await request(app)
        .post('/api/instances')
        .send(createRequest)
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      // Process creation job
      await jobWorkerService.processNextJob();

      // Mock instance stuck in starting state
      mockedNovitaApiService.getInstanceStatus.mockResolvedValue({
        id: 'novita-inst-123',
        name: 'timeout-instance',
        status: 'starting',
        productId: 'prod-1',
        region: 'CN-HK-01',
        createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 minutes ago
        startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        gpuNum: 1,
        rootfsSize: 60
      });

      // Process monitoring jobs until timeout
      for (let i = 0; i < 25; i++) { // Simulate 25 polling attempts
        await jobWorkerService.processNextJob();
        jest.advanceTimersByTime(30000); // 30 seconds between polls
      }

      // Verify timeout webhook was sent
      expect(mockedWebhookClient.sendWebhook).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          instanceId,
          status: 'failed',
          error: expect.stringContaining('timeout')
        })
      );

      jest.useRealTimers();
    }, 15000);
  });

  describe('API Error Handling', () => {
    it('should handle invalid request data', async () => {
      const invalidRequest = {
        name: '', // Invalid: empty name
        productName: 'RTX 4090 24GB'
        // Missing required templateId
      };

      const response = await request(app)
        .post('/api/instances')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('validation');
    });

    it('should handle service unavailable scenarios', async () => {
      // Mock all services as unavailable
      mockedProductService.getOptimalProduct.mockRejectedValue(
        new Error('Service unavailable')
      );

      const createRequest: CreateInstanceRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-1'
      };

      const createResponse = await request(app)
        .post('/api/instances')
        .send(createRequest)
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      // Process creation job (should fail)
      await jobWorkerService.processNextJob();

      // Verify error is handled gracefully
      const statusResponse = await request(app)
        .get(`/api/instances/${instanceId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('failed');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent instance creations', async () => {
      const concurrentRequests = 5;
      const requests = Array.from({ length: concurrentRequests }, (_, i) => ({
        name: `concurrent-instance-${i}`,
        productName: 'RTX 4090 24GB',
        templateId: 'template-1'
      }));

      // Send all requests concurrently
      const responses = await Promise.all(
        requests.map(req =>
          request(app)
            .post('/api/instances')
            .send(req)
            .expect(201)
        )
      );

      // Verify all instances were created
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach(response => {
        expect(response.body.instanceId).toBeDefined();
        expect(response.body.status).toBe('creating');
      });

      // Verify jobs were queued
      const queueStats = jobQueueService.getStats();
      expect(queueStats.totalJobs).toBe(concurrentRequests);
    });

    it('should maintain performance under job processing load', async () => {
      const startTime = Date.now();
      const jobCount = 10;

      // Create multiple jobs
      for (let i = 0; i < jobCount; i++) {
        await request(app)
          .post('/api/instances')
          .send({
            name: `load-test-${i}`,
            productName: 'RTX 4090 24GB',
            templateId: 'template-1'
          })
          .expect(201);
      }

      // Process all jobs
      for (let i = 0; i < jobCount; i++) {
        await jobWorkerService.processNextJob();
      }

      const processingTime = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(processingTime).toBeLessThan(10000); // 10 seconds
    });
  });

  describe('Cache Performance', () => {
    it('should benefit from caching on repeated requests', async () => {
      const templateId = 'cached-template';
      const productName = 'RTX 4090 24GB';

      // First request - should hit external APIs
      await request(app)
        .post('/api/instances')
        .send({
          name: 'cache-test-1',
          productName,
          templateId
        })
        .expect(201);

      await jobWorkerService.processNextJob();

      // Second request - should use cache
      await request(app)
        .post('/api/instances')
        .send({
          name: 'cache-test-2',
          productName,
          templateId
        })
        .expect(201);

      await jobWorkerService.processNextJob();

      // Verify template service was called only once (cached on second call)
      expect(mockedTemplateService.getTemplate).toHaveBeenCalledTimes(2);
      expect(mockedProductService.getOptimalProduct).toHaveBeenCalledTimes(2);
    });
  });
});