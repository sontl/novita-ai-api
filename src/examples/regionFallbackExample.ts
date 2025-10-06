/**
 * Example demonstrating multi-region fallback functionality
 */

import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('example');
import { productService } from '../services/productService';
import { RegionConfig } from '../types/api';

async function demonstrateRegionFallback() {
  console.log('🌍 Multi-Region Fallback Example');
  console.log('================================\n');

  const productName = 'RTX 4090 24GB';
  
  // Example 1: Using default region configuration
  console.log('1. Using default region configuration:');
  try {
    const result = await productService.getOptimalProductWithFallback(productName);
    console.log(`✅ Found optimal product: ${result.product.id}`);
    console.log(`   Region used: ${result.regionUsed}`);
    console.log(`   Spot price: $${result.product.spotPrice}`);
  } catch (error) {
    console.log(`❌ Failed: ${(error as Error).message}`);
  }

  console.log('\n');

  // Example 2: With preferred region
  console.log('2. With preferred region (AS-SGP-02):');
  try {
    const result = await productService.getOptimalProductWithFallback(
      productName, 
      'AS-SGP-02'
    );
    console.log(`✅ Found optimal product: ${result.product.id}`);
    console.log(`   Region used: ${result.regionUsed}`);
    console.log(`   Spot price: $${result.product.spotPrice}`);
  } catch (error) {
    console.log(`❌ Failed: ${(error as Error).message}`);
  }

  console.log('\n');

  // Example 3: With custom region configuration
  console.log('3. With custom region priority:');
  const customRegions: RegionConfig[] = [
    { id: 'as-in-1', name: 'AS-IN-01', priority: 1 },      // Try India first
    { id: 'cn-hongkong-1', name: 'OC-AU-01', priority: 2 }, // Then Hong Kong
    { id: 'as-sgp-2', name: 'AS-SGP-02', priority: 3 }     // Finally Singapore
  ];
  
  try {
    const result = await productService.getOptimalProductWithFallback(
      productName,
      undefined, // No preferred region
      customRegions
    );
    console.log(`✅ Found optimal product: ${result.product.id}`);
    console.log(`   Region used: ${result.regionUsed}`);
    console.log(`   Spot price: $${result.product.spotPrice}`);
    console.log(`   Custom priority order was: ${customRegions.map(r => r.name).join(' → ')}`);
  } catch (error) {
    console.log(`❌ Failed: ${(error as Error).message}`);
  }

  console.log('\n');

  // Example 4: Fallback in action - try invalid product first
  console.log('4. Demonstrating fallback behavior:');
  try {
    const result = await productService.getOptimalProductWithFallback('Invalid GPU Product');
    console.log(`✅ Found optimal product: ${result.product.id}`);
    console.log(`   Region used: ${result.regionUsed}`);
  } catch (error) {
    console.log(`❌ All regions failed: ${(error as Error).message}`);
  }
}

// Run the example
if (require.main === module) {
  demonstrateRegionFallback()
    .then(() => {
      console.log('\n🎉 Multi-region fallback demonstration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Example failed:', error);
      process.exit(1);
    });
}

export { demonstrateRegionFallback };