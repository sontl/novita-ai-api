/**
 * Unit tests for webhook client startup operation enhancements
 */

import { WebhookClient } from '../webhookClient';
import { HealthCheckResult } from '../../types/api';

describe('WebhookClient - Startup Operations', () => {
  let client: WebhookClient;

  beforeEach(() => {
    client = new WebhookClient();
  });

  describe('createNotificationPayload', () => {
    it('should create startup initiated payload with operation details', () => {
      const startupOperation = {
        operationId: 'op-123',
        status: 'initiated' as const,
        startedAt: '2024-01-01T10:00:00Z',
        phases: {
          startRequested: '2024-01-01T10:00:00Z'
        },
        totalElapsedTime: 0
      };

      const payload = client.createNotificationPayload(
        'instance-123',
        'startup_initiated',
        {
          novitaInstanceId: 'novita-456',
          startupOperation,
          reason: 'Instance startup operation initiated',
          data: { estimatedReadyTime: '2024-01-01T10:05:00Z' }
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'startup_initiated',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        startupOperation,
        reason: 'Instance startup operation initiated',
        data: { estimatedReadyTime: '2024-01-01T10:05:00Z' }
      });
    });

    it('should create startup completed payload with comprehensive details', () => {
      const startupOperation = {
        operationId: 'op-123',
        status: 'completed' as const,
        startedAt: '2024-01-01T10:00:00Z',
        phases: {
          startRequested: '2024-01-01T10:00:00Z',
          instanceStarting: '2024-01-01T10:00:30Z',
          instanceRunning: '2024-01-01T10:02:00Z',
          healthCheckStarted: '2024-01-01T10:02:10Z',
          healthCheckCompleted: '2024-01-01T10:02:50Z',
          ready: '2024-01-01T10:03:00Z'
        },
        totalElapsedTime: 180000
      };

      const healthCheck = {
        status: 'completed' as const,
        overallStatus: 'healthy' as const,
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://example.com:8080',
            type: 'http',
            status: 'healthy' as const,
            lastChecked: '2024-01-01T10:02:50Z',
            responseTime: 150
          }
        ],
        startedAt: '2024-01-01T10:02:10Z',
        completedAt: '2024-01-01T10:02:50Z',
        totalResponseTime: 150
      };

      const payload = client.createNotificationPayload(
        'instance-123',
        'startup_completed',
        {
          novitaInstanceId: 'novita-456',
          elapsedTime: 180000,
          startupOperation,
          healthCheck,
          data: { customData: 'test' },
          reason: 'Instance startup completed successfully - instance is ready to serve requests'
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'startup_completed',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        elapsedTime: 180000,
        startupOperation,
        healthCheck,
        data: { customData: 'test' },
        reason: 'Instance startup completed successfully - instance is ready to serve requests'
      });
    });

    it('should create startup failed payload with failure details', () => {
      const startupOperation = {
        operationId: 'op-123',
        status: 'failed' as const,
        startedAt: '2024-01-01T10:00:00Z',
        phases: {
          startRequested: '2024-01-01T10:00:00Z',
          instanceStarting: '2024-01-01T10:00:30Z',
          instanceRunning: '2024-01-01T10:02:00Z',
          healthCheckStarted: '2024-01-01T10:02:10Z'
        },
        totalElapsedTime: 150000,
        error: 'Health check timeout after 30000ms'
      };

      const payload = client.createNotificationPayload(
        'instance-123',
        'startup_failed',
        {
          novitaInstanceId: 'novita-456',
          elapsedTime: 150000,
          error: 'Health check timeout after 30000ms',
          startupOperation,
          reason: 'Instance startup failed during health_check phase: Health check timeout after 30000ms'
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'startup_failed',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        elapsedTime: 150000,
        error: 'Health check timeout after 30000ms',
        startupOperation,
        reason: 'Instance startup failed during health_check phase: Health check timeout after 30000ms'
      });
    });

    it('should create startup progress payload for monitoring phase', () => {
      const startupOperation = {
        operationId: 'op-123',
        status: 'monitoring' as const,
        startedAt: '2024-01-01T10:00:00Z',
        phases: {
          startRequested: '2024-01-01T10:00:00Z',
          instanceStarting: '2024-01-01T10:00:30Z',
          instanceRunning: '2024-01-01T10:02:00Z'
        },
        totalElapsedTime: 150000
      };

      const payload = client.createNotificationPayload(
        'instance-123',
        'running',
        {
          novitaInstanceId: 'novita-456',
          elapsedTime: 150000,
          startupOperation,
          reason: 'Instance startup in progress - current status: running'
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'running',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        elapsedTime: 150000,
        startupOperation,
        reason: 'Instance startup in progress - current status: running'
      });
    });

    it('should create startup progress payload for health_checking phase', () => {
      const startupOperation = {
        operationId: 'op-123',
        status: 'health_checking' as const,
        startedAt: '2024-01-01T10:00:00Z',
        phases: {
          startRequested: '2024-01-01T10:00:00Z',
          instanceStarting: '2024-01-01T10:00:30Z',
          instanceRunning: '2024-01-01T10:02:00Z',
          healthCheckStarted: '2024-01-01T10:02:10Z'
        },
        totalElapsedTime: 150000
      };

      const healthCheck = {
        status: 'in_progress' as const,
        overallStatus: 'partial' as const,
        endpoints: [
          {
            port: 8080,
            endpoint: 'http://example.com:8080',
            type: 'http',
            status: 'pending' as const
          }
        ],
        startedAt: '2024-01-01T10:02:10Z',
        totalResponseTime: 0
      };

      const payload = client.createNotificationPayload(
        'instance-123',
        'health_checking',
        {
          novitaInstanceId: 'novita-456',
          elapsedTime: 150000,
          startupOperation,
          healthCheck,
          reason: 'Instance startup in progress - performing health checks'
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'health_checking',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        elapsedTime: 150000,
        startupOperation,
        healthCheck,
        reason: 'Instance startup in progress - performing health checks'
      });
    });
  });

  describe('webhook payload validation', () => {
    it('should create payload without optional startup operation details', () => {
      const payload = client.createNotificationPayload(
        'instance-123',
        'running',
        {
          novitaInstanceId: 'novita-456',
          elapsedTime: 30000
        }
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'running',
        timestamp: expect.any(String),
        novitaInstanceId: 'novita-456',
        elapsedTime: 30000
      });
      expect(payload).not.toHaveProperty('startupOperation');
    });

    it('should handle missing optional fields gracefully', () => {
      const payload = client.createNotificationPayload(
        'instance-123',
        'startup_initiated',
        {}
      );

      expect(payload).toEqual({
        instanceId: 'instance-123',
        status: 'startup_initiated',
        timestamp: expect.any(String)
      });
    });
  });
});