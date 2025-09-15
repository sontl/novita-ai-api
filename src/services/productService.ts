import { logger } from '../utils/logger';
import { novitaApiService } from './novitaApiService';
import { Product, NovitaApiClientError } from '../types/api';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface ProductCache {
  [key: string]: CacheEntry<Product[]>;
}

interface OptimalProductCache {
  [key: string]: CacheEntry<Product>;
}

export class ProductService {
  private productCache: ProductCache = {};
  private optimalProductCache: OptimalProductCache = {};
  private readonly defaultCacheTtl = 5 * 60 * 1000; // 5 minutes
  private readonly defaultRegion = 'CN-HK-01';

  /**
   * Get products with caching support
   */
  async getProducts(filters?: {
    name?: string;
    region?: string;
    gpuType?: string;
  }): Promise<Product[]> {
    const cacheKey = this.generateCacheKey(filters);
    
    // Check cache first
    const cachedEntry = this.productCache[cacheKey];
    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      logger.debug('Returning cached products', { cacheKey, filters });
      return cachedEntry.data;
    }

    try {
      // Fetch from API
      logger.debug('Fetching products from API', { filters });
      const products = await novitaApiService.getProducts(filters);
      
      // Cache the results
      this.productCache[cacheKey] = {
        data: products,
        timestamp: Date.now(),
        ttl: this.defaultCacheTtl
      };

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
    const cacheKey = `optimal:${productName}:${targetRegion}`;
    
    // Check cache first
    const cachedEntry = this.optimalProductCache[cacheKey];
    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      logger.debug('Returning cached optimal product', { 
        cacheKey, 
        productName, 
        region: targetRegion 
      });
      return cachedEntry.data;
    }

    try {
      // Fetch products with filters
      const products = await this.getProducts({ 
        name: productName, 
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
      this.optimalProductCache[cacheKey] = {
        data: optimalProduct,
        timestamp: Date.now(),
        ttl: this.defaultCacheTtl
      };
      
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
    name?: string;
    region?: string;
    gpuType?: string;
  }): string {
    if (!filters) {
      return 'all';
    }

    const parts: string[] = [];
    if (filters.name) parts.push(`name:${filters.name}`);
    if (filters.region) parts.push(`region:${filters.region}`);
    if (filters.gpuType) parts.push(`gpu:${filters.gpuType}`);
    
    return parts.length > 0 ? parts.join('|') : 'all';
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.productCache = {};
    this.optimalProductCache = {};
    logger.info('Product cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    let clearedCount = 0;

    // Clear expired product cache entries
    for (const key in this.productCache) {
      const entry = this.productCache[key];
      if (entry && !this.isCacheValid(entry)) {
        delete this.productCache[key];
        clearedCount++;
      }
    }

    // Clear expired optimal product cache entries
    for (const key in this.optimalProductCache) {
      const entry = this.optimalProductCache[key];
      if (entry && !this.isCacheValid(entry)) {
        delete this.optimalProductCache[key];
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      logger.debug('Cleared expired cache entries', { count: clearedCount });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    productCacheSize: number;
    optimalProductCacheSize: number;
    totalCacheSize: number;
  } {
    return {
      productCacheSize: Object.keys(this.productCache).length,
      optimalProductCacheSize: Object.keys(this.optimalProductCache).length,
      totalCacheSize: Object.keys(this.productCache).length + Object.keys(this.optimalProductCache).length
    };
  }

  /**
   * Set custom cache TTL (for testing or configuration)
   */
  setCacheTtl(ttlMs: number): void {
    if (ttlMs < 0) {
      throw new Error('Cache TTL must be non-negative');
    }
    (this as any).defaultCacheTtl = ttlMs;
    logger.debug('Cache TTL updated', { ttlMs });
  }
}

// Export singleton instance
export const productService = new ProductService();