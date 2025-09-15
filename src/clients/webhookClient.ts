/**
 * HTTP client for sending webhook notifications
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface WebhookRequest {
  url: string;
  payload: any;
  headers?: Record<string, string>;
  secret?: string;
}

export interface WebhookNotificationPayload {
  instanceId: string;
  novitaInstanceId?: string;
  status: 'running' | 'failed' | 'timeout';
  timestamp: string;
  elapsedTime?: number;
  error?: string;
  data?: any;
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
   * Create standardized webhook notification payload
   */
  createNotificationPayload(
    instanceId: string,
    status: 'running' | 'failed' | 'timeout',
    options: {
      novitaInstanceId?: string;
      elapsedTime?: number;
      error?: string;
      data?: any;
    } = {}
  ): WebhookNotificationPayload {
    return {
      instanceId,
      status,
      timestamp: new Date().toISOString(),
      ...(options.novitaInstanceId && { novitaInstanceId: options.novitaInstanceId }),
      ...(options.elapsedTime !== undefined && { elapsedTime: options.elapsedTime }),
      ...(options.error && { error: options.error }),
      ...(options.data && { data: options.data })
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
}

// Export singleton instance
export const webhookClient = new WebhookClient();