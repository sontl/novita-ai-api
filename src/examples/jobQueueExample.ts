/**
 * Example demonstrating job queue usage
 */

import { RedisJobQueueService } from '../services/redisJobQueueService';
import { JobWorkerService } from '../services/jobWorkerService';
import { JobType, JobPriority, CreateInstanceJobPayload, SendWebhookJobPayload } from '../types/job';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('example');

async function demonstrateJobQueue(): Promise<void> {
  logger.info('Starting job queue demonstration');

  // Create job queue and worker
  const jobQueue = new JobQueueService(1000); // Process every second
  const jobWorker = new JobWorkerService(jobQueue);

  // Start the worker
  jobWorker.start();

  try {
    // Example 1: Create instance job
    const createInstancePayload: CreateInstanceJobPayload = {
      instanceId: 'demo-instance-1',
      name: 'Demo Instance',
      productName: 'RTX 4090 24GB',
      templateId: 'template-123',
      gpuNum: 2,
      rootfsSize: 100,
      region: 'CN-HK-01',
      webhookUrl: 'https://example.com/webhook'
    };

    const createJobId = await jobQueue.addJob(
      JobType.CREATE_INSTANCE,
      createInstancePayload,
      JobPriority.HIGH
    );

    logger.info('Added create instance job', { jobId: createJobId });

    // Example 2: Send webhook job
    const webhookPayload: SendWebhookJobPayload = {
      url: 'https://example.com/status-update',
      payload: {
        instanceId: 'demo-instance-1',
        status: 'ready',
        timestamp: new Date().toISOString()
      }
    };

    const webhookJobId = await jobQueue.addJob(
      JobType.SEND_WEBHOOK,
      webhookPayload,
      JobPriority.NORMAL
    );

    logger.info('Added webhook job', { jobId: webhookJobId });

    // Monitor job progress
    const monitorJobs = async (): Promise<void> => {
      const stats = jobQueue.getStats();
      logger.info('Job queue statistics', stats);

      const createJob = jobQueue.getJob(createJobId);
      const webhookJob = jobQueue.getJob(webhookJobId);

      logger.info('Job statuses', {
        createJob: { id: createJob?.id, status: createJob?.status, attempts: createJob?.attempts },
        webhookJob: { id: webhookJob?.id, status: webhookJob?.status, attempts: webhookJob?.attempts }
      });

      // Check if both jobs are complete
      if (createJob?.status === 'completed' && webhookJob?.status === 'completed') {
        logger.info('All jobs completed successfully');
        return;
      }

      // Continue monitoring
      setTimeout(monitorJobs, 2000);
    };

    // Start monitoring
    setTimeout(monitorJobs, 1000);

    // Let it run for a while
    await new Promise(resolve => setTimeout(resolve, 10000));

  } finally {
    // Cleanup
    await jobWorker.shutdown(5000);
    logger.info('Job queue demonstration completed');
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateJobQueue().catch(error => {
    logger.error('Job queue demonstration failed', { error: error.message });
    process.exit(1);
  });
}

export { demonstrateJobQueue };