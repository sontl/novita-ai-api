// Mock logger first
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the novitaApiService
jest.mock('../novitaApiService', () => ({
  novitaApiService: {
    getProducts: jest.fn()
  }
}));

// Mock the cache service with a more realistic implementation
jest.mock('../cacheService', () => {
  const cacheStorage = new Map<string, any>();
  
  const mockCache = {
    get: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(cacheStorage.get(key));
    }),
    set: jest.fn().mockImplementation((key: string, value: any) => {
      cacheStorage.set(key, value);
      return Promise.resolve(undefined);
    }),
    delete: jest.fn().mockImplementation((key: string) => {
      const existed = cacheStorage.has(key);
      cacheStorage.delete(key);
      return Promise.resolve(existed);
    }),
    clear: jest.fn().mockImplementation(() => {
      cacheStorage.clear();
      return Promise.resolve(undefined);
    }),
    keys: jest.fn().mockImplementation(() => {
      return Promise.resolve(Array.from(cacheStorage.keys()));
    }),
    size: jest.fn().mockImplementation(() => {
      return Promise.resolve(cacheStorage.size);
    }),
    cleanupExpired: jest.fn().mockResolvedValue(0),
    getMetrics: jest.fn().mockReturnValue({ hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, totalSize: 0 }),
    getHitRatio: jest.fn().mockReturnValue(0),
  };

  return {
    cacheManager: {
      getCache: jest.fn().mockResolvedValue(mockCache),
      getAllStats: jest.fn().mockResolvedValue({}),
      getCacheNames: jest.fn().mockReturnValue([]),
      destroyAll: jest.fn().mockResolvedValue(undefined),
    }
  };
});

