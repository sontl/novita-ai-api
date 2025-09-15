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

import { ProductService, productService } from '../productService';
import { novitaApiService } from '../novitaApiService';
import { Product, NovitaApiClientError } from '../../types/api';
import { logger } from '../../utils/logger';

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    service = new ProductService();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockProducts: Product[] = [
    {
      id: 'prod-1',
      name: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      spotPrice: 0.6,
      onDemandPrice: 1.1,
      gpuType: 'RTX 4090',
      gpuMemory: 24,
      availability: 'available'
    },
    {
      id: 'prod-2',
      name: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      spotPrice: 0.5,
      onDemandPrice: 1.0,
      gpuType: 'RTX 4090',
      gpuMemory: 24,
      availability: 'available'
    },
    {
      id: 'prod-3',
      name: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      spotPrice: 0.7,
      onDemandPrice: 1.2,
      gpuType: 'RTX 4090',
      gpuMemory: 24,
      availability: 'limited'
    }
  ];

  describe('getProducts', () => {
    it('should fetch products from API when cache is empty', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      const result = await service.getProducts();

      expect(result).toEqual(mockProducts);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith(undefined);
      expect(logger.info).toHaveBeenCalledWith('Products fetched and cached', {
        count: 3,
        cacheKey: 'all',
        filters: undefined
      });
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
      expect(logger.debug).toHaveBeenCalledWith('Returning cached products', {
        cacheKey: 'all',
        filters: undefined
      });
    });

    it('should fetch fresh data when cache is expired', async () => {
      // First call to populate cache
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);
      await service.getProducts();

      // Advance time beyond cache TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

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
      expect(logger.error).toHaveBeenCalledWith('Failed to fetch products', {
        error: 'API Error',
        filters: undefined
      });
    });

    it('should generate different cache keys for different filters', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      // Call with different filters
      await service.getProducts({ name: 'RTX 4090' });
      await service.getProducts({ region: 'CN-HK-01' });
      await service.getProducts({ name: 'RTX 4090', region: 'CN-HK-01' });

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(3);
    });
  });

  describe('getOptimalProduct', () => {
    it('should return product with lowest spot price', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      const result = await service.getOptimalProduct('RTX 4090 24GB');

      expect(result.id).toBe('prod-2');
      expect(result.spotPrice).toBe(0.5);
      expect(logger.info).toHaveBeenCalledWith('Optimal product selected and cached', {
        productId: 'prod-2',
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01',
        spotPrice: 0.5,
        totalAvailable: 2, // Only available products
        cacheKey: 'optimal:RTX 4090 24GB:CN-HK-01'
      });
    });

    it('should use default region when not specified', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue([mockProducts[0]!]);

      await service.getOptimalProduct('RTX 4090 24GB');

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        name: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
    });

    it('should use specified region', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue([mockProducts[0]!]);

      await service.getOptimalProduct('RTX 4090 24GB', 'US-WEST-01');

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        name: 'RTX 4090 24GB',
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
      expect(logger.debug).toHaveBeenCalledWith('Returning cached optimal product', {
        cacheKey: 'optimal:RTX 4090 24GB:CN-HK-01',
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
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
        {
          id: 'prod-a',
          name: 'RTX 4090 24GB',
          region: 'CN-HK-01',
          spotPrice: 0.5,
          onDemandPrice: 1.2,
          gpuType: 'RTX 4090',
          gpuMemory: 24,
          availability: 'available' as const
        },
        {
          id: 'prod-b',
          name: 'RTX 4090 24GB',
          region: 'CN-HK-01',
          spotPrice: 0.5,
          onDemandPrice: 1.0,
          gpuType: 'RTX 4090',
          gpuMemory: 24,
          availability: 'available' as const
        }
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
      expect(logger.error).toHaveBeenCalledWith('Failed to get optimal product', {
        error: 'API Error',
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
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

    it('should clear all cache', () => {
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Product cache cleared');
    });

    it('should clear expired cache entries', () => {
      // Get initial cache size
      const initialStats = service.getCacheStats();
      
      // Advance time to expire cache
      jest.advanceTimersByTime(6 * 60 * 1000);

      service.clearExpiredCache();

      const stats = service.getCacheStats();
      expect(stats.totalCacheSize).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith('Cleared expired cache entries', {
        count: initialStats.totalCacheSize
      });
    });

    it('should not clear valid cache entries', () => {
      // Get initial cache size
      const initialStats = service.getCacheStats();
      
      // Don't advance time, cache should still be valid
      service.clearExpiredCache();

      const stats = service.getCacheStats();
      expect(stats.totalCacheSize).toBe(initialStats.totalCacheSize);
    });

    it('should return cache statistics', () => {
      const stats = service.getCacheStats();

      expect(stats.productCache.size).toBeGreaterThan(0);
      expect(stats.optimalProductCache.size).toBe(1);
      expect(stats.totalCacheSize).toBe(stats.productCache.size + stats.optimalProductCache.size);
    });

    it('should use configured cache TTL', () => {
      // Cache TTL is configured during service initialization
      const stats = service.getCacheStats();
      expect(stats.productCache).toBeDefined();
      expect(stats.optimalProductCache).toBeDefined();
    });
  });

  describe('cache key generation', () => {
    it('should generate correct cache keys for different filter combinations', async () => {
      mockedNovitaApiService.getProducts.mockResolvedValue(mockProducts);

      // Test different filter combinations
      await service.getProducts();
      await service.getProducts({ name: 'RTX 4090' });
      await service.getProducts({ region: 'CN-HK-01' });
      await service.getProducts({ gpuType: 'RTX 4090' });
      await service.getProducts({ name: 'RTX 4090', region: 'CN-HK-01' });
      await service.getProducts({ name: 'RTX 4090', region: 'CN-HK-01', gpuType: 'RTX 4090' });

      const stats = service.getCacheStats();
      expect(stats.productCache.size).toBe(6); // All different cache keys
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(productService).toBeInstanceOf(ProductService);
    });
  });
});