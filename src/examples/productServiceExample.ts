/**
 * Example demonstrating ProductService usage for optimal pricing selection
 */

import { productService } from '../services/productService';
import { logger } from '../utils/logger';

async function demonstrateProductService() {
  try {
    console.log('=== ProductService Example ===\n');

    // Example 1: Get optimal product for RTX 4090 in default region
    console.log('1. Getting optimal RTX 4090 product in default region (CN-HK-01):');
    const optimalProduct = await productService.getOptimalProduct('RTX 4090 24GB');
    console.log(`   Selected: ${optimalProduct.name} (${optimalProduct.id})`);
    console.log(`   Region: ${optimalProduct.region}`);
    console.log(`   Spot Price: $${optimalProduct.spotPrice}/hour`);
    console.log(`   On-Demand Price: $${optimalProduct.onDemandPrice}/hour`);
    console.log(`   Availability: ${optimalProduct.availability}\n`);

    // Example 2: Get optimal product for specific region
    console.log('2. Getting optimal RTX 4090 product in US-WEST-01:');
    try {
      const usProduct = await productService.getOptimalProduct('RTX 4090 24GB', 'US-WEST-01');
      console.log(`   Selected: ${usProduct.name} (${usProduct.id})`);
      console.log(`   Region: ${usProduct.region}`);
      console.log(`   Spot Price: $${usProduct.spotPrice}/hour\n`);
    } catch (error) {
      console.log(`   No products available in US-WEST-01: ${(error as Error).message}\n`);
    }

    // Example 3: Demonstrate caching
    console.log('3. Demonstrating caching (second call should be faster):');
    const startTime = Date.now();
    const cachedProduct = await productService.getOptimalProduct('RTX 4090 24GB');
    const endTime = Date.now();
    console.log(`   Cached result retrieved in ${endTime - startTime}ms`);
    console.log(`   Same product: ${cachedProduct.id === optimalProduct.id}\n`);

    // Example 4: Get all products with filters
    console.log('4. Getting all RTX 4090 products:');
    const allProducts = await productService.getProducts({ name: 'RTX 4090 24GB' });
    console.log(`   Found ${allProducts.length} products:`);
    allProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name} - $${product.spotPrice}/hour (${product.availability})`);
    });
    console.log();

    // Example 5: Cache statistics
    console.log('5. Cache statistics:');
    const stats = productService.getCacheStats();
    console.log(`   Product cache entries: ${stats.productCache.size}`);
    console.log(`   Optimal product cache entries: ${stats.optimalProductCache.size}`);
    console.log(`   Total cache entries: ${stats.totalCacheSize}\n`);

    // Example 6: Clear cache
    console.log('6. Clearing cache:');
    productService.clearCache();
    const newStats = productService.getCacheStats();
    console.log(`   Cache cleared. Total entries: ${newStats.totalCacheSize}\n`);

    console.log('=== Example completed successfully ===');

  } catch (error) {
    console.error('Example failed:', error);
    logger.error('ProductService example failed', { error: (error as Error).message });
  }
}

// Export for use in other examples or testing
export { demonstrateProductService };

// Run example if this file is executed directly
if (require.main === module) {
  demonstrateProductService();
}