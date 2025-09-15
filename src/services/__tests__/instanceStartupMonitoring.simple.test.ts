/**
 * Simple unit tests for instance startup and monitoring functionality
 */

import { JobWorkerService } from '../jobWorkerService';
import { JobQueueService } from '../jobQueueService';
import { config } from '../../config/config';

// Mock all dependencies
jest.mock('../novitaApiService');
jest.mock('../productService');
jest.mock('../templateService');
jest.mock('../instanceService');
jest.mock('../../clients/webhookClient');
jest.mock('../../config/config', () => ({
  config: {
    novita: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.novita.ai'
    },
    defaults: {
      pollInterval: 1, // 1 second for faster tests
      maxRetryAttempts: 3,
      requestTimeout: 5000
    }
  }
}));

describe('Instance Startup and Monitoring - Unit Tests', () => {
  let jobQueue: JobQueueService;
  let jobWorker: JobWorkerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jobQueue = new JobQueueService();
    jobWorker = new JobWorkerService(jobQueue);
  });

  afterEach(() => {
    jobWorker.stop();
  });

  describe('Configuration Integration', () => {
    it('should use configurable polling interval from config', () => {
      const monitoringConfig = jobWorker.getMonitoringConfig();
      
      expect(monitoringConfig.pollIntervalMs).toBe(config.defaults.pollInterval * 1000);
      expect(monitoringConfig.maxWaitTimeMs).toBe(10 * 60 * 1000); // 10 minutes
      expect(monitoringConfig.maxRetryAttempts).toBe(config.defaults.maxRetryAttempts);
    });

    it('should initialize with correct configuration values', () => {
      const monitoringConfig = jobWorker.getMonitoringConfig();
      
      // Verify configuration is loaded correctly
      expect(monitoringConfig.pollIntervalMs).toBe(1000); // 1 second from mock config
      expect(monitoringConfig.maxRetryAttempts).toBe(3);
    });
  });

  describe('Job Worker Service Initialization', () => {
    it('should start and stop worker service correctly', () => {
      expect(() => {
        jobWorker.start();
        jobWorker.stop();
      }).not.toThrow();
    });

    it('should register job handlers on initialization', () => {
      // The constructor should register handlers without throwing
      expect(() => {
        new JobWorkerService(jobQueue);
      }).not.toThrow();
    });
  });

  describe('Monitoring Configuration', () => {
    it('should provide monitoring configuration', () => {
      const config = jobWorker.getMonitoringConfig();
      
      expect(config).toHaveProperty('pollIntervalMs');
      expect(config).toHaveProperty('maxWaitTimeMs');
      expect(config).toHaveProperty('maxRetryAttempts');
      
      expect(typeof config.pollIntervalMs).toBe('number');
      expect(typeof config.maxWaitTimeMs).toBe('number');
      expect(typeof config.maxRetryAttempts).toBe('number');
      
      expect(config.pollIntervalMs).toBeGreaterThan(0);
      expect(config.maxWaitTimeMs).toBeGreaterThan(0);
      expect(config.maxRetryAttempts).toBeGreaterThan(0);
    });

    it('should use reasonable default values', () => {
      const config = jobWorker.getMonitoringConfig();
      
      // Verify reasonable defaults
      expect(config.pollIntervalMs).toBe(1000); // 1 second
      expect(config.maxWaitTimeMs).toBe(600000); // 10 minutes
      expect(config.maxRetryAttempts).toBe(3);
    });
  });

  describe('Job Queue Integration', () => {
    it('should integrate with job queue service', () => {
      expect(jobQueue).toBeDefined();
      expect(jobWorker).toBeDefined();
      
      // Should be able to get queue stats
      const stats = jobQueue.getStats();
      expect(stats).toHaveProperty('totalJobs');
      expect(stats).toHaveProperty('pendingJobs');
      expect(stats).toHaveProperty('processingJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
    });
  });
});