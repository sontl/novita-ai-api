/**
 * Example demonstrating the billingMethod parameter in product services
 */

import { productService } from '../services/productService';
import { novitaApiService } from '../services/novitaApiService';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('billing-method-example');

async function demonstrateBillingMethods(): Promise<void> {
  try {
    console.log('=== Billing Method Parameter Example ===\n');

    // Example 1: Get products with default billing method (spot)
    console.log('1. Getting products with default billing method (spot):');
    const spotProducts = await productService.getProducts({
      productName: 'RTX 4090 24GB',
      region: 'CN-HK-01'
    });
    console.log(`   Found ${spotProducts.length} products with spot pricing`);
    if (spotProducts.length > 0) {
      console.log(`   Example: ${spotProducts[0].name} - Spot: $${spotProducts[0].spotPrice}/hr`);
    }

    // Example 2: Get products with explicit spot billing method
    console.log('\n2. Getting products with explicit spot billing method:');
    const explicitSpotProducts = await productService.getProducts({
      productName: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      billingMethod: 'spot'
    });
    console.log(`   Found ${explicitSpotProducts.length} products with explicit spot pricing`);

    // Example 3: Get products with on-demand billing method
    console.log('\n3. Getting products with on-demand billing method:');
    const onDemandProducts = await productService.getProducts({
      productName: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      billingMethod: 'on-demand'
    });
    console.log(`   Found ${onDemandProducts.length} products with on-demand pricing`);
    if (onDemandProducts.length > 0) {
      console.log(`   Example: ${onDemandProducts[0].name} - On-demand: $${onDemandProducts[0].onDemandPrice}/hr`);
    }

    // Example 4: Get optimal product with default billing method (spot)
    console.log('\n4. Getting optimal product with default billing method (spot):');
    try {
      const optimalSpot = await productService.getOptimalProduct('RTX 4090 24GB', 'CN-HK-01');
      console.log(`   Optimal spot product: ${optimalSpot.name} (${optimalSpot.id})`);
      console.log(`   Region: ${optimalSpot.region}, Spot Price: $${optimalSpot.spotPrice}/hr`);
    } catch (error) {
      console.log(`   No optimal spot product found: ${(error as Error).message}`);
    }

    // Example 5: Get optimal product with explicit on-demand billing method
    console.log('\n5. Getting optimal product with on-demand billing method:');
    try {
      const optimalOnDemand = await productService.getOptimalProduct('RTX 4090 24GB', 'CN-HK-01', 'on-demand');
      console.log(`   Optimal on-demand product: ${optimalOnDemand.name} (${optimalOnDemand.id})`);
      console.log(`   Region: ${optimalOnDemand.region}, On-demand Price: $${optimalOnDemand.onDemandPrice}/hr`);
    } catch (error) {
      console.log(`   No optimal on-demand product found: ${(error as Error).message}`);
    }

    // Example 6: Multi-region fallback with billing method
    console.log('\n6. Multi-region fallback with billing method:');
    try {
      const fallbackResult = await productService.getOptimalProductWithFallback(
        'RTX 4090 24GB',
        'US-WEST-01', // Preferred region
        undefined, // Use default regions
        'spot' // Explicit billing method
      );
      console.log(`   Found product in region: ${fallbackResult.regionUsed}`);
      console.log(`   Product: ${fallbackResult.product.name} (${fallbackResult.product.id})`);
      console.log(`   Spot Price: $${fallbackResult.product.spotPrice}/hr`);
    } catch (error) {
      console.log(`   No product found in any region: ${(error as Error).message}`);
    }

    // Example 7: Direct API call with billing method
    console.log('\n7. Direct API call with billing method:');
    const directApiProducts = await novitaApiService.getProducts({
      productName: 'RTX 4090 24GB',
      region: 'CN-HK-01',
      billingMethod: 'spot'
    });
    console.log(`   Direct API call returned ${directApiProducts.length} products`);

    console.log('\n=== Example completed successfully ===');

  } catch (error) {
    logger.error('Billing method example failed', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    console.error('Example failed:', (error as Error).message);
    throw error;
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  demonstrateBillingMethods()
    .then(() => {
      console.log('Billing method example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Billing method example failed:', error.message);
      process.exit(1);
    });
}

export { demonstrateBillingMethods };