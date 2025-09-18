/**
 * HTTP client for sending webhook notifications
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { HealthCheckResult, EndpointHealthCheck } from '../types/api';

export interface WebhookRequest {
  url: string;
  payload: any;
  headers?: Record<string, string>;
  secret?: string;
}

export interface WebhookNotificationPayload {
  instanceId: string;
  novitaInstanceId?: string;
  status: 'running' | 'failed' | 'timeout' | 'ready' | 'health_checking';
  timestamp: string;
  elapsedTime?: number;
  error?: string;
  data?: any;
  healthCheck?: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    overallStatus?: 'healthy' | 'unhealthy' | 'partial';
    endpoints?: Array<{
      port: number;
      endpoint: string;
      type: string;
      status: 'pending' | 'healthy' | 'unhealthy';
      lastChecked?: string;
      error?: string;
      responseTime?: number;
    }>;
    startedAt?: string;
    completedAt?: string;
    totalResponseTime?: number;
  };
  reason?: string;
}

export class WebhookClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 10000, // 10 second timeout for webhooks
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Novita-GPU-Instance-API/1.0'
      }
    });
  }

  /**
   * Generate webhook signature using HMAC-SHA256
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Convert HealthCheckResult to webhook format
   */
  private formatHealthCheckForWebhook(
    healthCheckResult: HealthCheckResult,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    startedAt?: Date,
    completedAt?: Date
  ): {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    overallStatus: 'healthy' | 'unhealthy' | 'partial';
    endpoints: Array<{
      port: number;
      endpoint: string;
      type: string;
      status: 'pending' | 'healthy' | 'unhealthy';
      lastChecked?: string;
      error?: string;
      responseTime?: number;
    }>;
    startedAt?: string;
    completedAt?: string;
    totalResponseTime: number;
  } {
    return {
      status,
      overallStatus: healthCheckResult.overallStatus,
      endpoints: healthCheckResult.endpoints.map(endpoint => ({
        port: endpoint.port,
        endpoint: endpoint.endpoint,
        type: endpoint.type,
        status: endpoint.status,
        ...(endpoint.lastChecked && { lastChecked: endpoint.lastChecked.toISOString() }),
        ...(endpoint.error && { error: endpoint.error }),
        ...(endpoint.responseTime !== undefined && { responseTime: endpoint.responseTime })
      })),
      ...(startedAt && { startedAt: startedAt.toISOString() }),
      ...(completedAt && { completedAt: completedAt.toISOString() }),
      totalResponseTime: healthCheckResult.totalResponseTime
    };
  }

  /**
   * Create standardized webhook notification payload
   */
  createNotificationPayload(
    instanceId: string,
    status: 'running' | 'failed' | 'timeout' | 'ready' | 'health_checking',
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      error?: string;
      data?: any;
      healthCheck?: {
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
        overallStatus?: 'healthy' | 'unhealthy' | 'partial';
        endpoints?: Array<{
          port: number;
          endpoint: string;
          type: string;
          status: 'pending' | 'healthy' | 'unhealthy';
          lastChecked?: string;
          error?: string;
          responseTime?: number;
        }>;
        startedAt?: string;
        completedAt?: string;
        totalResponseTime?: number;
      };
      reason?: string;
    } = {}
  ): WebhookNotificationPayload {
    return {
      instanceId,
      status,
      timestamp: new Date().toISOString(),
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      ...(options.elapsedTime !== undefined && { elapsedTime: options.elapsedTime }),
      ...(options.error && { error: options.error }),
      ...(options.data && { data: options.data }),
      ...(options.healthCheck && { healthCheck: options.healthCheck }),
      ...(options.reason && { reason: options.reason })
    };
  }

  /**
   * Send webhook with retry logic and optional signature validation
   */
  async sendWebhook(request: WebhookRequest, maxRetries: number = 3): Promise<void> {
    let lastError: Error | null = null;

    // Prepare payload and headers
    const payloadString = JSON.stringify(request.payload);
    const headers = { ...request.headers };

    // Add signature if secret is provided
    const secret = request.secret || config.webhook.secret;
    if (secret) {
      const signature = this.generateSignature(payloadString, secret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
      headers['X-Webhook-Timestamp'] = Math.floor(Date.now() / 1000).toString();
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('Sending webhook', {
          url: request.url,
          attempt,
          maxRetries,
          hasSignature: !!secret,
          payloadSize: payloadString.length
        });

        const response: AxiosResponse = await this.client.post(
          request.url,
          request.payload,
          { headers }
        );

        logger.info('Webhook sent successfully', {
          url: request.url,
          attempt,
          statusCode: response.status,
          responseSize: response.data ? JSON.stringify(response.data).length : 0
        });

        return; // Success, exit retry loop

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('Webhook delivery attempt failed', {
          url: request.url,
          attempt,
          maxRetries,
          error: lastError.message,
          statusCode: (error as any)?.response?.status
        });

        // Don't retry on client errors (4xx), only on server errors (5xx) and network errors
        if ((error as any)?.response?.status && (error as any).response.status < 500) {
          logger.error('Webhook failed with client error, not retrying', {
            url: request.url,
            statusCode: (error as any).response.status,
            error: lastError.message
          });
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          logger.debug('Waiting before webhook retry', {
            url: request.url,
            attempt,
            delayMs
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    throw new Error(`Webhook delivery failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Send success notification webhook
   */
  async sendSuccessNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      data?: any;
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'running', options);
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send failure notification webhook
   */
  async sendFailureNotification(
    url: string,
    instanceId: string,
    error: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'failed', {
      ...options,
      error
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send timeout notification webhook
   */
  async sendTimeoutNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'timeout', {
      ...options,
      error: `Instance startup timeout after ${options.elapsedTime}ms`
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send health check started notification webhook
   */
  async sendHealthCheckStartedNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      healthCheck?: {
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
        endpoints?: Array<{
          port: number;
          endpoint: string;
          type: string;
          status: 'pending' | 'healthy' | 'unhealthy';
        }>;
        startedAt?: string;
      };
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'health_checking', {
      ...options,
      reason: 'Health checks started for application endpoints'
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send ready notification webhook (after successful health checks)
   */
  async sendReadyNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      data?: any;
      healthCheck?: {
        status: 'completed';
        overallStatus: 'healthy';
        endpoints?: Array<{
          port: number;
          endpoint: string;
          type: string;
          status: 'healthy';
          lastChecked?: string;
          responseTime?: number;
        }>;
        startedAt?: string;
        completedAt?: string;
        totalResponseTime?: number;
      };
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'ready', {
      ...options,
      reason: 'Instance is ready - all health checks passed'
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send health check failed notification webhook
   */
  async sendHealthCheckFailedNotification(
    url: string,
    instanceId: string,
    error: string,
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      healthCheck?: {
        status: 'failed';
        overallStatus?: 'unhealthy' | 'partial';
        endpoints?: Array<{
          port: number;
          endpoint: string;
          type: string;
          status: 'pending' | 'healthy' | 'unhealthy';
          lastChecked?: string;
          error?: string;
          responseTime?: number;
        }>;
        startedAt?: string;
        completedAt?: string;
        totalResponseTime?: number;
      };
      secret?: string;
    } = {}
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'failed', {
      ...options,
      error,
      reason: 'Health checks failed - instance not ready'
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }

  /**
   * Send health check notification with comprehensive health check data
   */
  async sendHealthCheckNotification(
    url: string,
    instanceId: string,
    status: 'health_checking' | 'ready' | 'failed',
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      data?: any;
      healthCheckResult?: HealthCheckResult;
      healthCheckStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
      healthCheckStartedAt?: Date;
      healthCheckCompletedAt?: Date;
      error?: string;
      secret?: string;
    } = {}
  ): Promise<void> {
    let healthCheckData;
    let reason: string;

    if (options.healthCheckResult && options.healthCheckStatus) {
      healthCheckData = this.formatHealthCheckForWebhook(
        options.healthCheckResult,
        options.healthCheckStatus,
        options.healthCheckStartedAt,
        options.healthCheckCompletedAt
      );
    }

    switch (status) {
      case 'health_checking':
        reason = 'Health checks started for application endpoints';
        break;
      case 'ready':
        reason = 'Instance is ready - all health checks passed';
        break;
      case 'failed':
        reason = options.error || 'Health checks failed - instance not ready';
        break;
      default:
        reason = 'Health check status update';
    }

    const payload = this.createNotificationPayload(instanceId, status, {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      ...(options.elapsedTime !== undefined && { elapsedTime: options.elapsedTime }),
      ...(options.data && { data: options.data }),
      ...(healthCheckData && { healthCheck: healthCheckData }),
      ...(options.error && { error: options.error }),
      reason
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhook(request);
  }
}

// Export singleton instance
export const webhookClient = new WebhookClient();