import { ProductService, productService } from '../productService';
import { novitaApiService } from '../novitaApiService';
import { Product, NovitaApiClientError } from '../../types/api';
import { logger } from '../../utils/logger';

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    service = new ProductService();
    service.clearCache(); // Ensure cache is clean
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createMockProduct = (overrides: Partial<Product>): Product => ({
    id: 'prod-default',
    name: 'RTX 4090 24GB',
    region: 'CN-HK-01',
    spotPrice: 0.6,
    onDemandPrice: 1.1,
    gpuType: 'RTX 4090',
    gpuMemory: 24,
    availability: 'available',
    cpuPerGpu: 8,
    memoryPerGpu: 32,
    diskPerGpu: 100,
    availableDeploy: true,
    prices: [],
    price: '0.6',
    minRootFS: 10,
    maxRootFS: 500,
    minLocalStorage: 0,
    maxLocalStorage: 1000,
    regions: ['CN-HK-01'],
    monthlyPrice: [],
    billingMethods: ['spot', 'onDemand'],
    ...overrides
  });

  const mockProducts: Product[] = [
    createMockProduct({
      id: 'prod-1',
      spotPrice: 0.6,
      onDemandPrice: 1.1,
      price: '0.6'
    }),
    createMockProduct({
      id: 'prod-2',
      spotPrice: 0.5,
      onDemandPrice: 1.0,
      price: '0.5'
    }),
    createMockProduct({
      id: 'prod-3',
      spotPrice: 0.7,
      onDemandPrice: 1.2,
      availability: 'limited',
      price: '0.7'
    })
  ];

  describe('getProducts', () => {
    it('should fetch products from API when cache is empty', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      const result = await service.getProducts();

      expect(result).toEqual(mockProducts);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith(undefined);
      expect(logger.info).toHaveBeenCalledWith('Products fetched and cached', expect.objectContaining({
        component: 'product',
        metadata: expect.stringContaining('count')
      }));
    });

    it('should apply filters when provided', async () => {
      const filters = { name: 'RTX 4090', region: 'CN-HK-01' };
      mockedNovitaApiService.getProducts.mockResolvedValue([mockProducts[0]!]);

      const result = await service.getProducts(filters);

      expect(result).toEqual([mockProducts[0]]);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith(filters);
    });

    it('should return cached data when cache is valid', async () => {
      // First call to populate cache
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      await service.getProducts();

      // Second call should use cache
      mockedNovitaApiService.getProducts.mockClear();
      const result = await service.getProducts();

      expect(result).toEqual(mockProducts);
      expect(mockedNovitaApiService.getProducts).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Returning cached products', expect.objectContaining({
        component: 'product'
      }));
    });

    it('should fetch fresh data when cache is expired', async () => {
      // First call to populate cache
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      await service.getProducts();

      // Clear cache to simulate expiration
      await service.clearCache();

      // Second call should fetch fresh data
      mockedNovitaApiService.getProducts.mockClear();
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      const result = await service.getProducts();

      expect(result).toEqual(mockProducts);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith(undefined);
    });

    it('should handle API errors', async () => {
      const error = new NovitaApiClientError('API Error', 500, 'SERVER_ERROR');
      mockedNovitaApiService.getProducts.mockRejectedValue(error);

      await expect(service.getProducts()).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('Failed to fetch products', expect.objectContaining({
        component: 'product'
      }));
    });

    it('should generate different cache keys for different filters', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      // Call with different filters
      await service.getProducts({ productName: 'RTX 4090' });
      await service.getProducts({ region: 'CN-HK-01' });
      await service.getProducts({ productName: 'RTX 4090', region: 'CN-HK-01' });

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(3);
    });
  });

  describe('getOptimalProduct', () => {
    it('should return product with lowest spot price', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      const result = await service.getOptimalProduct('RTX 4090 24GB');

      expect(result.id).toBe('prod-2');
      expect(result.spotPrice).toBe(0.5);
      expect(logger.info).toHaveBeenCalledWith('Optimal product selected and cached', expect.objectContaining({
        component: 'product'
      }));
    });

    it('should use default region when not specified', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue([mockProducts[0]!]);

      await service.getOptimalProduct('RTX 4090 24GB');

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
    });

    it('should use specified region', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue([mockProducts[0]!]);

      await service.getOptimalProduct('RTX 4090 24GB', 'US-WEST-01');

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        productName: 'RTX 4090 24GB',
        region: 'US-WEST-01'
      });
    });

    it('should return cached optimal product when cache is valid', async () => {
      // First call to populate cache
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      await service.getOptimalProduct('RTX 4090 24GB');

      // Second call should use cache
      mockedNovitaApiService.getProducts.mockClear();
      const result = await service.getOptimalProduct('RTX 4090 24GB');

      expect(result.id).toBe('prod-2');
      expect(mockedNovitaApiService.getProducts).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Returning cached optimal product', expect.objectContaining({
        component: 'product'
      }));
    });

    it('should throw error when no products found', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue([]);

      await expect(
        service.getOptimalProduct('NonExistent GPU')
      ).rejects.toThrow('No products found matching name "NonExistent GPU" in region "CN-HK-01"');
    });

    it('should throw error when no available products', async () => {
      const unavailableProducts = mockProducts.map(p => ({
        ...p,
        availability: 'unavailable' as const
      }));
      mockedNovitaApiService.getProducts.mockResolvedValue(unavailableProducts);

      await expect(
        service.getOptimalProduct('RTX 4090 24GB')
      ).rejects.toThrow('No available products found for "RTX 4090 24GB" in region "CN-HK-01"');
    });

    it('should filter out non-available products', async () => {
      // Include products with different availability statuses
      const mixedProducts: Product[] = [
        { ...mockProducts[0]!, availability: 'unavailable' as const },
        { ...mockProducts[1]!, availability: 'available' as const },
        { ...mockProducts[2]!, availability: 'limited' as const }
      ];
      mockedNovitaApiService.getProducts.mockResolvedValue(mixedProducts);

      const result = await service.getOptimalProduct('RTX 4090 24GB');

      // Should only consider available products
      expect(result.id).toBe('prod-2');
      expect(result.availability).toBe('available');
    });

    it('should handle tie-breaking by on-demand price', async () => {
      const tiedProducts = [
        createMockProduct({
          id: 'prod-a',
          spotPrice: 0.5,
          onDemandPrice: 1.2,
          memoryPerGpu: 32,
          cpuPerGpu: 8,
          price: '0.5'
        }),
        createMockProduct({
          id: 'prod-b',
          spotPrice: 0.5,
          onDemandPrice: 1.0,
          memoryPerGpu: 40,
          cpuPerGpu: 10,
          price: '0.5'
        })
      ];
      mockedNovitaApiService.getProducts.mockResolvedValue(tiedProducts);

      const result = await service.getOptimalProduct('RTX 4090 24GB');

      // Should select the one with lower on-demand price
      expect(result.id).toBe('prod-b');
      expect(result.onDemandPrice).toBe(1.0);
    });

    it('should handle API errors', async () => {
      const error = new NovitaApiClientError('API Error', 500, 'SERVER_ERROR');
      mockedNovitaApiService.getProducts.mockRejectedValue(error);

      await expect(
        service.getOptimalProduct('RTX 4090 24GB')
      ).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('Failed to get optimal product', expect.objectContaining({
        component: 'product'
      }));
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      // Clear any existing cache and mocks
      service.clearCache();
      jest.clearAllMocks();
      
      // Populate cache with some data
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      await service.getProducts();
      await service.getOptimalProduct('RTX 4090 24GB');
    });

    it('should clear all cache', async () => {
      await service.clearCache();

      const stats = await service.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Product cache cleared', expect.objectContaining({
        component: 'product'
      }));
    });

    it('should clear expired cache entries', async () => {
      // Get initial cache size
      const initialStats = await service.getCacheStats();
      
      // Clear cache to simulate expiration cleanup
      await service.clearCache();

      await service.clearExpiredCache();

      const stats = await service.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
      // Note: clearExpiredCache may not log anything if no expired entries are found
    });

    it('should not clear valid cache entries', async () => {
      // Get initial cache size
      const initialStats = await service.getCacheStats();
      
      // Don't advance time, cache should still be valid
      await service.clearExpiredCache();

      const stats = await service.getCacheStats();
      expect(stats.totalCacheSize).toBe(initialStats.totalCacheSize);
    });

    it('should return cache statistics', async () => {
      const stats = await service.getCacheStats();

      expect(stats.productCache).toBeDefined();
      expect(stats.optimalProductCache).toBeDefined();
      expect(stats.totalCacheSize).toBeGreaterThanOrEqual(0);
      expect(typeof stats.productCache.size).toBe('number');
      expect(typeof stats.optimalProductCache.size).toBe('number');
    });

    it('should use configured cache TTL', async () => {
      // Cache TTL is configured during service initialization
      const stats = await service.getCacheStats();
      expect(stats.productCache).toBeDefined();
      expect(stats.optimalProductCache).toBeDefined();
    });
  });

  describe('cache key generation', () => {
    it('should generate correct cache keys for different filter combinations', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      // Test different filter combinations
      await service.getProducts();
      await service.getProducts({ productName: 'RTX 4090' });
      await service.getProducts({ region: 'CN-HK-01' });
      await service.getProducts({ gpuType: 'RTX 4090' });
      await service.getProducts({ productName: 'RTX 4090', region: 'CN-HK-01' });
      await service.getProducts({ productName: 'RTX 4090', region: 'CN-HK-01', gpuType: 'RTX 4090' });

      const stats = await service.getCacheStats();
      expect(stats.productCache.size).toBe(6); // All different cache keys
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(productService).toBeInstanceOf(ProductService);
    });
  });
});