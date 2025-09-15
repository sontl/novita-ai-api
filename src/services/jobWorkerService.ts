/**
 * Background worker service for processing different job types
 */

import { logger } from '../utils/logger';
import { JobQueueService } from './jobQueueService';
import {
  Job,
  JobType,
  CreateInstanceJobPayload,
  MonitorInstanceJobPayload,
  SendWebhookJobPayload
} from '../types/job';

export class JobWorkerService {
  constructor(private jobQueue: JobQueueService) {
    this.registerHandlers();
  }

  /**
   * Register all job handlers with the queue service
   */
  private registerHandlers(): void {
    this.jobQueue.registerHandler(JobType.CREATE_INSTANCE, this.handleCreateInstance.bind(this));
    this.jobQueue.registerHandler(JobType.MONITOR_INSTANCE, this.handleMonitorInstance.bind(this));
    this.jobQueue.registerHandler(JobType.SEND_WEBHOOK, this.handleSendWebhook.bind(this));
  }

  /**
   * Handle instance creation job
   */
  private async handleCreateInstance(job: Job): Promise<void> {
    const payload = job.payload as CreateInstanceJobPayload;
    
    logger.info('Processing create instance job', {
      jobId: job.id,
      instanceId: payload.instanceId,
      productName: payload.productName,
      templateId: payload.templateId
    });

    try {
      // TODO: This will be implemented when InstanceService is available
      // For now, we'll simulate the process
      await this.simulateInstanceCreation(payload);
      
      logger.info('Instance creation job completed', {
        jobId: job.id,
        instanceId: payload.instanceId
      });

    } catch (error) {
      logger.error('Instance creation job failed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle instance monitoring job
   */
  private async handleMonitorInstance(job: Job): Promise<void> {
    const payload = job.payload as MonitorInstanceJobPayload;
    
    logger.info('Processing monitor instance job', {
      jobId: job.id,
      instanceId: payload.instanceId,
      novitaInstanceId: payload.novitaInstanceId
    });

    try {
      // Check if monitoring timeout has been reached
      const now = new Date();
      const elapsedTime = now.getTime() - payload.startTime.getTime();
      
      if (elapsedTime > payload.maxWaitTime) {
        throw new Error(`Instance monitoring timeout after ${payload.maxWaitTime}ms`);
      }

      // TODO: This will be implemented when NovitaApiService is available
      // For now, we'll simulate the monitoring process
      const isReady = await this.simulateInstanceMonitoring(payload);
      
      if (isReady) {
        logger.info('Instance is ready', {
          jobId: job.id,
          instanceId: payload.instanceId,
          novitaInstanceId: payload.novitaInstanceId
        });

        // Send webhook notification if configured
        if (payload.webhookUrl) {
          await this.jobQueue.addJob(JobType.SEND_WEBHOOK, {
            url: payload.webhookUrl,
            payload: {
              instanceId: payload.instanceId,
              novitaInstanceId: payload.novitaInstanceId,
              status: 'running',
              timestamp: new Date().toISOString()
            }
          });
        }
      } else {
        // Instance not ready yet, reschedule monitoring
        await this.jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);
      }

    } catch (error) {
      logger.error('Instance monitoring job failed', {
        jobId: job.id,
        instanceId: payload.instanceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send failure webhook if configured
      if (payload.webhookUrl) {
        await this.jobQueue.addJob(JobType.SEND_WEBHOOK, {
          url: payload.webhookUrl,
          payload: {
            instanceId: payload.instanceId,
            novitaInstanceId: payload.novitaInstanceId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }
        });
      }

      throw error;
    }
  }

  /**
   * Handle webhook sending job
   */
  private async handleSendWebhook(job: Job): Promise<void> {
    const payload = job.payload as SendWebhookJobPayload;
    
    logger.info('Processing send webhook job', {
      jobId: job.id,
      url: payload.url
    });

    try {
      // TODO: This will be implemented when HTTP client is available
      // For now, we'll simulate the webhook sending
      await this.simulateWebhookSending(payload);
      
      logger.info('Webhook sent successfully', {
        jobId: job.id,
        url: payload.url
      });

    } catch (error) {
      logger.error('Webhook sending job failed', {
        jobId: job.id,
        url: payload.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Simulate instance creation (placeholder for actual implementation)
   */
  private async simulateInstanceCreation(payload: CreateInstanceJobPayload): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate potential failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Simulated instance creation failure');
    }

    logger.debug('Simulated instance creation completed', {
      instanceId: payload.instanceId,
      productName: payload.productName
    });
  }

  /**
   * Simulate instance monitoring (placeholder for actual implementation)
   */
  private async simulateInstanceMonitoring(payload: MonitorInstanceJobPayload): Promise<boolean> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simulate instance becoming ready (30% chance per check)
    const isReady = Math.random() < 0.3;
    
    logger.debug('Simulated instance monitoring check', {
      instanceId: payload.instanceId,
      isReady
    });

    return isReady;
  }

  /**
   * Simulate webhook sending (placeholder for actual implementation)
   */
  private async simulateWebhookSending(payload: SendWebhookJobPayload): Promise<void> {
    // Simulate HTTP request delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simulate potential failure (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Simulated webhook delivery failure');
    }

    logger.debug('Simulated webhook sent', {
      url: payload.url,
      payloadSize: JSON.stringify(payload.payload).length
    });
  }

  /**
   * Start the worker service
   */
  start(): void {
    logger.info('Starting job worker service');
    this.jobQueue.startProcessing();
  }

  /**
   * Stop the worker service
   */
  stop(): void {
    logger.info('Stopping job worker service');
    this.jobQueue.stopProcessing();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info('Shutting down job worker service');
    await this.jobQueue.shutdown(timeoutMs);
  }
}