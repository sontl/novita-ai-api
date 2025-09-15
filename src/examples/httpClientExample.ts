/**
 * Example demonstrating the HTTP client and API service usage
 * This file shows how to use the Novita.ai API client with all its features
 */

import { novitaApiService } from '../services/novitaApiService';
import { novitaClient } from '../clients/novitaClient';
import { logger } from '../utils/logger';

export async function demonstrateHttpClient() {
  try {
    logger.info('=== Novita.ai HTTP Client Demo ===');

    // 1. Health check
    logger.info('1. Checking API health...');
    const isHealthy = await novitaApiService.healthCheck();
    logger.info(`API Health: ${isHealthy ? 'OK' : 'FAILED'}`);

    // 2. Get client status (circuit breaker and queue)
    logger.info('2. Checking client status...');
    const clientStatus = novitaApiService.getClientStatus();
    logger.info('Client Status:', clientStatus);

    // 3. Fetch products with filtering
    logger.info('3. Fetching GPU products...');
    const products = await novitaApiService.getProducts({
      name: 'RTX 4090',
      region: 'CN-HK-01'
    });
    logger.info(`Found ${products.length} products`);

    if (products.length > 0) {
      // 4. Get optimal product (lowest spot price)
      logger.info('4. Finding optimal product...');
      const optimalProduct = await novitaApiService.getOptimalProduct(
        'RTX 4090 24GB',
        'CN-HK-01'
      );
      logger.info('Optimal product:', {
        id: optimalProduct.id,
        name: optimalProduct.name,
        spotPrice: optimalProduct.spotPrice,
        region: optimalProduct.region
      });

      // 5. Get template configuration
      logger.info('5. Fetching template configuration...');
      try {
        const template = await novitaApiService.getTemplate('ubuntu-22.04-cuda');
        logger.info('Template:', {
          id: template.id,
          name: template.name,
          imageUrl: template.imageUrl,
          portsCount: template.ports.length,
          envsCount: template.envs.length
        });
      } catch (error) {
        logger.warn('Template not found (expected in demo):', (error as Error).message);
      }

      // 6. List existing instances
      logger.info('6. Listing existing instances...');
      const instancesList = await novitaApiService.listInstances({
        page: 1,
        pageSize: 10
      });
      logger.info(`Found ${instancesList.total} instances`);

      // 7. Demonstrate error handling with invalid request
      logger.info('7. Testing error handling...');
      try {
        await novitaApiService.getInstance('invalid-instance-id');
      } catch (error) {
        logger.info('Expected error caught:', (error as Error).message);
      }
    }

    // 8. Show rate limiting and circuit breaker in action
    logger.info('8. Testing rate limiting (making multiple concurrent requests)...');
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      novitaApiService.getProducts().catch(error => ({
        error: error.message,
        index: i
      }))
    );

    const results = await Promise.all(concurrentRequests);
    logger.info('Concurrent requests completed:', results.length);

    logger.info('=== Demo completed successfully ===');

  } catch (error) {
    logger.error('Demo failed:', error);
    throw error;
  }
}

// Example of direct client usage (lower level)
export async function demonstrateDirectClientUsage() {
  try {
    logger.info('=== Direct Client Usage Demo ===');

    // Make a direct GET request
    const response = await novitaClient.get('/v1/products', {
      params: { region: 'CN-HK-01' }
    });

    logger.info('Direct client response:', {
      status: response.status,
      dataKeys: Object.keys(response.data || {})
    });

    // Check queue status
    const queueStatus = novitaClient.getQueueStatus();
    logger.info('Queue status:', queueStatus);

    // Check circuit breaker state
    const circuitState = novitaClient.getCircuitBreakerState();
    logger.info('Circuit breaker state:', circuitState);

  } catch (error) {
    logger.error('Direct client demo failed:', error);
    throw error;
  }
}

// Export for use in other parts of the application
export {
  novitaApiService,
  novitaClient
};