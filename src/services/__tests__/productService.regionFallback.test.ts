/**
 * Tests for multi-region fallback functionality in ProductService
 */

import { ProductService } from '../productService';
import { novitaApiService } from '../novitaApiService';
import { Product, NovitaApiClientError, RegionConfig } from '../../types/api';

// Mock dependencies
jest.mock('../novitaApiService');
jest.mock('../../utils/logger');
jest.mock('../cacheService', () => ({
  cacheManager: {
    getCache: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      size: jest.fn().mockReturnValue(0),
      keys: jest.fn().mockReturnValue([]),
      getHitRatio: jest.fn().mockReturnValue(0),
      getMetrics: jest.fn().mockReturnValue({}),
      cleanupExpired: jest.fn().mockReturnValue(0)
    })
  }
}));

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('ProductService Multi-Region Fallback', () => {
  let service: ProductService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductService();
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
      id: 'prod-sgp-1',
      region: 'AS-SGP-02',
      spotPrice: 0.8,
      onDemandPrice: 1.2,
      price: '0.8',
      regions: ['AS-SGP-02']
    }),
    createMockProduct({
      id: 'prod-hk-1',
      region: 'CN-HK-01',
      spotPrice: 0.6,
      onDemandPrice: 1.0,
      price: '0.6',
      regions: ['CN-HK-01']
    }),
    createMockProduct({
      id: 'prod-in-1',
      region: 'AS-IN-01',
      spotPrice: 0.5,
      onDemandPrice: 0.9,
      price: '0.5',
      regions: ['AS-IN-01']
    })
  ];

  describe('getOptimalProductWithFallback', () => {
    it('should find product in first region when available', async () => {
      // Mock first region (AS-SGP-02) to have products
      mockedNovitaApiService.getProducts
        .mockResolvedValueOnce([mockProducts[0]!]); // AS-SGP-02 products

      const result = await service.getOptimalProductWithFallback('RTX 4090 24GB');

      expect(result.product.id).toBe('prod-sgp-1');
      expect(result.regionUsed).toBe('AS-SGP-02');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(1);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        productName: 'RTX 4090 24GB',
        region: 'AS-SGP-02'
      });
    });

    it('should fallback to second region when first region has no products', async () => {
      // Mock first region to fail, second region to succeed
      mockedNovitaApiService.getProducts
        .mockRejectedValueOnce(new NovitaApiClientError('No products found', 404, 'PRODUCT_NOT_FOUND'))
        .mockResolvedValueOnce([mockProducts[1]!]); // CN-HK-01 products

      const result = await service.getOptimalProductWithFallback('RTX 4090 24GB');

      expect(result.product.id).toBe('prod-hk-1');
      expect(result.regionUsed).toBe('CN-HK-01');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(2);
    });

    it('should fallback through all regions until success', async () => {
      // Mock first two regions to fail, third region to succeed
      mockedNovitaApiService.getProducts
        .mockRejectedValueOnce(new NovitaApiClientError('No products found', 404, 'PRODUCT_NOT_FOUND'))
        .mockRejectedValueOnce(new NovitaApiClientError('No products found', 404, 'PRODUCT_NOT_FOUND'))
        .mockResolvedValueOnce([mockProducts[2]!]); // AS-IN-01 products

      const result = await service.getOptimalProductWithFallback('RTX 4090 24GB');

      expect(result.product.id).toBe('prod-in-1');
      expect(result.regionUsed).toBe('AS-IN-01');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(3);
    });

    it('should use preferred region first when specified', async () => {
      // Mock preferred region (CN-HK-01) to have products
      mockedNovitaApiService.getProducts
        .mockResolvedValueOnce([mockProducts[1]!]); // CN-HK-01 products

      const result = await service.getOptimalProductWithFallback(
        'RTX 4090 24GB',
        'CN-HK-01' // preferred region
      );

      expect(result.product.id).toBe('prod-hk-1');
      expect(result.regionUsed).toBe('CN-HK-01');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(1);
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
    });

    it('should use custom region configuration', async () => {
      const customRegions: RegionConfig[] = [
        { id: 'as-in-1', name: 'AS-IN-01', priority: 1 },
        { id: 'cn-hongkong-1', name: 'CN-HK-01', priority: 2 }
      ];

      // Mock first custom region to succeed
      mockedNovitaApiService.getProducts
        .mockResolvedValueOnce([mockProducts[2]!]); // AS-IN-01 products

      const result = await service.getOptimalProductWithFallback(
        'RTX 4090 24GB',
        undefined,
        customRegions
      );

      expect(result.product.id).toBe('prod-in-1');
      expect(result.regionUsed).toBe('AS-IN-01');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledWith({
        productName: 'RTX 4090 24GB',
        region: 'AS-IN-01'
      });
    });

    it('should fail when all regions fail', async () => {
      // Mock all regions to fail
      mockedNovitaApiService.getProducts
        .mockRejectedValue(new NovitaApiClientError('No products found', 404, 'PRODUCT_NOT_FOUND'));

      await expect(
        service.getOptimalProductWithFallback('Invalid GPU')
      ).rejects.toThrow('No optimal product found for "Invalid GPU" in any available region');

      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(3); // All 3 default regions tried
    });

    it('should fall back when preferred region fails but others succeed', async () => {
      // Mock preferred region to fail, fallback to succeed
      mockedNovitaApiService.getProducts
        .mockRejectedValueOnce(new NovitaApiClientError('No products in preferred region', 404))
        .mockResolvedValueOnce([mockProducts[0]!]); // AS-SGP-02 products

      const result = await service.getOptimalProductWithFallback(
        'RTX 4090 24GB',
        'CN-HK-01' // preferred region that will fail
      );

      expect(result.product.id).toBe('prod-sgp-1');
      expect(result.regionUsed).toBe('AS-SGP-02');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(2);
      
      // First call should be to preferred region
      expect(mockedNovitaApiService.getProducts).toHaveBeenNthCalledWith(1, {
        productName: 'RTX 4090 24GB',
        region: 'CN-HK-01'
      });
      
      // Second call should be to next priority region
      expect(mockedNovitaApiService.getProducts).toHaveBeenNthCalledWith(2, {
        productName: 'RTX 4090 24GB',
        region: 'AS-SGP-02'
      });
    });

    it('should handle no available products in region correctly', async () => {
      const unavailableProduct = {
        ...mockProducts[0]!,
        availability: 'unavailable' as const
      };

      // Mock first region to have unavailable products, second to have available
      mockedNovitaApiService.getProducts
        .mockResolvedValueOnce([unavailableProduct])
        .mockResolvedValueOnce([mockProducts[1]!]);

      const result = await service.getOptimalProductWithFallback('RTX 4090 24GB');

      expect(result.product.id).toBe('prod-hk-1');
      expect(result.regionUsed).toBe('CN-HK-01');
      expect(mockedNovitaApiService.getProducts).toHaveBeenCalledTimes(2);
    });
  });
});