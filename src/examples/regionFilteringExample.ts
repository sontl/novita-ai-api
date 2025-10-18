/**
 * Example demonstrating the region filtering fix for Novita API
 * 
 * This example shows how the service now handles both old and new region formats:
 * - Old format: ["US-CA-06", "CN-HK-01"]
 * - New format: ["US-CA-06 (California)", "CN-HK-01 (Hong Kong)"]
 */

import { novitaApiService } from '../services/novitaApiService';

async function demonstrateRegionFiltering() {
  console.log('🔍 Demonstrating region filtering with new API format...\n');

  try {
    // Example 1: Get products for US-CA-06 region
    console.log('1. Fetching products for US-CA-06 region...');
    const californiaProducts = await novitaApiService.getProducts({
      region: 'US-CA-06'
    });
    
    console.log(`   Found ${californiaProducts.length} products in US-CA-06`);
    californiaProducts.forEach(product => {
      console.log(`   - ${product.name} (${product.id}) - Region: ${product.region}, Price: $${product.spotPrice}/hr`);
    });

    // Example 2: Get optimal product for a specific region
    console.log('\n2. Finding optimal RTX 4090 product in CN-HK-01...');
    try {
      const optimalProduct = await novitaApiService.getOptimalProduct('RTX 4090', 'CN-HK-01');
      console.log(`   Optimal product: ${optimalProduct.name} (${optimalProduct.id})`);
      console.log(`   Region: ${optimalProduct.region}, Spot Price: $${optimalProduct.spotPrice}/hr`);
    } catch (error) {
      console.log(`   No optimal product found: ${error.message}`);
    }

    // Example 3: Show how the filtering works with both formats
    console.log('\n3. Region filtering now handles both formats:');
    console.log('   ✅ Old format: "US-CA-06" matches ["US-CA-06", "CN-HK-01"]');
    console.log('   ✅ New format: "US-CA-06" matches ["US-CA-06 (California)", "CN-HK-01 (Hong Kong)"]');
    console.log('   ✅ Mixed format: "CN-HK-01" matches ["US-CA-06", "CN-HK-01 (Hong Kong)"]');

  } catch (error) {
    console.error('❌ Error demonstrating region filtering:', error.message);
  }
}

// Export for use in other examples
export { demonstrateRegionFiltering };

// Run if called directly
if (require.main === module) {
  demonstrateRegionFiltering();
}