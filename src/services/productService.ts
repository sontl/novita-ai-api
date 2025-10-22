import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('product');
import { novitaApiService } from './novitaApiService';
import { Product, NovitaApiClientError, RegionConfig } from '../types/api';

export class ProductService {
  private readonly defaultRegion = 'CN-HK-01';

  // Default region configuration with fallback priorities
  private readonly defaultRegions: RegionConfig[] = [
    { id: 'as-sgp-2', name: 'AS-SGP-02', priority: 1 },
    { id: 'cn-hongkong-1', name: 'CN-HK-01', priority: 2 },
    { id: 'as-in-1', name: 'AS-IN-01', priority: 8 },
    { id: 'us-ca-6', name: 'US-CA-06', priority: 4 },
    { id: 'us-west-1', name: 'US-WEST-01', priority: 5 },
    { id: 'eu-de-1', name: 'EU-DE-01', priority: 6 },
    { id: 'eu-west-1', name: 'EU-WEST-01', priority: 7 },
    { id: 'oc-au-1', name: 'OC-AU-01', priority: 3 }
  ];


  /**
   * Get products with caching support
   */
  async getProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
    billingMethod?: string;
  }): Promise<Product[]> {
    try {
      // Fetch from API
      logger.debug('Fetching products from API', { filters });
      const products = await novitaApiService.getProducts(filters);
      return products;
    } catch (error) {
      logger.error('Failed to fetch products', { error: (error as Error).message, filters });
      throw error;
    }
  }

  /**
   * Get optimal product by name and region (lowest spot price) with caching
   */
  async getOptimalProduct(productName: string, region?: string, billingMethod?: string): Promise<Product> {
    const targetRegion = region || this.defaultRegion;
    const targetBillingMethod = billingMethod || 'spot';

    try {
      // Fetch products with filters
      const products = await this.getProducts({
        productName: productName,
        region: targetRegion,
        billingMethod: targetBillingMethod
      });

      if (products.length === 0) {
        throw new NovitaApiClientError(
          `No products found matching name "${productName}" in region "${targetRegion}" with billing method "${targetBillingMethod}"`,
          404,
          'PRODUCT_NOT_FOUND'
        );
      }

      // Filter only available products
      const availableProducts = products.filter(p => p.availability === 'available');

      if (availableProducts.length === 0) {
        throw new NovitaApiClientError(
          `No available products found for "${productName}" in region "${targetRegion}" with billing method "${targetBillingMethod}"`,
          404,
          'NO_AVAILABLE_PRODUCTS'
        );
      }

      // Sort by spot price ascending and select the cheapest
      const sortedProducts = this.sortProductsBySpotPrice(availableProducts);
      const optimalProduct = sortedProducts[0];

      if (!optimalProduct) {
        throw new NovitaApiClientError(
          `No optimal product found for "${productName}" in region "${targetRegion}" with billing method "${targetBillingMethod}"`,
          404,
          'NO_OPTIMAL_PRODUCT'
        );
      }
      return optimalProduct;
    } catch (error) {
      logger.error('Failed to get optimal product', {
        error: (error as Error).message,
        productName,
        region: targetRegion,
        billingMethod: targetBillingMethod
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
    regions?: RegionConfig[],
    billingMethod?: string
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
      billingMethod: billingMethod || 'spot',
      regionOrder: sortedRegions.map(r => `${r.name} (priority: ${r.priority})`)
    });

    const regionErrors: Array<{ region: string; error: string }> = [];

    for (const regionConfig of sortedRegions) {
      const regionName = regionConfig.name;

      try {
        logger.debug('Trying region for optimal product', {
          productName,
          region: regionName,
          priority: regionConfig.priority,
          billingMethod: billingMethod || 'spot'
        });

        const product = await this.getOptimalProduct(productName, regionName, billingMethod);

        logger.info('Found optimal product in region', {
          productName,
          regionUsed: regionName,
          priority: regionConfig.priority,
          productId: product.id,
          spotPrice: product.spotPrice,
          billingMethod: billingMethod || 'spot',
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
      billingMethod: billingMethod || 'spot',
      attemptedRegions: regionErrors.length,
      regionErrors
    });

    throw new NovitaApiClientError(
      `No optimal product found for "${productName}" with billing method "${billingMethod || 'spot'}" in any available region. Attempted regions: ${regionErrors.map(e => `${e.region} (${e.error})`).join(', ')}`,
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
   * Preload products into cache
   */
  async preloadProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
    billingMethod?: string;
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