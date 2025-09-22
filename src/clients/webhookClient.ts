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
  status: 'running' | 'failed' | 'timeout' | 'ready' | 'health_checking' | 'startup_initiated' | 'startup_completed' | 'startup_failed';
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
  startupOperation?: {
    operationId: string;
    status: 'initiated' | 'monitoring' | 'health_checking' | 'completed' | 'failed';
    startedAt: string;
    phases: {
      startRequested: string;
      instanceStarting?: string;
      instanceRunning?: string;
      healthCheckStarted?: string;
      healthCheckCompleted?: string;
      ready?: string;
    };
    totalElapsedTime?: number;
    error?: string;
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
    status: 'running' | 'failed' | 'timeout' | 'ready' | 'health_checking' | 'startup_initiated' | 'startup_completed' | 'startup_failed' | 'stopped',
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
      startupOperation?: {
        operationId: string;
        status: 'initiated' | 'monitoring' | 'health_checking' | 'completed' | 'failed';
        startedAt: string;
        phases: {
          startRequested: string;
          instanceStarting?: string;
          instanceRunning?: string;
          healthCheckStarted?: string;
          healthCheckCompleted?: string;
          ready?: string;
        };
        totalElapsedTime?: number;
        error?: string;
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
      ...(options.startupOperation && { startupOperation: options.startupOperation }),
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

  /**
   * Send startup initiated notification webhook
   */
  async sendStartupInitiatedNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      operationId: string;
      startedAt: Date;
      estimatedReadyTime?: string;
      secret?: string;
    }
  ): Promise<void> {
    const payload = this.createNotificationPayload(instanceId, 'startup_initiated', {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      startupOperation: {
        operationId: options.operationId,
        status: 'initiated',
        startedAt: options.startedAt.toISOString(),
        phases: {
          startRequested: options.startedAt.toISOString()
        },
        totalElapsedTime: 0
      },
      reason: 'Instance startup operation initiated',
      ...(options.estimatedReadyTime && { data: { estimatedReadyTime: options.estimatedReadyTime } })
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhookWithRetry(request);
  }

  /**
   * Send startup completed notification webhook
   */
  async sendStartupCompletedNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      operationId: string;
      startedAt: Date;
      completedAt: Date;
      phases: {
        startRequested: Date;
        instanceStarting?: Date;
        instanceRunning?: Date;
        healthCheckStarted?: Date;
        healthCheckCompleted?: Date;
        ready?: Date;
      };
      healthCheckResult?: HealthCheckResult;
      data?: any;
      secret?: string;
    }
  ): Promise<void> {
    const totalElapsedTime = options.completedAt.getTime() - options.startedAt.getTime();
    
    const payload = this.createNotificationPayload(instanceId, 'startup_completed', {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      elapsedTime: totalElapsedTime,
      startupOperation: {
        operationId: options.operationId,
        status: 'completed',
        startedAt: options.startedAt.toISOString(),
        phases: {
          startRequested: options.phases.startRequested.toISOString(),
          ...(options.phases.instanceStarting && { instanceStarting: options.phases.instanceStarting.toISOString() }),
          ...(options.phases.instanceRunning && { instanceRunning: options.phases.instanceRunning.toISOString() }),
          ...(options.phases.healthCheckStarted && { healthCheckStarted: options.phases.healthCheckStarted.toISOString() }),
          ...(options.phases.healthCheckCompleted && { healthCheckCompleted: options.phases.healthCheckCompleted.toISOString() }),
          ...(options.phases.ready && { ready: options.phases.ready.toISOString() })
        },
        totalElapsedTime
      },
      ...(options.healthCheckResult && { 
        healthCheck: this.formatHealthCheckForWebhook(
          options.healthCheckResult,
          'completed',
          options.phases.healthCheckStarted,
          options.phases.healthCheckCompleted
        )
      }),
      ...(options.data && { data: options.data }),
      reason: 'Instance startup completed successfully - instance is ready to serve requests'
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhookWithRetry(request);
  }

  /**
   * Send startup failed notification webhook
   */
  async sendStartupFailedNotification(
    url: string,
    instanceId: string,
    error: string,
    options: {
      novitaInstanceId?: string;
      operationId: string;
      startedAt: Date;
      failedAt: Date;
      phases: {
        startRequested: Date;
        instanceStarting?: Date;
        instanceRunning?: Date;
        healthCheckStarted?: Date;
        healthCheckCompleted?: Date;
      };
      failurePhase: 'startup' | 'health_check' | 'timeout';
      healthCheckResult?: HealthCheckResult;
      secret?: string;
    }
  ): Promise<void> {
    const totalElapsedTime = options.failedAt.getTime() - options.startedAt.getTime();
    
    const payload = this.createNotificationPayload(instanceId, 'startup_failed', {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      elapsedTime: totalElapsedTime,
      error,
      startupOperation: {
        operationId: options.operationId,
        status: 'failed',
        startedAt: options.startedAt.toISOString(),
        phases: {
          startRequested: options.phases.startRequested.toISOString(),
          ...(options.phases.instanceStarting && { instanceStarting: options.phases.instanceStarting.toISOString() }),
          ...(options.phases.instanceRunning && { instanceRunning: options.phases.instanceRunning.toISOString() }),
          ...(options.phases.healthCheckStarted && { healthCheckStarted: options.phases.healthCheckStarted.toISOString() }),
          ...(options.phases.healthCheckCompleted && { healthCheckCompleted: options.phases.healthCheckCompleted.toISOString() })
        },
        totalElapsedTime,
        error
      },
      ...(options.healthCheckResult && { 
        healthCheck: this.formatHealthCheckForWebhook(
          options.healthCheckResult,
          'failed',
          options.phases.healthCheckStarted,
          options.failedAt
        )
      }),
      reason: `Instance startup failed during ${options.failurePhase} phase: ${error}`
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhookWithRetry(request);
  }

  /**
   * Send startup progress notification webhook
   */
  async sendStartupProgressNotification(
    url: string,
    instanceId: string,
    currentPhase: 'monitoring' | 'health_checking',
    options: {
      novitaInstanceId?: string;
      operationId: string;
      startedAt: Date;
      phases: {
        startRequested: Date;
        instanceStarting?: Date;
        instanceRunning?: Date;
        healthCheckStarted?: Date;
      };
      currentStatus: string;
      healthCheckResult?: HealthCheckResult;
      secret?: string;
    }
  ): Promise<void> {
    const totalElapsedTime = Date.now() - options.startedAt.getTime();
    
    let status: 'running' | 'health_checking';
    let reason: string;
    
    switch (currentPhase) {
      case 'monitoring':
        status = 'running';
        reason = `Instance startup in progress - current status: ${options.currentStatus}`;
        break;
      case 'health_checking':
        status = 'health_checking';
        reason = 'Instance startup in progress - performing health checks';
        break;
      default:
        status = 'running';
        reason = 'Instance startup in progress';
    }
    
    const payload = this.createNotificationPayload(instanceId, status, {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      elapsedTime: totalElapsedTime,
      startupOperation: {
        operationId: options.operationId,
        status: currentPhase,
        startedAt: options.startedAt.toISOString(),
        phases: {
          startRequested: options.phases.startRequested.toISOString(),
          ...(options.phases.instanceStarting && { instanceStarting: options.phases.instanceStarting.toISOString() }),
          ...(options.phases.instanceRunning && { instanceRunning: options.phases.instanceRunning.toISOString() }),
          ...(options.phases.healthCheckStarted && { healthCheckStarted: options.phases.healthCheckStarted.toISOString() })
        },
        totalElapsedTime
      },
      ...(options.healthCheckResult && { 
        healthCheck: this.formatHealthCheckForWebhook(
          options.healthCheckResult,
          currentPhase === 'health_checking' ? 'in_progress' : 'pending'
        )
      }),
      reason
    });
    
    const request: WebhookRequest = {
      url,
      payload
    };
    
    if (options.secret) {
      request.secret = options.secret;
    }
    
    await this.sendWebhookWithRetry(request);
  }

  /**
   * Send stop notification webhook
   */
  async sendStopNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      operationId?: string;
      secret?: string;
    } = {}
  ): Promise<void> {
    logger.info('Sending stop notification webhook', {
      url,
      instanceId,
      novitaInstanceId: options.novitaInstanceId,
      operationId: options.operationId
    });

    const payload = this.createNotificationPayload(instanceId, 'stopped', {
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      ...(options.operationId && { operationId: options.operationId }),
      reason: 'Instance stopped successfully'
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
   * Send delete notification webhook
   */
  async sendDeleteNotification(
    url: string,
    instanceId: string,
    options: {
      novitaInstanceId?: string;
      operationId?: string;
      secret?: string;
    } = {}
  ): Promise<void> {
    logger.info('Sending delete notification webhook', {
      url,
      instanceId,
      novitaInstanceId: options.novitaInstanceId,
      operationId: options.operationId
    });

    const payload = {
      instanceId,
      status: 'deleted' as const,
      timestamp: new Date().toISOString(),
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      ...(options.operationId && { operationId: options.operationId }),
      reason: 'Instance deleted successfully'
    };

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
   * Send webhook with enhanced retry logic for startup operations
   */
  async sendWebhookWithRetry(request: WebhookRequest, maxRetries: number = 5): Promise<void> {
    let lastError: Error | null = null;
    const baseDelayMs = 1000; // Start with 1 second
    const maxDelayMs = 30000; // Cap at 30 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('Sending startup webhook with retry', {
          url: request.url,
          attempt,
          maxRetries,
          payloadSize: JSON.stringify(request.payload).length
        });

        await this.sendWebhook(request, 1); // Use single attempt in base method
        
        logger.info('Startup webhook sent successfully', {
          url: request.url,
          attempt,
          totalAttempts: attempt
        });

        return; // Success, exit retry loop

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('Startup webhook delivery attempt failed', {
          url: request.url,
          attempt,
          maxRetries,
          error: lastError.message,
          statusCode: (error as any)?.response?.status
        });

        // Don't retry on client errors (4xx), only on server errors (5xx) and network errors
        if ((error as any)?.response?.status && (error as any).response.status < 500) {
          logger.error('Startup webhook failed with client error, not retrying', {
            url: request.url,
            statusCode: (error as any).response.status,
            error: lastError.message
          });
          throw lastError;
        }

        // Wait before retry with exponential backoff and jitter
        if (attempt < maxRetries) {
          const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
          const jitter = Math.random() * 0.1 * exponentialDelay; // Add up to 10% jitter
          const delayMs = Math.floor(exponentialDelay + jitter);
          
          logger.debug('Waiting before startup webhook retry', {
            url: request.url,
            attempt,
            delayMs,
            exponentialDelay,
            jitter: Math.floor(jitter)
          });
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    const finalError = new Error(`Startup webhook delivery failed after ${maxRetries} attempts: ${lastError?.message}`);
    
    logger.error('Startup webhook delivery failed permanently', {
      url: request.url,
      maxRetries,
      finalError: finalError.message,
      lastError: lastError?.message
    });
    
    throw finalError;
  }
}

// Export singleton instance
export const webhookClient = new WebhookClient();