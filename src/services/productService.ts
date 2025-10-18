import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('product');
import { novitaApiService } from './novitaApiService';
import { Product, NovitaApiClientError, RegionConfig } from '../types/api';
import { cacheManager, ICacheService } from './cacheService';

export class ProductService {
  private productCache?: ICacheService<Product[]>;
  private optimalProductCache?: ICacheService<Product>;
  private cacheInitialized = false;

  private readonly defaultRegion = 'CN-HK-01';

  // Default region configuration with fallback priorities
  private readonly defaultRegions: RegionConfig[] = [
    { id: 'as-sgp-2', name: 'AS-SGP-02', priority: 1 },
    { id: 'cn-hongkong-1', name: 'CN-HK-01', priority: 2 },
    { id: 'as-in-1', name: 'AS-IN-01', priority: 3 },
    { id: 'us-ca-6', name: 'US-CA-06', priority: 4 },
    { id: 'us-west-1', name: 'US-WEST-01', priority: 5 },
    { id: 'eu-de-1', name: 'EU-DE-01', priority: 6 },
    { id: 'eu-west-1', name: 'EU-WEST-01', priority: 7 },
    { id: 'oc-au-1', name: 'OC-AU-01', priority: 8 }
  ];

  /**
   * Initialize cache instances
   */
  private async initializeCaches(): Promise<void> {
    if (this.cacheInitialized) {
      return;
    }

    this.productCache = await cacheManager.getCache<Product[]>('products', {
      maxSize: 100,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      cleanupIntervalMs: 60 * 1000 // Cleanup every minute
    });

    this.optimalProductCache = await cacheManager.getCache<Product>('optimal-products', {
      maxSize: 50,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      cleanupIntervalMs: 60 * 1000 // Cleanup every minute
    });

    this.cacheInitialized = true;
    logger.debug('Product service caches initialized');
  }

