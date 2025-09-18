/**
 * Enhanced tests for JobWorkerService health check integration
 * Tests the complete health check workflow including state transitions,
 * timeout handling, and webhook notifications
 */

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { instanceService } from '../instanceService';
import { novitaApiService } from '../novitaApiService';
import { healthCheckerService } from '../healthCheckerService';
import { webhookClient } from '../../clients/webhookClient';
import {
  Job,
  JobType,
  JobStatus,
  MonitorInstanceJobPayload
} from '../../types/job';
import { InstanceStatus, HealthCheckConfig, HealthCheckResult } from '../../types/api';

// Mock dependencies
jest.mock('../instanceService');
jest.mock('../novitaApiService');
jest.mock('../healthCheckerService');
jest.mock('../../clients/webhookClient');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('JobWorkerService Enhanced Health Check Integration', () => {
  let jobWorkerService: JobWorkerService;
  let jobQueue: JobQueueService;

  const mockHealthCheckConfig: HealthCheckConfig = {
    timeoutMs: 10000,
    retryAttempts: 3,
    retryDelayMs: 2000,
    maxWaitTimeMs: 300000
  };

  // Helper function to wait for job completion
  const waitForJobCompletion = async (jobId: string, timeoutMs: number = 2000): Promise<Job | undefined> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const job = jobQueue.getJob(jobId);
      if (job && (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)) {
        return job;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return jobQueue.getJob(jobId);
  };

  beforeEach(() => {
    // Use faster processing interval for tests
    jobQueue = new JobQueueService(50); // 50ms processing interval
    jobWorkerService = new JobWorkerService(jobQueue);

    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (instanceService.getInstanceState as jest.Mock).mockReturnValue({
      id: 'test-instance',
      status: InstanceStatus.RUNNING,
      timestamps: { created: new Date() }
    });
    
    (novitaApiService.getInstance as jest.Mock).mockResolvedValue({
      id: 'novita-123',
      status: InstanceStatus.RUNNING,
      portMappings: [
        { port: 8080, type: 'http' },
        { port: 3000, type: 'http' }
      ]
    });
    
    (healthCheckerService.performHealthChecks as jest.Mock).mockResolvedValue({
      overallStatus: 'healthy',
      endpoints: [
        { port: 8080, endpoint: 'http://localhost:8080', type: 'http', status: 'healthy' },
        { port: 3000, endpoint: 'http://localhost:3000', type: 'http', status: 'healthy' }
      ],
      checkedAt: new Date(),
      totalResponseTime: 150
    });
    
    (webhookClient.createNotificationPayload as jest.Mock).mockReturnValue({
      instanceId: 'test-instance',
      status: 'ready',
      timestamp: new Date().toISOString()
    });
    
    (webhookClient.sendHealthCheckNotification as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jobWorkerService.stop();
  });

  describe('handleMonitorInstance with health check integration', () => {
    it('should transition to health checking when instance becomes running', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      const jobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job completion
      const job = await waitForJobCompletion(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);

      // Verify health checks were performed with correct endpoints
      expect(healthCheckerService.performHealthChecks).toHaveBeenCalledWith(
        [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http' },
          { port: 3000, endpoint: 'http://localhost:3000', type: 'http' }
        ],
        mockHealthCheckConfig
      );

      // Verify instance state was updated (should be called multiple times during the flow)
      expect(instanceService.updateInstanceState).toHaveBeenCalled();
      
      // Check that the final call was to set status to READY
      const updateCalls = (instanceService.updateInstanceState as jest.Mock).mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1];
      expect(finalCall[1]).toEqual(
        expect.objectContaining({
          status: InstanceStatus.READY
        })
      );

      // Verify webhook notifications were sent
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          healthCheckStatus: 'in_progress'
        })
      );

      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          healthCheckStatus: 'completed',
          healthCheckResult: expect.any(Object)
        })
      );
    });

    it('should handle partial health check results and continue monitoring', async () => {
      // Mock partial health check result
      const partialHealthResult: HealthCheckResult = {
        overallStatus: 'partial',
        endpoints: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http', status: 'healthy', responseTime: 150 },
          { port: 3000, endpoint: 'http://localhost:3000', type: 'http', status: 'unhealthy', error: 'Connection refused', responseTime: 0 }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      (healthCheckerService.performHealthChecks as jest.Mock).mockResolvedValue(partialHealthResult);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for initial job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify health check was performed
      expect(healthCheckerService.performHealthChecks).toHaveBeenCalled();

      // Verify instance state was updated with partial results
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          healthCheck: expect.objectContaining({
            status: 'in_progress',
            results: expect.arrayContaining([partialHealthResult])
          })
        })
      );

      // Verify instance was not marked as ready (should continue monitoring)
      expect(instanceService.updateInstanceState).not.toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.READY
        })
      );

      // Verify another monitoring job was scheduled
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(1);
    });

    it('should handle health check timeout correctly', async () => {
      // Mock instance state with health check started long ago
      const oldStartTime = new Date(Date.now() - 400000); // 400 seconds ago
      const mockInstanceState = {
        id: 'test-instance',
        status: InstanceStatus.HEALTH_CHECKING,
        healthCheck: {
          status: 'in_progress',
          config: mockHealthCheckConfig,
          results: [],
          startedAt: oldStartTime
        },
        timestamps: { created: new Date() }
      };

      (instanceService.getInstanceState as jest.Mock).mockReturnValue(mockInstanceState);
      (healthCheckerService.summarizeResults as jest.Mock).mockReturnValue({
        summary: 'Health check timeout - no successful checks',
        metrics: { totalChecks: 0, successfulChecks: 0 },
        issues: ['Timeout exceeded before any successful health checks']
      });

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify instance was marked as failed due to health check timeout
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: expect.stringContaining('Health check timeout after'),
          timestamps: expect.objectContaining({
            failed: expect.any(Date)
          }),
          healthCheck: expect.objectContaining({
            status: 'failed',
            completedAt: expect.any(Date)
          })
        })
      );

      // Verify timeout webhook notification was sent
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'failed',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          error: expect.stringContaining('Health check timeout after'),
          healthCheckStatus: 'failed'
        })
      );
    });

    it('should handle instance with no port mappings', async () => {
      // Mock Novita instance without port mappings
      const mockNovitaInstance = {
        id: 'novita-123',
        status: InstanceStatus.RUNNING,
        portMappings: []
      };

      (novitaApiService.getInstance as jest.Mock).mockResolvedValue(mockNovitaInstance);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook'
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify instance was marked as ready immediately (no health checks needed)
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.READY,
          timestamps: expect.objectContaining({
            ready: expect.any(Date)
          })
        })
      );

      // Verify health checks were not performed
      expect(healthCheckerService.performHealthChecks).not.toHaveBeenCalled();

      // Verify ready webhook notification was sent
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          healthCheckResult: expect.objectContaining({
            overallStatus: 'healthy',
            endpoints: [],
            totalResponseTime: 0
          })
        })
      );
    });

    it('should handle health check service errors gracefully', async () => {
      // Mock health check service to throw an error
      const healthCheckError = new Error('Network connection failed');
      (healthCheckError as any).name = 'HealthCheckError';
      (healthCheckError as any).isRetryable = true;
      (healthCheckError as any).severity = 'medium';

      (healthCheckerService.performHealthChecks as jest.Mock).mockRejectedValue(healthCheckError);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify health check was attempted
      expect(healthCheckerService.performHealthChecks).toHaveBeenCalled();

      // For retryable errors, should reschedule monitoring
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(1);

      // Should not mark instance as failed for retryable errors
      expect(instanceService.updateInstanceState).not.toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.FAILED
        })
      );
    });

    it('should handle critical health check errors by failing instance', async () => {
      // Mock critical health check error
      const criticalError = new Error('Critical system failure');
      (criticalError as any).name = 'HealthCheckError';
      (criticalError as any).isRetryable = false;
      (criticalError as any).severity = 'critical';

      (healthCheckerService.performHealthChecks as jest.Mock).mockRejectedValue(criticalError);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify instance was marked as failed for critical errors
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: 'Critical system failure',
          healthCheck: expect.objectContaining({
            status: 'failed'
          })
        })
      );

      // Verify failure webhook notification was sent
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('Critical system failure'),
          healthCheckStatus: 'failed'
        })
      );
    });
  });

  describe('instance state transitions during health checking', () => {
    it('should properly transition through all health check states', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      const updateCalls = (instanceService.updateInstanceState as jest.Mock).mock.calls;

      // Verify state transition sequence
      expect(updateCalls).toEqual(
        expect.arrayContaining([
          // First call: transition to HEALTH_CHECKING
          ['test-instance', expect.objectContaining({
            status: InstanceStatus.HEALTH_CHECKING,
            healthCheck: expect.objectContaining({
              status: 'in_progress',
              startedAt: expect.any(Date)
            })
          })],
          // Second call: update with health check results
          ['test-instance', expect.objectContaining({
            healthCheck: expect.objectContaining({
              status: 'in_progress',
              results: expect.any(Array)
            })
          })],
          // Final call: transition to READY
          ['test-instance', expect.objectContaining({
            status: InstanceStatus.READY,
            timestamps: expect.objectContaining({
              ready: expect.any(Date)
            }),
            healthCheck: expect.objectContaining({
              status: 'completed',
              completedAt: expect.any(Date)
            })
          })]
        ])
      );
    });

    it('should maintain health check history during state transitions', async () => {
      // Mock multiple health check results
      const firstResult: HealthCheckResult = {
        overallStatus: 'partial',
        endpoints: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http', status: 'healthy', responseTime: 150 },
          { port: 3000, endpoint: 'http://localhost:3000', type: 'http', status: 'unhealthy', error: 'Connection refused', responseTime: 0 }
        ],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      const secondResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          { port: 8080, endpoint: 'http://localhost:8080', type: 'http', status: 'healthy', responseTime: 120 },
          { port: 3000, endpoint: 'http://localhost:3000', type: 'http', status: 'healthy', responseTime: 180 }
        ],
        checkedAt: new Date(),
        totalResponseTime: 300
      };

      // Mock sequential health check results
      (healthCheckerService.performHealthChecks as jest.Mock)
        .mockResolvedValueOnce(firstResult)
        .mockResolvedValueOnce(secondResult);

      // Mock instance state to simulate already health checking
      let callCount = 0;
      (instanceService.getInstanceState as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            id: 'test-instance',
            status: InstanceStatus.RUNNING,
            timestamps: { created: new Date() }
          };
        } else {
          return {
            id: 'test-instance',
            status: InstanceStatus.HEALTH_CHECKING,
            healthCheck: {
              status: 'in_progress',
              config: mockHealthCheckConfig,
              results: [firstResult],
              startedAt: new Date()
            },
            timestamps: { created: new Date() }
          };
        }
      });

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for initial processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Add another monitoring job to simulate continued monitoring
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify health check results are accumulated
      const updateCalls = (instanceService.updateInstanceState as jest.Mock).mock.calls;
      const finalCall = updateCalls[updateCalls.length - 1];
      
      expect(finalCall[1]).toEqual(
        expect.objectContaining({
          status: InstanceStatus.READY,
          healthCheck: expect.objectContaining({
            status: 'completed',
            results: expect.arrayContaining([firstResult, secondResult])
          })
        })
      );
    });

    it('should handle state transitions with webhook failures gracefully', async () => {
      // Mock webhook failure
      (webhookClient.sendHealthCheckNotification as jest.Mock).mockRejectedValue(
        new Error('Webhook delivery failed')
      );

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify instance state was still updated correctly despite webhook failure
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.READY
        })
      );

      // Verify webhook was attempted
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalled();
    });
  });

  describe('webhook notifications with health check data', () => {
    it('should send comprehensive webhook notifications for successful health checks', async () => {
      const mockHealthResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [
          { 
            port: 8080, 
            endpoint: 'http://localhost:8080', 
            type: 'http', 
            status: 'healthy',
            lastChecked: new Date('2023-01-01T00:01:00.000Z'),
            responseTime: 150
          },
          { 
            port: 3000, 
            endpoint: 'http://localhost:3000', 
            type: 'http', 
            status: 'healthy',
            lastChecked: new Date('2023-01-01T00:01:00.000Z'),
            responseTime: 200
          }
        ],
        checkedAt: new Date('2023-01-01T00:01:00.000Z'),
        totalResponseTime: 350
      };

      (healthCheckerService.performHealthChecks as jest.Mock).mockResolvedValue(mockHealthResult);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date('2023-01-01T00:00:00.000Z'),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify health_checking notification
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'health_checking',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          elapsedTime: expect.any(Number),
          healthCheckStatus: 'in_progress',
          healthCheckStartedAt: expect.any(Date)
        })
      );

      // Verify ready notification with complete health check data
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'ready',
        expect.objectContaining({
          novitaInstanceId: 'novita-123',
          elapsedTime: expect.any(Number),
          healthCheckResult: mockHealthResult,
          healthCheckStatus: 'completed',
          healthCheckStartedAt: expect.any(Date),
          healthCheckCompletedAt: expect.any(Date)
        })
      );
    });

    it('should not send webhook notifications when webhookUrl is not provided', async () => {
      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        // No webhookUrl provided
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify health check logic completed successfully
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.READY
        })
      );

      // Verify no webhook notifications were sent
      expect(webhookClient.sendHealthCheckNotification).not.toHaveBeenCalled();
    });
  });

  describe('health check timeout and failure scenarios', () => {
    it('should handle health check timeout with comprehensive error details', async () => {
      const oldStartTime = new Date(Date.now() - 400000); // 400 seconds ago
      const mockInstanceState = {
        id: 'test-instance',
        status: InstanceStatus.HEALTH_CHECKING,
        healthCheck: {
          status: 'in_progress',
          config: mockHealthCheckConfig,
          results: [
            {
              overallStatus: 'unhealthy',
              endpoints: [
                { 
                  port: 8080, 
                  endpoint: 'http://localhost:8080', 
                  type: 'http', 
                  status: 'unhealthy',
                  error: 'Connection timeout',
                  responseTime: 0,
                  lastChecked: new Date()
                }
              ],
              checkedAt: new Date(),
              totalResponseTime: 0
            }
          ],
          startedAt: oldStartTime
        },
        timestamps: { created: new Date() }
      };

      (instanceService.getInstanceState as jest.Mock).mockReturnValue(mockInstanceState);
      (healthCheckerService.summarizeResults as jest.Mock).mockReturnValue({
        summary: 'Health check timeout - persistent failures',
        metrics: { totalChecks: 10, successfulChecks: 0, averageResponseTime: 0 },
        issues: ['All endpoints consistently failing', 'Timeout exceeded maximum wait time']
      });

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        webhookUrl: 'https://example.com/webhook',
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify instance was marked as failed with detailed error
      expect(instanceService.updateInstanceState).toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.FAILED,
          lastError: expect.stringMatching(/Health check timeout after \d+ms \(max: 300000ms\)/),
          timestamps: expect.objectContaining({
            failed: expect.any(Date)
          }),
          healthCheck: expect.objectContaining({
            status: 'failed',
            completedAt: expect.any(Date)
          })
        })
      );

      // Verify comprehensive webhook notification
      expect(webhookClient.sendHealthCheckNotification).toHaveBeenCalledWith(
        'https://example.com/webhook',
        'test-instance',
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('Health check timeout after'),
          healthCheckStatus: 'failed',
          data: expect.objectContaining({
            maxWaitTimeMs: 300000,
            healthCheckSummary: 'Health check timeout - persistent failures',
            healthCheckMetrics: expect.objectContaining({
              totalChecks: 10,
              successfulChecks: 0
            }),
            endpointDetails: expect.arrayContaining([
              expect.objectContaining({
                port: 8080,
                status: 'unhealthy',
                error: 'Connection timeout'
              })
            ])
          })
        })
      );
    });

    it('should differentiate between retryable and critical health check failures', async () => {
      // Test retryable error first
      const retryableError = new Error('Temporary network issue');
      (retryableError as any).name = 'HealthCheckError';
      (retryableError as any).isRetryable = true;
      (retryableError as any).severity = 'medium';

      (healthCheckerService.performHealthChecks as jest.Mock).mockRejectedValueOnce(retryableError);

      const payload: MonitorInstanceJobPayload = {
        instanceId: 'test-instance',
        novitaInstanceId: 'novita-123',
        startTime: new Date(),
        maxWaitTime: 600000,
        healthCheckConfig: mockHealthCheckConfig
      };

      jobWorkerService.start();
      await jobQueue.addJob(JobType.MONITOR_INSTANCE, payload);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should not mark instance as failed for retryable errors
      expect(instanceService.updateInstanceState).not.toHaveBeenCalledWith(
        'test-instance',
        expect.objectContaining({
          status: InstanceStatus.FAILED
        })
      );

      // Should reschedule monitoring
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = jobQueue.getStats();
      expect(stats.jobsByType[JobType.MONITOR_INSTANCE]).toBeGreaterThan(1);
    });
  });
});