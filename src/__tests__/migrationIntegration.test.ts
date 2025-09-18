/**
 * Integration test for migration scheduler integration with main application
 */

import request from 'supertest';
import { app } from '../index';
import { serviceRegistry } from '../services/serviceRegistry';

describe('Migration Scheduler Integration', () => {
  beforeEach(() => {
    // Reset service registry for clean test state
    serviceRegistry.reset();
  });

  afterEach(() => {
    serviceRegistry.reset();
  });

  describe('Health Check Integration', () => {
    it('should include migration service status in health check response', async () => {
      const response = await request(app)
        .get('/health');
      
      // Health check might return 503 due to external dependencies, but should still have migration service info
      expect([200, 503]).toContain(response.status);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('migrationService');
      expect(response.body).toHaveProperty('migrationService');
      
      // Migration service should be included in services
      expect(['up', 'down']).toContain(response.body.services.migrationService);
      
      // Migration service details should be present
      expect(response.body.migrationService).toHaveProperty('enabled');
      expect(response.body.migrationService).toHaveProperty('status');
      expect(response.body.migrationService).toHaveProperty('recentErrors');
      expect(response.body.migrationService).toHaveProperty('totalExecutions');
      expect(response.body.migrationService).toHaveProperty('uptime');
      
      // Status should be one of the expected values
      expect(['healthy', 'unhealthy', 'disabled']).toContain(response.body.migrationService.status);
    });

    it('should handle missing migration scheduler gracefully', async () => {
      // Don't register migration scheduler to simulate missing service
      const response = await request(app)
        .get('/health');
      
      // Health check might return 503 due to external dependencies, but should still have migration service info
      expect([200, 503]).toContain(response.status);

      expect(response.body.services.migrationService).toBe('down');
      expect(response.body.migrationService.status).toBe('disabled');
      expect(response.body.migrationService.enabled).toBe(false);
    });
  });

  describe('Service Registry', () => {
    it('should allow registering and retrieving migration scheduler', () => {
      const mockScheduler = {
        isHealthy: jest.fn().mockReturnValue(true),
        getHealthDetails: jest.fn().mockReturnValue({
          healthy: true,
          status: {
            isEnabled: true,
            isRunning: true,
            lastExecution: new Date(),
            nextExecution: new Date(),
            totalExecutions: 5,
            failedExecutions: 0,
            uptime: 60000
          },
          issues: []
        })
      } as any;

      serviceRegistry.registerMigrationScheduler(mockScheduler);
      const retrieved = serviceRegistry.getMigrationScheduler();
      
      expect(retrieved).toBe(mockScheduler);
    });

    it('should return undefined when no migration scheduler is registered', () => {
      const retrieved = serviceRegistry.getMigrationScheduler();
      expect(retrieved).toBeUndefined();
    });

    it('should reset service registry correctly', () => {
      const mockScheduler = {} as any;
      serviceRegistry.registerMigrationScheduler(mockScheduler);
      
      serviceRegistry.reset();
      
      const retrieved = serviceRegistry.getMigrationScheduler();
      expect(retrieved).toBeUndefined();
    });
  });
});