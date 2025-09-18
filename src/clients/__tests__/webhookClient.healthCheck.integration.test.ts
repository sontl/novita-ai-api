/**
 * Integration tests for WebhookClient health check functionality
 */

import axios from 'axios';
import { WebhookClient } from '../webhookClient';
import { HealthCheckResult } from '../../types/api';

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

describe('WebhookClient Health Check Integration', () => {
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

  describe('Complete Health Check Workflow', () => {
    it('should send health check workflow notifications in correct sequence', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: { success: true }
      });

      const instanceId = 'test-instance';
      const webhookUrl = 'https://example.com/webhook';
      const novitaInstanceId = 'novita-123';

      // 1. Health check started
      await webhookClient.sendHealthCheckNotification(
        webhookUrl,
        instanceId,
        'health_checking',
        {
          novitaInstanceId,
          elapsedTime: 30000,
          healthCheckStatus: 'in_progress',
          healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z')
        }
      );

      // 2. Health check completed successfully
      const healthCheckResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://example.com:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date('2023-01-01T00:01:00.000Z'),
            responseTime: 150
          }
        ],
        checkedAt: new Date('2023-01-01T00:01:00.000Z'),
        totalResponseTime: 150
      };

      await webhookClient.sendHealthCheckNotification(
        webhookUrl,
        instanceId,
        'ready',
        {
          novitaInstanceId,
          elapsedTime: 60000,
          healthCheckResult,
          healthCheckStatus: 'completed',
          healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z'),
          healthCheckCompletedAt: new Date('2023-01-01T00:01:00.000Z')
        }
      );

      // Verify both notifications were sent
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);

      // Verify first notification (health_checking)
      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(
        1,
        webhookUrl,
        {
          instanceId,
          status: 'health_checking',
          timestamp: expect.any(String),
          novitaInstanceId,
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

      // Verify second notification (ready)
      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(
        2,
        webhookUrl,
        {
          instanceId,
          status: 'ready',
          timestamp: expect.any(String),
          novitaInstanceId,
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
                responseTime: 150
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

    it('should send health check failure workflow notifications', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: { success: true }
      });

      const instanceId = 'test-instance';
      const webhookUrl = 'https://example.com/webhook';
      const novitaInstanceId = 'novita-123';

      // 1. Health check started
      await webhookClient.sendHealthCheckNotification(
        webhookUrl,
        instanceId,
        'health_checking',
        {
          novitaInstanceId,
          elapsedTime: 30000,
          healthCheckStatus: 'in_progress',
          healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z')
        }
      );

      // 2. Health check failed
      const healthCheckResult: HealthCheckResult = {
        overallStatus: 'unhealthy',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://example.com:8080',
            type: 'http',
            status: 'unhealthy',
            lastChecked: new Date('2023-01-01T00:05:00.000Z'),
            error: 'Connection timeout',
            responseTime: 0
          }
        ],
        checkedAt: new Date('2023-01-01T00:05:00.000Z'),
        totalResponseTime: 0
      };

      await webhookClient.sendHealthCheckNotification(
        webhookUrl,
        instanceId,
        'failed',
        {
          novitaInstanceId,
          elapsedTime: 300000,
          healthCheckResult,
          healthCheckStatus: 'failed',
          healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z'),
          healthCheckCompletedAt: new Date('2023-01-01T00:05:00.000Z'),
          error: 'Health check timeout exceeded'
        }
      );

      // Verify both notifications were sent
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);

      // Verify first notification (health_checking)
      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(
        1,
        webhookUrl,
        {
          instanceId,
          status: 'health_checking',
          timestamp: expect.any(String),
          novitaInstanceId,
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

      // Verify second notification (failed)
      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(
        2,
        webhookUrl,
        {
          instanceId,
          status: 'failed',
          timestamp: expect.any(String),
          novitaInstanceId,
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

    it('should handle partial health check results', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: { success: true }
      });

      const instanceId = 'test-instance';
      const webhookUrl = 'https://example.com/webhook';
      const novitaInstanceId = 'novita-123';

      const healthCheckResult: HealthCheckResult = {
        overallStatus: 'partial',
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://example.com:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date('2023-01-01T00:01:00.000Z'),
            responseTime: 150
          },
          {
            port: 8081,
            endpoint: 'http://example.com:8081',
            type: 'http',
            status: 'unhealthy',
            lastChecked: new Date('2023-01-01T00:01:00.000Z'),
            error: 'Connection refused',
            responseTime: 0
          }
        ],
        checkedAt: new Date('2023-01-01T00:01:00.000Z'),
        totalResponseTime: 150
      };

      await webhookClient.sendHealthCheckNotification(
        webhookUrl,
        instanceId,
        'health_checking',
        {
          novitaInstanceId,
          elapsedTime: 60000,
          healthCheckResult,
          healthCheckStatus: 'in_progress',
          healthCheckStartedAt: new Date('2023-01-01T00:00:00.000Z')
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        webhookUrl,
        {
          instanceId,
          status: 'health_checking',
          timestamp: expect.any(String),
          novitaInstanceId,
          elapsedTime: 60000,
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
                responseTime: 150
              },
              {
                port: 8081,
                endpoint: 'http://example.com:8081',
                type: 'http',
                status: 'unhealthy',
                lastChecked: '2023-01-01T00:01:00.000Z',
                error: 'Connection refused',
                responseTime: 0
              }
            ],
            startedAt: '2023-01-01T00:00:00.000Z',
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
  });
});