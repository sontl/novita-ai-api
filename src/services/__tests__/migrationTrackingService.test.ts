import { migrationTrackingService } from '../migrationTrackingService';
import { serviceRegistry } from '../serviceRegistry';

// Mock the service registry
jest.mock('../serviceRegistry', () => ({
  serviceRegistry: {
    getCacheManager: jest.fn()
  }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('MigrationTrackingService', () => {
  let mockCache: any;
  let mockCacheManager: any;

  beforeEach(() => {
    mockCache = {
      set: jest.fn(),
      get: jest.fn(),
      delete: jest.fn()
    };

    mockCacheManager = {
      getCache: jest.fn().mockResolvedValue(mockCache)
    };
    
    (serviceRegistry.getCacheManager as jest.Mock).mockReturnValue(mockCacheManager);
    jest.clearAllMocks();
  });

  describe('recordMigrationTime', () => {
    it('should record migration time successfully', async () => {
      const instanceId = 'test-instance-123';
      const migrationTime = new Date('2025-09-24T10:00:00Z');
      
      mockCache.set.mockResolvedValue(undefined);

      await migrationTrackingService.recordMigrationTime(instanceId, migrationTime);

      expect(mockCacheManager.getCache).toHaveBeenCalledWith('migration-times', {
        maxSize: 10000,
        defaultTtl: 7 * 24 * 60 * 60 * 1000,
        backend: 'fallback'
      });
      expect(mockCache.set).toHaveBeenCalledWith(
        'test-instance-123',
        '2025-09-24T10:00:00.000Z'
      );
    });

    it('should handle cache manager not available', async () => {
      (serviceRegistry.getCacheManager as jest.Mock).mockReturnValue(null);
      
      const instanceId = 'test-instance-123';
      
      // Should not throw
      await migrationTrackingService.recordMigrationTime(instanceId);
      
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('getLastMigrationTime', () => {
    it('should return migration time when found', async () => {
      const instanceId = 'test-instance-123';
      const storedTime = '2025-09-24T10:00:00.000Z';
      
      // First call to get cache, then the actual get call
      mockCache.get.mockResolvedValue(storedTime);

      const result = await migrationTrackingService.getLastMigrationTime(instanceId);

      expect(result).toEqual(new Date(storedTime));
      expect(mockCache.get).toHaveBeenCalledWith('test-instance-123');
    });

    it('should return null when no migration time found', async () => {
      const instanceId = 'test-instance-123';
      
      mockCache.get.mockResolvedValue(null);

      const result = await migrationTrackingService.getLastMigrationTime(instanceId);

      expect(result).toBeNull();
    });
  });

  describe('isEligibleByTime', () => {
    it('should return eligible when no previous migration', async () => {
      const instanceId = 'test-instance-123';
      
      mockCache.get.mockResolvedValue(null);

      const result = await migrationTrackingService.isEligibleByTime(instanceId, 4);

      expect(result).toEqual({
        eligible: true,
        hoursSinceLastMigration: null,
        lastMigrationTime: null
      });
    });

    it('should return eligible when enough time has passed', async () => {
      const instanceId = 'test-instance-123';
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      
      mockCache.get.mockResolvedValue(fiveHoursAgo.toISOString());

      const result = await migrationTrackingService.isEligibleByTime(instanceId, 4);

      expect(result.eligible).toBe(true);
      expect(result.hoursSinceLastMigration).toBeGreaterThan(4);
      expect(result.lastMigrationTime).toEqual(fiveHoursAgo);
    });

    it('should return not eligible when insufficient time has passed', async () => {
      const instanceId = 'test-instance-123';
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      mockCache.get.mockResolvedValue(twoHoursAgo.toISOString());

      const result = await migrationTrackingService.isEligibleByTime(instanceId, 4);

      expect(result.eligible).toBe(false);
      expect(result.hoursSinceLastMigration).toBeLessThan(4);
      expect(result.lastMigrationTime).toEqual(twoHoursAgo);
    });
  });

  describe('clearMigrationTime', () => {
    it('should clear migration time successfully', async () => {
      const instanceId = 'test-instance-123';
      
      mockCache.delete.mockResolvedValue(true);

      await migrationTrackingService.clearMigrationTime(instanceId);

      expect(mockCache.delete).toHaveBeenCalledWith('test-instance-123');
    });
  });
});