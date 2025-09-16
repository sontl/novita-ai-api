import { logger } from '../utils/logger';
import { novitaApiService } from './novitaApiService';
import { Product, NovitaApiClientError } from '../types/api';
import { cacheManager } from './cacheService';

export class ProductService {
  private readonly productCache = cacheManager.getCache<Product[]>('products', {
    maxSize: 100,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    cleanupIntervalMs: 60 * 1000 // Cleanup every minute
  });
  
  private readonly optimalProductCache = cacheManager.getCache<Product>('optimal-products', {
    maxSize: 50,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    cleanupIntervalMs: 60 * 1000 // Cleanup every minute
  });
  
  private readonly defaultRegion = 'CN-HK-01';

  /**
   * Get products with caching support
   */
  async getProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
  }): Promise<Product[]> {
    const cacheKey = this.generateCacheKey(filters);
    
    // Check cache first
    const cachedProducts = this.productCache.get(cacheKey);
    if (cachedProducts) {
      logger.debug('Returning cached products', { cacheKey, filters });
      return cachedProducts;
    }

    try {
      // Fetch from API
      logger.debug('Fetching products from API', { filters });
      const products = await novitaApiService.getProducts(filters);
      
      // Cache the results
      this.productCache.set(cacheKey, products);

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
    const targetRegion = region || this.defaultRegion;
    const cacheKey = `${productName}:${targetRegion}`;
    
    // Check cache first
    const cachedProduct = this.optimalProductCache.get(cacheKey);
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
      this.optimalProductCache.set(cacheKey, optimalProduct);
      
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
   * Sort products by spot price in ascending order (cheapest first)
   */
  private sortProductsBySpotPrice(products: Product[]): Product[] {
    return products.sort((a, b) => {
      // Primary sort: spot price ascending
      if (a.spotPrice !== b.spotPrice) {
        return a.spotPrice - b.spotPrice;
      }
      
      // Secondary sort: on-demand price ascending (for tie-breaking)
      if (a.onDemandPrice !== b.onDemandPrice) {
        return a.onDemandPrice - b.onDemandPrice;
      }
      
      // Tertiary sort: product ID for consistent ordering
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
  clearCache(): void {
    this.productCache.clear();
    this.optimalProductCache.clear();
    logger.info('Product cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const productCleaned = this.productCache.cleanupExpired();
    const optimalCleaned = this.optimalProductCache.cleanupExpired();
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
  getCacheStats(): {
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
  } {
    const productMetrics = this.productCache.getMetrics();
    const optimalMetrics = this.optimalProductCache.getMetrics();
    
    return {
      productCache: {
        size: this.productCache.size(),
        hitRatio: this.productCache.getHitRatio(),
        metrics: productMetrics
      },
      optimalProductCache: {
        size: this.optimalProductCache.size(),
        hitRatio: this.optimalProductCache.getHitRatio(),
        metrics: optimalMetrics
      },
      totalCacheSize: this.productCache.size() + this.optimalProductCache.size()
    };
  }

  /**
   * Invalidate cache for specific product
   */
  invalidateProduct(productName: string, region?: string): void {
    const targetRegion = region || this.defaultRegion;
    const optimalKey = `${productName}:${targetRegion}`;
    
    // Remove from optimal product cache
    this.optimalProductCache.delete(optimalKey);
    
    // Remove from product cache (need to check all keys that might contain this product)
    const productKeys = this.productCache.keys();
    for (const key of productKeys) {
      if (key.includes(`productName:${productName}`) || key.includes(`region:${targetRegion}`)) {
        this.productCache.delete(key);
      }
    }
    
    logger.debug('Invalidated product cache', { productName, region: targetRegion });
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