  /**
   * Get products with caching support
   */
  async getProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
  }): Promise<Product[]> {
    await this.initializeCaches();

    const cacheKey = this.generateCacheKey(filters);

    // Check cache first
    const cachedProducts = await this.productCache!.get(cacheKey);
    if (cachedProducts) {
      logger.debug('Returning cached products', { cacheKey, filters });
      return cachedProducts;
    }

    try {
      // Fetch from API
      logger.debug('Fetching products from API', { filters });
      const products = await novitaApiService.getProducts(filters);

      // Cache the results
      await this.productCache!.set(cacheKey, products);

      logger.info('Products fetched and cached', {
        count: products.length,
        cacheKey,
        filters
      });

      return products;
    } catch (error) {
      logger.error('Failed to fetch products', { error: (error as Error).message, filters });
      throw error;
    }
  }

  /**
   * Get optimal product by name and region (lowest spot price) with caching
   */
  async getOptimalProduct(productName: string, region?: string): Promise<Product> {
    await this.initializeCaches();

    const targetRegion = region || this.defaultRegion;
    const cacheKey = `optimal:${productName}:${targetRegion}`;

    // Check cache first
    const cachedProduct = await this.optimalProductCache!.get(cacheKey);
    if (cachedProduct) {
      logger.debug('Returning cached optimal product', {
        cacheKey,
        productName,
        region: targetRegion
      });
      return cachedProduct;
    }

    try {
      // Fetch products with filters
      const products = await this.getProducts({
        productName: productName,
        region: targetRegion
      });

      if (products.length === 0) {
        throw new NovitaApiClientError(
          `No products found matching name "${productName}" in region "${targetRegion}"`,
          404,
          'PRODUCT_NOT_FOUND'
        );
      }

      // Filter only available products
      const availableProducts = products.filter(p => p.availability === 'available');

      if (availableProducts.length === 0) {
        throw new NovitaApiClientError(
          `No available products found for "${productName}" in region "${targetRegion}"`,
          404,
          'NO_AVAILABLE_PRODUCTS'
        );
      }

      // Sort by spot price ascending and select the cheapest
      const sortedProducts = this.sortProductsBySpotPrice(availableProducts);
      const optimalProduct = sortedProducts[0];

      if (!optimalProduct) {
        throw new NovitaApiClientError(
          `No optimal product found for "${productName}" in region "${targetRegion}"`,
          404,
          'NO_OPTIMAL_PRODUCT'
        );
      }

      // Cache the optimal product
      await this.optimalProductCache!.set(cacheKey, optimalProduct);

      logger.info('Optimal product selected and cached', {
        productId: optimalProduct.id,
        productName: optimalProduct.name,
        region: optimalProduct.region,
        spotPrice: optimalProduct.spotPrice,
        totalAvailable: availableProducts.length,
        cacheKey
      });

      return optimalProduct;
    } catch (error) {
      logger.error('Failed to get optimal product', {
        error: (error as Error).message,
        productName,
        region: targetRegion
      });
      throw error;
    }
  }

  /**
   * Get optimal product with multi-region fallback based on priority
   * Tries regions in priority order until an available product is found
   */
  async getOptimalProductWithFallback(
    productName: string,
    preferredRegion?: string,
    regions?: RegionConfig[]
  ): Promise<{ product: Product; regionUsed: string }> {
    const fallbackRegions = regions || this.defaultRegions;

    // Sort regions by priority (lower number = higher priority)
    const sortedRegions = [...fallbackRegions].sort((a, b) => a.priority - b.priority);

    // If preferred region is provided, try it first if it's in our region list
    if (preferredRegion) {
      const preferredRegionConfig = sortedRegions.find(r => r.name === preferredRegion || r.id === preferredRegion);
      if (preferredRegionConfig) {
        // Move preferred region to the front
        const otherRegions = sortedRegions.filter(r => r !== preferredRegionConfig);
        sortedRegions.splice(0, sortedRegions.length, preferredRegionConfig, ...otherRegions);
      }
    }

    logger.debug('Starting multi-region product search', {
      productName,
      preferredRegion,
      regionOrder: sortedRegions.map(r => `${r.name} (priority: ${r.priority})`)
    });

    const regionErrors: Array<{ region: string; error: string }> = [];

    for (const regionConfig of sortedRegions) {
      const regionName = regionConfig.name;

      try {
        logger.debug('Trying region for optimal product', {
          productName,
          region: regionName,
          priority: regionConfig.priority
        });

        const product = await this.getOptimalProduct(productName, regionName);

        logger.info('Found optimal product in region', {
          productName,
          regionUsed: regionName,
          priority: regionConfig.priority,
          productId: product.id,
          spotPrice: product.spotPrice,
          attemptsBeforeSuccess: regionErrors.length
        });

        return {
          product,
          regionUsed: regionName
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        regionErrors.push({ region: regionName, error: errorMessage });

        logger.warn('Failed to find optimal product in region, trying next', {
          productName,
          region: regionName,
          priority: regionConfig.priority,
          error: errorMessage,
          remainingRegions: sortedRegions.length - regionErrors.length
        });

        // Continue to next region unless this is the last one
        if (regionErrors.length < sortedRegions.length) {
          continue;
        }
      }
    }

    // If we get here, all regions failed
    logger.error('Failed to find optimal product in any region', {
      productName,
      preferredRegion,
      attemptedRegions: regionErrors.length,
      regionErrors
    });

    throw new NovitaApiClientError(
      `No optimal product found for "${productName}" in any available region. Attempted regions: ${regionErrors.map(e => `${e.region} (${e.error})`).join(', ')}`,
      404,
      'NO_OPTIMAL_PRODUCT_ANY_REGION',
      { regionErrors }
    );
  }

  /**
   * Sort products by spot price in ascending order (cheapest first)
   * With multi-level sorting for tie-breaking
   */
  private sortProductsBySpotPrice(products: Product[]): Product[] {
    return products.sort((a, b) => {
      // Primary sort: spot price ascending (cheapest first)
      if (a.spotPrice !== b.spotPrice) {
        return a.spotPrice - b.spotPrice;
      }

      // Secondary sort: memory per GPU descending (higher is better)
      if (a.memoryPerGpu !== b.memoryPerGpu) {
        return b.memoryPerGpu - a.memoryPerGpu;
      }

      // Tertiary sort: CPU per GPU descending (higher is better)
      if (a.cpuPerGpu !== b.cpuPerGpu) {
        return b.cpuPerGpu - a.cpuPerGpu;
      }

      // Quaternary sort: product ID for consistent ordering
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Generate cache key from filters
   */
  private generateCacheKey(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
  }): string {
    if (!filters) {
      return 'all';
    }

    const parts: string[] = [];
    if (filters.productName) parts.push(`productName:${filters.productName}`);
    if (filters.region) parts.push(`region:${filters.region}`);
    if (filters.gpuType) parts.push(`gpu:${filters.gpuType}`);

    return parts.length > 0 ? parts.join('|') : 'all';
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.initializeCaches();
    await this.productCache!.clear();
    await this.optimalProductCache!.clear();
    logger.info('Product cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<void> {
    if (!this.cacheInitialized || !this.productCache || !this.optimalProductCache) {
      return;
    }

    const productCleaned = await this.productCache.cleanupExpired();
    const optimalCleaned = await this.optimalProductCache.cleanupExpired();
    const totalCleaned = productCleaned + optimalCleaned;

    if (totalCleaned > 0) {
      logger.debug('Cleared expired product cache entries', {
        productCleaned,
        optimalCleaned,
        totalCleaned
      });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    productCache: {
      size: number;
      hitRatio: number;
      metrics: any;
    };
    optimalProductCache: {
      size: number;
      hitRatio: number;
      metrics: any;
    };
    totalCacheSize: number;
  }> {
    if (!this.cacheInitialized || !this.productCache || !this.optimalProductCache) {
      return {
        productCache: { size: 0, hitRatio: 0, metrics: {} },
        optimalProductCache: { size: 0, hitRatio: 0, metrics: {} },
        totalCacheSize: 0
      };
    }

    const productMetrics = this.productCache.getMetrics();
    const optimalMetrics = this.optimalProductCache.getMetrics();

    const productSize = await this.productCache.size();
    const optimalSize = await this.optimalProductCache.size();

    return {
      productCache: {
        size: productSize,
        hitRatio: this.productCache.getHitRatio(),
        metrics: productMetrics
      },
      optimalProductCache: {
        size: optimalSize,
        hitRatio: this.optimalProductCache.getHitRatio(),
        metrics: optimalMetrics
      },
      totalCacheSize: productSize + optimalSize
    };
  }

  /**
   * Invalidate cache for specific product
   */
  async invalidateProduct(productName: string, region?: string): Promise<void> {
    if (!this.cacheInitialized || !this.productCache || !this.optimalProductCache) {
      return;
    }

    const targetRegion = region || this.defaultRegion;
    const optimalKey = `optimal:${productName}:${targetRegion}`;

    // Remove from optimal product cache
    await this.optimalProductCache.delete(optimalKey);

    // Remove from product cache (need to check all keys that might contain this product)
    const productKeys = await this.productCache.keys();
    for (const key of productKeys) {
      if (key.includes(`productName:${productName}`) || key.includes(`region:${targetRegion}`)) {
        await this.productCache.delete(key);
      }
    }

    logger.debug('Invalidated product cache');
  }

  /**
   * Preload products into cache
   */
  async preloadProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
  }): Promise<void> {
    try {
      await this.getProducts(filters);
      logger.debug('Products preloaded into cache', { filters });
    } catch (error) {
      logger.warn('Failed to preload products', {
        filters,
        error: (error as Error).message
      });
      throw error;
    }
  }
}

// Export singleton instance
export const productService = new ProductService();