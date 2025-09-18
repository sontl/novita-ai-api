/**
 * Unit tests for WebhookClient
 */

import axios from 'axios';
import crypto from 'crypto';
import { WebhookClient } from '../webhookClient';
import { config } from '../../config/config';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock config
jest.mock('../../config/config', () => ({
  config: {
    webhook: {
      secret: 'test-webhook-secret'
    }
  }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('WebhookClient', () => {
  let webhookClient: WebhookClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAxiosInstance = {
      post: jest.fn()
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    webhookClient = new WebhookClient();
  });

  describe('createNotificationPayload', () => {
    it('should create basic notification payload', () => {
      const payload = webhookClient.createNotificationPayload('test-instance', 'running');
      
      expect(payload).toEqual({
        instanceId: 'test-instance',
        status: 'running',
        timestamp: expect.any(String)
      });
      
      // Verify timestamp is valid ISO string
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });

    it('should create notification payload with all options', () => {
      const payload = webhookClient.createNotificationPayload('test-instance', 'failed', {
        novitaInstanceId: 'novita-123',
        elapsedTime: 5000,
        error: 'Test error',
        data: { test: 'data' }
      });
      
      expect(payload).toEqual({
        instanceId: 'test-instance',
        status: 'failed',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-123',
        elapsedTime: 5000,
        error: 'Test error',
        data: { test: 'data' }
      });
    });

    it('should only include provided options', () => {
      const payload = webhookClient.createNotificationPayload('test-instance', 'timeout', {
        error: 'Timeout error'
      });
      
      expect(payload).toEqual({
        instanceId: 'test-instance',
        status: 'timeout',
        timestamp: expect.any(String),
        error: 'Timeout error'
      });
      
      expect(payload).not.toHaveProperty('novitaInstanceId');
      expect(payload).not.toHaveProperty('elapsedTime');
      expect(payload).not.toHaveProperty('data');
    });
  });

  describe('sendWebhook', () => {
    it('should send webhook successfully with default signature', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      await webhookClient.sendWebhook(request);

      const expectedPayload = JSON.stringify({ test: 'data' });
      const expectedSignature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(expectedPayload, 'utf8')
        .digest('hex');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        { test: 'data' },
        {
          headers: {
            'X-Webhook-Signature': `sha256=${expectedSignature}`,
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should send webhook with signature when secret is configured', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      await webhookClient.sendWebhook(request);

      const expectedPayload = JSON.stringify({ test: 'data' });
      const expectedSignature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(expectedPayload, 'utf8')
        .digest('hex');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        { test: 'data' },
        {
          headers: {
            'X-Webhook-Signature': `sha256=${expectedSignature}`,
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should use custom secret when provided', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      const customSecret = 'custom-secret';
      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' },
        secret: customSecret
      };

      await webhookClient.sendWebhook(request);

      const expectedPayload = JSON.stringify({ test: 'data' });
      const expectedSignature = crypto
        .createHmac('sha256', customSecret)
        .update(expectedPayload, 'utf8')
        .digest('hex');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        { test: 'data' },
        {
          headers: {
            'X-Webhook-Signature': `sha256=${expectedSignature}`,
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should include custom headers', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' },
        headers: { 'Custom-Header': 'custom-value' }
      };

      await webhookClient.sendWebhook(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        { test: 'data' },
        {
          headers: {
            'Custom-Header': 'custom-value',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should retry on server errors with exponential backoff', async () => {
      const serverError1 = new Error('Server error');
      (serverError1 as any).response = { status: 500 };
      
      const serverError2 = new Error('Bad gateway');
      (serverError2 as any).response = { status: 502 };
      
      mockAxiosInstance.post
        .mockRejectedValueOnce(serverError1)
        .mockRejectedValueOnce(serverError2)
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await webhookClient.sendWebhook(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
      
      jest.restoreAllMocks();
    });

    it('should not retry on client errors', async () => {
      const error = new Error('Bad request');
      (error as any).response = { status: 400 };
      
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      await expect(webhookClient.sendWebhook(request)).rejects.toThrow('Bad request');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should retry on network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNABORTED';
      
      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await webhookClient.sendWebhook(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
      
      jest.restoreAllMocks();
    });

    it('should fail after max retries', async () => {
      const error = new Error('Server error');
      (error as any).response = { status: 500 };
      
      mockAxiosInstance.post.mockRejectedValue(error);

      const request = {
        url: 'https://example.com/webhook',
        payload: { test: 'data' }
      };

      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(webhookClient.sendWebhook(request, 2)).rejects.toThrow(
        'Webhook delivery failed after 2 attempts: Server error'
      );
      
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
      
      jest.restoreAllMocks();
    });
  });

  describe('sendSuccessNotification', () => {
    it('should send success notification with basic parameters', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      await webhookClient.sendSuccessNotification(
        'https://example.com/webhook',
        'test-instance'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'running',
          timestamp: expect.any(String)
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should send success notification with all options', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      const data = { ports: [8080], ssh: 'ssh://example.com' };

      await webhookClient.sendSuccessNotification(
        'https://example.com/webhook',
        'test-instance',
        {
          novitaInstanceId: 'novita-123',
          elapsedTime: 5000,
          data,
          secret: 'custom-secret'
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'running',
          timestamp: expect.any(String),
          novitaInstanceId: 'novita-123',
          elapsedTime: 5000,
          data
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });
  });

  describe('sendFailureNotification', () => {
    it('should send failure notification', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      await webhookClient.sendFailureNotification(
        'https://example.com/webhook',
        'test-instance',
        'Instance creation failed'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'failed',
          timestamp: expect.any(String),
          error: 'Instance creation failed'
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should send failure notification with options', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      await webhookClient.sendFailureNotification(
        'https://example.com/webhook',
        'test-instance',
        'Instance startup failed',
        {
          novitaInstanceId: 'novita-123',
          elapsedTime: 10000
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'failed',
          timestamp: expect.any(String),
          error: 'Instance startup failed',
          novitaInstanceId: 'novita-123',
          elapsedTime: 10000
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });
  });

  describe('sendTimeoutNotification', () => {
    it('should send timeout notification', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      await webhookClient.sendTimeoutNotification(
        'https://example.com/webhook',
        'test-instance',
        {
          elapsedTime: 600000 // 10 minutes
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'timeout',
          timestamp: expect.any(String),
          elapsedTime: 600000,
          error: 'Instance startup timeout after 600000ms'
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });

    it('should send timeout notification with all options', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      });

      await webhookClient.sendTimeoutNotification(
        'https://example.com/webhook',
        'test-instance',
        {
          novitaInstanceId: 'novita-123',
          elapsedTime: 600000,
          secret: 'custom-secret'
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          instanceId: 'test-instance',
          status: 'timeout',
          timestamp: expect.any(String),
          novitaInstanceId: 'novita-123',
          elapsedTime: 600000,
          error: 'Instance startup timeout after 600000ms'
        },
        {
          headers: {
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String)
          }
        }
      );
    });
  });

  describe('Health Check Webhook Notifications', () => {
    describe('sendHealthCheckStartedNotification', () => {
      it('should send health check started notification', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheck = {
          status: 'in_progress' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'pending' as const
            }
          ],
          startedAt: '2023-01-01T00:00:00.000Z'
        };

        await webhookClient.sendHealthCheckStartedNotification(
          'https://example.com/webhook',
          'test-instance',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 5000,
            healthCheck
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'health_checking',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 5000,
            healthCheck,
            reason: 'Health checks started for application endpoints'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });
    });

    describe('sendReadyNotification', () => {
      it('should send ready notification with health check results', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheck = {
          status: 'completed' as const,
          overallStatus: 'healthy' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'healthy' as const,
              lastChecked: '2023-01-01T00:01:00.000Z',
              responseTime: 150
            }
          ],
          startedAt: '2023-01-01T00:00:00.000Z',
          completedAt: '2023-01-01T00:01:00.000Z',
          totalResponseTime: 150
        };

        await webhookClient.sendReadyNotification(
          'https://example.com/webhook',
          'test-instance',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 60000,
            healthCheck
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'ready',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 60000,
            healthCheck,
            reason: 'Instance is ready - all health checks passed'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });
    });

    describe('sendHealthCheckFailedNotification', () => {
      it('should send health check failed notification', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheck = {
          status: 'failed' as const,
          overallStatus: 'unhealthy' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'unhealthy' as const,
              lastChecked: '2023-01-01T00:01:00.000Z',
              error: 'Connection refused',
              responseTime: 0
            }
          ],
          startedAt: '2023-01-01T00:00:00.000Z',
          completedAt: '2023-01-01T00:01:00.000Z',
          totalResponseTime: 0
        };

        await webhookClient.sendHealthCheckFailedNotification(
          'https://example.com/webhook',
          'test-instance',
          'Health checks failed after timeout',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 300000,
            healthCheck
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'failed',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 300000,
            healthCheck,
            error: 'Health checks failed after timeout',
            reason: 'Health checks failed - instance not ready'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });
    });

    describe('sendHealthCheckNotification', () => {
      it('should send comprehensive health check notification for health_checking status', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheckResult = {
          overallStatus: 'partial' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'healthy' as const,
              lastChecked: new Date('2023-01-01T00:01:00.000Z'),
              responseTime: 150
            },
            {
              port: 8081,
              endpoint: 'http://example.com:8081',
              type: 'http',
              status: 'pending' as const
            }
          ],
          checkedAt: new Date('2023-01-01T00:01:00.000Z'),
          totalResponseTime: 150
        };

        await webhookClient.sendHealthCheckNotification(
          'https://example.com/webhook',
          'test-instance',
          'health_checking',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 30000,
            healthCheckResult,
            healthCheckStatus: 'in_progress',
            healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z')
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'health_checking',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 30000,
            healthCheck: {
              status: 'in_progress',
              overallStatus: 'partial',
              endpoints: [
                {
                  port: 8080,
                  endpoint: 'http://example.com:8080',
                  type: 'http',
                  status: 'healthy',
                  lastChecked: '2023-01-01T00:01:00.000Z',
                  responseTime: 150,
                  error: undefined
                },
                {
                  port: 8081,
                  endpoint: 'http://example.com:8081',
                  type: 'http',
                  status: 'pending',
                  lastChecked: undefined,
                  responseTime: undefined,
                  error: undefined
                }
              ],
              startedAt: '2023-01-01T00:00:00.000Z',
              completedAt: undefined,
              totalResponseTime: 150
            },
            reason: 'Health checks started for application endpoints'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });

      it('should send comprehensive health check notification for ready status', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheckResult = {
          overallStatus: 'healthy' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'healthy' as const,
              lastChecked: new Date('2023-01-01T00:01:00.000Z'),
              responseTime: 150
            }
          ],
          checkedAt: new Date('2023-01-01T00:01:00.000Z'),
          totalResponseTime: 150
        };

        await webhookClient.sendHealthCheckNotification(
          'https://example.com/webhook',
          'test-instance',
          'ready',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 60000,
            healthCheckResult,
            healthCheckStatus: 'completed',
            healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z'),
            healthCheckCompletedAt: new Date('2023-01-01T00:01:00.000Z')
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'ready',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 60000,
            healthCheck: {
              status: 'completed',
              overallStatus: 'healthy',
              endpoints: [
                {
                  port: 8080,
                  endpoint: 'http://example.com:8080',
                  type: 'http',
                  status: 'healthy',
                  lastChecked: '2023-01-01T00:01:00.000Z',
                  responseTime: 150,
                  error: undefined
                }
              ],
              startedAt: '2023-01-01T00:00:00.000Z',
              completedAt: '2023-01-01T00:01:00.000Z',
              totalResponseTime: 150
            },
            reason: 'Instance is ready - all health checks passed'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });

      it('should send comprehensive health check notification for failed status', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        const healthCheckResult = {
          overallStatus: 'unhealthy' as const,
          endpoints: [
            {
              port: 8080,
              endpoint: 'http://example.com:8080',
              type: 'http',
              status: 'unhealthy' as const,
              lastChecked: new Date('2023-01-01T00:05:00.000Z'),
              error: 'Connection timeout',
              responseTime: 0
            }
          ],
          checkedAt: new Date('2023-01-01T00:05:00.000Z'),
          totalResponseTime: 0
        };

        await webhookClient.sendHealthCheckNotification(
          'https://example.com/webhook',
          'test-instance',
          'failed',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 300000,
            healthCheckResult,
            healthCheckStatus: 'failed',
            healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z'),
            healthCheckCompletedAt: new Date('2023-01-01T00:05:00.000Z'),
            error: 'Health check timeout exceeded'
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'failed',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 300000,
            healthCheck: {
              status: 'failed',
              overallStatus: 'unhealthy',
              endpoints: [
                {
                  port: 8080,
                  endpoint: 'http://example.com:8080',
                  type: 'http',
                  status: 'unhealthy',
                  lastChecked: '2023-01-01T00:05:00.000Z',
                  error: 'Connection timeout',
                  responseTime: 0
                }
              ],
              startedAt: '2023-01-01T00:00:00.000Z',
              completedAt: '2023-01-01T00:05:00.000Z',
              totalResponseTime: 0
            },
            error: 'Health check timeout exceeded',
            reason: 'Health check timeout exceeded'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });

      it('should handle notification without health check data', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({
          status: 200,
          data: { success: true }
        });

        await webhookClient.sendHealthCheckNotification(
          'https://example.com/webhook',
          'test-instance',
          'health_checking',
          {
            novitaInstanceId: 'novita-123',
            elapsedTime: 30000
          }
        );

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          'https://example.com/webhook',
          {
            instanceId: 'test-instance',
            status: 'health_checking',
            timestamp: expect.any(String),
            novitaInstanceId: 'novita-123',
            elapsedTime: 30000,
            reason: 'Health checks started for application endpoints'
          },
          {
            headers: {
              'X-Webhook-Signature': expect.any(String),
              'X-Webhook-Timestamp': expect.any(String)
            }
          }
        );
      });
    });
  });
});