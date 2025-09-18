import { instanceService } from '../instanceService';
import { InstanceStatus, HealthCheckConfig, HealthCheckResult } from '../../types/api';

describe('InstanceService - Health Check Management', () => {
  const mockInstanceId = 'test-instance-123';
  const mockHealthCheckConfig: HealthCheckConfig = {
    timeoutMs: 10000,
    retryAttempts: 3,
    retryDelayMs: 2000,
    maxWaitTimeMs: 300000,
    targetPort: 8080
  };

  beforeEach(() => {
    // Clear any existing instance states
    instanceService.removeInstanceState(mockInstanceId);
    
    // Create a mock instance state
    const mockInstanceState = {
      id: mockInstanceId,
      name: 'test-instance',
      status: InstanceStatus.RUNNING,
      productId: 'test-product',
      templateId: 'test-template',
      configuration: {
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        imageUrl: 'test-image',
        ports: [{ port: 8080, type: 'http' as const }],
        envs: []
      },
      timestamps: {
        created: new Date(),
        started: new Date()
      }
    };

    // Manually add to internal state for testing
    (instanceService as any).instanceStates.set(mockInstanceId, mockInstanceState);
  });

  afterEach(() => {
    instanceService.removeInstanceState(mockInstanceId);
  });

  describe('initializeHealthCheck', () => {
    it('should initialize health check configuration', () => {
      instanceService.initializeHealthCheck(mockInstanceId, mockHealthCheckConfig);

      const healthCheckStatus = instanceService.getHealthCheckStatus(mockInstanceId);
      expect(healthCheckStatus.status).toBe('pending');
      expect(healthCheckStatus.config).toEqual(mockHealthCheckConfig);
      expect(healthCheckStatus.latestResult).toBeUndefined();
    });

    it('should throw error for non-existent instance', () => {
      expect(() => {
        instanceService.initializeHealthCheck('non-existent', mockHealthCheckConfig);
      }).toThrow('Instance state not found: non-existent');
    });
  });

  describe('updateHealthCheckProgress', () => {
    beforeEach(() => {
      instanceService.initializeHealthCheck(mockInstanceId, mockHealthCheckConfig);
    });

    it('should update health check progress with results', () => {
      const mockResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [{
          port: 8080,
          endpoint: 'http://localhost:8080',
          type: 'http',
          status: 'healthy',
          lastChecked: new Date(),
          responseTime: 150
        }],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      instanceService.updateHealthCheckProgress(mockInstanceId, mockResult);

      const healthCheckStatus = instanceService.getHealthCheckStatus(mockInstanceId);
      expect(healthCheckStatus.latestResult).toEqual(mockResult);
    });

    it('should limit health check results to 10 entries', () => {
      // Add 15 results
      for (let i = 0; i < 15; i++) {
        const mockResult: HealthCheckResult = {
          overallStatus: 'healthy',
          endpoints: [{
            port: 8080,
            endpoint: 'http://localhost:8080',
            type: 'http',
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: 150 + i
          }],
          checkedAt: new Date(),
          totalResponseTime: 150 + i
        };

        instanceService.updateHealthCheckProgress(mockInstanceId, mockResult);
      }

      const history = instanceService.getHealthCheckHistory(mockInstanceId);
      expect(history).toHaveLength(10);
      // Should keep the latest 10 results
      expect(history[9]?.totalResponseTime).toBe(164); // 150 + 14 (last result)
    });

    it('should throw error for instance without health check initialized', () => {
      const anotherInstanceId = 'another-instance';
      const mockInstanceState = {
        id: anotherInstanceId,
        name: 'another-instance',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        templateId: 'test-template',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [{ port: 8080, type: 'http' as const }],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };

      (instanceService as any).instanceStates.set(anotherInstanceId, mockInstanceState);

      const mockResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [],
        checkedAt: new Date(),
        totalResponseTime: 0
      };

      expect(() => {
        instanceService.updateHealthCheckProgress(anotherInstanceId, mockResult);
      }).toThrow('Instance state or health check not found: another-instance');

      instanceService.removeInstanceState(anotherInstanceId);
    });
  });

  describe('status transition handling', () => {
    beforeEach(() => {
      instanceService.initializeHealthCheck(mockInstanceId, mockHealthCheckConfig);
    });

    it('should handle transition to HEALTH_CHECKING status', () => {
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.HEALTH_CHECKING
      });

      const healthCheckStatus = instanceService.getHealthCheckStatus(mockInstanceId);
      expect(healthCheckStatus.status).toBe('in_progress');
      expect(healthCheckStatus.startedAt).toBeDefined();
    });

    it('should handle transition to READY status', async () => {
      // First transition to health checking
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.HEALTH_CHECKING
      });

      // Add a small delay to ensure duration calculation works
      await new Promise(resolve => setTimeout(resolve, 10));

      // Then transition to ready
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.READY
      });

      const healthCheckStatus = instanceService.getHealthCheckStatus(mockInstanceId);
      expect(healthCheckStatus.status).toBe('completed');
      expect(healthCheckStatus.completedAt).toBeDefined();
      expect(healthCheckStatus.duration).toBeGreaterThanOrEqual(0);

      const instanceState = instanceService.getInstanceState(mockInstanceId);
      expect(instanceState?.timestamps.ready).toBeDefined();
    });

    it('should handle transition to FAILED status', () => {
      // First transition to health checking
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.HEALTH_CHECKING
      });

      // Then transition to failed
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.FAILED
      });

      const healthCheckStatus = instanceService.getHealthCheckStatus(mockInstanceId);
      expect(healthCheckStatus.status).toBe('failed');
      expect(healthCheckStatus.completedAt).toBeDefined();

      const instanceState = instanceService.getInstanceState(mockInstanceId);
      expect(instanceState?.timestamps.failed).toBeDefined();
    });
  });

  describe('health check status queries', () => {
    beforeEach(() => {
      instanceService.initializeHealthCheck(mockInstanceId, mockHealthCheckConfig);
    });

    it('should return not_configured for instance without health check', () => {
      const anotherInstanceId = 'another-instance';
      const mockInstanceState = {
        id: anotherInstanceId,
        name: 'another-instance',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        templateId: 'test-template',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };

      (instanceService as any).instanceStates.set(anotherInstanceId, mockInstanceState);

      const healthCheckStatus = instanceService.getHealthCheckStatus(anotherInstanceId);
      expect(healthCheckStatus.status).toBe('not_configured');

      instanceService.removeInstanceState(anotherInstanceId);
    });

    it('should identify ready instances correctly', () => {
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.READY
      });

      expect(instanceService.isInstanceReady(mockInstanceId)).toBe(true);
      expect(instanceService.isInstanceHealthChecking(mockInstanceId)).toBe(false);
    });

    it('should identify health checking instances correctly', () => {
      instanceService.updateInstanceState(mockInstanceId, {
        status: InstanceStatus.HEALTH_CHECKING
      });

      expect(instanceService.isInstanceHealthChecking(mockInstanceId)).toBe(true);
      expect(instanceService.isInstanceReady(mockInstanceId)).toBe(false);
    });
  });

  describe('instance filtering by status', () => {
    const createMockInstance = (id: string, status: InstanceStatus) => {
      const mockInstanceState = {
        id,
        name: `instance-${id}`,
        status,
        productId: 'test-product',
        templateId: 'test-template',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };

      (instanceService as any).instanceStates.set(id, mockInstanceState);
      return id;
    };

    afterEach(() => {
      // Clean up all test instances
      ['health-check-1', 'health-check-2', 'ready-1', 'failed-1'].forEach(id => {
        instanceService.removeInstanceState(id);
      });
    });

    it('should filter instances by status', () => {
      const healthCheckingId1 = createMockInstance('health-check-1', InstanceStatus.HEALTH_CHECKING);
      const healthCheckingId2 = createMockInstance('health-check-2', InstanceStatus.HEALTH_CHECKING);
      const readyId = createMockInstance('ready-1', InstanceStatus.READY);

      const healthCheckingInstances = instanceService.getInstancesByStatus(InstanceStatus.HEALTH_CHECKING);
      const readyInstances = instanceService.getInstancesByStatus(InstanceStatus.READY);

      expect(healthCheckingInstances).toHaveLength(2);
      expect(healthCheckingInstances.map(i => i.id)).toContain(healthCheckingId1);
      expect(healthCheckingInstances.map(i => i.id)).toContain(healthCheckingId2);

      expect(readyInstances).toHaveLength(1);
      expect(readyInstances[0]?.id).toBe(readyId);
    });

    it('should get health checking instances', () => {
      createMockInstance('health-check-1', InstanceStatus.HEALTH_CHECKING);
      createMockInstance('ready-1', InstanceStatus.READY);

      const healthCheckingInstances = instanceService.getHealthCheckingInstances();
      expect(healthCheckingInstances).toHaveLength(1);
      expect(healthCheckingInstances[0]?.id).toBe('health-check-1');
    });

    it('should get failed health check instances', () => {
      const failedId = createMockInstance('failed-1', InstanceStatus.FAILED);
      
      // Initialize health check for the failed instance
      instanceService.initializeHealthCheck(failedId, mockHealthCheckConfig);
      instanceService.updateInstanceState(failedId, {
        status: InstanceStatus.HEALTH_CHECKING
      });
      instanceService.updateInstanceState(failedId, {
        status: InstanceStatus.FAILED
      });

      const failedInstances = instanceService.getFailedHealthCheckInstances();
      expect(failedInstances).toHaveLength(1);
      expect(failedInstances[0]?.id).toBe(failedId);
    });
  });

  describe('getHealthCheckHistory', () => {
    beforeEach(() => {
      instanceService.initializeHealthCheck(mockInstanceId, mockHealthCheckConfig);
    });

    it('should return empty array for instance without health check results', () => {
      const history = instanceService.getHealthCheckHistory(mockInstanceId);
      expect(history).toEqual([]);
    });

    it('should return copy of health check results', () => {
      const mockResult: HealthCheckResult = {
        overallStatus: 'healthy',
        endpoints: [{
          port: 8080,
          endpoint: 'http://localhost:8080',
          type: 'http',
          status: 'healthy',
          lastChecked: new Date(),
          responseTime: 150
        }],
        checkedAt: new Date(),
        totalResponseTime: 150
      };

      instanceService.updateHealthCheckProgress(mockInstanceId, mockResult);

      const history = instanceService.getHealthCheckHistory(mockInstanceId);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(mockResult);

      // Verify it's a copy (modifying returned array shouldn't affect internal state)
      history.push({} as HealthCheckResult);
      const historyAgain = instanceService.getHealthCheckHistory(mockInstanceId);
      expect(historyAgain).toHaveLength(1);
    });

    it('should return empty array for instance without health check', () => {
      const anotherInstanceId = 'another-instance';
      const mockInstanceState = {
        id: anotherInstanceId,
        name: 'another-instance',
        status: InstanceStatus.RUNNING,
        productId: 'test-product',
        templateId: 'test-template',
        configuration: {
          gpuNum: 1,
          rootfsSize: 60,
          region: 'CN-HK-01',
          imageUrl: 'test-image',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date()
        }
      };

      (instanceService as any).instanceStates.set(anotherInstanceId, mockInstanceState);

      const history = instanceService.getHealthCheckHistory(anotherInstanceId);
      expect(history).toEqual([]);

      instanceService.removeInstanceState(anotherInstanceId);
    });
  });
});